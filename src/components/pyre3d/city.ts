import * as THREE from "three";
import { cityMat, lanternMat, streetMat } from "./materials";
import { mulberry32, type Rng } from "./rng";
import { buildStructure, buildVehicle, buildTree, FLAMMABILITY } from "./structures";
import { createNpcSystem, type NpcHandle } from "./npcs";
import type { Target, TargetKind, TowerKind } from "./types";
import {
  bake,
  bakeTagged,
  terrainHeight,
  writeState,
  type TagRange,
  type TerrainMod,
} from "./world";

/**
 * Kül Şehri.
 *
 * Eskiden 78 bina 900 yarıçaplı boş bir dairenin içine rastgele saçılıyordu:
 * ne bir yer hissi vardı ne de hedefleri bulmanın bir yolu. Onun yerine
 * halkalı bölge planı kuruyoruz — merkez meydandan sur kapılarına giden
 * radyal caddeler, halka yolları ve bunların arasında kalan bloklar.
 *
 * Üretim tohumlanmış: aynı bölüm her açılışta aynı şehri kurar, "en iyi skor"
 * adil kalır, hata ayıklama tekrarlanabilir olur.
 *
 * Performans sözleşmesi:
 *  - Binalar BLOK başına tek mesh'e birleştirilir (draw call ~30 × materyal).
 *  - Yıkım geometriyi değiştirmez: `aState` niteliğine yazılır, shader yaması
 *    vertex'i klip dışına iter (bkz. materials.ts).
 *  - Şehir binaları gölge DÖKMEZ; yoğun şehir üzerinde gölge geçişi tek en
 *    büyük maliyet ve vertex çökertme hilesi ayrıca yamalı bir depth
 *    materyali gerektirirdi.
 */

export type District = "core" | "residential" | "market" | "industrial" | "docks";

export type CitySpec = {
  seed: number;
  cx: number;
  cz: number;
  radius: number;
  density: "small" | "medium" | "large";
  wall: boolean;
  masts: number;
  elevators: number;
};

export type CityBlock = {
  id: number;
  district: District;
  center: THREE.Vector3;
  radius: number;
  buildings: Target[];
  alive: number;
};

export type CityHandle = {
  group: THREE.Group;
  blocks: CityBlock[];
  targets: Target[];
  spec: CitySpec;
  npcs: NpcHandle;
  /** Cadde/meydan testi — yangının blok atlamasını zorlaştırır. */
  streetAt(x: number, z: number): boolean;
  dispose(): void;
};

const SECTORS = 8;
const AVENUE_HALF = 9;
const RING_ROAD_HALF = 7;
/** Parsel kenarından binaya bırakılan pay. */
const GUTTER = 1.3;

const DENSITY_DEPTH: Record<CitySpec["density"], number> = { small: 2, medium: 3, large: 4 };
const DENSITY_MIN_AREA: Record<CitySpec["density"], number> = {
  small: 320,
  medium: 150,
  large: 84,
};

/** Halka sınırları, yarıçapın oranı olarak. */
const RINGS = [0.13, 0.3, 0.52, 0.76, 1.0];

const DISTRICT_WEIGHTS: Record<District, Partial<Record<TargetKind, number>>> = {
  core: { factory: 0.2, workshop: 0.25, tenement: 0.25, warehouse: 0.08, command_post: 0.12, barracks: 0.1 },
  residential: { tenement: 0.5, house: 0.3, workshop: 0.08, barracks: 0.07, watchtower: 0.05 },
  market: { house: 0.3, workshop: 0.25, tenement: 0.2, warehouse: 0.1, armory: 0.08, ammo_depot: 0.07 },
  industrial: { factory: 0.35, workshop: 0.22, warehouse: 0.18, armory: 0.1, ammo_depot: 0.08, command_post: 0.07 },
  docks: { warehouse: 0.45, workshop: 0.2, house: 0.15, barracks: 0.12, watchtower: 0.08 },
};

const DISTRICT_SCALE: Record<District, [number, number]> = {
  core: [1.05, 1.5],
  residential: [0.85, 1.2],
  market: [0.7, 1.05],
  industrial: [0.95, 1.35],
  docks: [0.7, 1.0],
};

function districtOf(ring: number, sector: number): District {
  if (ring === 0) return "core";
  if (ring === 1) return "residential";
  if (ring === 2) return "market";
  return sector >= 2 && sector <= 4 ? "industrial" : sector >= 6 ? "docks" : "residential";
}

/** Şehrin oturduğu araziyi düzleştiren biçimlendirme. */
export function cityFlattenMod(spec: CitySpec): TerrainMod {
  return {
    t: "flatten",
    x: spec.cx,
    z: spec.cz,
    radius: spec.radius * 1.05,
    feather: spec.radius * 0.35,
    // Merkez yüksekliğini araziden alıyoruz ki şehir manzaraya gömülmesin.
    height: 0,
  };
}

type Lot = { r0: number; r1: number; a0: number; a1: number };

function subdivide(lot: Lot, depth: number, minArea: number, rng: Rng, out: Lot[]): void {
  const rc = (lot.r0 + lot.r1) / 2;
  const w = rc * (lot.a1 - lot.a0);
  const d = lot.r1 - lot.r0;
  if (w <= 0 || d <= 0) return;
  if (depth <= 0 || w * d < minArea || (w < 9 && d < 9)) {
    out.push(lot);
    return;
  }
  const t = rng.range(0.36, 0.64);
  if (w > d) {
    const am = lot.a0 + (lot.a1 - lot.a0) * t;
    subdivide({ r0: lot.r0, r1: lot.r1, a0: lot.a0, a1: am }, depth - 1, minArea, rng, out);
    subdivide({ r0: lot.r0, r1: lot.r1, a0: am, a1: lot.a1 }, depth - 1, minArea, rng, out);
  } else {
    const rm = lot.r0 + d * t;
    subdivide({ r0: lot.r0, r1: rm, a0: lot.a0, a1: lot.a1 }, depth - 1, minArea, rng, out);
    subdivide({ r0: rm, r1: lot.r1, a0: lot.a0, a1: lot.a1 }, depth - 1, minArea, rng, out);
  }
}

/** Kaldırım/cadde kaplaması ve sur — tek mesh'e birleşen dekor. */
function buildPavement(spec: CitySpec, baseY: number, rng: Rng): THREE.Group {
  const parts = new THREE.Group();
  const R = spec.radius;

  const plate = new THREE.Mesh(new THREE.CircleGeometry(R * 1.04, 48), streetMat);
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(spec.cx, baseY + 0.05, spec.cz);
  parts.add(plate);

  // Radyal caddeler: havadan şehir planını okutan asıl çizgiler.
  const paleStreet = cityMat(0x33291f, 1);
  for (let j = 0; j < SECTORS; j++) {
    const a = (j / SECTORS) * Math.PI * 2;
    const len = R * 1.02 - R * RINGS[0]!;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, AVENUE_HALF * 2), paleStreet);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -a;
    strip.position.set(
      spec.cx + Math.cos(a) * (R * RINGS[0]! + len / 2),
      baseY + 0.12,
      spec.cz + Math.sin(a) * (R * RINGS[0]! + len / 2),
    );
    parts.add(strip);

    // Cadde kenarları (kerb) — her iki taraf
    const kerbMat = cityMat(0x2a2018, 0.95);
    for (const side of [-1, 1]) {
      const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.35, 0.4),
        kerbMat,
      );
      kerb.rotation.x = -Math.PI / 2;
      kerb.rotation.z = -a;
      kerb.position.set(
        spec.cx + Math.cos(a) * (R * RINGS[0]! + len / 2),
        baseY + 0.18,
        spec.cz + Math.sin(a) * (R * RINGS[0]! + len / 2) + side * AVENUE_HALF,
      );
      parts.add(kerb);
    }

    // Cadde lambaları — her 12 birimde bir
    const lampCount = Math.max(1, Math.floor(len / 12));
    for (let k = 0; k < lampCount; k++) {
      const t = (k + 0.5) / lampCount;
      const lx = spec.cx + Math.cos(a) * (R * RINGS[0]! + len * t);
      const lz = spec.cz + Math.sin(a) * (R * RINGS[0]! + len * t);
      const side = k % 2 === 0 ? 1 : -1;
      addStreetLamp(parts, lx + Math.cos(a + Math.PI / 2) * side * (AVENUE_HALF - 1.5), baseY, lz + Math.sin(a + Math.PI / 2) * side * (AVENUE_HALF - 1.5), rng);
    }

    // Cadde kenarlarına ağaçlar — lambaların ters tarafına
    const treePerAvenue = Math.max(1, Math.floor(len / 16));
    for (let k = 0; k < treePerAvenue; k++) {
      if (rng.chance(0.55)) continue;
      const t = (k + 0.5) / treePerAvenue;
      const tx = spec.cx + Math.cos(a) * (R * RINGS[0]! + len * t);
      const tz = spec.cz + Math.sin(a) * (R * RINGS[0]! + len * t);
      const side = k % 2 === 0 ? -1 : 1;
      const tree = buildTree(rng);
      tree.position.set(
        tx + Math.cos(a + Math.PI / 2) * side * (AVENUE_HALF - 0.5),
        baseY + 0.1,
        tz + Math.sin(a + Math.PI / 2) * side * (AVENUE_HALF - 0.5),
      );
      parts.add(tree);
    }
  }

  // Halka yolları.
  for (const f of RINGS) {
    const rr = R * f;
    if (rr < 4) continue;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(rr - RING_ROAD_HALF, rr + RING_ROAD_HALF, 48),
      paleStreet,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(spec.cx, baseY + 0.1, spec.cz);
    parts.add(ring);

    // Halka yolu kenarları (kerb)
    const kerbMat = cityMat(0x2a2018, 0.95);
    for (const side of [-1, 1]) {
      const rKerb = new THREE.Mesh(
        new THREE.TorusGeometry(rr + side * RING_ROAD_HALF, 0.2, 4, 48),
        kerbMat,
      );
      rKerb.rotation.x = Math.PI / 2;
      rKerb.position.set(spec.cx, baseY + 0.18, spec.cz);
      parts.add(rKerb);
    }

    // Halka yolu lambaları
    const lampInterval = 18;
    const circumference = 2 * Math.PI * rr;
    const lCount = Math.max(4, Math.floor(circumference / lampInterval));
    for (let k = 0; k < lCount; k++) {
      const a = (k / lCount) * Math.PI * 2;
      const side = k % 2 === 0 ? 1 : -1;
      addStreetLamp(
        parts,
        spec.cx + Math.cos(a) * (rr + side * (RING_ROAD_HALF - 1.5)),
        baseY,
        spec.cz + Math.sin(a) * (rr + side * (RING_ROAD_HALF - 1.5)),
        rng,
      );
    }

    // Halka yolu kenarlarına ağaçlar
    const ringTreeCount = Math.max(3, Math.floor(circumference / 22));
    for (let k = 0; k < ringTreeCount; k++) {
      if (rng.chance(0.5)) continue;
      const a = (k / ringTreeCount) * Math.PI * 2;
      const side = k % 2 === 0 ? 1 : -1;
      const tree = buildTree(rng);
      tree.position.set(
        spec.cx + Math.cos(a) * (rr + side * (RING_ROAD_HALF + 1.5)),
        baseY + 0.1,
        spec.cz + Math.sin(a) * (rr + side * (RING_ROAD_HALF + 1.5)),
      );
      parts.add(tree);
    }
  }

  // Kazan Meydanı: merkez, köz damarından beslenen bir ızgara.
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(R * RINGS[0]! * 0.85, 24),
    cityMat(0x3a2d20, 1),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(spec.cx, baseY + 0.16, spec.cz);
  parts.add(plaza);
  const vent = new THREE.Mesh(new THREE.CircleGeometry(R * RINGS[0]! * 0.3, 18), lanternMat);
  vent.rotation.x = -Math.PI / 2;
  vent.position.set(spec.cx, baseY + 0.2, spec.cz);
  parts.add(vent);

  // Meydan etrafında ağaçlar
  const treeCount = rng.int(5, 8);
  for (let i = 0; i < treeCount; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(R * RINGS[0]! * 0.45, R * RINGS[0]! * 0.82);
    const tx = spec.cx + Math.cos(a) * rr;
    const tz = spec.cz + Math.sin(a) * rr;
    const tree = buildTree(rng);
    tree.position.set(tx, baseY + 0.1, tz);
    tree.rotation.y = rng.range(0, Math.PI * 2);
    parts.add(tree);
  }

  // Meydan etrafında fenerler
  const plazaR = R * RINGS[0]! * 0.75;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    addStreetLamp(
      parts,
      spec.cx + Math.cos(a) * plazaR,
      baseY,
      spec.cz + Math.sin(a) * plazaR,
      rng,
    );
  }

  // Araçlar — cadde kenarlarına serpiştirilmiş buharlı arabalar
  const vehicleKinds: Array<"wagon" | "truck" | "cart"> = ["wagon", "truck", "cart"];
  for (let j = 0; j < SECTORS; j++) {
    const a = (j / SECTORS) * Math.PI * 2;
    const len = R * 1.02 - R * RINGS[0]!;
    const vCount = Math.max(1, Math.floor(len / 20));
    for (let k = 0; k < vCount; k++) {
      if (rng.chance(0.4)) continue;
      const t = (k + 0.5) / vCount;
      const vx = spec.cx + Math.cos(a) * (R * RINGS[0]! + len * t);
      const vz = spec.cz + Math.sin(a) * (R * RINGS[0]! + len * t);
      const side = k % 2 === 0 ? 1 : -1;
      const offset = side * (AVENUE_HALF - 2.5);
      const vx2 = vx + Math.cos(a + Math.PI / 2) * offset;
      const vz2 = vz + Math.sin(a + Math.PI / 2) * offset;
      const kind = vehicleKinds[rng.int(0, 2)]!;
      const v = buildVehicle(kind, rng);
      v.position.set(vx2, baseY + 0.05, vz2);
      v.rotation.y = a + (rng.chance(0.5) ? 0 : Math.PI);
      parts.add(v);
    }
  }
  // Halka yollarına araçlar
  for (const f of RINGS) {
    const rr = R * f;
    if (rr < 8) continue;
    const circ = 2 * Math.PI * rr;
    const vCount = Math.max(2, Math.floor(circ / 24));
    for (let k = 0; k < vCount; k++) {
      if (rng.chance(0.45)) continue;
      const a = (k / vCount) * Math.PI * 2;
      const side = k % 2 === 0 ? 1 : -1;
      const rr2 = rr + side * (RING_ROAD_HALF - 2.5);
      const vx = spec.cx + Math.cos(a) * rr2;
      const vz = spec.cz + Math.sin(a) * rr2;
      const kind = vehicleKinds[rng.int(0, 2)]!;
      const v = buildVehicle(kind, rng);
      v.position.set(vx, baseY + 0.05, vz);
      v.rotation.y = a + Math.PI / 2 + (rng.chance(0.5) ? 0 : Math.PI);
      parts.add(v);
    }
  }

  // Park alanı — bir sektörde yoğun ağaç kümesi
  const parkSector = rng.int(2, 7);
  const daPark = (Math.PI * 2) / SECTORS;
  const parkA = parkSector * daPark + daPark * 0.5;
  const parkR0 = R * 0.45;
  const parkR1 = R * 0.72;
  for (let i = 0; i < 15; i++) {
    const a = rng.range(parkA - daPark * 0.35, parkA + daPark * 0.35);
    const r = rng.range(parkR0, parkR1);
    const tx = spec.cx + Math.cos(a) * r;
    const tz = spec.cz + Math.sin(a) * r;
    const tree = buildTree(rng);
    tree.position.set(tx, baseY + 0.1, tz);
    tree.rotation.y = rng.range(0, Math.PI * 2);
    parts.add(tree);
  }

  if (spec.wall) {
    const wallR = R * 1.06;
    const da = (Math.PI * 2) / SECTORS;
    // Askeri kamp duvarı — ahşap palisad + metal destekler
    const palisadeMat = cityMat(0x3d2b1f, 0.92, 0.05);
    const metalMat = cityMat(0x2b241e, 0.6, 0.6);
    const seg = 40;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;

      const wallLen = (Math.PI * 2 * wallR) / seg + 5;

      // Ana palisade duvarı — ahşap kütükler
      const wallH = rng.range(10, 13);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(3, wallH, wallLen),
        palisadeMat,
      );
      wall.position.set(spec.cx + Math.cos(a) * wallR, baseY + wallH / 2, spec.cz + Math.sin(a) * wallR);
      wall.rotation.y = -a;
      parts.add(wall);

      // Ahşap kütük dişleri (üstte sivri uçlar)
      const logCount = Math.max(2, Math.floor(wallLen / 1.2));
      for (let j = 0; j < logCount; j++) {
        const offset = (j / (logCount - 1) - 0.5) * wallLen;
        const log = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.18, 2.2, 5),
          palisadeMat,
        );
        log.position.set(
          spec.cx + Math.cos(a) * wallR + Math.cos(a + Math.PI / 2) * offset * Math.cos(a),
          baseY + wallH + 1.1,
          spec.cz + Math.sin(a) * wallR + Math.sin(a + Math.PI / 2) * offset * Math.cos(a),
        );
        log.rotation.y = -a;
        parts.add(log);
      }

      // Metal destek direkleri — her 3 parçada bir
      if (i % 3 === 0) {
        const support = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, wallH + 2, 0.5),
          metalMat,
        );
        support.position.set(
          spec.cx + Math.cos(a) * wallR,
          baseY + (wallH + 2) / 2,
          spec.cz + Math.sin(a) * wallR,
        );
        support.rotation.y = -a;
        parts.add(support);

        //rama askeri lamba (searchlight)
        const spotlight = new THREE.Mesh(
          new THREE.ConeGeometry(0.5, 0.8, 6),
          cityMat(0x8a6b32, 0.35, 0.9),
        );
        spotlight.position.set(
          spec.cx + Math.cos(a) * wallR,
          baseY + wallH + 2.5,
          spec.cz + Math.sin(a) * wallR,
        );
        parts.add(spotlight);

        // Işık.createQuery
        const lightGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 6, 5),
          lanternMat,
        );
        lightGlow.position.set(
          spec.cx + Math.cos(a) * wallR,
          baseY + wallH + 2.2,
          spec.cz + Math.sin(a) * wallR,
        );
        parts.add(lightGlow);
      }

      // Dikenli tel — duvarın üstünde
      if (i % 2 === 0) {
        const wireLen = wallLen * 0.6;
        const wire = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.3, wireLen),
          metalMat,
        );
        wire.position.set(
          spec.cx + Math.cos(a) * wallR,
          baseY + wallH + 0.4,
          spec.cz + Math.sin(a) * wallR,
        );
        wire.rotation.y = -a;
        parts.add(wire);
      }
    }

    // Gözetleme kuleleri — kapıların yanına ve duvar köşelerine
    const towerPositions = [0, 2, 4, 6].map((s) => s * da + da / 2);
    for (const ta of towerPositions) {
      const tx = spec.cx + Math.cos(ta) * wallR;
      const tz = spec.cz + Math.sin(ta) * wallR;
      const ty = baseY;

      // Kule temeli
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(4, 2, 4),
        cityMat(0x3a3228, 0.85, 0.15),
      );
      base.position.set(tx, ty + 1, tz);
      parts.add(base);

      // Kule gövdesi — ahşap
      const towerH = rng.range(8, 11);
      const towerBody = new THREE.Mesh(
        new THREE.BoxGeometry(3, towerH, 3),
        palisadeMat,
      );
      towerBody.position.set(tx, ty + 2 + towerH / 2, tz);
      parts.add(towerBody);

      // Gözlem platformu
      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(4, 0.4, 4),
        cityMat(0x2e2620, 0.85, 0.15),
      );
      platform.position.set(tx, ty + 2 + towerH + 0.2, tz);
      parts.add(platform);

      // Korkuluk
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 1.2, 0.15),
            palisadeMat,
          );
          post.position.set(
            tx + sx * 1.7,
            ty + 2 + towerH + 0.8,
            tz + sz * 1.7,
          );
          parts.add(post);
        }
      }

      // Gözetleme gözleri — ahşap panjur
      for (const side of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const eye = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.5, 0.15),
          cityMat(0x1a1612, 0.7, 0.3),
        );
        eye.position.set(
          tx + Math.cos(side) * 1.6,
          ty + 2 + towerH - 1.5,
          tz + Math.sin(side) * 1.6,
        );
        eye.rotation.y = side;
        parts.add(eye);
      }

      // Tüfek yuvası
      const rifleSlot = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.3, 0.15),
        metalMat,
      );
      rifleSlot.position.set(tx, ty + 2 + towerH - 0.8, tz + 1.6);
      parts.add(rifleSlot);
    }

    // Askeri kapısı — her caddede (gerçekçi silindirik kuleli gatehouse)
    const gateW = 7;
    const gateH = 10;
    const gateDepth = 4.5;
    const towerR = 3.2;
    const towerH = 14;

    for (let j = 0; j < SECTORS; j++) {
      const gateA = j * da;
      const gx = spec.cx + Math.cos(gateA) * wallR;
      const gz = spec.cz + Math.sin(gateA) * wallR;
      const perpX = Math.cos(gateA + Math.PI / 2);
      const perpZ = Math.sin(gateA + Math.PI / 2);
      const radX = Math.cos(gateA);
      const radZ = Math.sin(gateA);

      // === SİLİNDİRİK KULELER ===
      for (const side of [-1, 1]) {
        const kx = gx + perpX * side * (gateW / 2 + towerR + 0.8);
        const kz = gz + perpZ * side * (gateW / 2 + towerR + 0.8);

        // Taş temel — geniş silindir
        const baseRing = new THREE.Mesh(
          new THREE.CylinderGeometry(towerR + 0.5, towerR + 0.8, 2.5, 12),
          cityMat(0x3a3228, 0.85, 0.15),
        );
        baseRing.position.set(kx, baseY + 1.25, kz);
        parts.add(baseRing);

        // Ahşap kütük gövdesi — silindir + dikey kütük detayları
        const mainBody = new THREE.Mesh(
          new THREE.CylinderGeometry(towerR, towerR + 0.2, towerH, 12),
          palisadeMat,
        );
        mainBody.position.set(kx, baseY + 2.5 + towerH / 2, kz);
        parts.add(mainBody);

        // Dikey kütük kabartmaları — silindir etrafında
        const logCount = 10;
        for (let li = 0; li < logCount; li++) {
          const la = (li / logCount) * Math.PI * 2;
          const log = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.22, towerH * 0.85, 5),
            cityMat(0x2e1e14, 0.92, 0.05),
          );
          log.position.set(
            kx + Math.cos(la) * (towerR + 0.1),
            baseY + 2.5 + towerH * 0.43,
            kz + Math.sin(la) * (towerR + 0.1),
          );
          parts.add(log);
        }

        // Taş kuşak — orta section
        const belt = new THREE.Mesh(
          new THREE.CylinderGeometry(towerR + 0.35, towerR + 0.35, 0.7, 12),
          cityMat(0x3a3228, 0.85, 0.15),
        );
        belt.position.set(kx, baseY + 2.5 + towerH * 0.5, kz);
        parts.add(belt);

        // Machicolation konsolları — üstte platformu taşıyan eğik destekler
        const machR = towerR + 1.2;
        const machY = baseY + 2.5 + towerH;
        for (let mi = 0; mi < 8; mi++) {
          const ma = (mi / 8) * Math.PI * 2;
          const bracket = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.3, 1.5),
            cityMat(0x4a3728, 0.88, 0.05),
          );
          bracket.position.set(
            kx + Math.cos(ma) * (towerR + 0.7),
            machY - 0.4,
            kz + Math.sin(ma) * (towerR + 0.7),
          );
          bracket.rotation.x = -Math.sin(ma) * 0.4;
          bracket.rotation.z = Math.cos(ma) * 0.4;
          parts.add(bracket);
        }

        // Üst platform — genişletilmiş
        const platform = new THREE.Mesh(
          new THREE.CylinderGeometry(machR, machR, 0.4, 12),
          cityMat(0x2e2620, 0.85, 0.15),
        );
        platform.position.set(kx, machY + 0.2, kz);
        parts.add(platform);

        // Korkuluk dişleri — platform etrafında
        for (let pi = 0; pi < 12; pi++) {
          const pa = (pi / 12) * Math.PI * 2;
          const merlon = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 1.0, 0.5),
            palisadeMat,
          );
          merlon.position.set(
            kx + Math.cos(pa) * (machR - 0.3),
            machY + 0.9,
            kz + Math.sin(pa) * (machR - 0.3),
          );
          parts.add(merlon);
        }

        // Sivri çatı — dar koni
        const roofCone = new THREE.Mesh(
          new THREE.ConeGeometry(towerR + 0.3, 3.5, 12),
          cityMat(0x2a221a, 0.88),
        );
        roofCone.position.set(kx, machY + 0.4 + 1.75, kz);
        parts.add(roofCone);

        // Çatı tepesi — metal top
        const roofFinial = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 6, 5),
          metalMat,
        );
        roofFinial.position.set(kx, machY + 0.4 + 3.6, kz);
        parts.add(roofFinial);

        // Ok delikleri — kule gövdesinde, 3 katmanlı
        for (let sl = 0; sl < 3; sl++) {
          for (let si = 0; si < 2; si++) {
            const slotA = (si / 2) * Math.PI + sl * 0.3;
            const slY = baseY + 5 + sl * 3;
            const slot = new THREE.Mesh(
              new THREE.BoxGeometry(0.25, 1.0, 0.12),
              cityMat(0x1a1612, 0.7, 0.3),
            );
            slot.position.set(
              kx + Math.cos(slotA) * (towerR + 0.15),
              slY,
              kz + Math.sin(slotA) * (towerR + 0.15),
            );
            slot.rotation.y = -slotA;
            parts.add(slot);
          }
        }

        // Kule lambası — machicolation altında
        const kLamp = new THREE.Mesh(
          new THREE.ConeGeometry(0.4, 0.65, 6),
          cityMat(0x8a6b32, 0.35, 0.9),
        );
        kLamp.position.set(kx, machY - 1.2, kz + towerR + 0.5);
        parts.add(kLamp);
        const kGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 6, 5),
          lanternMat,
        );
        kGlow.position.set(kx, machY - 1.5, kz + towerR + 0.5);
        parts.add(kGlow);
      }

      // === KEMERLİ GEÇİT (barrel vault) ===
      // Geçit yan duvarları — daha kalın
      for (const side of [-1, 1]) {
        const tunnelWall = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, gateH, gateDepth),
          palisadeMat,
        );
        tunnelWall.position.set(
          gx + perpX * side * (gateW / 2),
          baseY + gateH / 2,
          gz + perpZ * side * (gateW / 2),
        );
        tunnelWall.rotation.y = -gateA;
        parts.add(tunnelWall);
      }

      // Kemerli tavan — yarım silindir (barrel vault)
      const archSegs = 8;
      const archR = gateW / 2;
      for (let ai = 0; ai < archSegs; ai++) {
        const a0 = (ai / archSegs) * Math.PI;
        const a1 = ((ai + 1) / archSegs) * Math.PI;
        const midA = (a0 + a1) / 2;
        const segW = 0.6;

        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(segW, 0.35, gateDepth),
          cityMat(0x3a3228, 0.85, 0.15),
        );
        tile.position.set(
          gx + Math.cos(midA) * (archR - 0.2),
          baseY + gateH + Math.sin(midA) * (archR * 0.55) - 0.5,
          gz,
        );
        tile.rotation.z = midA - Math.PI / 2;
        tile.rotation.y = -gateA;
        parts.add(tile);
      }

      // Kemer smoother — üstte düz yüzey
      const archCap = new THREE.Mesh(
        new THREE.BoxGeometry(gateW + 1.2, 0.5, gateDepth + 0.3),
        cityMat(0x3a3228, 0.85, 0.15),
      );
      archCap.position.set(gx, baseY + gateH + 0.5, gz);
      archCap.rotation.y = -gateA;
      parts.add(archCap);

      // Kemer tuğla detayları — geçit iç yüzeyinde
      for (let ri = 0; ri < 3; ri++) {
        const ringR = archR * (0.6 + ri * 0.15);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(ringR, 0.12, 4, 8, Math.PI),
          cityMat(0x4a3a2a, 0.88, 0.1),
        );
        ring.position.set(gx, baseY + gateH - 0.5, gz);
        ring.rotation.y = -gateA + Math.PI / 2;
        ring.rotation.x = Math.PI / 2;
        ring.position.z = gz + (ri - 1) * 1.5;
        parts.add(ring);
      }

      // Zemin — ahşap kalaslar + taş bordür
      const floorPlank = new THREE.Mesh(
        new THREE.BoxGeometry(gateW - 0.4, 0.25, gateDepth),
        cityMat(0x4a3728, 0.88, 0.05),
      );
      floorPlank.position.set(gx, baseY + 0.12, gz);
      floorPlank.rotation.y = -gateA;
      parts.add(floorPlank);

      // Zemin tahtalar arası boşluklar — ince çizgiler
      for (let pi = 0; pi < 6; pi++) {
        const plankLine = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.05, gateDepth),
          cityMat(0x1a1612, 0.9),
        );
        plankLine.position.set(
          gx + perpX * (-gateW / 2 + (pi + 1) * (gateW / 7)),
          baseY + 0.26,
          gz + perpZ * (-gateW / 2 + (pi + 1) * (gateW / 7)),
        );
        plankLine.rotation.y = -gateA;
        parts.add(plankLine);
      }

      // === DETAYLI KAPI KANATLARI ===
      for (const side of [-1, 1]) {
        const doorW = gateW / 2 - 0.3;
        const doorH = gateH - 0.8;
        const doorX = gx + perpX * side * (doorW / 2 + 0.15);
        const doorZ = gz + perpZ * side * (doorW / 2 + 0.15) + radX * 0.4;
        const doorY = baseY + doorH / 2 + 0.3;

        // Ana kapı paneli — daha kalın
        const doorPanel = new THREE.Mesh(
          new THREE.BoxGeometry(doorW, doorH, 0.6),
          cityMat(0x3d2b1f, 0.9, 0.05),
        );
        doorPanel.position.set(doorX, doorY, doorZ);
        doorPanel.rotation.y = -gateA;
        parts.add(doorPanel);

        // Dikey tahta plakalar — her kanatta 5-6 tahta
        const plankCount = 5;
        for (let p = 0; p < plankCount; p++) {
          const plankX = -doorW / 2 + (p + 0.5) * (doorW / plankCount);
          const plank = new THREE.Mesh(
            new THREE.BoxGeometry(doorW / plankCount - 0.08, doorH * 0.95, 0.12),
            cityMat(p % 2 === 0 ? 0x4a3527 : 0x3d2b1f, 0.92, 0.05),
          );
          plank.position.set(
            doorX + perpX * plankX,
            doorY,
            doorZ + radX * 0.38,
          );
          plank.rotation.y = -gateA;
          parts.add(plank);
        }

        // Çapraz destek — X şekli
        const braceLen = Math.sqrt(doorW * doorW + doorH * doorH) * 0.42;
        const braceAngle = Math.atan2(doorH, doorW);
        for (const dir of [1, -1]) {
          const brace = new THREE.Mesh(
            new THREE.BoxGeometry(braceLen, 0.22, 0.15),
            cityMat(0x2e1e14, 0.9, 0.05),
          );
          brace.position.set(doorX, doorY, doorZ + radX * 0.72);
          brace.rotation.y = -gateA;
          brace.rotation.z = dir * braceAngle;
          parts.add(brace);
        }

        // Yatay destek kirişi — orta
        const midRail = new THREE.Mesh(
          new THREE.BoxGeometry(doorW * 0.92, 0.3, 0.18),
          cityMat(0x2e1e14, 0.9, 0.05),
        );
        midRail.position.set(doorX, doorY, doorZ + radX * 0.72);
        midRail.rotation.y = -gateA;
        parts.add(midRail);

        // Demir bantlar — 2 yatay, kalın
        for (const yFrac of [0.25, 0.75]) {
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(doorW * 0.95, 0.35, 0.1),
            metalMat,
          );
          band.position.set(doorX, baseY + doorH * yFrac + 0.3, doorZ + radX * 0.82);
          band.rotation.y = -gateA;
          parts.add(band);

          // Perçinler — bant üzerinde
          for (let rv = 0; rv < 4; rv++) {
            const rvX = -doorW / 2 + (rv + 0.5) * (doorW / 4);
            const rivet = new THREE.Mesh(
              new THREE.SphereGeometry(0.07, 5, 4),
              cityMat(0x8a6b32, 0.4, 0.8),
            );
            rivet.position.set(
              doorX + perpX * rvX,
              baseY + doorH * yFrac + 0.3,
              doorZ + radX * 0.9,
            );
            parts.add(rivet);
          }
        }

        // Kapı eşiği — altta ahşap blok
        const threshold = new THREE.Mesh(
          new THREE.BoxGeometry(doorW + 0.3, 0.35, 0.8),
          cityMat(0x3a3228, 0.85, 0.15),
        );
        threshold.position.set(doorX, baseY + 0.17, doorZ - radX * 0.1);
        threshold.rotation.y = -gateA;
        parts.add(threshold);

        // Menteşe plakaları — üst ve alt
        for (const hy of [-doorH / 2 + 0.8, doorH / 2 - 0.8]) {
          const hingePlate = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 1.0, 0.35),
            metalMat,
          );
          hingePlate.position.set(
            gx + perpX * side * 0.2,
            baseY + doorH / 2 + 0.3 + hy,
            gz + perpZ * side * 0.2 + radX * 0.5,
          );
          parts.add(hingePlate);

          // Menteşe pimi
          const pin = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.5, 5),
            metalMat,
          );
          pin.position.set(
            gx + perpX * side * 0.1,
            baseY + doorH / 2 + 0.3 + hy,
            gz + perpZ * side * 0.1 + radX * 0.45,
          );
          pin.rotation.x = Math.PI / 2;
          parts.add(pin);
        }

        // Kapı demir halka sapı
        const handleRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.22, 0.04, 5, 8),
          metalMat,
        );
        handleRing.position.set(
          gx + perpX * side * (doorW * 0.3),
          baseY + doorH / 2,
          gz + perpZ * side * (doorW * 0.3) + radX * 0.95,
        );
        handleRing.rotation.x = Math.PI / 2;
        parts.add(handleRing);
      }

      // === PORTCULLIS (kaldırma ızgarası) ===
      const portW = gateW - 0.6;
      const portH = gateH * 0.5;
      const portY = baseY + gateH - portH;
      const portZ = gz + radX * 1.8;

      // Izgara çerçevesi — üst
      const portFrame = new THREE.Mesh(
        new THREE.BoxGeometry(portW + 0.6, 0.5, 0.3),
        metalMat,
      );
      portFrame.position.set(gx, baseY + gateH + 0.3, portZ);
      portFrame.rotation.y = -gateA;
      parts.add(portFrame);

      // Dikey çubuklar — daha kalın, uçları sivri
      const barCount = Math.floor(portW / 0.65);
      for (let bi = 0; bi < barCount; bi++) {
        const bx = -portW / 2 + (bi + 0.5) * (portW / barCount);
        const bar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.08, portH, 5),
          metalMat,
        );
        bar.position.set(
          gx + perpX * bx,
          portY + portH / 2,
          portZ,
        );
        parts.add(bar);

        // Sivri uç — altta
        const tip = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.25, 4),
          metalMat,
        );
        tip.position.set(
          gx + perpX * bx,
          portY - 0.12,
          portZ,
        );
        tip.rotation.z = Math.PI;
        parts.add(tip);
      }

      // Yatay çubuklar
      for (let hj = 0; hj < 3; hj++) {
        const hy = portY + portH * (hj + 1) / 4;
        const hBar = new THREE.Mesh(
          new THREE.BoxGeometry(portW, 0.1, 0.1),
          metalMat,
        );
        hBar.position.set(gx, hy, portZ);
        hBar.rotation.y = -gateA;
        parts.add(hBar);
      }

      // === ZİNCİR MEKANİZMASI ===
      for (const cs of [-1, 1]) {
        const chainX = gx + perpX * cs * (portW / 2 - 0.2);
        const chainBaseZ = portZ;

        // Zincir dikey — 8 halka
        for (let ci = 0; ci < 8; ci++) {
          const link = new THREE.Mesh(
            new THREE.TorusGeometry(0.1, 0.025, 4, 6),
            metalMat,
          );
          link.position.set(
            chainX,
            portY + portH * 0.5 + ci * 0.35,
            chainBaseZ,
          );
          link.rotation.x = ci % 2 === 0 ? 0 : Math.PI / 2;
          parts.add(link);
        }

        // Makara dişlisi
        const sprocket = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, 0.15, 8),
          metalMat,
        );
        sprocket.position.set(chainX, baseY + gateH + 0.5, chainBaseZ);
        sprocket.rotation.x = Math.PI / 2;
        parts.add(sprocket);

        // Dişli tırnakları
        for (let ti = 0; ti < 6; ti++) {
          const ta = (ti / 6) * Math.PI * 2;
          const tooth = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.08, 0.06),
            metalMat,
          );
          tooth.position.set(
            chainX + Math.cos(ta) * 0.25,
            baseY + gateH + 0.5 + Math.sin(ta) * 0.25,
            chainBaseZ,
          );
          parts.add(tooth);
        }
      }

      // Üst makara kirişi
      const crossBeam = new THREE.Mesh(
        new THREE.BoxGeometry(portW + 2, 0.55, 0.55),
        palisadeMat,
      );
      crossBeam.position.set(gx, baseY + gateH + 1.0, portZ);
      crossBeam.rotation.y = -gateA;
      parts.add(crossBeam);

      // === ÖN SAVUNMA ENGELLERİ ===
      for (const side of [-1, 1]) {
        // Çivili tahta barikat (chevaux-de-frise)
        const bX = gx + perpX * side * (gateW / 2 + 3.5);
        const bZ = gz + perpZ * side * (gateW / 2 + 3.5) + radX * 3;

        const barricade = new THREE.Mesh(
          new THREE.BoxGeometry(2.5, 1.8, 0.5),
          metalMat,
        );
        barricade.position.set(bX, baseY + 0.9, bZ);
        barricade.rotation.y = -gateA;
        parts.add(barricade);

        // Çapraz sivri tahta kirişler — X
        for (const dir of [1, -1]) {
          const spike = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.12, 2.5, 5),
            palisadeMat,
          );
          spike.position.set(bX, baseY + 1.8, bZ);
          spike.rotation.z = dir * 0.5;
          spike.rotation.y = -gateA;
          parts.add(spike);
        }

        // Çivi tel rulo
        const wireRoll = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 1.6, 8),
          metalMat,
        );
        wireRoll.rotation.z = Math.PI / 2;
        wireRoll.position.set(
          gx + perpX * side * (gateW / 2 + 5.5),
          baseY + 0.4,
          gz + perpZ * side * (gateW / 2 + 5.5) + radX * 3,
        );
        parts.add(wireRoll);
      }
    }

    void rng;
  }

  const g = new THREE.Group();
  for (const m of bake(parts, { castShadow: true, receiveShadow: true })) g.add(m);
  return g;
}

/** Sokak lambası — demir direk, köz feneri. */
function addStreetLamp(parent: THREE.Object3D, x: number, y: number, z: number, _rng: Rng) {
  const lampMat = cityMat(0x1a1410, 0.8, 0.6);
  // Direk
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 5.5, 6), lampMat);
  pole.position.set(x, y + 2.75, z);
  parent.add(pole);
  // Üst bükülme (dirsek)
  const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 5), lampMat);
  elbow.position.set(x, y + 5.8, z);
  elbow.rotation.z = 0.3;
  parent.add(elbow);
  // Fener kutusu
  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.6, 0.5),
    cityMat(0x8a6b32, 0.35, 0.9),
  );
  lantern.position.set(x + 0.4, y + 6.3, z);
  parent.add(lantern);
  // Işık topu
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), lanternMat);
  glow.position.set(x + 0.4, y + 6.0, z);
  parent.add(glow);
}

export type StepFn = (pct: number, label: string) => Promise<void>;

export async function createCity(
  spec: CitySpec,
  step: StepFn,
  fromPct: number,
  toPct: number,
  isCancelled: () => boolean,
  nextId: () => number,
): Promise<CityHandle | null> {
  const rng = mulberry32(spec.seed);
  const group = new THREE.Group();
  const blocks: CityBlock[] = [];
  const targets: Target[] = [];
  const R = spec.radius;
  const baseY = terrainHeight(spec.cx, spec.cz);
  const maxDepth = DENSITY_DEPTH[spec.density];
  const minArea = DENSITY_MIN_AREA[spec.density];

  group.add(buildPavement(spec, baseY, rng));

  const da = (Math.PI * 2) / SECTORS;
  const cells: { ring: number; sector: number }[] = [];
  for (let ring = 0; ring < RINGS.length - 1; ring++) {
    for (let sector = 0; sector < SECTORS; sector++) cells.push({ ring, sector });
  }

  let blockId = 0;
  const span = toPct - fromPct;

  for (let ci = 0; ci < cells.length; ci++) {
    const { ring, sector } = cells[ci]!;
    const district = districtOf(ring, sector);
    const r0 = R * RINGS[ring]! + RING_ROAD_HALF;
    const r1 = R * RINGS[ring + 1]! - RING_ROAD_HALF;
    if (r1 - r0 < 10) continue;
    // Cadde genişliği açısal değil metrik: iç yarıçapta daha geniş bir açı kaplar.
    const aPad0 = AVENUE_HALF / Math.max(1, r0);
    const aPad1 = AVENUE_HALF / Math.max(1, r0);
    const a0 = sector * da + aPad0;
    const a1 = (sector + 1) * da - aPad1;
    if (a1 - a0 <= 0.02) continue;

    const lots: Lot[] = [];
    subdivide({ r0, r1, a0, a1 }, maxDepth, minArea, rng, lots);

    const blockParts = new THREE.Group();
    const blockBuildings: Target[] = [];
    const [sMin, sMax] = DISTRICT_SCALE[district];
    const weights = DISTRICT_WEIGHTS[district] as Record<TargetKind, number>;

    for (const lot of lots) {
      const rc = (lot.r0 + lot.r1) / 2;
      const ac = (lot.a0 + lot.a1) / 2;
      const lotW = rc * (lot.a1 - lot.a0) - GUTTER * 2;
      const lotD = lot.r1 - lot.r0 - GUTTER * 2;
      if (lotW < 3.5 || lotD < 3.5) continue;
      // Bazı parseller boş kalsın: avlu, yıkıntı, meydan artığı — ağaç dik.
      if (rng.chance(0.05)) {
        const tx = spec.cx + Math.cos(ac) * rc;
        const tz = spec.cz + Math.sin(ac) * rc;
        const tree = buildTree(rng);
        tree.position.set(tx, baseY + 0.1, tz);
        tree.rotation.y = rng.range(0, Math.PI * 2);
        blockParts.add(tree);
        continue;
      }

      const kind = rng.weighted(weights);
      const fit = Math.min(lotW, lotD) / 8;
      const scale = Math.min(sMax, Math.max(sMin * 0.7, Math.min(fit, sMax)));
      const spec2 = buildStructure(kind, rng, scale);

      const id = nextId();
      const x = spec.cx + Math.cos(ac) * rc;
      const z = spec.cz + Math.sin(ac) * rc;
      const y = terrainHeight(x, z);
      spec2.parts.position.set(x, y, z);
      // Cepheler caddeye baksın: bina, bulunduğu yarıçapın teğetine hizalanır.
      spec2.parts.rotation.y = -ac + rng.range(-0.05, 0.05);
      spec2.parts.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.userData["tag"] = id;
      });
      blockParts.add(spec2.parts);

      const target: Target = {
        id,
        kind,
        pos: new THREE.Vector3(x, y, z),
        burn: 0,
        dead: false,
        lightY: Math.min(14, spec2.height * 0.45),
        radius: spec2.radius,
        height: spec2.height,
        hp: spec2.hp,
        maxHp: spec2.hp,
        flammable: spec2.flammable,
        score: spec2.score,
        cool: 0,
        tower: null,
        rig: null,
        wrote: -1,
        // Aralıklar aşağıda bakeTagged'dan sonra bağlanıyor.
        apply: () => {},
      };
      blockBuildings.push(target);
      targets.push(target);
    }

    if (!blockBuildings.length) continue;

    const { meshes, ranges } = bakeTagged(
      blockParts,
      (m) => (m.userData["tag"] as number | undefined) ?? -1,
      { castShadow: true, receiveShadow: true },
    );
    for (const m of meshes) group.add(m);

    for (const t of blockBuildings) {
      const list: TagRange[] = ranges.get(t.id) ?? [];
      t.apply = (self) => writeState(list, self.dead ? 2 : Math.min(1, self.burn));
    }

    const center = new THREE.Vector3();
    for (const t of blockBuildings) center.add(t.pos);
    center.divideScalar(blockBuildings.length);
    let br = 0;
    for (const t of blockBuildings) br = Math.max(br, center.distanceTo(t.pos) + t.radius);

    blocks.push({
      id: blockId++,
      district,
      center,
      radius: br,
      buildings: blockBuildings,
      alive: blockBuildings.length,
    });

    if (ci % 3 === 2) {
      await step(Math.round(fromPct + (span * (ci + 1)) / cells.length), "Kül Şehri kuruluyor");
      if (isCancelled()) return null;
    }
  }

  /* ---- işaret yapıları: kule, direk, asansör ---- */
  const landmarks: { kind: TargetKind; x: number; z: number; tower: TowerKind | null }[] = [];

  // Savunma kuleleri sur hattında ve halka yollarının kesişimlerinde.
  const towerCount = spec.wall ? SECTORS : Math.max(3, Math.round(SECTORS / 2));
  for (let i = 0; i < towerCount; i++) {
    const a = (i / towerCount) * Math.PI * 2 + da / 2;
    const rr = R * (spec.wall ? 1.02 : 0.82);
    landmarks.push({
      kind: "tower",
      x: spec.cx + Math.cos(a) * rr,
      z: spec.cz + Math.sin(a) * rr,
      tower: null,
    });
  }
  // Köz madeni asansörleri sanayi bölgesinde.
  for (let i = 0; i < spec.elevators; i++) {
    const a = rng.range(2 * da, 5 * da);
    const rr = rng.range(R * 0.78, R * 0.98);
    landmarks.push({
      kind: "elevator",
      x: spec.cx + Math.cos(a) * rr,
      z: spec.cz + Math.sin(a) * rr,
      tower: null,
    });
  }
  // Bağlama direkleri dok bölgesinde.
  for (let i = 0; i < spec.masts; i++) {
    const a = rng.range(6 * da, 8 * da);
    const rr = rng.range(R * 0.8, R * 1.0);
    landmarks.push({
      kind: "mast",
      x: spec.cx + Math.cos(a) * rr,
      z: spec.cz + Math.sin(a) * rr,
      tower: null,
    });
  }

  const lmParts = new THREE.Group();
  const lmTargets: Target[] = [];
  for (const lm of landmarks) {
    const s = buildStructure(lm.kind, rng, 1);
    const id = nextId();
    const y = terrainHeight(lm.x, lm.z);
    s.parts.position.set(lm.x, y, lm.z);
    s.parts.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.userData["tag"] = id;
    });
    lmParts.add(s.parts);
    const t: Target = {
      id,
      kind: lm.kind,
      pos: new THREE.Vector3(lm.x, y, lm.z),
      burn: 0,
      dead: false,
      lightY: Math.min(16, s.height * 0.5),
      radius: s.radius,
      height: s.height,
      hp: s.hp,
      maxHp: s.hp,
      flammable: FLAMMABILITY[lm.kind],
      score: s.score,
      cool: rng.range(0, 3),
      tower: s.tower,
      rig: null,
      wrote: -1,
      apply: () => {},
    };
    lmTargets.push(t);
    targets.push(t);
  }
  if (lmTargets.length) {
    // İşaret yapıları siluetin bel kemiği: bunlar gölge döksün.
    const { meshes, ranges } = bakeTagged(
      lmParts,
      (m) => (m.userData["tag"] as number | undefined) ?? -1,
      { castShadow: true, receiveShadow: true },
    );
    for (const m of meshes) group.add(m);
    for (const t of lmTargets) {
      const list: TagRange[] = ranges.get(t.id) ?? [];
      t.apply = (self) => writeState(list, self.dead ? 2 : Math.min(1, self.burn));
    }
  }

  await step(toPct, "Kül Şehri kuruluyor");
  if (isCancelled()) return null;

  const plazaR = R * RINGS[0]! * 0.9;

  // Sivil ve asker NPC'ler
  const streetTest = (x: number, z: number): boolean => {
    const dx = x - spec.cx;
    const dz = z - spec.cz;
    const r = Math.hypot(dx, dz);
    if (r < plazaR) return true;
    if (r > R * 1.02) return true;
    for (const f of RINGS) {
      if (Math.abs(r - R * f) < RING_ROAD_HALF) return true;
    }
    const a = Math.atan2(dz, dx);
    const m = ((a % da) + da) % da;
    return Math.min(m, da - m) * r < AVENUE_HALF;
  };
  const npcs = createNpcSystem(group, rng, streetTest, spec.cx, spec.cz, R);

  return {
    group,
    blocks,
    targets,
    spec,
    npcs,
    streetAt: streetTest,
    dispose() {
      npcs.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    },
  };
}
