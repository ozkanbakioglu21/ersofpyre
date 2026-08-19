import * as THREE from "three";
import { FIRE_LIGHTS } from "./quality";
import type { Burnable } from "./types";

/**
 * Ateş ışığı havuzu.
 *
 * Sahnedeki ışık SAYISI sabit: three.js görünür ışık sayısı değiştiğinde tüm
 * materyallerin shader'ını yeniden derler ve oyun ortasında donar. Havuz
 * kurulumda doğar, kullanılmayan ışık yoğunluğu 0'a iner.
 *
 * Atama "en yakın 6 yanan hedef" değil, KÜME tabanlı. Kül Şehri'nde bütün bir
 * blok aynı anda yanıyor; en-yakın ataması altı ışığı tek bloğa yığıyor ve
 * ejderha kıpırdadıkça ışıklar hedef değiştirip titriyordu. Bunun yerine
 * yanan hedefler kaba hücrelere toplanıp en "sıcak" hücreler seçiliyor.
 */

const CELL = 80;
/** Işık kaç saniyede bir yeniden hedeflenir. */
const RETARGET = 0.25;

export type FireLightPool = {
  lights: THREE.PointLight[];
  update(dt: number, now: number, sources: Burnable[], focus: THREE.Vector3): void;
};

type Cluster = { x: number; z: number; y: number; burn: number; score: number };

export function createFireLights(scene: THREE.Scene): FireLightPool {
  const lights: THREE.PointLight[] = [];
  const goals: THREE.Vector3[] = [];
  const power: number[] = [];
  for (let i = 0; i < FIRE_LIGHTS; i++) {
    const l = new THREE.PointLight(0xff6a1a, 0, 46, 2);
    l.position.set(0, -600, 0);
    scene.add(l);
    lights.push(l);
    goals.push(new THREE.Vector3(0, -600, 0));
    power.push(0);
  }

  const cells = new Map<number, Cluster>();
  const ranked: Cluster[] = [];
  let timer = 0;

  return {
    lights,
    update(dt, now, sources, focus) {
      timer -= dt;
      if (timer <= 0) {
        timer = RETARGET;
        cells.clear();
        for (const s of sources) {
          if (s.burn <= 0.04) continue;
          if (s.dead && !s.splitDone) continue;
          const cx = Math.floor(s.pos.x / CELL);
          const cz = Math.floor(s.pos.z / CELL);
          const key = ((cx + 4096) << 13) | (cz + 4096);
          let c = cells.get(key);
          if (!c) {
            c = { x: 0, z: 0, y: 0, burn: 0, score: 0 };
            cells.set(key, c);
          }
          // Yanma ağırlıklı merkez: en şiddetli yangın ışığı kendine çeker.
          c.x += s.pos.x * s.burn;
          c.z += s.pos.z * s.burn;
          c.y += (s.pos.y + s.lightY) * s.burn;
          c.burn += s.burn;
        }
        ranked.length = 0;
        for (const c of cells.values()) {
          if (c.burn <= 0) continue;
          c.x /= c.burn;
          c.z /= c.burn;
          c.y /= c.burn;
          const dx = c.x - focus.x;
          const dz = c.z - focus.z;
          c.score = c.burn / (1 + (dx * dx + dz * dz) * 0.00004);
          ranked.push(c);
        }
        ranked.sort((a, b) => b.score - a.score);
        for (let i = 0; i < FIRE_LIGHTS; i++) {
          const c = ranked[i];
          if (c) {
            goals[i]!.set(c.x, c.y, c.z);
            power[i] = c.burn;
          } else {
            power[i] = 0;
          }
        }
      }

      for (let i = 0; i < FIRE_LIGHTS; i++) {
        const l = lights[i]!;
        const p = power[i]!;
        if (p <= 0) {
          l.intensity = Math.max(0, l.intensity - 200 * dt);
          continue;
        }
        l.position.lerp(goals[i]!, Math.min(1, dt * 4));
        // Çok frekanslı titreşim — doğal yangın ışığı
        const flicker =
          Math.sin(now * 0.011 + l.position.x) * 10 +
          Math.sin(now * 0.037 + l.position.z) * 6 +
          Math.sin(now * 0.089 + l.position.x * 0.5) * 3;
        const target = Math.min(150, 20 + p * 9) + flicker;
        l.intensity += (target - l.intensity) * Math.min(1, dt * 8);
        l.distance = 46 + Math.min(74, p * 7);
      }
    },
  };
}
