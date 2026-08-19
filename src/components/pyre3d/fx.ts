import * as THREE from "three";
import { softParticleTexture } from "./materials";
import { rand } from "./rng";

/**
 * Parçacık ve patlama havuzları.
 *
 * Hepsi sabit boyutlu ve sahneye kurulum sırasında ekleniyor: `compileAsync`
 * ısınmasına dahil olsunlar diye. Oyun ortasında sahneye yeni materyal
 * girmesi shader derlemesi demek — ilk patlamada takılmanın sebebi budur.
 */

export type FxSystem = {
  /** Kor sıçraması. */
  ember(p: THREE.Vector3, n: number, spread?: number): void;
  /** Ağızdan fışkıran alev jeti. */
  flameJet(p: THREE.Vector3, n: number, dir: THREE.Vector3): void;
  explosion(p: THREE.Vector3, size: number): void;
  shock(p: THREE.Vector3): void;
  /** Çukur — bomba/alev topu yere çarpınca. */
  crater(p: THREE.Vector3, radius: number): void;
  update(dt: number, now: number): void;
  setDensity(k: number): void;
  dispose(): void;
};

const EMBERS = 700;
const FLAME = 340;
const BLASTS = 10;

export function createFx(scene: THREE.Scene): FxSystem {
  /* ---- kor parçacıkları ---- */
  const emPos = new Float32Array(EMBERS * 3);
  const emVel = new Float32Array(EMBERS * 3);
  const emLife = new Float32Array(EMBERS);
  const emGeo = new THREE.BufferGeometry();
  emGeo.setAttribute("position", new THREE.BufferAttribute(emPos, 3));
  const emberMat = new THREE.PointsMaterial({
    color: 0xff9430,
    map: softParticleTexture(),
    size: 2.6,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const emberPts = new THREE.Points(emGeo, emberMat);
  // Parçacıklar her karede yer değiştiriyor ama sınır küresi ilk karede
  // (hepsi y=-9999'dayken) hesaplanıp önbelleğe alınıyor; frustum dışında
  // sayılıp hiç çizilmemelerinin sebebi buydu.
  emberPts.frustumCulled = false;
  scene.add(emberPts);
  let emIdx = 0;
  for (let i = 0; i < EMBERS; i++) {
    emLife[i] = 0;
    emPos[i * 3 + 1] = -9999;
  }

  /* ---- alev jeti (vertex renk geçişli) ---- */
  const fpPos = new Float32Array(FLAME * 3);
  const fpCol = new Float32Array(FLAME * 3);
  const fpVel = new Float32Array(FLAME * 3);
  const fpLife = new Float32Array(FLAME);
  const fpMax = new Float32Array(FLAME);
  const fpGeo = new THREE.BufferGeometry();
  fpGeo.setAttribute("position", new THREE.BufferAttribute(fpPos, 3));
  fpGeo.setAttribute("color", new THREE.BufferAttribute(fpCol, 3));
  const flameMat = new THREE.PointsMaterial({
    color: 0xffffff,
    map: softParticleTexture(),
    size: 3.6,
    transparent: true,
    opacity: 0.75,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flamePts = new THREE.Points(fpGeo, flameMat);
  flamePts.frustumCulled = false;
  scene.add(flamePts);
  let fpIdx = 0;
  const fpA = new THREE.Color(0xfff6d0);
  const fpB = new THREE.Color(0xffc83c);
  const fpC = new THREE.Color(0xff6a1a);
  const fpD = new THREE.Color(0x5a1200);
  const fpTmp = new THREE.Color();
  for (let i = 0; i < FLAME; i++) {
    fpLife[i] = 0;
    fpPos[i * 3 + 1] = -9999;
  }

  /* ---- patlama küreleri ---- */
  const blastGeo = new THREE.SphereGeometry(1, 12, 10);
  type Blast = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; size: number };
  const blasts: Blast[] = [];
  for (let i = 0; i < BLASTS; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffb24a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(blastGeo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    blasts.push({ mesh, mat, t: -1, size: 1 });
  }
  let blastIdx = 0;

  // Patlama parlaması için TEK kalıcı ışık. Sahnedeki ışık sayısı sabit
  // kalmalı; kullanılmadığında yoğunluğu 0.
  const blastLight = new THREE.PointLight(0xffa040, 0, 120, 2);
  blastLight.position.set(0, -600, 0);
  scene.add(blastLight);
  let blastLightT = 0;

  /* ---- şok halkası ---- */
  const shockMat = new THREE.MeshBasicMaterial({
    color: 0xffb347,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shockMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 8, 32), shockMat);
  shockMesh.rotation.x = Math.PI / 2;
  shockMesh.frustumCulled = false;
  scene.add(shockMesh);
  let shockT = -1;

  /* ---- çukur havuzu ---- */
  const CRATERS = 12;
  const craterGroup = new THREE.Group();
  craterGroup.name = "craters";
  scene.add(craterGroup);
  type Crater = { base: THREE.Mesh; rim: THREE.Mesh; t: number };
  const craters: Crater[] = [];
  const craterBaseMat = new THREE.MeshStandardMaterial({
    color: 0x1a0e06,
    roughness: 1,
    metalness: 0,
  });
  const craterRimMat = new THREE.MeshStandardMaterial({
    color: 0x3a2818,
    roughness: 0.9,
    metalness: 0,
  });
  for (let i = 0; i < CRATERS; i++) {
    const base = new THREE.Mesh(new THREE.CircleGeometry(1, 16), craterBaseMat);
    base.rotation.x = -Math.PI / 2;
    base.visible = false;
    craterGroup.add(base);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 16), craterRimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.visible = false;
    craterGroup.add(rim);
    craters.push({ base, rim, t: -1 });
  }
  let craterIdx = 0;

  let density = 1;

  return {
    setDensity(k) {
      density = Math.min(1, Math.max(0.25, k));
    },
    ember(p, n, spread = 14) {
      const count = Math.max(1, Math.round(n * density));
      for (let i = 0; i < count; i++) {
        const i3 = emIdx * 3;
        emPos[i3] = p.x;
        emPos[i3 + 1] = p.y;
        emPos[i3 + 2] = p.z;
        emVel[i3] = rand(-spread, spread);
        emVel[i3 + 1] = rand(2, spread);
        emVel[i3 + 2] = rand(-spread, spread);
        emLife[emIdx] = rand(0.7, 2);
        emIdx = (emIdx + 1) % EMBERS;
      }
    },
    flameJet(p, n, dir) {
      const count = Math.max(1, Math.round(n * density));
      // Jet ejderhanın baktığı YÖNE atılıyor. Eskiden hız doğrudan dünya
      // +Z'ye yazılıyordu: heading 0'dan saptığın anda alev ileri değil yana
      // savruluyor, batıya uçarken de tamamen geriye kalıyordu.
      const sx = dir.x;
      const sz = dir.z;
      // Yöne dik vektör: saçılmayı jetin etrafına dağıtmak için.
      const px = dir.z;
      const pz = -dir.x;
      for (let i = 0; i < count; i++) {
        const i3 = fpIdx * 3;
        fpPos[i3] = p.x + rand(-0.7, 0.7);
        fpPos[i3 + 1] = p.y + rand(-0.7, 0.7);
        fpPos[i3 + 2] = p.z + rand(-0.7, 0.7);
        const speed = rand(52, 96);
        const spread = rand(-4, 4);
        fpVel[i3] = sx * speed + px * spread;
        fpVel[i3 + 1] = rand(3, 12);
        fpVel[i3 + 2] = sz * speed + pz * spread;
        const life = rand(0.35, 0.85);
        fpLife[fpIdx] = life;
        fpMax[fpIdx] = life;
        fpCol[i3] = fpA.r;
        fpCol[i3 + 1] = fpA.g;
        fpCol[i3 + 2] = fpA.b;
        fpIdx = (fpIdx + 1) % FLAME;
      }
    },
    explosion(p, size) {
      const b = blasts[blastIdx]!;
      blastIdx = (blastIdx + 1) % BLASTS;
      b.mesh.position.copy(p);
      b.mesh.visible = true;
      b.t = 0;
      b.size = size;
      blastLight.position.copy(p);
      blastLightT = 0.28;
      this.ember(p, Math.round(28 * size), 12 * size);
    },
    shock(p) {
      shockMesh.position.copy(p);
      shockT = 0;
    },
    crater(p, radius) {
      const c = craters[craterIdx]!;
      craterIdx = (craterIdx + 1) % CRATERS;
      // Taban: koyu karartma diski
      c.base.position.set(p.x, p.y + 0.15, p.z);
      c.base.scale.setScalar(radius);
      c.base.visible = true;
      // Hörgüç: yükseltilmiş halka
      c.rim.position.set(p.x, p.y + 0.35, p.z);
      c.rim.scale.setScalar(radius * 1.15);
      c.rim.visible = true;
      c.t = 0;
      // Ek kor sıçraması
      this.ember(p, Math.round(radius * 3), radius * 0.6);
    },
    update(dt, now) {
      for (let i = 0; i < EMBERS; i++) {
        if (emLife[i]! <= 0) continue;
        emLife[i] = emLife[i]! - dt;
        const i3 = i * 3;
        emPos[i3] = emPos[i3]! + emVel[i3]! * dt;
        emPos[i3 + 1] = emPos[i3 + 1]! + emVel[i3 + 1]! * dt;
        emPos[i3 + 2] = emPos[i3 + 2]! + emVel[i3 + 2]! * dt;
        emVel[i3 + 1] = emVel[i3 + 1]! + 6 * dt;
        if (emLife[i]! <= 0) emPos[i3 + 1] = -9999;
      }
      (emGeo.attributes["position"] as THREE.BufferAttribute).needsUpdate = true;

      for (let i = 0; i < FLAME; i++) {
        if (fpLife[i]! <= 0) continue;
        fpLife[i] = fpLife[i]! - dt;
        const i3 = i * 3;
        fpVel[i3 + 1] = fpVel[i3 + 1]! + 14 * dt;
        const drag = Math.max(0, 1 - 1.2 * dt);
        fpVel[i3] = fpVel[i3]! * drag;
        fpVel[i3 + 1] = fpVel[i3 + 1]! * drag;
        fpVel[i3 + 2] = fpVel[i3 + 2]! * drag;
        fpVel[i3] = fpVel[i3]! + Math.sin(now * 0.02 + i) * 10 * dt;
        fpPos[i3] = fpPos[i3]! + fpVel[i3]! * dt;
        fpPos[i3 + 1] = fpPos[i3 + 1]! + fpVel[i3 + 1]! * dt;
        fpPos[i3 + 2] = fpPos[i3 + 2]! + fpVel[i3 + 2]! * dt;
        const age = 1 - Math.max(0, fpLife[i]!) / Math.max(1e-5, fpMax[i]!);
        if (age < 0.25) fpTmp.lerpColors(fpA, fpB, age / 0.25);
        else if (age < 0.6) fpTmp.lerpColors(fpB, fpC, (age - 0.25) / 0.35);
        else fpTmp.lerpColors(fpC, fpD, Math.min(1, (age - 0.6) / 0.4));
        fpCol[i3] = fpTmp.r;
        fpCol[i3 + 1] = fpTmp.g;
        fpCol[i3 + 2] = fpTmp.b;
        if (fpLife[i]! <= 0) fpPos[i3 + 1] = -9999;
      }
      (fpGeo.attributes["position"] as THREE.BufferAttribute).needsUpdate = true;
      (fpGeo.attributes["color"] as THREE.BufferAttribute).needsUpdate = true;

      for (const b of blasts) {
        if (b.t < 0) continue;
        b.t += dt;
        const k = b.t / 0.45;
        if (k >= 1) {
          b.t = -1;
          b.mesh.visible = false;
          b.mat.opacity = 0;
          continue;
        }
        b.mesh.scale.setScalar((2 + k * 26) * b.size);
        b.mat.opacity = 0.75 * (1 - k) * (1 - k);
      }

      if (blastLightT > 0) {
        blastLightT -= dt;
        blastLight.intensity = Math.max(0, blastLightT / 0.28) * 260;
      } else if (blastLight.intensity !== 0) {
        blastLight.intensity = 0;
      }

      if (shockT >= 0) {
        shockT += dt;
        const k = shockT / 0.8;
        shockMesh.scale.setScalar(1 + k * 90);
        shockMat.opacity = Math.max(0, 0.85 - k);
        if (k > 1) shockT = -1;
      }
    },
    dispose() {
      emGeo.dispose();
      fpGeo.dispose();
      blastGeo.dispose();
      shockMesh.geometry.dispose();
      emberMat.dispose();
      flameMat.dispose();
      shockMat.dispose();
      craterBaseMat.dispose();
      craterRimMat.dispose();
      for (const b of blasts) b.mat.dispose();
    },
  };
}
