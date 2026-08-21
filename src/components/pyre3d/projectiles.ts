import * as THREE from "three";
import { rand } from "./rng";

/**
 * Mermi havuzları.
 *
 * Hem düşman atışları hem Köz Mermisi sabit boyutlu havuzlardan geliyor:
 * sahneye oyun ortasında mesh eklemek/çıkarmak hem çöp üretiyor hem de ilk
 * kullanımda shader derlemesi riski taşıyor.
 */

export type ShotKind = "bolt" | "flak" | "harpoon" | "firebolt";

export type Shot = {
  active: boolean;
  kind: ShotKind;
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  /** Flak mermisi bu irtifayı geçtiğinde patlar. */
  fuseY: number;
  /** Fünyenin hangi yönden geçileceğini bilmek için başlangıç işareti. */
  fuseSign: number;
};

export type ShotPool = {
  shots: Shot[];
  spawn(
    kind: ShotKind,
    from: THREE.Vector3,
    vel: THREE.Vector3,
    damage: number,
    fuseY?: number,
  ): void;
  dispose(): void;
};

const SHOT_CAP = 140;

export function createShotPool(scene: THREE.Scene): ShotPool {
  const boltGeo = new THREE.SphereGeometry(0.9, 6, 6);
  const flakGeo = new THREE.SphereGeometry(1.2, 6, 6);
  const harpoonGeo = new THREE.CylinderGeometry(0.16, 0.16, 4.4, 5);
  const fireboltGeo = new THREE.SphereGeometry(1.1, 6, 6);
  const boltMat = new THREE.MeshBasicMaterial({ color: 0x7fe4ff });
  const flakMat = new THREE.MeshBasicMaterial({ color: 0xffd08a });
  const harpoonMat = new THREE.MeshBasicMaterial({ color: 0xc7a15a });
  const fireboltMat = new THREE.MeshBasicMaterial({ color: 0xffcc22 });

  const shots: Shot[] = [];
  const make = (kind: ShotKind) => {
    const geo = kind === "bolt" ? boltGeo : kind === "flak" ? flakGeo : kind === "harpoon" ? harpoonGeo : fireboltGeo;
    const mat = kind === "bolt" ? boltMat : kind === "flak" ? flakMat : kind === "harpoon" ? harpoonMat : fireboltMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  };
  // Üç türden de havuzda örnek bulunsun ki ilk atışta materyal derlenmesin.
  for (let i = 0; i < SHOT_CAP; i++) {
    const kind: ShotKind = i % 5 === 0 ? "flak" : i % 7 === 0 ? "harpoon" : i % 3 === 0 ? "firebolt" : "bolt";
    shots.push({
      active: false,
      kind,
      mesh: make(kind),
      vel: new THREE.Vector3(),
      life: 0,
      damage: 8,
      fuseY: 0,
      fuseSign: 0,
    });
  }

  return {
    shots,
    spawn(kind, from, vel, damage, fuseY = 0) {
      // Aynı türden boş yuva ara: mesh geometrisi türe bağlı.
      let slot: Shot | null = null;
      for (const s of shots) {
        if (!s.active && s.kind === kind) {
          slot = s;
          break;
        }
      }
      if (!slot) return;
      slot.active = true;
      slot.mesh.visible = true;
      slot.mesh.position.copy(from);
      slot.vel.copy(vel);
      slot.life = 6;
      slot.damage = damage;
      slot.fuseY = fuseY;
      slot.fuseSign = Math.sign(fuseY - from.y) || 1;
      if (kind === "harpoon") {
        slot.mesh.lookAt(from.clone().add(vel));
        slot.mesh.rotateX(Math.PI / 2);
      }
    },
    dispose() {
      boltGeo.dispose();
      flakGeo.dispose();
      harpoonGeo.dispose();
      fireboltGeo.dispose();
      boltMat.dispose();
      flakMat.dispose();
      harpoonMat.dispose();
      fireboltMat.dispose();
    },
  };
}

/* ------------------------------------------------------------------ *
 * Köz Mermisi (alev topu)
 * ------------------------------------------------------------------ */

export type Fireball = {
  active: boolean;
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  /** Uçuş ıslığını durdurur (mermi patlayınca/sönünce çağrılır). */
  sndStop: (() => void) | null;
};

export type FireballPool = {
  balls: Fireball[];
  spawn(from: THREE.Vector3, vel: THREE.Vector3): Fireball | null;
  dispose(): void;
};

const FIREBALL_CAP = 12;

export function createFireballPool(scene: THREE.Scene): FireballPool {
  const geo = new THREE.SphereGeometry(1.5, 10, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffb055,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const balls: Fireball[] = [];
  for (let i = 0; i < FIREBALL_CAP; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    balls.push({ active: false, mesh, vel: new THREE.Vector3(), life: 0, sndStop: null });
  }
  return {
    balls,
    spawn(from, vel) {
      for (const b of balls) {
        if (b.active) continue;
        b.active = true;
        b.mesh.visible = true;
        b.mesh.position.copy(from);
        b.mesh.scale.setScalar(rand(0.85, 1.15));
        b.vel.copy(vel);
        b.life = 3;
        b.sndStop = null;
        return b;
      }
      return null;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export const FIREBALL = {
  speed: 150,
  gravity: -62,
  /** Hava sürtünmesi — yatay hızı yavaşlatır, bomba gibi düşürür. */
  drag: 0.18,
  /** Çarpma yarıçapı ve hasarı. */
  blastRadius: 34,
  damage: 220,
  ignite: 0.7,
  heat: 18,
  cooldown: 0.55,
  /** Zayıf nokta modüllerine karşı çarpan — GDD: "zeplin modüllerini kırar". */
  weakPointMul: 2.5,
} as const;

/**
 * Alçak yay fırlatma açısı: v² sin2θ = g·d.
 *
 * 2.5D kontrollerde ve dokunmatikte oyuncunun elinde dikey nişan yok; bu
 * çözüm olmadan alev topu ya hep yere ya hep göğe gidiyordu.
 */
export function launchElevation(dist: number, speed: number, gravity: number): number {
  const g = Math.abs(gravity);
  const s = (g * dist) / (speed * speed);
  if (s >= 1) return Math.PI / 4;
  return 0.5 * Math.asin(s);
}
