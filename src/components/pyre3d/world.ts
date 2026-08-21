import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundMat, litWindow, peakMat, softParticleTexture } from "./materials";
import { rand } from "./rng";

export { softParticleTexture };
export type { Burnable } from "./types";

/* ------------------------------------------------------------------ *
 * Arazi
 * ------------------------------------------------------------------ */

/**
 * Bölüme özel arazi biçimlendirmeleri.
 *
 * Analitik `terrainHeight()` ile `createTerrain()`'in ürettiği mesh birebir
 * aynı formülü kullanmak zorunda — ejderhanın zemine gömülmemesi, kameranın
 * araziye girmemesi ve binaların yere oturması buna bağlı. Bu yüzden
 * biçimlendirmeler mesh'e değil, ortak fonksiyona uygulanıyor.
 */
export type TerrainMod =
  /** Şehri düzleştirir: yarıçap içinde araziyi sabit yüksekliğe çeker. */
  | { t: "flatten"; x: number; z: number; radius: number; feather: number; height: number }
  /** Kanyon: koridorun dışında araziyi yükselterek duvar oluşturur. */
  | {
      t: "ridge";
      axis: "x" | "z";
      center: number;
      halfWidth: number;
      feather: number;
      height: number;
    };

let mods: TerrainMod[] = [];

export function setTerrainMods(next: TerrainMod[]): void {
  mods = next;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
};

/* ---- deterministik değer gürültüsü ----
 * Arazi kabartısı için 2 oktav; tablo tabanlı (~8 dizi okuması) olduğu için
 * terrainHeight'ın uçuş/kamera/çarpışma gibi sıcak yollarında da ucuz.
 * Sabit tohum: mesh ile analitik yükseklik her zaman birebir aynı.
 */
const PERM = (() => {
  const p = new Uint8Array(512);
  let s = 0x9e3779b9;
  const nums = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    const j = s % (i + 1);
    const t = nums[i]!;
    nums[i] = nums[j]!;
    nums[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = nums[i & 255]!;
  return p;
})();

function vnoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const ix = xi & 255;
  const iz = zi & 255;
  const a = PERM[(PERM[ix]! + iz) & 255]!;
  const b = PERM[(PERM[(ix + 1) & 255]! + iz) & 255]!;
  const c = PERM[(PERM[ix]! + iz + 1) & 255]!;
  const d = PERM[(PERM[(ix + 1) & 255]! + iz + 1) & 255]!;
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ((ab + (cd - ab) * v) / 255) * 2 - 1;
}

/** Dünya koordinatlarında zemin yüksekliği — arazi mesh'iyle birebir aynı formül. */
export function terrainHeight(x: number, z: number): number {
  let h =
    Math.sin(x * 0.012) * 9 +
    Math.cos(z * 0.015) * 7 +
    Math.sin((x - z) * 0.03) * 2.5 +
    // Değer gürültüsü: tepecikler ve mikro kabartı — düz sinüs örtüsünün
    // "matematiksel" görünümünü kırar.
    vnoise(x * 0.008, z * 0.008) * 11 +
    vnoise(x * 0.035 + 7.3, z * 0.035 + 2.9) * 3;
  for (const m of mods) {
    if (m.t === "flatten") {
      const d = Math.hypot(x - m.x, z - m.z);
      const k = 1 - smoothstep(m.radius, m.radius + m.feather, d);
      h += (m.height - h) * k;
    } else {
      const off = Math.abs((m.axis === "x" ? z : x) - m.center);
      h += m.height * smoothstep(m.halfWidth, m.halfWidth + m.feather, off);
    }
  }
  return h;
}

export function createTerrain(size: number, segments = 72): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  const posAttr = geo.attributes["position"] as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  // Eğim/yükseklik paleti (kül dünyası): düzlük kül-kahve, orta toprak,
  // dik yamaç kaya grisi. Vertex rengi tek materyalle zengin zemin verir.
  const cFlat = new THREE.Color(0x34241a);
  const cMid = new THREE.Color(0x4a3826);
  const cRock = new THREE.Color(0x53504b);
  const cTint = new THREE.Color();
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    // Düzlem -90° X ile döndürülüyor: yerel (x, y, z) -> dünya (x, z, -y)
    const h = terrainHeight(x, -y);
    posAttr.setZ(i, h);
    // Eğim: komşu örnekleme ile yaklaşık normal
    const step = Math.max(4, size / segments);
    const slope =
      Math.abs(terrainHeight(x + step, -y) - h) + Math.abs(terrainHeight(x, -y - step) - h);
    const s01 = Math.min(1, slope / (step * 0.55));
    cTint.copy(cFlat).lerp(cMid, Math.min(1, Math.max(0, (h + 6) / 26)));
    cTint.lerp(cRock, s01 * s01);
    // Hafif leke gürültüsü — tekdüzeliği kırar
    const patch = vnoise(x * 0.02 + 31.7, -y * 0.02 + 11.3) * 0.12;
    cTint.offsetHSL(0, 0, patch * 0.5);
    colors[i * 3] = cTint.r;
    colors[i * 3 + 1] = cTint.g;
    colors[i * 3 + 2] = cTint.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);

  // Uzak sıradağlar — her "dağ" 2-4 iç içe geçmiş, gürültüyle yamultulmuş
  // koniden oluşan bir küme: yalnız koni silueti piramit gibi okunuyordu.
  // Hepsi tek mesh'e birleşiyor; maliyet yalnız kurulum anında.
  const peaks = new THREE.Group();
  const peakColor = new THREE.Color(0x181110);
  const capColor = new THREE.Color(0x4a4542);
  const addPeakCone = (px: number, pz: number, radius: number, height: number, seed: number) => {
    const cone = new THREE.ConeGeometry(radius, height, 7, 3);
    const cp = cone.attributes["position"] as THREE.BufferAttribute;
    const cc = new Float32Array(cp.count * 3);
    for (let vi = 0; vi < cp.count; vi++) {
      const vx = cp.getX(vi);
      const vy = cp.getY(vi);
      const vz = cp.getZ(vi);
      const k = 1 + vnoise(vx * 0.05 + seed * 3.1, vz * 0.05 - seed * 1.7) * 0.3;
      cp.setX(vi, vx * k);
      cp.setZ(vi, vz * k);
      const t = Math.min(1, Math.max(0, (vy / height + 0.5 - 0.62) / 0.38));
      cTint.copy(peakColor).lerp(capColor, t * t);
      cc[vi * 3] = cTint.r;
      cc[vi * 3 + 1] = cTint.g;
      cc[vi * 3 + 2] = cTint.b;
    }
    cone.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    cone.computeVertexNormals();
    const peak = new THREE.Mesh(cone, peakMat);
    peak.position.set(px, terrainHeight(px, pz) - 12, pz);
    peak.rotation.y = rand(0, Math.PI * 2);
    peaks.add(peak);
  };
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + rand(-0.06, 0.06);
    const ringK = i % 3 === 0 ? 0.52 : 0.45;
    const r = size * ringK + rand(-50, 50);
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    const mainH = rand(90, 210);
    const mainR = rand(38, 78);
    addPeakCone(px, pz, mainR, mainH, i);
    // Yan zirveler: siluet kırılır, sıradağ hissi doğar
    const spurs = 1 + Math.floor(rand(0, 2.4));
    for (let s2 = 0; s2 < spurs; s2++) {
      const sa = rand(0, Math.PI * 2);
      const sd = mainR * rand(0.6, 1.2);
      addPeakCone(
        px + Math.cos(sa) * sd,
        pz + Math.sin(sa) * sd,
        mainR * rand(0.45, 0.75),
        mainH * rand(0.45, 0.8),
        i * 7 + s2,
      );
    }
  }
  for (const mesh of bake(peaks)) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    g.add(mesh);
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * Su — liman/deniz düzlemi
 * ------------------------------------------------------------------ */

export type WaterHandle = { mesh: THREE.Mesh; update(t: number): void };

/**
 * Basit animasyonlu su: kayan iki sinüs katmanı + ufka doğru açılan renk.
 * Işık tüketmez; ton eşleme/renk uzayı yamalarıyla sahne paletine uyar.
 */
export function createWater(radius: number): WaterHandle {
  const uniforms = {
    uT: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms,
    vertexShader: `
      varying vec3 vW;
      void main(){
        vW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uT;
      varying vec3 vW;
      void main(){
        // İnce, kayan dalga kırışıkları — leke değil pırıltı.
        // Kamera uzaklaştıkça pırıltı söner: uzak mesafede moiré yapmasın.
        float camD = distance(cameraPosition, vW);
        float distFade = 1.0 - smoothstep(180.0, 520.0, camD);
        float w1 = sin(vW.x * 0.42 + vW.z * 0.13 + uT * 1.1) * 0.5 + 0.5;
        float w2 = sin(vW.z * 0.55 - uT * 0.8 + vW.x * 0.21) * 0.5 + 0.5;
        float w3 = sin((vW.x + vW.z) * 0.09 + uT * 0.35) * 0.5 + 0.5;
        float glint = pow(w1 * w2, 6.0) * (0.4 + w3 * 0.6) * distFade;
        vec3 deep = vec3(0.016, 0.026, 0.036); // kurşuni kül denizi
        vec3 lit  = vec3(0.30, 0.16, 0.07);    // şafak/yangın yansıması
        vec3 c = mix(deep, lit, glint * 0.5 + w3 * 0.06);
        gl_FragColor = vec4(c, 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.userData["shared"] = false;
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), mat);
  mesh.rotation.x = -Math.PI / 2;
  return {
    mesh,
    update(t) {
      uniforms.uT.value = t;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Sur dışı doğa örtüsü — instanced kaya ve kuru ağaçlar
 * ------------------------------------------------------------------ */

/**
 * Şehir dışındaki çıplak ovayı dolduran örtü. Kaya ve kuru ağaç başına tek
 * geometri, tümü 2 InstancedMesh: ~450 nesne, 2 draw call.
 */
export function createScatter(
  worldRadius: number,
  avoid: { x: number; z: number; r: number }[],
): THREE.Group {
  const g = new THREE.Group();

  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x3d3833,
    roughness: 1,
    flatShading: true,
  });
  rockMat.userData["shared"] = true;

  // Kuru ağaç: gövde + iki çatal dal tek geometriye birleşik
  const trunk = new THREE.CylinderGeometry(0.16, 0.34, 4.4, 5);
  trunk.translate(0, 2.2, 0);
  const branch1 = new THREE.CylinderGeometry(0.09, 0.16, 2.6, 4);
  branch1.translate(0, 1.3, 0);
  branch1.rotateZ(0.7);
  branch1.translate(0.3, 2.8, 0);
  const branch2 = new THREE.CylinderGeometry(0.07, 0.13, 2.0, 4);
  branch2.translate(0, 1.0, 0);
  branch2.rotateZ(-0.6);
  branch2.translate(-0.25, 3.4, 0.1);
  const treeGeo = mergeGeometries([trunk, branch1, branch2], false)!;
  trunk.dispose();
  branch1.dispose();
  branch2.dispose();
  const treeMat = new THREE.MeshStandardMaterial({
    color: 0x2c2018,
    roughness: 1,
    flatShading: true,
  });
  treeMat.userData["shared"] = true;

  const ROCKS = 220;
  const TREES = 260;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, TREES);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();

  const place = (out: THREE.InstancedMesh, count: number, isTree: boolean) => {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 12) {
      guard++;
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(rand(0.06, 1)) * worldRadius * 0.96;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      let bad = false;
      for (const av of avoid) {
        if (Math.hypot(x - av.x, z - av.z) < av.r) {
          bad = true;
          break;
        }
      }
      if (bad) continue;
      const h = terrainHeight(x, z);
      // Dik yamaçlara ağaç dikme; kayalar her yerde olur.
      const slope = Math.abs(terrainHeight(x + 4, z) - h) + Math.abs(terrainHeight(x, z + 4) - h);
      if (isTree && slope > 3.2) continue;
      eu.set(isTree ? rand(-0.08, 0.08) : rand(0, Math.PI), rand(0, Math.PI * 2), 0);
      q.setFromEuler(eu);
      const s = isTree ? rand(0.8, 1.7) : rand(0.7, 2.6);
      sc.set(s, isTree ? s * rand(0.9, 1.3) : s * rand(0.5, 0.9), s);
      pv.set(x, isTree ? h : h + 0.2, z);
      m.compose(pv, q, sc);
      out.setMatrixAt(placed, m);
      placed++;
    }
    // Yerleşemeyen kalanlar görünmesin
    sc.set(0, 0, 0);
    for (let i = placed; i < count; i++) {
      m.compose(pv, q, sc);
      out.setMatrixAt(i, m);
    }
    out.instanceMatrix.needsUpdate = true;
  };
  place(rocks, ROCKS, false);
  place(trees, TREES, true);
  rocks.castShadow = false;
  trees.castShadow = false;
  rocks.receiveShadow = true;
  trees.receiveShadow = false;
  g.add(rocks, trees);
  return g;
}

export function createAsh(count: number, area: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(-area, area);
    pos[i * 3 + 1] = rand(0, 220);
    pos[i * 3 + 2] = rand(-area, area);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x8a8078,
    map: softParticleTexture(),
    size: 1.6,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

/* ------------------------------------------------------------------ *
 * Geometri birleştirme
 *
 * Bir yapının onlarca parçası tek mesh'e indirilir: draw call sayısı
 * ~10 kat düşer, gölge geçişi de aynı oranda ucuzlar.
 * ------------------------------------------------------------------ */

export type BakeOpts = { castShadow?: boolean; receiveShadow?: boolean };

export function bake(src: THREE.Object3D, opts: BakeOpts = {}): THREE.Mesh[] {
  src.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    g.deleteAttribute("uv1");
    const mat = m.material as THREE.Material;
    const list = buckets.get(mat);
    if (list) list.push(g);
    else buckets.set(mat, [g]);
  });

  const out: THREE.Mesh[] = [];
  for (const [mat, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (!merged) continue;
    if (geos.length > 1) for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged, mat);
    // Camlar düzlem; gölge dökmeleri hem gereksiz hem de gölge kirliliği yapıyor.
    mesh.castShadow = opts.castShadow ?? mat !== litWindow;
    mesh.receiveShadow = opts.receiveShadow ?? true;
    out.push(mesh);
  }
  return out;
}

/** Birleştirilmiş mesh içinde tek bir mantıksal nesnenin vertex aralığı. */
export type TagRange = {
  mesh: THREE.Mesh;
  attr: THREE.BufferAttribute;
  start: number;
  count: number;
};

export type TaggedBake = {
  meshes: THREE.Mesh[];
  /** Etiket (bina kimliği) → o binaya ait vertex aralıkları. */
  ranges: Map<number, TagRange[]>;
};

/**
 * `bake()`'in etiketli sürümü: birleştirmeden önce her vertex'e `aState`
 * niteliği ekler ve hangi vertex aralığının hangi mantıksal nesneye ait
 * olduğunu döndürür.
 *
 * Böylece bir bina yandığında veya yıkıldığında geometriyi yeniden
 * birleştirmeye gerek kalmıyor: paylaşılan Float32Array'de birkaç yüz float
 * güncelleniyor, gerisini `materials.ts`'teki shader yaması hallediyor.
 */
export function bakeTagged(
  src: THREE.Object3D,
  tagOf: (mesh: THREE.Mesh) => number,
  opts: BakeOpts = {},
): TaggedBake {
  src.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; tags: number[] }>();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    g.deleteAttribute("uv1");
    // aState BİRLEŞTİRMEDEN ÖNCE eklenmeli: mergeGeometries yalnız her
    // geometride ortak olan nitelikleri taşır, eksik olan bir tanesi bile
    // niteliğin tamamen düşmesine yol açar.
    const count = (g.attributes["position"] as THREE.BufferAttribute).count;
    g.setAttribute("aState", new THREE.BufferAttribute(new Float32Array(count), 1));
    const mat = m.material as THREE.Material;
    const b = buckets.get(mat);
    if (b) {
      b.geos.push(g);
      b.tags.push(tagOf(m));
    } else {
      buckets.set(mat, { geos: [g], tags: [tagOf(m)] });
    }
  });

  const meshes: THREE.Mesh[] = [];
  const ranges = new Map<number, TagRange[]>();

  for (const [mat, { geos, tags }] of buckets) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = opts.castShadow ?? false;
    mesh.receiveShadow = opts.receiveShadow ?? true;
    const attr = merged.attributes["aState"] as THREE.BufferAttribute;

    // mergeGeometries geometrileri verildikleri sırayla uç uca ekler,
    // dolayısıyla vertex ofsetleri baştan sayılarak bulunabiliyor.
    let offset = 0;
    for (let i = 0; i < geos.length; i++) {
      const g = geos[i]!;
      const n = (g.attributes["position"] as THREE.BufferAttribute).count;
      const tag = tags[i]!;
      let list = ranges.get(tag);
      if (!list) {
        list = [];
        ranges.set(tag, list);
      }
      list.push({ mesh, attr, start: offset, count: n });
      offset += n;
    }
    if (geos.length > 1) for (const g of geos) g.dispose();
    meshes.push(mesh);
  }

  return { meshes, ranges };
}

/** Bir etiketin tüm vertex aralıklarına aynı durumu yazar. */
export function writeState(list: TagRange[], value: number): void {
  for (const r of list) {
    const arr = r.attr.array as Float32Array;
    arr.fill(value, r.start, r.start + r.count);
    r.attr.addUpdateRange(r.start, r.count);
    r.attr.needsUpdate = true;
  }
}
