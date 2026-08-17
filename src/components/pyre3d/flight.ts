import * as THREE from "three";
import { terrainHeight } from "./world";
import type { Game } from "./game";

/**
 * Uçuş modeli — 2.5D: kamera yönelimi sabit, hareket düzlemsel.
 *
 * GDD "ağır ama tatmin edici arcade fizik, hız korunumu sistemin kalbi" diyor.
 * Girdi doğrudan konuma değil hıza uygulanıyor; ejderha savrulmayı ve
 * duruşa geçmeyi hissettiriyor. Dalış hız biriktiriyor, çıkışta bu hız
 * "slingshot" ivmesine dönüşüyor.
 */

export const FLIGHT = {
  baseSpeed: 62,
  boostSpeed: 118,
  accel: 3.6,
  altSpeed: 70,
  minClearance: 12,
  maxAltitude: 320,
  /** Dalışta biriken ekstra hız ve sönümü. */
  diveGain: 46,
  diveDecay: 0.75,
  staminaDrain: 16,
  rollDuration: 0.55,
  rollInvuln: 0.4,
  rollImpulse: 42,
  rollStamina: 18,
  rollCooldown: 0.9,
  /** Kusursuz kaçınma penceresi: mermi bu süre içinde en yakın noktaya gelecekse. */
  perfectWindow: 0.22,
  emberRush: 2.5,
} as const;

export type RollState = { t: number; dir: -1 | 1; perfect: boolean } | null;

const camGoal = new THREE.Vector3();
const camPos = new THREE.Vector3();
const lookGoal = new THREE.Vector3();

export function tryRoll(g: Game, dir: -1 | 1): boolean {
  const s = g.state;
  if (g.roll || s.rollCd > 0 || s.stamina < FLIGHT.rollStamina) return false;
  s.rollCd = FLIGHT.rollCooldown;
  s.stamina -= FLIGHT.rollStamina;
  s.invuln = Math.max(s.invuln, FLIGHT.rollInvuln);

  // Kusursuz kaçınma: yaklaşan mermi tam da bu pencerede en yakın noktaya
  // gelecekse ödül. GDD: stamina iadesi + "Ember Rush".
  const perfect = s.threatT > 0 && s.threatT < FLIGHT.perfectWindow;
  if (perfect) {
    s.stamina = Math.min(100, s.stamina + 30);
    s.emberRush = FLIGHT.emberRush;
    s.rage = Math.min(100, s.rage + 12);
    s.perfectDodges++;
    g.audio.perfect();
    g.mission.emit({ kind: "perfectDodge" });
  } else {
    g.audio.roll();
  }
  // Harpun bağı takla ile kopuyor — GDD'nin "barrel roll spam'i" çözümü.
  if (s.snared > 0) s.snared = Math.max(0, s.snared - 1.6);
  g.roll = { t: 0, dir, perfect };
  return true;
}

export function updateFlight(g: Game, dt: number): void {
  const s = g.state;
  const c = g.ctrl;
  const d = g.dragon;

  s.invuln = Math.max(0, s.invuln - dt);
  s.rollCd = Math.max(0, s.rollCd - dt);
  s.fireballCd = Math.max(0, s.fireballCd - dt);
  s.shockCd = Math.max(0, s.shockCd - dt);
  s.emberRush = Math.max(0, s.emberRush - dt);
  s.snared = Math.max(0, s.snared - dt);
  s.marked = Math.max(0, s.marked - dt);

  if (c.roll !== 0) {
    tryRoll(g, c.roll > 0 ? 1 : -1);
    c.roll = 0;
  }

  const boosting = c.boost && s.stamina > 0;
  if (boosting) s.stamina = Math.max(0, s.stamina - FLIGHT.staminaDrain * dt);
  else s.stamina = Math.min(100, s.stamina + g.buffs.staminaRegen * dt);

  // Dalış hız biriktirir; yükselirken bu birikim geri veriliyor.
  if (c.alt < -0.1) g.dive = Math.min(1, g.dive + dt * 0.8);
  else g.dive = Math.max(0, g.dive - dt * FLIGHT.diveDecay);

  const rushMul = s.emberRush > 0 ? 1.35 : 1;
  const snareMul = s.snared > 0 ? 0.6 : 1;
  const target =
    (boosting ? FLIGHT.boostSpeed : FLIGHT.baseSpeed + g.dive * FLIGHT.diveGain) *
    rushMul *
    snareMul;
  s.speed += (target - s.speed) * Math.min(1, dt * 1.6);

  // Girdi hıza uygulanıyor: ani duruş yok, savrulma var.
  const goalX = c.x * s.speed;
  const goalZ = -c.y * s.speed;
  const k = Math.min(1, dt * FLIGHT.accel);
  g.vel.x += (goalX - g.vel.x) * k;
  g.vel.z += (goalZ - g.vel.z) * k;

  if (g.roll) {
    // Takla yanal bir itki taşıyor — sadece görsel değil, kaçınma hareketi.
    g.roll.t += dt;
    const p = g.roll.t / FLIGHT.rollDuration;
    d.root.position.x += g.roll.dir * FLIGHT.rollImpulse * (1 - p) * dt;
    if (g.roll.t >= FLIGHT.rollDuration) g.roll = null;
  }

  d.root.position.x += g.vel.x * dt;
  d.root.position.z += g.vel.z * dt;

  const groundY = terrainHeight(d.root.position.x, d.root.position.z);
  d.root.position.y = THREE.MathUtils.clamp(
    d.root.position.y + c.alt * FLIGHT.altSpeed * dt,
    groundY + FLIGHT.minClearance,
    FLIGHT.maxAltitude,
  );

  // Sınır dışına çıkınca yalnız yatay yarıçap kısılır; irtifa korunur.
  const rr = Math.hypot(d.root.position.x, d.root.position.z);
  if (rr > g.worldRadius) {
    const f = g.worldRadius / rr;
    d.root.position.x *= f;
    d.root.position.z *= f;
    g.vel.x *= 0.4;
    g.vel.z *= 0.4;
  }

  /* ---- gövde animasyonu ---- */
  const bank = g.roll
    ? // Takla süresince gövde tam tur atıyor.
      g.roll.dir * Math.PI * 2 * (g.roll.t / FLIGHT.rollDuration)
    : -c.x * 0.6;
  const lerpK = g.roll ? 1 : Math.min(1, dt * 5);
  d.body.rotation.z += (bank - d.body.rotation.z) * lerpK;
  d.root.rotation.y += ((c.x * Math.PI) / 2 - d.root.rotation.y) * Math.min(1, dt * 4);

  s.flap += dt * (2.2 + s.speed * 0.03);
  const flapAmt = Math.sin(s.flap) * (boosting ? 0.75 : 0.5);
  d.wingR.rotation.z = -flapAmt - 0.1;
  d.wingL.rotation.z = flapAmt + 0.1;
  d.wingR.rotation.x = Math.sin(s.flap - 0.6) * 0.16;
  d.wingL.rotation.x = Math.sin(s.flap - 0.6) * 0.16;
  d.tail.forEach((t, i) => {
    t.rotation.y = Math.sin(s.flap * 0.7 - i * 0.45) * 0.13 - c.x * 0.06;
    t.rotation.x = Math.sin(s.flap * 0.5 - i * 0.3) * 0.05;
  });
  d.neck.forEach((n, i) => {
    n.rotation.x = -c.y * 0.09 + Math.sin(s.flap * 0.6 - i) * 0.03;
    n.rotation.y = -c.x * 0.08;
  });
}

/** Sabit yönelimli, arkadan-üstten takip kamerası. */
export function updateCamera(g: Game, dt: number, playing: boolean): void {
  const s = g.state;
  const back = (playing ? 34 + s.speed * 0.16 : 40) + (s.rageT > 0 ? 8 : 0);
  camGoal.set(0, 14, -back).add(g.dragon.root.position);
  camPos.copy(g.camera.position).lerp(camGoal, Math.min(1, dt * 4.2));

  if (s.shakeT > 0) {
    s.shakeT = Math.max(0, s.shakeT - dt);
    const amp = s.shakeAmp * (s.shakeT / 0.35);
    camPos.x += (Math.random() - 0.5) * amp;
    camPos.y += (Math.random() - 0.5) * amp;
  }
  // Kamerayı arazinin altına sokma.
  camPos.y = Math.max(terrainHeight(camPos.x, camPos.z) + 8, camPos.y);
  g.camera.position.copy(camPos);
  lookGoal.copy(g.dragon.root.position).addScaledVector(g.fwd, 26);
  lookGoal.y += 3;
  g.camera.lookAt(lookGoal);
}

export function shake(g: Game, amp: number): void {
  g.state.shakeT = 0.35;
  g.state.shakeAmp = Math.max(g.state.shakeAmp * (g.state.shakeT > 0 ? 1 : 0), amp);
}
