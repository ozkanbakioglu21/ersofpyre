import * as THREE from "three";
import { createAirship } from "./airships";
import { createTeslaRig, updateTeslaArc, TESLA_RANGE, type TeslaRig } from "./enemies";
import type { Game } from "./game";
import { mulberry32, type Rng } from "./rng";
import { createStructure } from "./structures";
import type { Target } from "./types";

/**
 * Sonsuz ileri yol sistemi.
 *
 * Ejderha otomatik olarak +Z yönünde uçar. Yol boyunca binalar, zeplinler
 * ve tesla kuleleri periyodik olarak chunk'lar halinde oluşturulur, geride
 * kalan chunk'lar temizlenir.
 */

const ROAD_HALF_W = 18;
const CHUNK_DEPTH = 240;
const SPAWN_AHEAD = 900;
const DESPAWN_BEHIND = 500;

type Chunk = {
  z: number;
  targetIds: Set<number>;
  groups: THREE.Object3D[];
  airshipIds: Set<string>;
};

type InfiniteTower = {
  target: Target;
  rig: TeslaRig;
};

export type InfinitePath = {
  rng: Rng;
  chunks: Chunk[];
  nextZ: number;
  distance: number;
  towers: InfiniteTower[];
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export function createInfinitePath(seed: number): InfinitePath {
  return {
    rng: mulberry32(seed),
    chunks: [],
    nextZ: 0,
    distance: 0,
    towers: [],
  };
}

export function initInfinitePath(g: Game, inf: InfinitePath): void {
  const startZ = g.dragon.root.position.z;
  inf.nextZ = startZ;
  while (inf.nextZ < startZ + SPAWN_AHEAD) {
    spawnChunk(g, inf, inf.nextZ);
    inf.nextZ += CHUNK_DEPTH;
  }
}

export function updateInfinitePath(g: Game, inf: InfinitePath, dt: number): void {
  inf.distance += g.state.speed * dt;
  const dragonZ = g.dragon.root.position.z;

  while (inf.nextZ < dragonZ + SPAWN_AHEAD) {
    spawnChunk(g, inf, inf.nextZ);
    inf.nextZ += CHUNK_DEPTH;
  }

  while (inf.chunks.length > 0 && inf.chunks[0]!.z < dragonZ - DESPAWN_BEHIND) {
    removeChunk(g, inf.chunks[0]!);
    inf.chunks.shift();
  }

  const dp = g.dragon.root.position;
  for (const tower of inf.towers) {
    if (tower.target.dead) continue;
    const d = tower.target.pos.distanceTo(dp);
    if (d < TESLA_RANGE) {
      tower.rig.mat.opacity = 0.75;
      tmp.set(0, 0, 0);
      tmp2.copy(dp).sub(tower.rig.group.position);
      updateTeslaArc(tower.rig, tmp, tmp2);
      if (g.state.invuln <= 0) {
        g.state.hp -= 9 * dt;
        g.state.hitFlash = Math.max(g.state.hitFlash, 0.25);
      }
    } else {
      tower.rig.mat.opacity = Math.max(0, tower.rig.mat.opacity - 3 * dt);
    }
  }
}

const BUILDING_KINDS: Target["kind"][] = [
  "house",
  "tenement",
  "workshop",
  "warehouse",
  "factory",
];

function spawnChunk(g: Game, inf: InfinitePath, z: number): void {
  const { rng } = inf;
  const chunk: Chunk = { z, targetIds: new Set(), groups: [], airshipIds: new Set() };

  const numBuildings = 10 + Math.floor(rng() * 8);
  for (let i = 0; i < numBuildings; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * (ROAD_HALF_W + 8 + rng() * 55);
    const bz = z + rng() * CHUNK_DEPTH;
    const kind = BUILDING_KINDS[Math.floor(rng() * BUILDING_KINDS.length)]!;
    const { target, group } = createStructure(kind, x, bz, rng);
    g.targets.push(target);
    g.grid.insert(target, target.pos.x, target.pos.z);
    chunk.targetIds.add(target.id);
    g.scene.add(group);
    chunk.groups.push(group);
  }

  if (rng() < 0.4) {
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * (ROAD_HALF_W + 12 + rng() * 18);
    const tz = z + CHUNK_DEPTH * 0.5;
    const { target, group } = createStructure("tower", x, tz, rng);
    g.targets.push(target);
    g.grid.insert(target, target.pos.x, target.pos.z);
    chunk.targetIds.add(target.id);
    g.scene.add(group);
    chunk.groups.push(group);
    if (target.tower === "tesla") {
      const rig = createTeslaRig(target.height);
      rig.group.position.set(target.pos.x, target.pos.y + target.height, target.pos.z);
      g.scene.add(rig.group);
      target.rig = rig.group;
      inf.towers.push({ target, rig });
    }
  }

  if (rng() < 0.3) {
    const sx = (rng() - 0.5) * 180;
    const sy = 90 + rng() * 90;
    const sz = z + CHUNK_DEPTH * 0.3 + rng() * CHUNK_DEPTH * 0.4;
    const ship = createAirship(sx, sy, sz, rng, { role: "scout" });
    ship.dir.set(rng.range(-0.3, 0.3), 0, -1).normalize();
    g.airships.push(ship);
    g.scene.add(ship.group);
    chunk.airshipIds.add(ship.id);
  }

  inf.chunks.push(chunk);
}

function removeChunk(g: Game, chunk: Chunk): void {
  for (const id of chunk.targetIds) {
    const idx = g.targets.findIndex((t) => t.id === id);
    if (idx >= 0) {
      g.targets[idx]!.dead = true;
      g.targets.splice(idx, 1);
    }
  }

  for (const group of chunk.groups) {
    g.scene.remove(group);
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }

  for (const id of chunk.airshipIds) {
    const idx = g.airships.findIndex((s) => s.id === id);
    if (idx >= 0) {
      g.scene.remove(g.airships[idx]!.group);
      g.airships.splice(idx, 1);
    }
  }
}
