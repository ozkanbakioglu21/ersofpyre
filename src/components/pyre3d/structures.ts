import * as THREE from "three";
import {
  brass,
  cityMat,
  cityWindowMaterial,
  coilMat,
  lanternMat,
  stone,
  woodMat,
} from "./materials";
import type { Rng } from "./rng";
import { bake, bakeTagged, terrainHeight, writeState, type TagRange } from "./world";
import type { Target, TargetKind, TowerKind } from "./types";

/**
 * Yapı üretimi.
 *
 * Geometri kurulumu ("parts") ile sahneye yerleştirme ayrı: aynı parça
 * üreticisi hem tek başına duran yapılar için hem de Kül Şehri'nde blok
 * blok birleştirilen binalar için kullanılıyor. Böylece hasar, yangın,
 * ışık ve skor döngüleri tek bir `Target` dizisi üzerinden yürüyor.
 */

export type BuildSpec = {
  parts: THREE.Group;
  radius: number;
  height: number;
  hp: number;
  /** 0..1 tutuşma eğilimi. Ahşap ev zincirleme yanar, taş fabrika alev basıncı ister. */
  flammable: number;
  score: number;
  tower: TowerKind | null;
};

/** Yıkım puanları — GDD'nin ev 120 / kule 200 / fabrika 260 ekseni korunuyor. */
const SCORE: Record<TargetKind, number> = {
  house: 120,
  tenement: 140,
  workshop: 170,
  warehouse: 150,
  factory: 260,
  tower: 200,
  mast: 220,
  elevator: 340,
  bridge: 300,
  gate: 0,
};

export const FLAMMABILITY: Record<TargetKind, number> = {
  tenement: 1.0,
  house: 0.9,
  bridge: 1.0,
  warehouse: 0.85,
  mast: 0.8,
  workshop: 0.6,
  elevator: 0.5,
  factory: 0.25,
  tower: 0.1,
  gate: 0,
};

/**
 * Cepheye tek quad + tekrarlayan pencere dokusu.
 *
 * Pencere başına ayrı düzlem üretmek 780 binalık şehirde 100 binden fazla
 * quad demekti. Doku 4x4 hücrelik olduğu için UV ölçeği pencere sayısının
 * dörtte biri; rastgele kaydırma hangi pencerelerin yandığını değiştiriyor.
 */
function facadeGeo(w: number, h: number, rng: Rng): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const cols = Math.max(1, Math.round(w / 2.4)) / 4;
  const rows = Math.max(1, Math.round(h / 2.8)) / 4;
  const offU = rng.int(0, 3) / 4;
  const offV = rng.int(0, 3) / 4;
  const uv = g.attributes["uv"] as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * cols + offU, uv.getY(i) * rows + offV);
  }
  uv.needsUpdate = true;
  return g;
}

function addFacades(parent: THREE.Object3D, w: number, h: number, d: number, rng: Rng) {
  if (h < 3) return;
  const mat = cityWindowMaterial();
  const inset = 1.1;
  const fh = h - 1.8;
  const fy = h / 2 + 0.1;
  for (const [ww, rot, ox, oz] of [
    [w - inset, 0, 0, d / 2 + 0.05],
    [w - inset, Math.PI, 0, -d / 2 - 0.05],
    [d - inset, Math.PI / 2, w / 2 + 0.05, 0],
    [d - inset, -Math.PI / 2, -w / 2 - 0.05, 0],
  ] as const) {
    if (ww < 1.5) continue;
    const q = new THREE.Mesh(facadeGeo(ww, fh, rng), mat);
    q.position.set(ox, fy, oz);
    q.rotation.y = rot;
    parent.add(q);
  }
}

/* ------------------------------------------------------------------ *
 * Parça üreticileri
 * ------------------------------------------------------------------ */

export function buildStructure(kind: TargetKind, rng: Rng, scale = 1): BuildSpec {
  const parts = new THREE.Group();
  let radius = 4;
  let height = 6;
  let hp = 70;
  let tower: TowerKind | null = null;

  if (kind === "house") {
    const w = rng.range(4, 6.5) * scale;
    const h = rng.range(4, 7) * scale;
    const d = rng.range(4, 6.5) * scale;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x4a3527));
    base.position.y = h / 2;
    parts.add(base);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.8, 2.6, 4),
      cityMat(0x2c1c14),
    );
    roof.position.y = h + 1.3;
    roof.rotation.y = Math.PI / 4;
    parts.add(roof);
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 3, 6),
      cityMat(0x8a6b32, 0.35, 0.9),
    );
    pipe.position.set(w / 2 - 0.8, h + 1.2, d / 2 - 0.8);
    parts.add(pipe);
    addFacades(parts, w, h, d, rng);
    radius = Math.max(w, d) * 0.7;
    height = h + 2.6;
    hp = 70;
  } else if (kind === "tenement") {
    // Kül tabakasının altında yer dar: konutlar yukarı doğru büyümüş.
    const w = rng.range(5, 8) * scale;
    const h = rng.range(10, 20) * scale;
    const d = rng.range(5, 8) * scale;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x453022));
    base.position.y = h / 2;
    parts.add(base);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6), cityMat(0x2a1d15));
    cap.position.y = h + 0.35;
    parts.add(cap);
    // Yangın merdiveni: siluete ritim veriyor, tek çubukla ucuz.
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.25, h * 0.8, 0.25), cityMat(0x2b241e));
    ladder.position.set(w / 2 - 0.4, h * 0.45, d / 2 + 0.3);
    parts.add(ladder);
    for (let i = 0; i < 2; i++) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.32, 2.4, 6),
        cityMat(0x8a6b32, 0.35, 0.9),
      );
      pipe.position.set(rng.range(-w / 3, w / 3), h + 1.2, rng.range(-d / 3, d / 3));
      parts.add(pipe);
    }
    addFacades(parts, w, h, d, rng);
    radius = Math.max(w, d) * 0.72;
    height = h + 2;
    hp = 110;
  } else if (kind === "workshop") {
    const w = rng.range(7, 10) * scale;
    const h = rng.range(5, 8) * scale;
    const d = rng.range(6, 9) * scale;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x3d352c));
    base.position.y = h / 2;
    parts.add(base);
    // Testere dişi çatı — atölye siluetinin imzası.
    const teeth = Math.max(2, Math.round(w / 3));
    for (let i = 0; i < teeth; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w / teeth - 0.2, 1.6, d), cityMat(0x2b241e));
      t.position.set(-w / 2 + (i + 0.5) * (w / teeth), h + 0.8, 0);
      t.rotation.x = 0.35;
      parts.add(t);
    }
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 5, 8), cityMat(0x2b241e));
    stack.position.set(w / 2 - 1.2, h + 2.5, -d / 2 + 1.2);
    parts.add(stack);
    addFacades(parts, w, h, d, rng);
    radius = Math.max(w, d) * 0.72;
    height = h + 4;
    hp = 140;
  } else if (kind === "warehouse") {
    const w = rng.range(10, 15) * scale;
    const h = rng.range(4, 6) * scale;
    const d = rng.range(8, 12) * scale;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x3a2f24));
    base.position.y = h / 2;
    parts.add(base);
    // Yarım silindir çatı.
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(d / 2, d / 2, w, 10, 1, false, 0, Math.PI),
      cityMat(0x4a3a28, 0.7, 0.4),
    );
    roof.rotation.z = Math.PI / 2;
    roof.position.y = h;
    parts.add(roof);
    addFacades(parts, w, h, d, rng);
    radius = Math.max(w, d) * 0.7;
    height = h + d / 2;
    hp = 130;
  } else if (kind === "factory") {
    const w = rng.range(9, 14) * scale;
    const h = rng.range(7, 11) * scale;
    const d = rng.range(8, 12) * scale;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x3a332c));
    base.position.y = h / 2;
    parts.add(base);
    let tallest = h;
    for (let i = 0; i < 3; i++) {
      const stackH = rng.range(6, 13) * scale;
      const st = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.2, stackH, 8),
        cityMat(0x2b241e, 0.9),
      );
      st.position.set(-w / 3 + i * (w / 3), h + stackH / 2, rng.range(-d / 4, d / 4));
      parts.add(st);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.05, 0.14, 5, 10),
        cityMat(0x8a6b32, 0.35, 0.9),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(st.position.x, st.position.y + stackH / 2 - 0.7, st.position.z);
      parts.add(ring);
      tallest = Math.max(tallest, h + stackH);
    }
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 5, 10),
      cityMat(0x8a6b32, 0.35, 0.9),
    );
    tank.position.set(w / 2 + 2.4, 2.5, -d / 3);
    parts.add(tank);
    addFacades(parts, w, h, d, rng);
    radius = Math.max(w, d) * 0.75;
    height = tallest;
    hp = 190;
  } else if (kind === "elevator") {
    // Köz madeni asansörü: GDD'de hikâye ilerlemesini açan öncelikli hedef.
    const h = rng.range(20, 28) * scale;
    for (const [sx, sz] of [
      [-2.4, -2.4],
      [2.4, -2.4],
      [-2.4, 2.4],
      [2.4, 2.4],
    ] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, h, 0.55), cityMat(0x2f2820));
      leg.position.set(sx, h / 2, sz);
      leg.rotation.y = 0.05;
      parts.add(leg);
    }
    for (let y = 4; y < h; y += 5) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.35, 5.4), cityMat(0x2f2820));
      brace.position.y = y;
      parts.add(brace);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.6, 6.4), cityMat(0x3a332c));
    head.position.y = h + 1.3;
    parts.add(head);
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.34, 6, 16),
      cityMat(0x8a6b32, 0.35, 0.9),
    );
    wheel.position.y = h + 3.6;
    parts.add(wheel);
    // Şaft ağzından sızan köz ışığı — uzaktan görünür bir işaret.
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.2, 12), lanternMat);
    shaft.position.y = 0.7;
    parts.add(shaft);
    radius = 4.6;
    height = h + 5;
    hp = 260;
  } else if (kind === "mast") {
    // Zeplin bağlama direği.
    const h = rng.range(16, 24) * scale;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.6, h, 8), cityMat(0x463a2c));
    pole.position.y = h / 2;
    parts.add(pole);
    for (let i = 0; i < 3; i++) {
      const guy = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, h * 0.9, 4),
        cityMat(0x2b241e),
      );
      const a = (i / 3) * Math.PI * 2;
      guy.position.set(Math.cos(a) * 2.6, h * 0.42, Math.sin(a) * 2.6);
      guy.rotation.z = Math.cos(a) * 0.22;
      guy.rotation.x = -Math.sin(a) * 0.22;
      parts.add(guy);
    }
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 1.4, 2.2, 10),
      cityMat(0x8a6b32, 0.35, 0.9),
    );
    collar.position.y = h + 0.6;
    parts.add(collar);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lanternMat);
    lamp.position.y = h + 2.2;
    parts.add(lamp);
    radius = 3;
    height = h + 3;
    hp = 150;
  } else if (kind === "bridge") {
    // Ahşap madenci köprüsü — bölüm 02'nin ilk alev hedefi.
    const len = rng.range(30, 44) * scale;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 7), woodMat);
    deck.position.y = 9;
    parts.add(deck);
    const rails = 2;
    for (let s = 0; s < rails; s++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 1.5, 0.4), woodMat);
      rail.position.set(0, 10.2, s === 0 ? 3.3 : -3.3);
      parts.add(rail);
    }
    const legs = Math.max(3, Math.round(len / 10));
    for (let i = 0; i < legs; i++) {
      const x = -len / 2 + (i + 0.5) * (len / legs);
      for (const sz of [-2.6, 2.6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 9, 0.7), woodMat);
        leg.position.set(x, 4.5, sz);
        parts.add(leg);
      }
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 5.6), woodMat);
      cross.position.set(x, 5.5, 0);
      parts.add(cross);
    }
    radius = len * 0.5;
    height = 11;
    hp = 220;
  } else {
    // tower — savunma kulesi; alt tür atışın karakterini belirliyor.
    const h = rng.range(14, 22) * scale;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.8, h, 8), cityMat(0x463a2c));
    base.position.y = h / 2;
    parts.add(base);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 2.2, 2.2, 8),
      cityMat(0x8a6b32, 0.35, 0.9),
    );
    cap.position.y = h + 0.8;
    parts.add(cap);

    tower = rng.weighted({ tesla: 0.45, flak: 0.35, isildak: 0.2 } as Record<TowerKind, number>);
    if (tower === "tesla") {
      const coil = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), coilMat);
      coil.position.y = h + 2.5;
      parts.add(coil);
    } else if (tower === "flak") {
      // Çift namlu: irtifa fünyeli mermiyi görsel olarak ayırt edilebilir kılar.
      for (const sx of [-0.6, 0.6]) {
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.4, 4.6, 6),
          cityMat(0x2b241e),
        );
        barrel.position.set(sx, h + 2.6, 0.6);
        barrel.rotation.x = -0.85;
        parts.add(barrel);
      }
      const mount = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1, 2.4),
        cityMat(0x8a6b32, 0.35, 0.9),
      );
      mount.position.y = h + 1.9;
      parts.add(mount);
    } else {
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.5, 1.8, 10),
        cityMat(0x8a6b32, 0.35, 0.9),
      );
      drum.rotation.z = Math.PI / 2;
      drum.position.y = h + 2.4;
      parts.add(drum);
    }
    radius = 3.4;
    height = h + 3;
    hp = 130;
  }

  return { parts, radius, height, hp, flammable: FLAMMABILITY[kind], score: SCORE[kind], tower };
}

/* ------------------------------------------------------------------ *
 * Tek başına duran yapı
 * ------------------------------------------------------------------ */

let nextId = 1;
export function resetTargetIds() {
  nextId = 1;
}

/**
 * Bağımsız yapı: kendi grubu, kendi gölgesi.
 *
 * Şehir binaları gibi burada da `bakeTagged` kullanılıyor — böylece yanma
 * rengi aynı shader yamasından geliyor ve iki ayrı görsel kod yolu doğmuyor.
 * Fark yalnız ölümde: burada grup gizleniyor, şehirde vertex çökertiliyor.
 */
export function createStructure(
  kind: TargetKind,
  x: number,
  z: number,
  rng: Rng,
  scale = 1,
): { target: Target; group: THREE.Group } {
  const spec = buildStructure(kind, rng, scale);
  const group = new THREE.Group();
  group.position.set(x, terrainHeight(x, z), z);
  const { meshes, ranges } = bakeTagged(spec.parts, () => 0, {
    castShadow: true,
    receiveShadow: true,
  });
  for (const m of meshes) group.add(m);
  const list: TagRange[] = ranges.get(0) ?? [];

  const target: Target = {
    id: nextId++,
    kind,
    pos: group.position.clone(),
    burn: 0,
    dead: false,
    lightY: Math.min(12, spec.height * 0.4),
    radius: spec.radius,
    height: spec.height,
    hp: spec.hp,
    maxHp: spec.hp,
    flammable: spec.flammable,
    score: spec.score,
    cool: rng.range(0, 3),
    tower: spec.tower,
    rig: null,
    wrote: -1,
    apply(t) {
      if (t.dead) {
        group.visible = false;
        return;
      }
      writeState(list, Math.min(1, t.burn));
    },
  };
  return { target, group };
}

/* ------------------------------------------------------------------ *
 * Proplar (yıkılamaz)
 * ------------------------------------------------------------------ */

/** Bölüm 01'in kaya geçidi — içinden uçulan halka. */
export function createGateRing(x: number, y: number, z: number, radius = 22): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const parts = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 1.6, 6, 24), stone(0x3a2c22, 1));
  parts.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spur = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 4), stone(0x2a1f18, 1));
    spur.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    spur.rotation.z = a - Math.PI / 2;
    parts.add(spur);
  }
  // Köz feneri: geçidin nereden geçileceğini uzaktan okutuyor.
  for (const sy of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), lanternMat);
    lamp.position.set(0, sy * radius, 0);
    parts.add(lamp);
  }
  for (const m of bake(parts, { castShadow: false, receiveShadow: false })) g.add(m);
  return g;
}

/** Sovereign Cinder'ın kül perdesi ardındaki silueti — ölçek gösterisi, savaş yok. */
export function createFlagshipSilhouette(): THREE.Group {
  const g = new THREE.Group();
  const parts = new THREE.Group();
  const dark = stone(0x0e0b0a, 1);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(120, 18, 12), dark);
  hull.scale.set(1, 0.42, 2.6);
  parts.add(hull);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(26, 34, 420), dark);
  spine.position.y = -34;
  parts.add(spine);
  for (const sx of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(16, 12, 90, 10), dark);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(sx * 88, -20, 190);
    parts.add(pod);
  }
  for (let i = 0; i < 14; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 2.4), lanternMat);
    win.position.set(-90 + (i % 7) * 30, -36 + Math.floor(i / 7) * 9, -120);
    parts.add(win);
  }
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(10, 18, 60, 8), dark);
  tower.position.set(0, 60, -60);
  parts.add(tower);
  for (const m of bake(parts, { castShadow: false, receiveShadow: false })) g.add(m);
  return g;
}
