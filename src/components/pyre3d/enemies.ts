import * as THREE from "three";
import { bandMat, brass, lanternMat, stone } from "./materials";
import type { Rng } from "./rng";
import { bake } from "./world";
import type { Enemy } from "./types";

/**
 * Avcı Zeplini "Wasp".
 *
 * GDD: "küçük, hızlı, sürü hâlinde; harpun atar ve ejderhayı yavaşlatır."
 * Sürü davranışı için ayrışma (separation) kuvveti şart: onsuz altı Wasp
 * aynı hedef noktasına gidip tek bir piksel hâline geliyor.
 */

let nextId = 1;
export function resetEnemyIds() {
  nextId = 1;
}

export function createWasp(x: number, y: number, z: number, rng: Rng): Enemy {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x6a5a3c,
    roughness: 0.6,
    metalness: 0.45,
  });
  const parts = new THREE.Group();

  // Kısa, şişkin gövde — firkateynin uzun silüetinden bir bakışta ayrılsın.
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), hullMat);
  body.scale.set(1, 0.85, 1.7);
  parts.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3.2, 8), bandMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -4.4;
  parts.add(nose);

  // Harpun namlusu: karnın altından uzanan uzun mızrak.
  const harpoon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 5.2, 6), brass);
  harpoon.rotation.x = Math.PI / 2;
  harpoon.position.set(0, -1.4, -2.2);
  parts.add(harpoon);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 2.6), stone(0x241f1a, 0.6));
  cabin.position.y = -2.2;
  parts.add(cabin);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 2.0), lanternMat);
  glow.position.y = -2.1;
  parts.add(glow);

  for (const s of [-1, 1]) {
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 2.6, 5),
      stone(0x1d1a16, 0.5),
    );
    strut.rotation.z = Math.PI / 2;
    strut.position.set(s * 1.8, 0.2, 1.6);
    parts.add(strut);
  }
  const finV = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.6, 1.8), hullMat);
  finV.position.set(0, 1.6, 3.6);
  parts.add(finV);

  // Dönen rotorlar birleştirmenin dışında kalıyor.
  const props: THREE.Object3D[] = [];
  const blade = new THREE.BoxGeometry(0.16, 1.8, 0.3);
  for (const s of [-1, 1]) {
    const bladeParts = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(blade, stone(0x1d1a16, 0.5));
      b.rotation.z = (i * Math.PI * 2) / 3;
      b.position.set(
        Math.sin((i * Math.PI * 2) / 3) * 0.85,
        Math.cos((i * Math.PI * 2) / 3) * 0.85,
        0,
      );
      bladeParts.add(b);
    }
    const prop = new THREE.Group();
    for (const m of bake(bladeParts, { castShadow: false, receiveShadow: false })) prop.add(m);
    prop.position.set(s * 3.2, 0.2, 1.6);
    props.push(prop);
    group.add(prop);
  }

  for (const m of bake(parts, { castShadow: true, receiveShadow: false })) group.add(m);

  return {
    id: nextId++,
    kind: "wasp",
    group,
    pos: group.position,
    vel: new THREE.Vector3(rng.range(-8, 8), 0, rng.range(-8, 8)),
    hp: 90,
    maxHp: 90,
    radius: 4.4,
    cool: rng.range(0.6, 2.4),
    burn: 0,
    dead: false,
    lightY: 0,
    splitDone: false,
    props,
    hullMat,
    state: "chase",
  };
}

/* ------------------------------------------------------------------ *
 * Kule donanımları
 *
 * ÖNEMLİ: Işıldak için THREE.SpotLight KULLANILMIYOR. Sahnedeki görünür ışık
 * sayısı değiştiğinde three.js tüm materyallerin shader'ını yeniden derler ve
 * oyun ortasında saniyelerce donar (quality.ts bunu belgeliyor). Bunun yerine
 * ışıksız, additive bir koni mesh'i kullanılıyor: görsel olarak aynı iş,
 * sıfır aydınlatma maliyeti.
 * ------------------------------------------------------------------ */

export type SearchlightRig = {
  group: THREE.Group;
  cone: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  /** Süpürme fazı. */
  phase: number;
};

export const SEARCHLIGHT_RANGE = 190;
export const SEARCHLIGHT_HALF_ANGLE = 0.22;

export function createSearchlightRig(height: number): SearchlightRig {
  const group = new THREE.Group();
  group.position.y = height;
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff0c0,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const r = Math.tan(SEARCHLIGHT_HALF_ANGLE) * SEARCHLIGHT_RANGE;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(r, SEARCHLIGHT_RANGE, 16, 1, true), mat);
  // Koninin tepesi kulede, tabanı ileride olsun diye yarım boy kaydırılıyor.
  cone.position.y = -SEARCHLIGHT_RANGE / 2;
  cone.frustumCulled = false;
  group.add(cone);
  return { group, cone, mat, phase: Math.random() * Math.PI * 2 };
}

export type TeslaRig = {
  group: THREE.Group;
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  positions: Float32Array;
};

export const TESLA_RANGE = 95;
const TESLA_SEGMENTS = 10;

export function createTeslaRig(height: number): TeslaRig {
  const group = new THREE.Group();
  group.position.y = height;
  const positions = new Float32Array(TESLA_SEGMENTS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x9fe8ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  group.add(line);
  return { group, line, mat, positions };
}

/** Kuleden hedefe kırık bir yay çizer. Geometri sabit boyutlu, yeniden ayrılmıyor. */
export function updateTeslaArc(rig: TeslaRig, from: THREE.Vector3, to: THREE.Vector3): void {
  const p = rig.positions;
  for (let i = 0; i < TESLA_SEGMENTS; i++) {
    const t = i / (TESLA_SEGMENTS - 1);
    const jitter = t > 0 && t < 1 ? 3.2 : 0;
    p[i * 3] = from.x + (to.x - from.x) * t + (Math.random() - 0.5) * jitter;
    p[i * 3 + 1] = from.y + (to.y - from.y) * t + (Math.random() - 0.5) * jitter;
    p[i * 3 + 2] = from.z + (to.z - from.z) * t + (Math.random() - 0.5) * jitter;
  }
  const attr = rig.line.geometry.attributes["position"] as THREE.BufferAttribute;
  attr.needsUpdate = true;
}
