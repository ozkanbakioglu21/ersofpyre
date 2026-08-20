import * as THREE from "three";
import {
  brass,
  cityMat,
  cityTexturedMat,
  cityWindowMaterial,
  coilMat,
  lanternMat,
  stone,
  woodMat,
  brickTexture,
  stoneTexture,
  woodTexture,
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
  barracks: 280,
  armory: 320,
  command_post: 400,
  ammo_depot: 350,
  watchtower: 240,
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
  barracks: 0.7,
  armory: 0.5,
  command_post: 0.4,
  ammo_depot: 0.9,
  watchtower: 0.6,
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
 *  Yardımcı geometri üreticileri — gerçekçi bina detayları
 * ------------------------------------------------------------------ */

/** Tek çatı引发 çizgisi (ridge). */
function addRidge(parent: THREE.Object3D, w: number, h: number, d: number, rot: number, mat: THREE.Material) {
  const len = Math.max(w, d) * 0.88;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.35), mat);
  ridge.position.y = h + 0.1;
  ridge.rotation.y = rot;
  parent.add(ridge);
}

/** Üst üste çatı kiremit satırı (3 basamalı) — çatı yüzeyine derinlik katar. */
function addShingleRows(parent: THREE.Object3D, w: number, h: number, d: number, rot: number, mat: THREE.Material) {
  const span = Math.max(w, d) * 0.82;
  for (let i = 0; i < 3; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(span - i * 1.2, 0.12, 0.7 - i * 0.12),
      mat,
    );
    plank.position.y = h + 0.4 + i * 0.35;
    plank.rotation.y = rot;
    parent.add(plank);
  }
}

/** Dormer pencere — büyük çatılarda çatının yüzeyinden çıkan mini ev. */
function addDormer(parent: THREE.Object3D, x: number, y: number, z: number, faceAngle: number, rng: Rng) {
  const dw = rng.range(1.2, 1.8);
  const dh = rng.range(1.0, 1.6);
  const body = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.8), cityMat(0x3a2a1e));
  body.position.set(x, y + dh / 2, z);
  parent.add(body);
  const dRoof = new THREE.Mesh(
    new THREE.ConeGeometry(dw * 0.7, 1.0, 4),
    cityMat(0x2c1c14),
  );
  dRoof.position.set(x, y + dh + 0.5, z);
  dRoof.rotation.y = Math.PI / 4;
  parent.add(dRoof);
}

/** Sundurma / porch — kapı önünde çatılıksı çıkıntı. */
function addPorch(parent: THREE.Object3D, x: number, z: number, w: number, h: number, rng: Rng) {
  const pw = rng.range(1.6, 2.4);
  const pd = rng.range(0.8, 1.4);
  // Zemin
  const slab = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.2, pd), cityMat(0x3a3228));
  slab.position.set(x, 0.1, z + pd / 2 + 0.15);
  parent.add(slab);
  // Sütunlar
  for (const sx of [-pw / 2 + 0.2, pw / 2 - 0.2]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, h + 1.2, 6), cityMat(0x4a3a2c));
    col.position.set(x + sx, (h + 1.2) / 2, z + pd + 0.15);
    parent.add(col);
  }
  // Çatı
  const pRoof = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.4, 0.2, pd + 0.3), cityMat(0x352820));
  pRoof.position.set(x, h + 0.3, z + pd / 2 + 0.15);
  parent.add(pRoof);
}

/** Temel / sawaz bandı — binanın dibinde genişletilmiş şerit. */
function addFoundation(parent: THREE.Object3D, w: number, d: number, h: number, rng: Rng) {
  const fh = rng.range(0.5, 1.0);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.5, fh, d + 0.5),
    cityMat(0x3a3028),
  );
  base.position.y = fh / 2;
  parent.add(base);
}

/** Kat bandı — çok katlı binalarda katları ayıran yatay çıkıntı. */
function addFloorBand(parent: THREE.Object3D, w: number, d: number, y: number, rng: Rng) {
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.35, 0.22, d + 0.35),
    cityMat(0x3a2a1e),
  );
  band.position.y = y;
  parent.add(band);
}

/** Kapı_specific — kemerli çerçeve, eşik, kulplu ahşap kapı. */
function addDetailedDoor(parent: THREE.Object3D, x: number, z: number, faceAngle: number, rng: Rng) {
  const dw = rng.range(1.0, 1.4);
  const dh = rng.range(2.0, 2.6);
  // Kemerli üst
  const arch = new THREE.Mesh(
    new THREE.CylinderGeometry(dw / 2, dw / 2, 0.25, 8, 1, false, 0, Math.PI),
    cityMat(0x3a2a1e),
  );
  arch.rotation.z = Math.PI;
  arch.position.set(x, dh, z);
  arch.rotation.y = faceAngle;
  parent.add(arch);
  // Kapı paneli
  const panel = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.12), cityMat(0x2a1a0e));
  panel.position.set(x, dh / 2, z);
  parent.add(panel);
  // Eşik
  const sill = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.5, 0.15, 0.35), cityMat(0x3a3228));
  sill.position.set(x, 0.08, z + 0.18);
  parent.add(sill);
  // Kapı üstü pervaz
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.6, 0.2, 0.3), cityMat(0x4a3a2c));
  lintel.position.set(x, dh + 0.4, z + 0.1);
  parent.add(lintel);
}

/** Pencere çerçevesi — pencere etrafında ince kutu çerçeve. */
function addWindowFrame(parent: THREE.Object3D, x: number, y: number, z: number, faceAngle: number, rng: Rng) {
  const ww = rng.range(0.8, 1.3);
  const wh = rng.range(1.0, 1.6);
  const depth = 0.18;
  // Üst lintel
  const top = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.3, 0.14, depth), cityMat(0x4a3a2c));
  top.position.set(x, y + wh / 2 + 0.07, z);
  parent.add(top);
  // Alt sill
  const bot = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.3, 0.14, depth + 0.08), cityMat(0x4a3a2c));
  bot.position.set(x, y - wh / 2 - 0.07, z + 0.04);
  parent.add(bot);
}

/** Pencere sundurması / awning — pencere üstünde eğik küçük çatı. */
function addAwning(parent: THREE.Object3D, x: number, y: number, z: number, rng: Rng) {
  const aw = rng.range(1.0, 1.6);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(aw, 0.1, 0.7), cityMat(0x4a3525));
  awning.position.set(x, y + 0.7, z + 0.35);
  awning.rotation.x = 0.25;
  parent.add(awning);
  // Destek çubukları
  for (const sx of [-aw / 3, aw / 3]) {
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4), cityMat(0x2b241e));
    brace.position.set(x + sx, y + 0.4, z + 0.3);
    brace.rotation.x = 0.4;
    parent.add(brace);
  }
}

/** Baca üstü detay — baca ağzında genişletme ve oluk. */
function addChimneyTop(parent: THREE.Object3D, x: number, y: number, z: number, rng: Rng) {
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.35, 0.35, 6),
    cityMat(0x6a5028, 0.5, 0.7),
  );
  cap.position.set(x, y + 0.18, z);
  parent.add(cap);
  // Baca içi karanlık
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.3, 6),
    cityMat(0x0a0604),
  );
  hole.position.set(x, y + 0.35, z);
  parent.add(hole);
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

    // L veya T ayak izi şansı (0.35) — tek kutudan daha doğal siluet
    const footprint = rng.int(0, 4);
    if (footprint === 0) {
      // L shape
      const w2 = w * rng.range(0.4, 0.6);
      const d2 = d * rng.range(0.35, 0.55);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x4a3527));
      body.position.y = h / 2;
      parts.add(body);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(w2, h * 0.85, d2), cityMat(0x4a3527));
      wing.position.set(w / 2 - w2 / 2, h * 0.425, d / 2 - d2 / 2);
      parts.add(wing);
    } else if (footprint === 1) {
      // T shape
      const arm = w * rng.range(0.6, 0.8);
      const armD = d * rng.range(0.25, 0.4);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x4a3527));
      body.position.y = h / 2;
      parts.add(body);
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(arm, h * 0.9, armD), cityMat(0x4a3527));
      crossbar.position.set(0, h * 0.45, d / 2 - armD / 2);
      parts.add(crossbar);
    } else {
      // Dikdörtgen (basit)
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x4a3527));
      body.position.y = h / 2;
      parts.add(body);
    }

    // Temel
    addFoundation(parts, w, d, h, rng);

    // Duvar dokusu (rastgele)
    if (rng.chance(0.5)) {
      const brick = brickTexture();
      const wrap = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.05, h + 0.05, d + 0.05),
        cityTexturedMat(brick, 0x6a4535),
      );
      wrap.position.y = h / 2;
      parts.add(wrap);
    }

    // Çeşitli çatı tipleri
    const roofStyle = rng.int(0, 4);
    if (roofStyle === 0) {
      // Kırma çatı
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.8, 2.6, 4),
        cityMat(0x2c1c14),
      );
      roof.position.y = h + 1.3;
      roof.rotation.y = Math.PI / 4;
      parts.add(roof);
      addRidge(parts, w, h, d, rng.chance(0.5) ? 0 : Math.PI / 2, cityMat(0x1a100a));
    } else if (roofStyle === 1) {
      // eğimli düz çatı
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, 0.3, d + 0.5),
        cityMat(0x352820),
      );
      roof.position.y = h + 0.15;
      roof.rotation.x = 0.08 * (rng.chance(0.5) ? 1 : -1);
      parts.add(roof);
    } else if (roofStyle === 2) {
      // —atTipi çatı (ikiz eğim)
      const hw = Math.max(w, d) * 0.85;
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(hw, 2.2, 4),
        cityMat(0x301e16),
      );
      roof.position.y = h + 1.1;
      roof.rotation.y = Math.PI / 4;
      parts.add(roof);
      addRidge(parts, w, h, d, 0, cityMat(0x1a100a));
    } else {
      // Kule çatısı — koni
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.min(w, d) * 0.6, 3.2, 6),
        cityMat(0x2c1c14),
      );
      roof.position.y = h + 1.6;
      parts.add(roof);
    }

    // Çatı kiremit satırları
    if (rng.chance(0.45)) {
      addShingleRows(parts, w, h, d, rng.chance(0.5) ? 0 : Math.PI / 2, cityMat(0x352820));
    }

    // Dormer pencere
    if (rng.chance(0.3) && h > 5) {
      addDormer(parts, rng.range(-w / 3, w / 3), h + 0.5, d / 2 + 0.3, 0, rng);
    }

    // Korniş / saçak (her eve)
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.3, d + 0.6),
      cityMat(0x3a2a1e),
    );
    cornice.position.y = h + 0.15;
    parts.add(cornice);

    // Baca
    if (rng.chance(0.6)) {
      const cx = w / 2 - 0.8;
      const cz = d / 2 - 0.8;
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.38, rng.range(2, 4), 6),
        cityMat(0x7a5a30, 0.4, 0.8),
      );
      pipe.position.set(cx, h + rng.range(1.5, 2.8), cz);
      parts.add(pipe);
      addChimneyTop(parts, cx, h + rng.range(3.2, 5.0), cz, rng);
    }

    // Kapı — kemerli çerçeve ile
    if (rng.chance(0.8)) {
      addDetailedDoor(parts, rng.range(-w / 3, w / 3), d / 2 + 0.1, 0, rng);
    }

    // Pencere çerçeveleri ve sundurmalar
    const windowSide = rng.chance(0.6);
    if (windowSide) {
      for (let i = 0; i < rng.int(1, 3); i++) {
        const wx = rng.range(-w / 3, w / 3);
        addWindowFrame(parts, wx, rng.range(1.5, h * 0.7), d / 2 + 0.08, 0, rng);
        if (rng.chance(0.4)) addAwning(parts, wx, rng.range(1.5, h * 0.7), d / 2 + 0.08, rng);
      }
    }

    // Porch / sundurma
    if (rng.chance(0.3) && w > 4.5) {
      addPorch(parts, 0, d / 2, w * 0.45, h, rng);
    }

    addFacades(parts, w, h, d, rng);
    radius = Math.max(w, d) * 0.7;
    height = h + 3.2;
    hp = 70;
  } else if (kind === "tenement") {
    // Kül tabakasının altında yer dar: konutlar yukarı doğru büyümüş.
    const w = rng.range(5, 8) * scale;
    const h = rng.range(10, 20) * scale;
    const d = rng.range(5, 8) * scale;

    // Ana gövde
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x453022));
    body.position.y = h / 2;
    parts.add(body);

    // Temel
    addFoundation(parts, w, d, h, rng);

    // Duvar dokusu
    if (rng.chance(0.4)) {
      const stoneTex = stoneTexture();
      const wrap = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.05, h + 0.05, d + 0.05),
        cityTexturedMat(stoneTex, 0x504035),
      );
      wrap.position.y = h / 2;
      parts.add(wrap);
    }

    // Kat bantları — her 3-4 katta bir
    const floors = Math.floor(h / 3.2);
    for (let i = 1; i < floors; i++) {
      addFloorBand(parts, w, d, i * 3.2, rng);
    }

    // Korniş / saçak
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.8, 0.5, d + 0.8),
      cityMat(0x3a2a1e),
    );
    cornice.position.y = h + 0.25;
    parts.add(cornice);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6), cityMat(0x2a1d15));
    cap.position.y = h + 0.85;
    parts.add(cap);

    // Yangın merdiveni
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.25, h * 0.8, 0.25), cityMat(0x2b241e));
    ladder.position.set(w / 2 - 0.4, h * 0.45, d / 2 + 0.3);
    parts.add(ladder);

    // Balkon (rastgele, 1-2 tane)
    const balconies = rng.int(0, 3);
    for (let i = 0; i < balconies; i++) {
      const bw = rng.range(2, Math.min(4, w - 1));
      const by = h * rng.range(0.2, 0.8);
      const balcony = new THREE.Mesh(
        new THREE.BoxGeometry(bw, 0.2, 1.4),
        cityMat(0x3a2a1e),
      );
      balcony.position.set(rng.range(-w / 4, w / 4), by, d / 2 + 0.7);
      parts.add(balcony);
      // Korkuluk — dikey çubuklar
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(bw, 1.0, 0.1),
        cityMat(0x2b241e),
      );
      rail.position.set(balcony.position.x, by + 0.6, d / 2 + 1.35);
      parts.add(rail);
      // Korkuluk dikey destekleri
      for (let j = 0; j < 3; j++) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 1.0, 0.08),
          cityMat(0x2b241e),
        );
        post.position.set(balcony.position.x + (j - 1) * bw / 2.5, by + 0.5, d / 2 + 1.35);
        parts.add(post);
      }
    }

    // Bacalar
    const stacks = rng.int(1, 3);
    for (let i = 0; i < stacks; i++) {
      const sx = rng.range(-w / 3, w / 3);
      const sz = rng.range(-d / 3, d / 3);
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.3, 2.4, 6),
        cityMat(0x7a5a30, 0.4, 0.8),
      );
      pipe.position.set(sx, h + 1.2, sz);
      parts.add(pipe);
      addChimneyTop(parts, sx, h + 2.5, sz, rng);
    }

    // Kapı
    if (rng.chance(0.75)) {
      addDetailedDoor(parts, rng.range(-w / 3, w / 3), d / 2 + 0.1, 0, rng);
    }

    // Pencere çerçeveleri ve sundurmalar
    const wCount = rng.int(2, 4);
    for (let i = 0; i < wCount; i++) {
      const wx = rng.range(-w / 3, w / 3);
      const wy = rng.range(1.5, h * 0.8);
      addWindowFrame(parts, wx, wy, d / 2 + 0.08, 0, rng);
      if (rng.chance(0.3)) addAwning(parts, wx, wy, d / 2 + 0.08, rng);
    }

    addFacades(parts, w, h, d, rng);
    radius = Math.max(w, d) * 0.72;
    height = h + 2;
    hp = 110;
  } else if (kind === "workshop") {
    const w = rng.range(7, 10) * scale;
    const h = rng.range(5, 8) * scale;
    const d = rng.range(6, 9) * scale;

    // Ana gövde
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x3d352c));
    body.position.y = h / 2;
    parts.add(body);

    // Temel
    addFoundation(parts, w, d, h, rng);

    // Ahşap doku
    if (rng.chance(0.45)) {
      const wood = woodTexture();
      const wrap = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.05, h + 0.05, d + 0.05),
        cityTexturedMat(wood, 0x4a3525),
      );
      wrap.position.y = h / 2;
      parts.add(wrap);
    }

    // Testere dişi çatı
    const teeth = Math.max(2, Math.round(w / 3));
    for (let i = 0; i < teeth; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w / teeth - 0.2, 1.6, d), cityMat(0x2b241e));
      t.position.set(-w / 2 + (i + 0.5) * (w / teeth), h + 0.8, 0);
      t.rotation.x = 0.35;
      parts.add(t);
    }

    // Bacalar (birden fazla)
    const stacks = rng.int(1, 3);
    for (let i = 0; i < stacks; i++) {
      const sx = w / 2 - 1.2 - i * 1.5;
      const stackH = rng.range(3, 6);
      const st = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.8, stackH, 6),
        cityMat(0x2b241e),
      );
      st.position.set(sx, h + stackH / 2, -d / 2 + 1.2);
      parts.add(st);
      addChimneyTop(parts, sx, h + stackH + 0.1, -d / 2 + 1.2, rng);
    }

    // Büyük kapı (atölye girişi)
    if (rng.chance(0.7)) {
      const gateW = rng.range(2.5, 4.0);
      const gateH = rng.range(3.0, 4.5);
      const gate = new THREE.Mesh(new THREE.BoxGeometry(gateW, gateH, 0.15), cityMat(0x2a1a0e));
      gate.position.set(0, gateH / 2, d / 2 + 0.1);
      parts.add(gate);
      // Kapı üstü kiri
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(gateW + 0.8, 0.35, 0.35),
        cityMat(0x4a3a2c),
      );
      lintel.position.set(0, gateH + 0.2, d / 2 + 0.1);
      parts.add(lintel);
    }

    addFacades(parts, w, h, d, rng);
    radius = Math.max(w, d) * 0.72;
    height = h + 4;
    hp = 140;
  } else if (kind === "warehouse") {
    const w = rng.range(10, 15) * scale;
    const h = rng.range(4, 6) * scale;
    const d = rng.range(8, 12) * scale;

    // Ana gövde
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x3a2f24));
    body.position.y = h / 2;
    parts.add(body);

    // Temel
    addFoundation(parts, w, d, h, rng);

    // Taş doku
    if (rng.chance(0.5)) {
      const stoneTex = stoneTexture();
      const wrap = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.05, h + 0.05, d + 0.05),
        cityTexturedMat(stoneTex, 0x4a3f34),
      );
      wrap.position.y = h / 2;
      parts.add(wrap);
    }

    // Yarım silindir çatı
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(d / 2, d / 2, w, 10, 1, false, 0, Math.PI),
      cityMat(0x4a3a28, 0.7, 0.4),
    );
    roof.rotation.z = Math.PI / 2;
    roof.position.y = h;
    parts.add(roof);

    // Çatı bindirme (çelik bantlar)
    for (let i = 0; i < 4; i++) {
      const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(d / 2 + 0.05, d / 2 + 0.05, 0.15, 10, 1, false, 0, Math.PI),
        cityMat(0x5a4a30, 0.5, 0.6),
      );
      strap.rotation.z = Math.PI / 2;
      strap.position.set(-w / 3 + i * (w / 4.5), h, 0);
      parts.add(strap);
    }

    // Büyük yükleme kapısı
    if (rng.chance(0.6)) {
      const gateW = rng.range(3.0, 5.0);
      const gateH = rng.range(3.0, h - 0.5);
      const gate = new THREE.Mesh(new THREE.BoxGeometry(gateW, gateH, 0.15), cityMat(0x2a1a0e));
      gate.position.set(0, gateH / 2, d / 2 + 0.1);
      parts.add(gate);
      // Ray بالای
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(gateW + 0.4, 0.18, 0.18),
        cityMat(0x5a4a30, 0.5, 0.6),
      );
      rail.position.set(0, gateH + 0.15, d / 2 + 0.15);
      parts.add(rail);
    }

    addFacades(parts, w, h, d, rng);
    radius = Math.max(w, d) * 0.7;
    height = h + d / 2;
    hp = 130;
  } else if (kind === "factory") {
    const w = rng.range(9, 14) * scale;
    const h = rng.range(7, 11) * scale;
    const d = rng.range(8, 12) * scale;

    // Ana gövde
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(0x3a332c));
    body.position.y = h / 2;
    parts.add(body);

    // Temel
    addFoundation(parts, w, d, h, rng);

    // Taş doku
    if (rng.chance(0.4)) {
      const stoneTex = stoneTexture();
      const wrap = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.05, h + 0.05, d + 0.05),
        cityTexturedMat(stoneTex, 0x4a4338),
      );
      wrap.position.y = h / 2;
      parts.add(wrap);
    }

    // Kat bantları
    const floors = Math.floor(h / 3.5);
    for (let i = 1; i < floors; i++) {
      addFloorBand(parts, w, d, i * 3.5, rng);
    }

    // Bacalar (3-4 tane)
    let tallest = h;
    const stackCount = rng.int(2, 5);
    for (let i = 0; i < stackCount; i++) {
      const stackH = rng.range(6, 13) * scale;
      const sx = -w / 3 + i * (w / (stackCount - 1 || 1));
      const sz = rng.range(-d / 4, d / 4);
      const st = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.2, stackH, 8),
        cityMat(0x2b241e, 0.9),
      );
      st.position.set(sx, h + stackH / 2, sz);
      parts.add(st);
      // Bakır halka
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.05, 0.14, 5, 10),
        cityMat(0x8a6b32, 0.35, 0.9),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(sx, h + stackH / 2 - 0.7, sz);
      parts.add(ring);
      addChimneyTop(parts, sx, h + stackH + 0.1, sz, rng);
      tallest = Math.max(tallest, h + stackH);
    }

    // Depolama tankı
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 5, 10),
      cityMat(0x8a6b32, 0.35, 0.9),
    );
    tank.position.set(w / 2 + 2.4, 2.5, -d / 3);
    parts.add(tank);

    // Tank destekleri
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.5, 0.3), cityMat(0x2b241e));
      leg.position.set(
        tank.position.x + Math.cos(a) * 1.8,
        1.25,
        tank.position.z + Math.sin(a) * 1.8,
      );
      parts.add(leg);
    }

    // Büyük fabrika kapısı
    if (rng.chance(0.7)) {
      const gateW = rng.range(3.0, 5.5);
      const gateH = rng.range(3.5, 5.0);
      const gate = new THREE.Mesh(new THREE.BoxGeometry(gateW, gateH, 0.18), cityMat(0x2a1a0e));
      gate.position.set(0, gateH / 2, d / 2 + 0.1);
      parts.add(gate);
      // Çelik kiriş
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(gateW + 1.0, 0.4, 0.5),
        cityMat(0x5a4a30, 0.5, 0.6),
      );
      lintel.position.set(0, gateH + 0.25, d / 2 + 0.15);
      parts.add(lintel);
    }

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

    // Silindirik gövde — dibinde genişletme
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.8, h, 10), cityMat(0x463a2c));
    base.position.y = h / 2;
    parts.add(base);

    // Temel halka
    const fRing = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 3.0, 0.6, 10),
      cityMat(0x3a3028),
    );
    fRing.position.y = 0.3;
    parts.add(fRing);

    // Gövde bindirme halkaları (her 4-5 birimde)
    const bands = Math.floor(h / 4.5);
    for (let i = 1; i <= bands; i++) {
      const bRing = new THREE.Mesh(
        new THREE.TorusGeometry(
          2.8 - (i / bands) * 0.8,
          0.12,
          5,
          10,
        ),
        cityMat(0x5a4a30, 0.6, 0.5),
      );
      bRing.rotation.x = Math.PI / 2;
      bRing.position.y = i * 4.5;
      parts.add(bRing);
    }

    // Kule tepesi — PPC korniş
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 2.2, 2.2, 10),
      cityMat(0x8a6b32, 0.35, 0.9),
    );
    cap.position.y = h + 0.8;
    parts.add(cap);

    // Merslon / dövüşme dişleri
    const merlons = rng.int(6, 10);
    for (let i = 0; i < merlons; i++) {
      const a = (i / merlons) * Math.PI * 2;
      const mx = Math.cos(a) * 3.0;
      const mz = Math.sin(a) * 3.0;
      const merlon = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.7, 0.45),
        cityMat(0x463a2c),
      );
      merlon.position.set(mx, h + 2.2, mz);
      parts.add(merlon);
    }

    // Küçük pencere nişleri (gövdede)
    const winCount = rng.int(2, 5);
    for (let i = 0; i < winCount; i++) {
      const a = (i / winCount) * Math.PI * 2 + rng.range(0, 0.5);
      const wy = rng.range(4, h - 3);
      const r = 2.0 - (wy / h) * 0.3;
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.8, 0.2),
        cityMat(0x150d07),
      );
      win.position.set(Math.cos(a) * r, wy, Math.sin(a) * r);
      win.rotation.y = a;
      parts.add(win);
      // Pencere üstü kemer
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.12, 0.25),
        cityMat(0x5a4a30, 0.6, 0.5),
      );
      lintel.position.set(Math.cos(a) * r, wy + 0.46, Math.sin(a) * r);
      lintel.rotation.y = a;
      parts.add(lintel);
    }

    tower = rng.weighted({ tesla: 0.45, flak: 0.35, isildak: 0.2 } as Record<TowerKind, number>);
    if (tower === "tesla") {
      const coil = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), coilMat);
      coil.position.y = h + 2.5;
      parts.add(coil);
      // Bobin destek çubukları
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const strut = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 1.6, 4),
          cityMat(0x2b241e),
        );
        strut.position.set(Math.cos(a) * 1.0, h + 2.5, Math.sin(a) * 1.0);
        strut.rotation.z = Math.cos(a) * 0.5;
        strut.rotation.x = -Math.sin(a) * 0.5;
        parts.add(strut);
      }
    } else if (tower === "flak") {
      // Çift namlu
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
      // Mermi kutusu
      const ammoBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.8, 0.8),
        cityMat(0x2b241e),
      );
      ammoBox.position.set(1.4, h + 1.6, 0);
      parts.add(ammoBox);
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

  /* ---- Askeri yapılar ---- */

  if (kind === "barracks") {
    // Kışla — geniş dikdörtgen bina, avlu, nöbet kulübesi
    const w = rng.range(8, 12) * scale;
    const h = rng.range(5, 7) * scale;
    const d = rng.range(6, 9) * scale;
    const wallCol = rng.chance(0.5) ? 0x4a4035 : 0x3d352b;
    const wallMat = cityMat(wallCol, 0.9, 0.1);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.y = h / 2;
    parts.add(body);
    // Çatı — eğimli
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
      cityMat(0x2a221a, 0.85),
    );
    roof.position.y = h + 0.25;
    parts.add(roof);
    // Pencereler — askeri-USP
    for (let i = 0; i < Math.floor(w / 2.5); i++) {
      const wx = -w / 2 + 1.2 + i * 2.5;
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 1.4, 0.15),
        cityMat(0x1a1612, 0.7, 0.3),
      );
      win.position.set(wx, h * 0.55, d / 2 + 0.08);
      parts.add(win);
    }
    // Nöbet kulübesi
    const booth = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 2.5, 1.8),
      cityMat(0x3a3028),
    );
    booth.position.set(w / 2 + 1.5, 1.25, 0);
    parts.add(booth);
    const boothRoof = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.3, 2.2),
      cityMat(0x2a221a),
    );
    boothRoof.position.set(w / 2 + 1.5, 2.65, 0);
    parts.add(boothRoof);
    radius = Math.max(w, d) / 2 + 1;
    height = h;
    hp = 160;
  } else if (kind === "armory") {
    // Cephanelik — kalın duvarlı, kapı geniş, patlayabilir
    const w = rng.range(5, 7) * scale;
    const h = rng.range(4, 5.5) * scale;
    const d = rng.range(5, 7) * scale;
    const wallMat = cityMat(0x3a3228, 0.85, 0.15);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.y = h / 2;
    parts.add(body);
    // Kalın duvar hissi — dış paneller
    for (const sx of [-1, 1]) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, h * 0.9, d * 0.8),
        cityMat(0x2e2620, 0.9, 0.2),
      );
      panel.position.set(sx * (w / 2 + 0.2), h * 0.45, 0);
      parts.add(panel);
    }
    // Demir kapı
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 2.8, 0.2),
      cityMat(0x2b241e, 0.6, 0.7),
    );
    door.position.set(0, 1.4, d / 2 + 0.1);
    parts.add(door);
    // Kapı perçinleri
    for (const dy of [0.8, 1.8, 2.6]) {
      for (const dx of [-0.5, 0.5]) {
        const rivet = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 5, 4),
          cityMat(0x8a6b32, 0.4, 0.8),
        );
        rivet.position.set(dx, dy, d / 2 + 0.22);
        parts.add(rivet);
      }
    }
    // Üzerinde "CEPHANELİK" tabelası (kırmızı şerit)
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.6, 0.25, 0.05),
      cityMat(0x8a2020, 0.7),
    );
    stripe.position.set(0, h * 0.7, d / 2 + 0.1);
    parts.add(stripe);
    radius = Math.max(w, d) / 2 + 0.5;
    height = h;
    hp = 200;
  } else if (kind === "command_post") {
    // Komuta merkezi — yüksek, anten, harita odası
    const w = rng.range(6, 9) * scale;
    const h = rng.range(8, 12) * scale;
    const d = rng.range(6, 9) * scale;
    const wallCol = rng.chance(0.5) ? 0x3d3830 : 0x4a4235;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat(wallCol, 0.88, 0.12));
    body.position.y = h / 2;
    parts.add(body);
    // Komuta katı — üstte daha geniş
    const cmdFloor = new THREE.Mesh(
      new THREE.BoxGeometry(w + 1.0, 1.2, d + 1.0),
      cityMat(0x2a2520, 0.85, 0.2),
    );
    cmdFloor.position.y = h - 0.6;
    parts.add(cmdFloor);
    // Anten direği
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 5, 5),
      cityMat(0x2b241e, 0.5, 0.6),
    );
    antenna.position.set(w * 0.25, h + 2.5, 0);
    parts.add(antenna);
    // Anten topu
    const antTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 6, 5),
      cityMat(0x8a6b32, 0.3, 0.8),
    );
    antTop.position.set(w * 0.25, h + 5.2, 0);
    parts.add(antTop);
    // Sinyal ışığı
    const sigLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 5, 4),
      lanternMat,
    );
    sigLight.position.set(w * 0.25, h + 5.5, 0);
    parts.add(sigLight);
    // Pencereler — geniş komuta pencereleri
    for (let i = 0; i < 3; i++) {
      const wx = -w / 2 + 1.5 + i * (w / 3);
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(w / 4.5, 1.8, 0.15),
        cityMat(0x1a1612, 0.6, 0.4),
      );
      win.position.set(wx, h * 0.65, d / 2 + 0.08);
      parts.add(win);
    }
    // Dış merdiven
    const stairs = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, h * 0.4, 2.5),
      cityMat(0x2e2620, 0.9, 0.1),
    );
    stairs.position.set(w / 2 + 0.6, h * 0.2, 0);
    parts.add(stairs);
    radius = Math.max(w, d) / 2 + 1;
    height = h + 5;
    hp = 240;
  } else if (kind === "ammo_depot") {
    // Mühimmat deposu — yuvarlak, silindirik, barikatlı
    const r = rng.range(3.5, 5) * scale;
    const h = rng.range(4, 6) * scale;
    // Ana gövde — silindir
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 1.05, h, 10),
      cityMat(0x3a3228, 0.85, 0.15),
    );
    body.position.y = h / 2;
    parts.add(body);
    // Kubbemsi çatı
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      cityMat(0x2e2620, 0.8, 0.2),
    );
    dome.position.y = h;
    parts.add(dome);
    // Barikatlar — etrafında
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bx = Math.cos(a) * (r + 1.5);
      const bz = Math.sin(a) * (r + 1.5);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.0, 0.3),
        cityMat(0x2b241e, 0.9, 0.1),
      );
      bar.position.set(bx, 0.5, bz);
      bar.rotation.y = a + Math.PI / 2;
      parts.add(bar);
    }
    // Kapı
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 2.4, 0.2),
      cityMat(0x2b241e, 0.6, 0.6),
    );
    door.position.set(0, 1.2, r + 0.1);
    parts.add(door);
    // Patlama uyarısı — sarı şerit
    const warnStripe = new THREE.Mesh(
      new THREE.BoxGeometry(r * 1.2, 0.2, 0.05),
      cityMat(0xc8a820, 0.7),
    );
    warnStripe.position.set(0, h * 0.65, r + 0.08);
    parts.add(warnStripe);
    radius = r + 2;
    height = h + r * 0.5;
    hp = 180;
  } else if (kind === "watchtower") {
    // Gözetleme kulesi — yüksek, dar, gözlem platformu
    const base = rng.range(3, 4) * scale;
    const h = rng.range(12, 18) * scale;
    // Temel
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(base + 1, 1.5, base + 1),
      cityMat(0x3a3228, 0.9, 0.1),
    );
    foundation.position.y = 0.75;
    parts.add(foundation);
    // Direk gövdesi
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(base, h, base),
      cityMat(0x4a4035, 0.88, 0.1),
    );
    pole.position.y = h / 2 + 1.5;
    parts.add(pole);
    // Platform — üstte geniş
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(base + 2, 0.4, base + 2),
      cityMat(0x2e2620, 0.85, 0.15),
    );
    platform.position.y = h + 1.7;
    parts.add(platform);
    // Korkuluk
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 1.2, 0.15),
          cityMat(0x2b241e, 0.9),
        );
        post.position.set(sx * (base / 2 + 0.8), h + 2.5, sz * (base / 2 + 0.8));
        parts.add(post);
      }
    }
    // Siper duvarı
    for (const side of ["front", "back", "left", "right"]) {
      const isX = side === "front" || side === "back";
      const s = side === "front" || side === "right" ? 1 : -1;
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(isX ? base + 2 : 0.2, 0.8, isX ? 0.2 : base + 2),
        cityMat(0x3a3228, 0.85),
      );
      wall.position.set(
        isX ? 0 : s * (base / 2 + 0.9),
        h + 2.5,
        isX ? s * (base / 2 + 0.9) : 0,
      );
      parts.add(wall);
    }
    // Tüfek slotları
    for (let i = 0; i < 3; i++) {
      const slotAngle = (i / 3) * Math.PI * 2;
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.4, 0.15),
        cityMat(0x1a1612, 0.7, 0.3),
      );
      slot.position.set(
        Math.cos(slotAngle) * (base / 2 + 0.5),
        h + 2.2,
        Math.sin(slotAngle) * (base / 2 + 0.5),
      );
      slot.rotation.y = slotAngle;
      parts.add(slot);
    }
    radius = base / 2 + 2;
    height = h + 3;
    hp = 150;
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
    splitDone: false,
    apply(t) {
      if (t.dead) {
        if (!t.splitDone) {
          t.splitDone = true;
          // Binaların yarısını ayır — sol ve sağ
          const halfX = spec.radius * 0.6;
          group.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const m = child as THREE.Mesh;
              const mat = m.material as THREE.MeshStandardMaterial;
              if (mat.color) {
                mat.color.multiplyScalar(0.65);
                // Rengi sarıya kaydır
                mat.color.r = Math.min(1, mat.color.r + 0.15);
                mat.color.g = Math.min(1, mat.color.g + 0.08);
              }
              if (mat.emissive) {
                mat.emissive.setHex(0xffcc22);
                mat.emissiveIntensity = 2.5;
              }
            }
          });
          // Yarıları ayır
          for (const child of group.children) {
            if (child.position.x < 0) {
              child.position.x -= halfX;
              child.rotation.z = -0.08 - Math.random() * 0.12;
            } else {
              child.position.x += halfX;
              child.rotation.z = 0.08 + Math.random() * 0.12;
            }
            child.position.y -= 0.5 + Math.random() * 1.5;
          }
        }
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

/* ------------------------------------------------------------------ *
 * Dekoratif Araçlar — şehir sokaklarına serpiştirilen buharlı arabalar
 * ------------------------------------------------------------------ */

export type VehicleKind = "wagon" | "truck" | "cart";

/** Buharlı araba — yıkılamaz dekoratif prop. */
export function buildVehicle(kind: VehicleKind, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const dark = cityMat(0x2a1e14);
  const wood = cityMat(0x3a2a18);
  const metal = cityMat(0x5a4a30, 0.5, 0.7);
  const wheelMat = cityMat(0x1a1410, 0.8, 0.5);

  if (kind === "wagon") {
    const bodyW = rng.range(2.8, 4.2);
    const bodyH = rng.range(1.2, 1.8);
    const bodyD = rng.range(1.6, 2.2);
    const box = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), wood);
    box.position.y = 1.4;
    g.add(box);
    if (rng.chance(0.6)) {
      const load = new THREE.Mesh(
        new THREE.BoxGeometry(bodyW - 0.4, bodyH * 0.6, bodyD - 0.3),
        cityMat(0x1a1008),
      );
      load.position.y = 1.6;
      g.add(load);
    }
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.6, 0.25, bodyD + 0.2), dark);
    chassis.position.y = 0.7;
    g.add(chassis);
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 8), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(sx * (bodyW / 2 - 0.3), 0.45, sz * (bodyD / 2 + 0.15));
      g.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 6), metal);
      hub.rotation.x = Math.PI / 2;
      hub.position.copy(wheel.position);
      g.add(hub);
    }
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.0), metal);
    tongue.position.set(0, 0.9, bodyD / 2 + 1.0);
    g.add(tongue);
  } else if (kind === "truck") {
    const bodyW = rng.range(3.5, 5.0);
    const bodyH = rng.range(1.4, 2.0);
    const bodyD = rng.range(2.0, 2.8);
    const box = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), dark);
    box.position.y = 1.5;
    g.add(box);
    const boiler = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, bodyW * 0.4, 8),
      metal,
    );
    boiler.rotation.z = Math.PI / 2;
    boiler.position.set(-bodyW / 4, 1.5, 0);
    g.add(boiler);
    const stack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6),
      cityMat(0x3a3028, 0.6, 0.6),
    );
    stack.position.set(-bodyW / 4, 2.6, 0);
    g.add(stack);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.8, 0.3, bodyD + 0.3), dark);
    chassis.position.y = 0.7;
    g.add(chassis);
    for (const sx of [-bodyW / 3, 0, bodyW / 3]) {
      for (const sz of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 8), wheelMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(sx, 0.5, sz * (bodyD / 2 + 0.2));
        g.add(wheel);
      }
    }
  } else {
    const bodyW = rng.range(1.2, 1.8);
    const bodyH = rng.range(0.6, 1.0);
    const bodyD = rng.range(0.8, 1.2);
    const box = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), wood);
    box.position.y = 1.0;
    g.add(box);
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 8), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(0, 0.35, sz * (bodyD / 2 + 0.1));
      g.add(wheel);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.0), metal);
    handle.position.set(0, 1.2, bodyD / 2 + 1.0);
    g.add(handle);
  }

  g.rotation.y = rng.range(0, Math.PI * 2);
  return g;
}

export type DecoKind = "rock" | "cactus" | "deadtree" | "tent" | "barrel" | "campfire";

/** Çöl dekoratif prop — yıkılamaz görsel. */
export function buildDeco(kind: DecoKind, rng: Rng, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const stone_ = cityMat(0x5a4a38);
  const sand = cityMat(0x8a7a5a);
  const wood = cityMat(0x3a2a18);
  const dark = cityMat(0x1a1410);

  if (kind === "rock") {
    const r = rng.range(1.5, 4.5) * scale;
    const h = r * rng.range(0.4, 0.9);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), stone_);
    rock.scale.set(1, h / r, rng.range(0.7, 1.0));
    rock.position.y = h * 0.4;
    rock.rotation.set(rng.range(0, 0.3), rng.range(0, Math.PI * 2), rng.range(0, 0.2));
    g.add(rock);
    if (rng.chance(0.4)) {
      const r2 = r * rng.range(0.3, 0.6);
      const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(r2, 0), stone_);
      rock2.position.set(rng.range(-r, r) * 0.8, r2 * 0.3, rng.range(-r, r) * 0.8);
      g.add(rock2);
    }
  } else if (kind === "cactus") {
    const trunkH = rng.range(4, 10) * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.4 * scale, trunkH, 6), new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.9 }));
    trunk.position.y = trunkH / 2;
    g.add(trunk);
    const armCount = rng.int(1, 4);
    for (let i = 0; i < armCount; i++) {
      const armH = rng.range(2, 4) * scale;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.25 * scale, armH, 5), new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.9 }));
      const armY = trunkH * rng.range(0.3, 0.7);
      const armAngle = rng.range(-0.5, 0.5);
      const dir = rng.chance(0.5) ? 1 : -1;
      arm.position.set(dir * (1.2 + rng.range(0, 0.5)) * scale, armY + armH * 0.3, rng.range(-0.5, 0.5) * scale);
      arm.rotation.z = dir * (0.3 + armAngle);
      g.add(arm);
    }
  } else if (kind === "deadtree") {
    const trunkH = rng.range(5, 12) * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.5 * scale, trunkH, 5), wood);
    trunk.position.y = trunkH / 2;
    g.add(trunk);
    const branches = rng.int(2, 5);
    for (let i = 0; i < branches; i++) {
      const bLen = rng.range(2, 5) * scale;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.15 * scale, bLen, 4), wood);
      const by = trunkH * rng.range(0.4, 0.9);
      const dir = rng.chance(0.5) ? 1 : -1;
      b.position.set(dir * bLen * 0.4, by + bLen * 0.2, rng.range(-0.5, 0.5) * scale);
      b.rotation.z = dir * rng.range(0.4, 1.2);
      g.add(b);
    }
  } else if (kind === "tent") {
    const tw = rng.range(3, 5) * scale;
    const td = rng.range(3, 6) * scale;
    const th = rng.range(2, 3.5) * scale;
    const cloth = new THREE.MeshStandardMaterial({ color: rng.chance(0.5) ? 0x8a7050 : 0x6a5a40, roughness: 1, side: THREE.DoubleSide });
    const sideA = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), cloth);
    sideA.position.set(0, th * 0.45, -td * 0.25);
    sideA.rotation.x = -0.35;
    g.add(sideA);
    const sideB = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), cloth);
    sideB.position.set(0, th * 0.45, td * 0.25);
    sideB.rotation.x = 0.35;
    g.add(sideB);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, th * 1.1, 4), wood);
    pole.position.y = th * 0.55;
    g.add(pole);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.9, 0.1, td * 0.8), sand);
    floor.position.y = 0.05;
    g.add(floor);
  } else if (kind === "barrel") {
    const r = rng.range(0.5, 0.9) * scale;
    const h = rng.range(1.0, 1.6) * scale;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, h, 8), wood);
    barrel.position.y = h / 2;
    g.add(barrel);
    for (const ringY of [0.2, 0.5, 0.8]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.04 * scale, 4, 12), dark);
      ring.position.y = h * ringY;
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
  } else if (kind === "campfire") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2 * scale, 0.2 * scale, 4, 12), stone_);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 1.6 * scale, 4), wood);
      log.position.set(Math.cos(a) * 0.5 * scale, 0.2, Math.sin(a) * 0.5 * scale);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = a;
      g.add(log);
    }
  }

  g.rotation.y = rng.range(0, Math.PI * 2);
  return g;
}
export function buildTree(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const type = rng.int(0, 3);

  const trunkH = rng.range(1.8, 4.0);
  const trunkR = rng.range(0.15, 0.35);
  const barkCol = rng.chance(0.5) ? 0x3d2b1f : rng.chance(0.5) ? 0x4a3728 : 0x2e1e14;
  const trunkMat = cityMat(barkCol, 0.9, 0.05);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.6, trunkR, trunkH, 7), trunkMat);
  trunk.position.y = trunkH / 2;
  g.add(trunk);

  const leafDark = rng.chance(0.3) ? 0x2d4a1a : rng.chance(0.5) ? 0x3a5c22 : 0x4a6e2c;
  const leafMid = rng.chance(0.5) ? 0x4e7a30 : 0x5a8a38;
  const leafMat = cityMat(leafDark, 0.92, 0.02);
  const leafMat2 = cityMat(leafMid, 0.88, 0.02);

  if (type === 0) {
    // Yuvarlak taç — bir büyük küre + birkaç küçük
    const crownR = rng.range(1.8, 3.2);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(crownR, 8, 7), leafMat);
    crown.position.y = trunkH + crownR * 0.6;
    g.add(crown);
    for (let i = 0; i < 3; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.8, 1.8);
      const s = crownR * rng.range(0.35, 0.55);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), i % 2 === 0 ? leafMat2 : leafMat);
      puff.position.set(Math.cos(a) * d, trunkH + crownR * 0.3 + rng.range(-0.5, 0.8), Math.sin(a) * d);
      g.add(puff);
    }
  } else if (type === 1) {
    // Konik — çam ağacı
    const layers = rng.int(2, 4);
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const coneH = rng.range(1.5, 2.5) * (1 - t * 0.3);
      const coneR = rng.range(1.2, 2.2) * (1 - t * 0.25);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(coneR, coneH, 7),
        i % 2 === 0 ? leafMat : leafMat2,
      );
      cone.position.y = trunkH - 0.3 + i * coneH * 0.55;
      g.add(cone);
    }
  } else {
    // Uzun gövdeli, geniş taç — meşe benzeri
    const crownR = rng.range(2.2, 3.8);
    const crownH = rng.range(1.5, 2.5);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(crownR, 8, 6), leafMat);
    crown.scale.y = crownH / crownR;
    crown.position.y = trunkH + crownH * 0.3;
    g.add(crown);
    // Dallar
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, Math.PI * 2);
      const branchL = rng.range(0.8, 1.8);
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.1, branchL, 5),
        trunkMat,
      );
      branch.position.set(
        Math.cos(a) * crownR * 0.6,
        trunkH + rng.range(-0.5, 0.5),
        Math.sin(a) * crownR * 0.6,
      );
      branch.rotation.z = rng.range(0.4, 0.9) * (rng.chance(0.5) ? 1 : -1);
      branch.rotation.y = a;
      g.add(branch);
      const leafPuff = new THREE.Mesh(
        new THREE.SphereGeometry(rng.range(0.6, 1.2), 5, 4),
        leafMat2,
      );
      leafPuff.position.set(
        Math.cos(a) * (crownR * 0.6 + branchL * 0.4),
        trunkH + rng.range(0, 1),
        Math.sin(a) * (crownR * 0.6 + branchL * 0.4),
      );
      g.add(leafPuff);
    }
  }

  return g;
}
