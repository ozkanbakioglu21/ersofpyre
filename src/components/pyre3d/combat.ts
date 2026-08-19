import * as THREE from "three";
import { FIREBALL } from "./projectiles";
import { terrainHeight } from "./world";
import type { Airship, Target, WeakPoint } from "./types";
import type { Game } from "./game";

/**
 * Hasar, yangın ve yayılma.
 *
 * GDD'nin yangın modeli: "ahşap köyler zincirleme yanar, taş fabrikalar
 * doğrudan alev basıncı ister; oyuncu yangının yayılmasını rüzgârla yönetir."
 */

export const SPREAD = {
  /** Komşu arama yarıçapı. Eski 70 birim yoğun şehirde 5-8 kat fazlaydı:
   *  cephe arası boşluk 6-14, cadde 14-18 birim. */
  radius: 22,
  windBoost: 0.6,
  baseChancePerSec: 0.55,
  /** Araya cadde giriyorsa sıçrama olasılığı bu kadar düşer. */
  streetBreak: 0.35,
  /** Saniyede tutuşabilecek yeni hedef sayısı. Bu sınır olmadan zincirleme
   *  reaksiyon tek karede parçacık havuzlarını boşaltıp kare süresini patlatıyor. */
  igniteBudgetPerSec: 6,
  tick: 0.4,
} as const;

export const BREATH = {
  range: 70,
  dot: 0.86,
  structureDps: 85,
  airshipDps: 95,
  burnRate: 1.4,
  airshipBurnRate: 2,
  heatPerSec: 30,
  coolPerSec: 24,
  /** Konik alev zayıf nokta modüllerine karşı zayıf; onlar Köz Mermisi ister. */
  weakPointMul: 0.35,
  overheatLock: 3.2,
} as const;

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const neighbours: Target[] = [];

export function addCombo(g: Game): void {
  const s = g.state;
  s.comboT = 5;
  s.combo = Math.min(5, s.combo + 1);
  s.bestCombo = Math.max(s.bestCombo, s.combo);
}

export function killTarget(g: Game, t: Target): void {
  if (t.dead) return;
  t.dead = true;
  t.apply(t);
  if (t.rig) t.rig.visible = false;
  g.state.destroyed++;
  addCombo(g);
  g.state.score += t.score * g.state.combo;
  g.state.embers += t.score * 0.35;
  g.state.rage = Math.min(100, g.state.rage + 1.2 * g.state.combo);
  tmp.copy(t.pos).setY(t.pos.y + Math.min(10, t.height * 0.4));
  g.fx.explosion(tmp, t.kind === "factory" || t.kind === "elevator" ? 1.5 : 1);
  g.audio.explosion(t.kind === "factory" ? 1.6 : 1);
  g.mission.emit({ kind: "targetDestroyed", target: t.kind });
}

export function damageTarget(g: Game, t: Target, amount: number, ignite: number): void {
  if (t.dead) return;
  t.hp -= amount;
  if (ignite > 0) t.burn = Math.min(1, t.burn + ignite * t.flammable);
  if (t.hp <= 0) killTarget(g, t);
}

export function killAirship(g: Game, z: Airship): void {
  if (z.dead) return;
  z.dead = true;
  z.group.visible = false;
  g.state.destroyed++;
  addCombo(g);
  const worth = z.role === "frigate" ? 2400 : 700;
  g.state.score += worth * g.state.combo;
  g.state.embers += z.role === "frigate" ? 900 : 260;
  g.state.rage = Math.min(100, g.state.rage + 10);
  g.fx.explosion(z.group.position, z.role === "frigate" ? 2 : 1.4);
  g.audio.explosion(2);
  g.mission.emit({ kind: "airshipKilled", role: z.role });
}

export function damageWeakPoint(g: Game, ship: Airship, wp: WeakPoint, amount: number): void {
  if (wp.dead) return;
  wp.hp -= amount;
  if (wp.hp > 0) return;
  wp.dead = true;
  wp.group.visible = false;
  g.fx.explosion(wp.world, 1.2);
  g.audio.explosion(1.3);
  g.state.rage = Math.min(100, g.state.rage + 6);
  g.state.score += 450 * g.state.combo;
  g.state.embers += 180;
  switch (wp.onDestroy) {
    case "sink":
      // Balon hücresi patladı: gemi irtifa kaybetmeye başlar.
      ship.burn = Math.min(1, ship.burn + 0.35);
      break;
    case "disableGuns":
      ship.gunsDisabled = true;
      break;
    case "disableEngine":
      ship.dir.multiplyScalar(0.45);
      break;
    case "phase":
      ship.hp = Math.min(ship.hp, ship.maxHp * 0.35);
      break;
  }
  g.mission.emit({ kind: "weakPointDown", shipId: ship.id, module: wp.id });
}

/* ------------------------------------------------------------------ *
 * Konik alev
 * ------------------------------------------------------------------ */

export function breathRange(g: Game): number {
  let r = BREATH.range * g.buffs.flameRange;
  if (g.state.rageT > 0) r *= 1.5;
  if (g.state.emberRush > 0) r *= 1.2;
  return r;
}

export function updateBreath(g: Game, dt: number, firing: boolean, head: THREE.Vector3): void {
  const s = g.state;
  if (!firing) {
    s.heat = Math.max(0, s.heat - BREATH.coolPerSec * dt);
    return;
  }
  // Ejderha Öfkesi süresince Heat birikmiyor (GDD).
  if (s.rageT <= 0) {
    s.heat = Math.min(s.maxHeat, s.heat + BREATH.heatPerSec * dt);
    if (s.heat >= s.maxHeat) {
      s.overheat = BREATH.overheatLock;
      g.audio.overheat();
      g.mission.emit({ kind: "overheat" });
    }
  }

  const range = breathRange(g);
  const dmgMul = s.rageT > 0 ? 1.6 : 1;

  const hit = (p: THREE.Vector3, extra: number): boolean => {
    tmp.copy(p).sub(head);
    const dist = tmp.length();
    if (dist > range + extra) return false;
    tmp.normalize();
    return tmp.dot(g.fwd) > BREATH.dot - extra * 0.004;
  };

  // Menzil içindeki hedefler ızgaradan çekiliyor; tüm şehri taramak
  // 800 binada kare başına ciddi maliyet olurdu.
  g.grid.query(head.x, head.z, range + 30, neighbours);
  for (const t of neighbours) {
    if (t.dead) continue;
    tmp2.copy(t.pos).setY(t.pos.y + Math.min(8, t.height * 0.35));
    if (!hit(tmp2, t.radius)) continue;
    damageTarget(g, t, BREATH.structureDps * dmgMul * dt, BREATH.burnRate * dt);
  }

  for (const z of g.airships) {
    if (z.dead) continue;
    let consumed = false;
    for (const wp of z.weakPoints) {
      if (wp.dead) continue;
      if (!hit(wp.world, wp.radius)) continue;
      damageWeakPoint(g, z, wp, BREATH.airshipDps * BREATH.weakPointMul * dmgMul * dt);
      consumed = true;
    }
    if (hit(z.pos, 12)) {
      z.hp -= BREATH.airshipDps * dmgMul * dt;
      z.burn = Math.min(1, z.burn + BREATH.airshipBurnRate * dt);
      consumed = true;
    }
    if (consumed && z.hp <= 0) killAirship(g, z);
  }

  for (const e of g.enemies) {
    if (e.dead) continue;
    if (!hit(e.pos, e.radius)) continue;
    e.hp -= BREATH.airshipDps * dmgMul * dt;
    e.burn = Math.min(1, e.burn + 1.6 * dt);
  }

  // İnsanları yak — konik alev NPC'leri öldürür
  const npcH = g.city?.npcs;
  if (npcH) {
    for (const npc of npcH.npcs) {
      if (!npc.alive) continue;
      if (hit(npc.group.position, 2.2)) {
        npcH.emitDeathFx(npc.group.position, g.fx);
        npcH.kill(npc);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Patlama (Köz Mermisi ve şok)
 * ------------------------------------------------------------------ */

export type BlastOpts = {
  radius: number;
  damage: number;
  ignite: number;
  weakPointMul?: number;
  /** Köz Mermisi yönü — varsa oval yıkım uygulanır. */
  dir?: THREE.Vector3;
  /** Köz Mermisi mi? — true ise yere çukur, binaya yarım çökme. */
  fireball?: boolean;
};

export function explode(g: Game, at: THREE.Vector3, o: BlastOpts): void {
  g.fx.explosion(at, o.radius / 26);
  // Köz Mermisi: derin bomba sesi; diğerleri normal patlama
  if (o.fireball) g.audio.bombHit();
  else g.audio.explosion(o.radius / 26);

  /* ---- Köz Mermisi efektleri ---- */
  if (o.fireball) {
    // Çukur: yere çarpınca karanlık karartma diski + hörgüç halkası
    const groundY = terrainHeight(at.x, at.z);
    if (at.y <= groundY + 3) {
      g.fx.crater(at, o.radius * 0.35);
    }
  }

  /* ---- Yıkım yarıçapı (oval genişletme) ---- */
  const dir = o.dir;
  const hasDir = dir && dir.lengthSq() > 0.01;
  // Ejderha yönünde uzatma katsayısı: yön varsa %60 daha uzun
  const stretchX = hasDir ? 1.6 : 1;
  const stretchZ = 1;

  /* ---- Bina hasarı ---- */
  g.grid.query(at.x, at.z, o.radius * stretchX, neighbours);
  for (const t of neighbours) {
    if (t.dead) continue;
    // Oval mesafe hesabı: yön boyunca uzatılmış yarıçap
    let dx = t.pos.x - at.x;
    let dz = t.pos.z - at.z;
    if (hasDir) {
      // Ejderha yönünde ecxprojeksiyon — yön boyunca mesafe düşürülür
      const proj = dx * dir!.x + dz * dir!.z;
      const perpX = dx - proj * dir!.x;
      const perpZ = dz - proj * dir!.z;
      // Yön boyunca mesafe kısaltılır (daha uzun menzil), psyche mesafe aynen kalır
      dx = proj * 0.62 + perpX;
      dz = perpZ;
    }
    const d = Math.hypot(dx, dz);
    const effectiveR = o.radius * (hasDir ? stretchX : 1);
    if (d > effectiveR + t.radius) continue;
    const falloff = 1 - Math.min(1, d / (effectiveR + t.radius)) * 0.66;
    const dmg = o.damage * falloff;
    const ign = o.ignite * falloff;

    if (o.fireball) {
      // Köz Mermisi: binaya çarpınca ağır hasar + yüksek yanma
      // Yarım çökme etkisi: binanın yarısına kadar hasar, anında tutuşma
      damageTarget(g, t, dmg * 1.3, Math.min(1, ign * 1.8));
      // Ekstra yakma — bina hemen yanmaya başlar
      if (!t.dead) {
        t.burn = Math.min(1, t.burn + 0.6 * falloff);
      }
    } else {
      damageTarget(g, t, dmg, ign);
    }
  }

  const wpMul = o.weakPointMul ?? 1;
  for (const z of g.airships) {
    if (z.dead) continue;
    for (const wp of z.weakPoints) {
      if (wp.dead) continue;
      const d = wp.world.distanceTo(at);
      if (d > o.radius + wp.radius) continue;
      damageWeakPoint(
        g,
        z,
        wp,
        o.damage * wpMul * (1 - Math.min(1, d / (o.radius + wp.radius)) * 0.6),
      );
    }
    const dz = z.pos.distanceTo(at);
    if (dz < o.radius + 14) {
      z.hp -= o.damage * (1 - Math.min(1, dz / (o.radius + 14)) * 0.6);
      z.burn = Math.min(1, z.burn + o.ignite * 0.6);
      if (z.hp <= 0) killAirship(g, z);
    }
  }

  for (const e of g.enemies) {
    if (e.dead) continue;
    const d = e.pos.distanceTo(at);
    if (d > o.radius + e.radius) continue;
    e.hp -= o.damage * (1 - Math.min(1, d / (o.radius + e.radius)) * 0.6);
    e.burn = Math.min(1, e.burn + o.ignite);
  }

  // İnsanları patlama dalgasıyla öldür — Köz Mermisi / şok dalgası
  const npcH = g.city?.npcs;
  if (npcH) {
    for (const npc of npcH.npcs) {
      if (!npc.alive) continue;
      const d = npc.group.position.distanceTo(at);
      if (d < o.radius) {
        npcH.emitDeathFx(npc.group.position, g.fx);
        npcH.kill(npc);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Yanma ve yayılma
 * ------------------------------------------------------------------ */

export function updateBurning(g: Game, dt: number): void {
  for (const t of g.burning) {
    if (t.dead) continue;
    t.hp -= t.burn * 16 * dt;
    // Görsel durum sadece gözle görülür değiştiğinde yazılıyor: her karede
    // yüzlerce binanın vertex aralığını güncellemek gereksiz.
    if (Math.abs(t.burn - t.wrote) > 0.03) {
      t.wrote = t.burn;
      t.apply(t);
    }
    if (Math.random() < t.burn * 0.7 * dt * 12) {
      tmp.set(
        t.pos.x + (Math.random() - 0.5) * t.radius * 2,
        t.pos.y + 2 + Math.random() * Math.min(14, t.height),
        t.pos.z + (Math.random() - 0.5) * t.radius * 2,
      );
      g.fx.ember(tmp, 1, 3);
    }
    if (t.hp <= 0) killTarget(g, t);
  }
}

let spreadTimer = 0;
let igniteBudget = 0;

export function resetSpread(): void {
  spreadTimer = 0;
  igniteBudget = 0;
}

export function updateFireSpread(g: Game, dt: number): void {
  igniteBudget = Math.min(SPREAD.igniteBudgetPerSec, igniteBudget + SPREAD.igniteBudgetPerSec * dt);
  spreadTimer -= dt;
  if (spreadTimer > 0) return;
  spreadTimer = SPREAD.tick;

  const wind = g.state.wind;
  const windLen = wind.length();
  const radius = SPREAD.radius * (1 + windLen * SPREAD.windBoost);

  for (const src of g.burning) {
    if (src.dead || src.burn < 0.25 || igniteBudget < 1) continue;
    g.grid.query(src.pos.x, src.pos.z, radius, neighbours);
    for (const t of neighbours) {
      if (igniteBudget < 1) break;
      if (t === src || t.dead || t.burn > 0.2 || t.flammable <= 0) continue;
      const dx = t.pos.x - src.pos.x;
      const dz = t.pos.z - src.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 1e-3) continue;

      // Rüzgâr yönü: cephe rüzgârın estiği yöne doğru hızlı ilerler.
      let w = 1;
      if (windLen > 0.01) {
        const dot = (dx / d) * (wind.x / windLen) + (dz / d) * (wind.y / windLen);
        w = 0.55 + 0.45 * dot;
      }
      // Cadde yangın duvarı: iki bina arasındaki orta nokta caddedeyse
      // sıçrama zorlaşır. Alev topu bu duvarı aşmanın yolu.
      const street = g.streetAt((src.pos.x + t.pos.x) / 2, (src.pos.z + t.pos.z) / 2);
      const chance =
        SPREAD.baseChancePerSec *
        src.burn *
        t.flammable *
        Math.max(0, w) *
        (street ? SPREAD.streetBreak : 1) *
        (1 - d / radius) *
        SPREAD.tick;
      if (Math.random() < chance) {
        t.burn = Math.min(1, t.burn + 0.35);
        igniteBudget -= 1;
      }
    }
  }
}

export const FIREBALL_BLAST: BlastOpts = {
  radius: FIREBALL.blastRadius,
  damage: FIREBALL.damage,
  ignite: FIREBALL.ignite,
  weakPointMul: FIREBALL.weakPointMul,
};
