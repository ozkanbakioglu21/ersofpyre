import * as THREE from "three";
import { terrainHeight } from "./world";
import type { Game } from "./game";

/**
 * 5 Ekseni Momentum Tabanlı Uçuş Modeli
 *
 * Eksenler:
 *   throttle  → İleri hız (auto-forward + boost)
 *   pitch     → Burun yukarı/aşağı (momentum ile)
 *   roll      → Yatay bank/kanat yatması
 *   yaw       → Saf yön dönme (kamera bozulmaz)
 *   hover     → Askıda kalma (stamina tüketir, momentum sıfırlar)
 *
 * Fizik: Girdi hedefe değil ivmeye uygulanır. Hız ve açısal momentum
 * kademeli olarak hedefe yaklaşır, böylece ejderha "ağır ama tatmin
 * edici" bir his verir. Dalışta biriken hız çıkışta slingshot'a dönüşür.
 */

export const FLIGHT = {
  /* ---- hız ---- */
  baseSpeed: 62,
  boostSpeed: 118,
  accel: 3.6,
  altSpeed: 70,
  minClearance: 12,
  maxAltitude: 320,

  /* ---- pitch (burun yukarı/aşağı) ---- */
  pitchRate: 2.4,
  pitchDamping: 0.88,
  pitchReturn: 2.8,
  maxPitch: 0.7,

  /* ---- roll (yatay bank/kanat) ---- */
  rollRate: 3.2,
  rollDamping: 0.9,
  maxRoll: 0.65,
  rollReturn: 1.8,

  /* ---- yaw (saf yön) ---- */
  yawRate: 1.8,
  yawDamping: 0.88,
  maxYaw: 0.5,
  yawReturn: 1.4,

  /* ---- hover ---- */
  hoverStaminaDrain: 22,
  hoverLift: 24,
  hoverDamping: 0.82,

  /* ---- dalma ---- */
  diveGain: 46,
  diveDecay: 0.75,

  /* ---- barrel roll (takla) ---- */
  rollDuration: 0.55,
  rollInvuln: 0.4,
  rollImpulse: 42,
  rollStamina: 18,
  rollCooldown: 0.9,
  perfectWindow: 0.22,
  emberRush: 2.5,

  /** Yaw input'unun heading'e ne kadar hızlı eklendiği (radyan/saniye). */
  headingRate: 1.6,
} as const;

/** Açısal momentum durumu: pitch, roll ve yaw için bağımsız state. */
export type FlightAxes = {
  pitch: number;
  pitchVel: number;
  roll: number;
  rollVel: number;
  yaw: number;
  yawVel: number;
  /** Mevcut irtifa momentumu (pozitif=yükselme, negatif=dalma). */
  altMomentum: number;
  /** Dalma ile biriken ekstra hız skoru (0..1). */
  diveAccum: number;
  /** Ejderhanın yatay yön açısı (radyan). Yaw input'u bu açıya birikir. */
  heading: number;
};

export function createFlightAxes(): FlightAxes {
  return {
    pitch: 0,
    pitchVel: 0,
    roll: 0,
    rollVel: 0,
    yaw: 0,
    yawVel: 0,
    altMomentum: 0,
    diveAccum: 0,
    heading: 0,
  };
}

export type RollState = { t: number; dir: -1 | 1; perfect: boolean } | null;

const camGoal = new THREE.Vector3();
const camPos = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const camOff = new THREE.Vector3();
const fwdRot = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

export function tryRoll(g: Game, dir: -1 | 1): boolean {
  const s = g.state;
  if (g.roll || s.rollCd > 0 || s.stamina < FLIGHT.rollStamina) return false;
  s.rollCd = FLIGHT.rollCooldown;
  s.stamina -= FLIGHT.rollStamina;
  s.invuln = Math.max(s.invuln, FLIGHT.rollInvuln);

  // Kusursuz kaçınma: yaklaşan mermi tam da bu pencerede en yakın noktaya
  // gelecekse ödül. Stamina iadesi + "Ember Rush".
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
  // Harpun bağı takla ile kopuyor.
  if (s.snared > 0) s.snared = Math.max(0, s.snared - 1.6);
  g.roll = { t: 0, dir, perfect };
  return true;
}

/** Hedefe yumuşak yaklaşma (momentum damping). */
function lerpDamp(
  current: number,
  target: number,
  dt: number,
  rate: number,
  damping: number,
): [number, number] {
  const k = Math.min(1, dt * rate);
  const vel = (target - current) * k;
  return [current + vel, vel * damping];
}

export function updateFlight(g: Game, dt: number): void {
  const s = g.state;
  const c = g.ctrl;
  const d = g.dragon;
  const a = g.flightAxes;

  /* ---- cooldown / timer düşüşü ---- */
  s.invuln = Math.max(0, s.invuln - dt);
  s.rollCd = Math.max(0, s.rollCd - dt);
  s.fireballCd = Math.max(0, s.fireballCd - dt);
  s.shockCd = Math.max(0, s.shockCd - dt);
  s.emberRush = Math.max(0, s.emberRush - dt);
  s.snared = Math.max(0, s.snared - dt);
  s.marked = Math.max(0, s.marked - dt);

  /* ---- barrel roll (dodge) ---- */
  if (c.dodge !== 0) {
    tryRoll(g, c.dodge > 0 ? 1 : -1);
    c.dodge = 0;
  }

  /* ---- stamina ---- */
  const hover = c.hover && s.stamina > 0 && !g.roll;
  if (hover) {
    s.stamina = Math.max(0, s.stamina - FLIGHT.hoverStaminaDrain * dt);
  } else {
    s.stamina = Math.min(100, s.stamina + g.buffs.staminaRegen * dt);
  }

  /* ---- pitch momentum ---- */
  const pitchTarget = c.pitch * FLIGHT.maxPitch;
  const [newPitch, pitchVel] = lerpDamp(
    a.pitch,
    hover ? 0 : pitchTarget,
    dt,
    FLIGHT.pitchRate,
    FLIGHT.pitchDamping,
  );
  a.pitchVel = pitchVel;
  a.pitch = THREE.MathUtils.clamp(newPitch, -FLIGHT.maxPitch, FLIGHT.maxPitch);

  // Pitch sıfıra dönerken daha hızlı (doğal stabilizasyon).
  if (Math.abs(c.pitch) < 0.1) {
    a.pitch += (0 - a.pitch) * Math.min(1, dt * FLIGHT.pitchReturn);
  }

  /* ---- roll momentum ---- */
  const rollTarget = c.roll * FLIGHT.maxRoll;
  const [newRoll, rollVel] = lerpDamp(
    a.roll,
    hover ? 0 : rollTarget,
    dt,
    FLIGHT.rollRate,
    FLIGHT.rollDamping,
  );
  a.rollVel = rollVel;
  a.roll = THREE.MathUtils.clamp(newRoll, -FLIGHT.maxRoll, FLIGHT.maxRoll);

  if (Math.abs(c.roll) < 0.1) {
    a.roll += (0 - a.roll) * Math.min(1, dt * FLIGHT.rollReturn);
  }

  /* ---- yaw momentum ---- */
  const yawTarget = c.yaw * FLIGHT.maxYaw;
  const [newYaw, yawVel] = lerpDamp(
    a.yaw,
    hover ? 0 : yawTarget,
    dt,
    FLIGHT.yawRate,
    FLIGHT.yawDamping,
  );
  a.yawVel = yawVel;
  a.yaw = THREE.MathUtils.clamp(newYaw, -FLIGHT.maxYaw, FLIGHT.maxYaw);

  if (Math.abs(c.yaw) < 0.1) {
    a.yaw += (0 - a.yaw) * Math.min(1, dt * FLIGHT.yawReturn);
  }

  /* ---- dalma hız biriktirme ---- */
  if (a.pitch < -0.15) {
    a.diveAccum = Math.min(1, a.diveAccum + dt * 0.8);
  } else {
    a.diveAccum = Math.max(0, a.diveAccum - dt * FLIGHT.diveDecay);
  }
  g.dive = a.diveAccum;

  /* ---- hız hesapla ---- */
  const rushMul = s.emberRush > 0 ? 1.35 : 1;
  const snareMul = s.snared > 0 ? 0.6 : 1;
  const pitchActive = Math.abs(c.pitch) > 0.05;
  const throttleBoost = c.throttle * (FLIGHT.boostSpeed - FLIGHT.baseSpeed);
  const diveBoost = a.diveAccum * FLIGHT.diveGain;
  const targetSpeed = pitchActive
    ? (FLIGHT.baseSpeed + throttleBoost + diveBoost) * rushMul * snareMul
    : 0;
  s.speed += (targetSpeed - s.speed) * Math.min(1, dt * 1.6);

  /* ---- yatay hız vektörü ---- */
  if (hover) {
    // Hover: pozisyon sabit, yalnız küçük kaymalar.
    g.vel.x *= FLIGHT.hoverDamping;
    g.vel.z *= FLIGHT.hoverDamping;
  } else {
    // Yaw → heading biriktirmesi (ejderhanın gerçek yönü).
    // Input bırakılınca heading sabit kalır — ejderha döndüğü yönde uçar.
    a.heading += a.yaw * FLIGHT.headingRate * dt;

    // Hız vektörü: heading açısına göre.
    const goalX = Math.sin(a.heading) * s.speed;
    const goalZ = Math.cos(a.heading) * s.speed;
    // Roll hafifçe yan hız ekler (görsel banking + çok hafif drift).
    const rollDrift = a.roll * s.speed * 0.08;
    const k = Math.min(1, dt * FLIGHT.accel);
    g.vel.x += (goalX + rollDrift - g.vel.x) * k;
    g.vel.z += (goalZ - g.vel.z) * k;
  }

  /* ---- barrel roll itki ---- */
  if (g.roll) {
    g.roll.t += dt;
    const p = g.roll.t / FLIGHT.rollDuration;
    d.root.position.x += g.roll.dir * FLIGHT.rollImpulse * (1 - p) * dt;
    if (g.roll.t >= FLIGHT.rollDuration) g.roll = null;
  }

  /* ---- pozisyon güncelle ---- */
  d.root.position.x += g.vel.x * dt;
  d.root.position.z += g.vel.z * dt;

  /* ---- fwd vektörü: ateş ve hedefleme yönü ---- */
  g.fwd.set(Math.sin(a.heading), 0, Math.cos(a.heading)).normalize();

  /* ---- irtifa (pitch + hover) ---- */
  const altInput = hover
    ? FLIGHT.hoverLift * (0.3 + 0.7 * c.throttle)
    : a.pitch * FLIGHT.altSpeed + c.throttle * FLIGHT.altSpeed * 0.15;

  // Hover'da irtifa momentumu daha yumuşak.
  const altLerp = hover ? 2.5 : 5;
  a.altMomentum += (altInput - a.altMomentum) * Math.min(1, dt * altLerp);

  const groundY = terrainHeight(d.root.position.x, d.root.position.z);
  d.root.position.y = THREE.MathUtils.clamp(
    d.root.position.y + a.altMomentum * dt,
    groundY + FLIGHT.minClearance,
    FLIGHT.maxAltitude,
  );

  /* ---- sınır kontrolü ---- */
  if (g.autoForward) {
    if (Math.abs(d.root.position.x) > 180) {
      d.root.position.x = Math.sign(d.root.position.x) * 180;
      g.vel.x *= 0.4;
    }
  } else {
    const rr = Math.hypot(d.root.position.x, d.root.position.z);
    if (rr > g.worldRadius) {
      const f = g.worldRadius / rr;
      d.root.position.x *= f;
      d.root.position.z *= f;
      g.vel.x *= 0.4;
      g.vel.z *= 0.4;
    }
  }

  /* ---- gövde animasyonu ---- */
  // Ejderhanın gerçek yönü: heading doğrudan root.rotation.y olur.
  const headingSmooth = g.roll ? a.heading : a.heading;
  d.root.rotation.y += (headingSmooth - d.root.rotation.y) * Math.min(1, dt * 10);

  // Bank (gövde yatması): roll input'u + takla animasyonu.
  const bank = g.roll ? g.roll.dir * Math.PI * 2 * (g.roll.t / FLIGHT.rollDuration) : a.roll * 0.8;
  const lerpK = g.roll ? 1 : Math.min(1, dt * 5);
  d.body.rotation.z += (bank - d.body.rotation.z) * lerpK;

  // Kanat çırpma
  s.flap += dt * (2.2 + s.speed * 0.03);
  const flapAmt = Math.sin(s.flap) * (c.throttle ? 0.75 : 0.5);
  d.wingR.rotation.z = -flapAmt - 0.1;
  d.wingL.rotation.z = flapAmt + 0.1;
  d.wingR.rotation.x = Math.sin(s.flap - 0.6) * 0.16;
  d.wingL.rotation.x = Math.sin(s.flap - 0.6) * 0.16;

  // Kuyruk ve boyun animasyonu
  d.tail.forEach((t, i) => {
    t.rotation.y = Math.sin(s.flap * 0.7 - i * 0.45) * 0.13 - a.roll * 0.08;
    t.rotation.x = Math.sin(s.flap * 0.5 - i * 0.3) * 0.05;
  });
  d.neck.forEach((n, i) => {
    const fireTilt = g.fireT * 0.35 * (1 - i * 0.15);
    n.rotation.x = -a.pitch * 0.12 + fireTilt + Math.sin(s.flap * 0.6 - i) * 0.03;
    n.rotation.y = -a.yaw * 0.08 - a.roll * 0.05;
  });
}

/** Ejderhanın yönüyle dönen, arkadan-üstten takip kamerası. */
export function updateCamera(g: Game, dt: number, playing: boolean): void {
  const s = g.state;
  const a = g.flightAxes;
  const ry = g.dragon.root.rotation.y;

  // Kamera geri mesafesi: pitch yukarı çıktıkça biraz uzar.
  const pitchBackOffset = Math.max(0, a.pitch) * 6;
  const back = (playing ? 34 + s.speed * 0.16 : 40) + (s.rageT > 0 ? 8 : 0) + pitchBackOffset;

  // Kamera yüksekliği: pitch yukarı çıkınca biraz yukarı.
  const pitchHeightOffset = a.pitch * 8;

  camOff.set(0, 14 + pitchHeightOffset, -back).applyAxisAngle(UP, ry);
  camGoal.copy(camOff).add(g.dragon.root.position);
  camPos.copy(g.camera.position).lerp(camGoal, Math.min(1, dt * 9));

  if (s.shakeT > 0) {
    s.shakeT = Math.max(0, s.shakeT - dt);
    const amp = s.shakeAmp * (s.shakeT / 0.35);
    camPos.x += (Math.random() - 0.5) * amp;
    camPos.y += (Math.random() - 0.5) * amp;
  }
  camPos.y = Math.max(terrainHeight(camPos.x, camPos.z) + 8, camPos.y);
  g.camera.position.copy(camPos);

  // Look-at noktası: pitch ve yaw etkisiyle hafifçe kaydır.
  fwdRot.set(0, 0, 26).applyAxisAngle(UP, ry);
  lookGoal.copy(g.dragon.root.position).add(fwdRot);
  lookGoal.y += 3 + a.pitch * 5;

  // Yaw: kameranın baktığı yönü de hafifçe döndür.
  tmpVec.set(a.yaw * 8, 0, 0).applyAxisAngle(UP, ry);
  lookGoal.add(tmpVec);

  g.camera.lookAt(lookGoal);
}

export function shake(g: Game, amp: number): void {
  g.state.shakeT = 0.35;
  g.state.shakeAmp = Math.max(g.state.shakeAmp * (g.state.shakeT > 0 ? 1 : 0), amp);
}
