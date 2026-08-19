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
      const m = ((a % da) + da) % da;
      if (Math.min(m, da - m) * wallR < AVENUE_HALF + 6) continue;

      const wallLen = (Math.PI * 2 * wallR) / seg + 1;

      // Ana palisade duvarı — ahşap kütükler
      const wallH = rng.range(10, 13);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, wallH, wallLen),
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
          new THREE.BoxGeometry(0.4, wallH + 2, 0.4),
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

    // Askeri kapısı — her caddede (gerçekçi gatehouse)
    for (let j = 0; j < SECTORS; j++) {
      const gateA = j * da;
      const gx = spec.cx + Math.cos(gateA) * wallR;
      const gz = spec.cz + Math.sin(gateA) * wallR;
      const perpX = Math.cos(gateA + Math.PI / 2);
      const perpZ = Math.sin(gateA + Math.PI / 2);
      const radX = Math.cos(gateA);
      const radZ = Math.sin(gateA);

      const gateW = 8;
      const gateH = 9;
      const depth = 4.5;

      // --- Çift kule (gatehouse) ---
      for (const side of [-1, 1]) {
        const kx = gx + perpX * side * (gateW / 2 + 2.2);
        const kz = gz + perpZ * side * (gateW / 2 + 2.2);

        // Taş temel
        const kBase = new THREE.Mesh(
          new THREE.BoxGeometry(5, 3, 5),
          cityMat(0x3a3228, 0.85, 0.15),
        );
        kBase.position.set(kx, baseY + 1.5, kz);
        kBase.rotation.y = -gateA;
        parts.add(kBase);

        // Ahşap gövde
        const kBody = new THREE.Mesh(
          new THREE.BoxGeometry(4, gateH, 4),
          palisadeMat,
        );
        kBody.position.set(kx, baseY + 3 + gateH / 2, kz);
        kBody.rotation.y = -gateA;
        parts.add(kBody);

        // Taş kuşak — gövde ortasında
        const belt = new THREE.Mesh(
          new THREE.BoxGeometry(4.3, 0.6, 4.3),
          cityMat(0x3a3228, 0.85, 0.15),
        );
        belt.position.set(kx, baseY + 3 + gateH * 0.45, kz);
        belt.rotation.y = -gateA;
        parts.add(belt);

        // Çatı
        const roofW = 5.2;
        const roofH = 2;
        const kRoof = new THREE.Mesh(
          new THREE.BoxGeometry(roofW, 0.35, roofW),
          cityMat(0x2a221a, 0.88),
        );
        kRoof.position.set(kx, baseY + 3 + gateH + 0.2, kz);
        kRoof.rotation.y = -gateA;
        parts.add(kRoof);

        // Kule çatısı — kule maiso
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(3.2, roofH, 4),
          cityMat(0x2a221a, 0.88),
        );
        cap.position.set(kx, baseY + 3 + gateH + 0.35 + roofH / 2, kz);
        cap.rotation.y = -gateA + Math.PI / 4;
        parts.add(cap);

        // Ok delikleri — kulede 3er tane
        for (let sl = 0; sl < 3; sl++) {
          const slY = baseY + 5 + sl * 2.5;
          const slot = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.9, 0.15),
            cityMat(0x1a1612, 0.7, 0.3),
          );
          slot.position.set(
            kx + radX * (side > 0 ? 2.1 : -2.1),
            slY,
            kz + radZ * (side > 0 ? 2.1 : -2.1),
          );
          slot.rotation.y = -gateA;
          parts.add(slot);
        }

        // Gözetleme penceresi — üst katta
        const eye = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.6, 0.15),
          cityMat(0x1a1612, 0.6, 0.4),
        );
        eye.position.set(
          kx + radX * (side > 0 ? 2.1 : -2.1),
          baseY + 3 + gateH - 1.5,
          kz + radZ * (side > 0 ? 2.1 : -2.1),
        );
        eye.rotation.y = -gateA;
        parts.add(eye);

        // Korkuluk
        for (const cx2 of [-1, 1]) {
          for (const cz2 of [-1, 1]) {
            const post = new THREE.Mesh(
              new THREE.BoxGeometry(0.15, 1.0, 0.15),
              palisadeMat,
            );
            post.position.set(
              kx + perpX * cx2 * 2.2 + radX * cz2 * 2.2,
              baseY + 3 + gateH + 0.85,
              kz + perpZ * cx2 * 2.2 + radZ * cz2 * 2.2,
            );
            parts.add(post);
          }
        }

        // Üst kule lambası
        const kLamp = new THREE.Mesh(
          new THREE.ConeGeometry(0.45, 0.7, 6),
          cityMat(0x8a6b32, 0.35, 0.9),
        );
        kLamp.position.set(kx, baseY + 3 + gateH + 1.6, kz);
        parts.add(kLamp);
        const kGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 6, 5),
          lanternMat,
        );
        kGlow.position.set(kx, baseY + 3 + gateH + 1.3, kz);
        parts.add(kGlow);
      }

      // --- Tünelli geçit (duvar kalınlığında derinlik) ---
      // İç tavan
      const ceil = new THREE.Mesh(
        new THREE.BoxGeometry(gateW, 0.5, depth),
        palisadeMat,
      );
      ceil.position.set(gx, baseY + gateH, gz);
      ceil.rotation.y = -gateA;
      parts.add(ceil);

      // İç sol duvar
      for (const side of [-1, 1]) {
        const innerWall = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, gateH, depth),
          palisadeMat,
        );
        innerWall.position.set(
          gx + perpX * side * (gateW / 2),
          baseY + gateH / 2,
          gz + perpZ * side * (gateW / 2),
        );
        innerWall.rotation.y = -gateA;
        parts.add(innerWall);
      }

      // Zemin ahşap kalas
      const floorPlank = new THREE.Mesh(
        new THREE.BoxGeometry(gateW - 0.5, 0.2, depth),
        cityMat(0x4a3728, 0.88, 0.05),
      );
      floorPlank.position.set(gx, baseY + 0.1, gz);
      floorPlank.rotation.y = -gateA;
      parts.add(floorPlank);

      // --- Kapalı ahşap kapı kanatları ---
      for (const side of [-1, 1]) {
        const doorW = gateW / 2 - 0.2;
        const doorH = gateH - 1;

        // Ana kapı paneli
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(doorW, doorH, 0.45),
          cityMat(0x3d2b1f, 0.9, 0.05),
        );
        door.position.set(
          gx + perpX * side * (doorW / 2 + 0.1),
          baseY + doorH / 2 + 0.3,
          gz + perpZ * side * (doorW / 2 + 0.1) + radX * 0.5,
        );
        door.rotation.y = -gateA;
        parts.add(door);

        // Metal dikey bantlar
        for (let b = 0; b < 3; b++) {
          const bx = -doorW / 2 + doorW * (b + 1) / 4;
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, doorH * 0.85, 0.1),
            metalMat,
          );
          band.position.set(
            gx + perpX * (side * (doorW / 2 + 0.1) + bx),
            baseY + doorH / 2 + 0.3,
            gz + perpZ * (side * (doorW / 2 + 0.1) + bx) + radX * 0.75,
          );
          band.rotation.y = -gateA;
          parts.add(band);
        }

        // Metal yatay bantlar
        for (let by = 0; by < 3; by++) {
          const yOff = -doorH / 3 + by * doorH / 3;
          const hBand = new THREE.Mesh(
            new THREE.BoxGeometry(doorW * 0.9, 0.2, 0.1),
            metalMat,
          );
          hBand.position.set(
            gx + perpX * side * (doorW / 2 + 0.1),
            baseY + doorH / 2 + 0.3 + yOff,
            gz + perpZ * side * (doorW / 2 + 0.1) + radX * 0.75,
          );
          hBand.rotation.y = -gateA;
          parts.add(hBand);
        }

        // Perçinler
        for (let py = 0; py < 4; py++) {
          for (let px = 0; px < 2; px++) {
            const rivet = new THREE.Mesh(
              new THREE.SphereGeometry(0.08, 5, 4),
              cityMat(0x8a6b32, 0.4, 0.8),
            );
            rivet.position.set(
              gx + perpX * (side * (doorW / 2 + 0.1) - doorW / 4 + px * doorW / 2),
              baseY + 1.5 + py * 2,
              gz + perpZ * (side * (doorW / 2 + 0.1) - doorW / 4 + px * doorW / 2) + radX * 0.8,
            );
            parts.add(rivet);
          }
        }

        // Kapı sapı — demir halka
        const handle = new THREE.Mesh(
          new THREE.TorusGeometry(0.25, 0.05, 5, 8),
          metalMat,
        );
        handle.position.set(
          gx + perpX * side * (doorW * 0.35),
          baseY + doorH / 2 + 0.3,
          gz + perpZ * side * (doorW * 0.35) + radX * 0.85,
        );
        handle.rotation.x = Math.PI / 2;
        parts.add(handle);

        // Menteşe hornları — kapının üst ve alt
        for (const hy of [-doorH / 2 + 1, doorH / 2 - 1]) {
          const hinge = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.8, 0.3),
            metalMat,
          );
          hinge.position.set(
            gx + perpX * side * 0.15,
            baseY + doorH / 2 + 0.3 + hy,
            gz + perpZ * side * 0.15 + radX * 0.5,
          );
          parts.add(hinge);
        }
      }

      // --- Portcullis (yarıya kadar indirilmiş ızgara) ---
      const portW = gateW - 0.8;
      const portH = gateH * 0.55;
      const portY = baseY + gateH - portH;
      // Dikey çubuklar
      const barCount = Math.floor(portW / 0.7);
      for (let bi = 0; bi < barCount; bi++) {
        const bx = -portW / 2 + (bi + 0.5) * (portW / barCount);
        const bar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, portH, 5),
          metalMat,
        );
        bar.position.set(
          gx + perpX * bx,
          portY + portH / 2,
          gz + perpZ * bx + radX * 1.5,
        );
        parts.add(bar);
      }
      // Yatay çubuklar
      for (let hj = 0; hj < 4; hj++) {
        const hy = portY + portH * (hj + 0.5) / 4;
        const hBar = new THREE.Mesh(
          new THREE.BoxGeometry(portW, 0.08, 0.08),
          metalMat,
        );
        hBar.position.set(gx, hy, gz + radX * 1.5);
        hBar.rotation.y = -gateA;
        parts.add(hBar);
      }
      // Üst kiriş (portcullis rayı)
      const ray = new THREE.Mesh(
        new THREE.BoxGeometry(portW + 1, 0.5, 0.5),
        metalMat,
      );
      ray.position.set(gx, baseY + gateH + 0.3, gz + radX * 1.5);
      ray.rotation.y = -gateA;
      parts.add(ray);

      // --- Zincir mekanizması ---
      for (const cs of [-1, 1]) {
        // Zincir — dikey
        for (let ci = 0; ci < 6; ci++) {
          const link = new THREE.Mesh(
            new THREE.TorusGeometry(0.12, 0.03, 4, 6),
            metalMat,
          );
          link.position.set(
            gx + perpX * cs * (portW / 2 - 0.3),
            portY + ci * 0.4,
            gz + perpZ * cs * (portW / 2 - 0.3) + radX * 1.5,
          );
          link.rotation.x = ci % 2 === 0 ? 0 : Math.PI / 2;
          parts.add(link);
        }

        // Makara dişlisi — üstte
        const sprocket = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8),
          metalMat,
        );
        sprocket.position.set(
          gx + perpX * cs * (portW / 2),
          baseY + gateH + 0.3,
          gz + perpZ * cs * (portW / 2) + radX * 1.5,
        );
        sprocket.rotation.x = Math.PI / 2;
        parts.add(sprocket);
      }

      // Çapraz üst kiriş (makara destek)
      const crossBeam = new THREE.Mesh(
        new THREE.BoxGeometry(portW + 2, 0.6, 0.6),
        palisadeMat,
      );
      crossBeam.position.set(gx, baseY + gateH + 1.2, gz + radX * 1.5);
      crossBeam.rotation.y = -gateA;
      parts.add(crossBeam);

      // --- Ön engeller ---
      for (const side of [-1, 1]) {
        // Çivili tahta barikat (chevaux-de-frise)
        const barricade = new THREE.Mesh(
          new THREE.BoxGeometry(2.5, 2, 0.5),
          metalMat,
        );
        barricade.position.set(
          gx + perpX * side * (gateW / 2 + 3.5),
          baseY + 1,
          gz + perpZ * side * (gateW / 2 + 3.5) + radX * 3,
        );
        barricade.rotation.y = -gateA;
        parts.add(barricade);

        // Çapraz tahta kirişler (sivri uçlu)
        for (let sp = 0; sp < 3; sp++) {
          const spike = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.15, 2.2, 5),
            palisadeMat,
          );
          spike.position.set(
            gx + perpX * side * (gateW / 2 + 3.5) + perpX * (sp - 1) * 0.6,
            baseY + 2.2,
            gz + perpZ * side * (gateW / 2 + 3.5) + radX * 3 + perpZ * (sp - 1) * 0.6,
          );
          spike.rotation.z = (sp - 1) * 0.25;
          spike.rotation.y = -gateA;
          parts.add(spike);
        }

        // Çivi tel rulo
        const wireRoll = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.45, 1.8, 8),
          metalMat,
        );
        wireRoll.rotation.z = Math.PI / 2;
        wireRoll.position.set(
          gx + perpX * side * (gateW / 2 + 5.5),
          baseY + 0.45,
          gz + perpZ * side * (gateW / 2 + 5.5) + radX * 3,
        );
        parts.add(wireRoll);

        // Tank engeli — çapraz kiriş
        const tankTrap = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 1.8, 0.3),
          metalMat,
        );
        tankTrap.position.set(
          gx + perpX * side * (gateW / 2 + 2),
          baseY + 0.9,
          gz + perpZ * side * (gateW / 2 + 2) + radX * 5,
        );
        tankTrap.rotation.z = side * 0.3;
        tankTrap.rotation.y = -gateA;
        parts.add(tankTrap);
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
