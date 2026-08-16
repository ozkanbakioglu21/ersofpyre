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

/** Dünya koordinatlarında zemin yüksekliği — arazi mesh'iyle birebir aynı formül. */
export function terrainHeight(x: number, z: number): number {
  let h = Math.sin(x * 0.012) * 9 + Math.cos(z * 0.015) * 7 + Math.sin((x - z) * 0.03) * 2.5;
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
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    // Düzlem -90° X ile döndürülüyor: yerel (x, y, z) -> dünya (x, z, -y)
    posAttr.setZ(i, terrainHeight(x, -y));
  }
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);

  // distant jagged peaks — tek mesh'e birleştiriliyor
  const peaks = new THREE.Group();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = size * 0.44 + rand(-40, 40);
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(rand(30, 70), rand(80, 190), 5), peakMat);
    peak.position.set(px, terrainHeight(px, pz) - 12, pz);
    peaks.add(peak);
  }
  for (const mesh of bake(peaks)) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    g.add(mesh);
  }
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
