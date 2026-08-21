import * as THREE from "three";
import { bandMat, brass, flagMat, lanternMat, litWindow, stone } from "./materials";
import type { Rng } from "./rng";
import { bake } from "./world";
import type { Airship, AirshipRole, WeakPoint, WeakPointEffect, WeakPointId } from "./types";

/**
 * Ashkeep zeplinleri.
 *
 * GDD'nin "zayıf nokta sistemi"ni taşıyorlar: gövde tek mesh'e birleştirilmiş
 * olsa da her modül kendi grubu, kendi canı ve kendi yıkım sonucu olan ayrı
 * bir nesne. Bunun emsali zaten kodda vardı — pervaneler dönebilsinler diye
 * birleştirmenin dışında tutuluyorlardı; modüller de aynı yolu izliyor.
 */

const ROLE_SCALE: Record<AirshipRole, number> = { scout: 0.6, bomber: 0.95, frigate: 1.35, flagship: 2.2 };
const ROLE_HP: Record<AirshipRole, number> = { scout: 190, bomber: 520, frigate: 900, flagship: 2400 };

const WP_LABEL: Record<WeakPointId, string> = {
  balonOn: "Ön Balon Hücresi",
  balonArka: "Arka Balon Hücresi",
  motorSol: "Sol Motor Podu",
  motorSag: "Sağ Motor Podu",
  batarya: "Yan Batarya",
  kopru: "Köprü",
  cekirdek: "Çekirdek Kazanı",
  kanatSol: "Sol Kanat Konsolu",
  kanatSag: "Sağ Kanat Konsolu",
  radar: "Anten Kulesi",
  kalkan: "Kalkan Jeneratörü",
  yakit: "Yakıt Deposu",
  komuta: "Komuta Merkezi",
  taretSol: "Sol Topçu Kulesi",
  taretSag: "Sağ Topçu Kulesi",
  egzost: "Egzoz Kanalı",
  navigasyon: "Navigasyon Kulesi",
  zirh: "Zırh Plakası",
};

function makeWeakPoint(
  id: WeakPointId,
  parts: THREE.Group,
  local: THREE.Vector3,
  radius: number,
  hp: number,
  onDestroy: WeakPointEffect,
): WeakPoint {
  const group = new THREE.Group();
  group.position.copy(local);
  for (const m of bake(parts, { castShadow: false, receiveShadow: false })) group.add(m);
  return {
    id,
    label: WP_LABEL[id],
    group,
    local: local.clone(),
    world: local.clone(),
    radius,
    hp,
    maxHp: hp,
    dead: false,
    onDestroy,
  };
}

/** Balon hücresi: kaburgalar arasına gerilmiş şişkin bir gaz bölmesi. */
function balloonCell(s: number): THREE.Group {
  const g = new THREE.Group();
  const cell = new THREE.Mesh(new THREE.SphereGeometry(2.5 * s, 12, 10), bandMat);
  cell.scale.set(1, 0.85, 1.5);
  g.add(cell);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(2.6 * s, 0.16 * s, 5, 14), brass);
  strap.rotation.y = Math.PI / 2;
  g.add(strap);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.7 * s, 1.2 * s, 8), brass);
  valve.position.y = 2.2 * s;
  g.add(valve);
  return g;
}

function gunBattery(s: number): THREE.Group {
  const g = new THREE.Group();
  const mount = new THREE.Mesh(
    new THREE.BoxGeometry(2.2 * s, 1.6 * s, 5.4 * s),
    stone(0x2e2822, 0.6),
  );
  g.add(mount);
  for (let i = -1; i <= 1; i++) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * s, 0.3 * s, 3.4 * s, 6), brass);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(1.6 * s, 0, i * 1.7 * s);
    g.add(barrel);
  }
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.5 * s, 4 * s), lanternMat);
  glow.position.set(-1.1 * s, 0, 0);
  g.add(glow);
  return g;
}

function enginePod(s: number): THREE.Group {
  const g = new THREE.Group();
  const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * s, 0.65 * s, 4 * s, 10), brass);
  nacelle.rotation.x = Math.PI / 2;
  g.add(nacelle);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.55 * s, 1.2 * s, 8), brass);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -2.4 * s;
  g.add(spinner);
  const vent = new THREE.Mesh(new THREE.TorusGeometry(0.95 * s, 0.14 * s, 5, 12), lanternMat);
  vent.position.z = 1.6 * s;
  g.add(vent);
  return g;
}

function bridgeModule(s: number): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(3.4 * s, 2.2 * s, 4.4 * s),
    stone(0x241f1a, 0.6),
  );
  g.add(box);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(3.0 * s, 1.0 * s, 4.0 * s), litWindow);
  glass.position.y = 0.3 * s;
  g.add(glass);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * s, 0.8 * s, 2.4 * s, 8), brass);
  funnel.position.y = 2 * s;
  g.add(funnel);
  return g;
}

function wingStrut(s: number): THREE.Group {
  const g = new THREE.Group();
  const strut = new THREE.Mesh(new THREE.BoxGeometry(4.8 * s, 0.6 * s, 1.4 * s), stone(0x3a3228, 0.5));
  g.add(strut);
  const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.15 * s, 3.2 * s, 6), brass);
  brace.rotation.z = Math.PI / 4;
  brace.position.set(0, -1.2 * s, 0);
  g.add(brace);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.35 * s, 6, 6), lanternMat);
  light.position.set(2.2 * s, 0.5 * s, 0);
  g.add(light);
  return g;
}

function antennaTower(s: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 4.5 * s, 6), brass);
  g.add(pole);
  const dish = new THREE.Mesh(new THREE.TorusGeometry(1.2 * s, 0.12 * s, 6, 10), lanternMat);
  dish.rotation.x = Math.PI / 3;
  dish.position.y = 2.2 * s;
  g.add(dish);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.25 * s, 6, 6), lanternMat);
  tip.position.y = 2.6 * s;
  g.add(tip);
  return g;
}

function shieldGen(s: number): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 * s, 0), brass);
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8 * s, 0.18 * s, 6, 12), lanternMat);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * s, 1.1 * s, 1.6 * s, 8), stone(0x2e2822, 0.6));
  base.position.y = -1.6 * s;
  g.add(base);
  return g;
}

function fuelTank(s: number): THREE.Group {
  const g = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(1.1 * s, 3.6 * s, 6, 8), stone(0x3a2e22, 0.4));
  tank.rotation.x = Math.PI / 2;
  g.add(tank);
  const band1 = new THREE.Mesh(new THREE.TorusGeometry(1.2 * s, 0.1 * s, 5, 10), brass);
  band1.position.z = -1.2 * s;
  g.add(band1);
  const band2 = band1.clone();
  band2.position.z = 1.2 * s;
  g.add(band2);
  return g;
}

function commandModule(s: number): THREE.Group {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2 * s, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone(0x241f1a, 0.5));
  g.add(dome);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2 * s, 2.4 * s, 1.6 * s, 10), stone(0x2e2822, 0.6));
  base.position.y = -1.2 * s;
  g.add(base);
  const window1 = new THREE.Mesh(new THREE.BoxGeometry(0.8 * s, 0.6 * s, 2.6 * s), litWindow);
  window1.position.set(0, -0.4 * s, 1.6 * s);
  g.add(window1);
  return g;
}

function gunTurret(s: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * s, 1.4 * s, 1.2 * s, 8), stone(0x2e2822, 0.6));
  g.add(base);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 3.4 * s, 6), brass);
  barrel.rotation.x = -Math.PI / 2;
  barrel.position.set(0, 0.5 * s, -1.2 * s);
  g.add(barrel);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(2 * s, 1 * s, 1.6 * s), bandMat);
  shield.position.set(0, 0.6 * s, 0.2 * s);
  g.add(shield);
  return g;
}

function exhaustPort(s: number): THREE.Group {
  const g = new THREE.Group();
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.7 * s, 0.9 * s, 2.2 * s, 8), brass);
  pipe.rotation.x = -Math.PI / 2;
  g.add(pipe);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.6 * s, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 2.5 }),
  );
  glow.position.z = -1.2 * s;
  g.add(glow);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85 * s, 0.08 * s, 5, 10), bandMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = -0.8 * s;
  g.add(ring);
  return g;
}

function navTower(s: number): THREE.Group {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 4.4 * s, 6), brass);
  mast.position.y = 2 * s;
  g.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1 * s, 8, 6, 0, Math.PI), lanternMat);
  dish.position.y = 4 * s;
  dish.rotation.y = Math.PI / 4;
  g.add(dish);
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.3 * s, 5, 5),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffaa44, emissiveIntensity: 3 }),
  );
  light.position.y = 4.6 * s;
  g.add(light);
  return g;
}

function armorPlate(s: number): THREE.Group {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(4.2 * s, 3.2 * s, 0.4 * s), bandMat);
  g.add(plate);
  for (const rx of [-1.5 * s, 0, 1.5 * s]) {
    for (const ry of [-1 * s, 1 * s]) {
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.14 * s, 4, 4), brass);
      rivet.position.set(rx, ry, 0.22 * s);
      g.add(rivet);
    }
  }
  return g;
}

export function createAirship(
  x: number,
  y: number,
  z: number,
  rng: Rng,
  opts: { role?: AirshipRole; id?: string; weakPoints?: boolean } = {},
): Airship {
  const role = opts.role ?? "scout";
  const s = ROLE_SCALE[role];
  const group = new THREE.Group();
  group.position.set(x, y, z);

  // Gövde yanınca renk değiştiği için bu materyal zeplin başına özel.
  const hullMat = new THREE.MeshStandardMaterial({
    color: role === "frigate" ? 0x4d4438 : role === "bomber" ? 0x3e3a32 : 0x5c5145,
    roughness: 0.7,
    metalness: 0.35,
  });
  const dark = stone(0x1d1a16, 0.5);
  const parts = new THREE.Group();

  // ---- balloon ----
  const R = 6.4 * s;
  const HALF = R * 2.44;
  let halfLen = HALF;

  if (role === "bomber") {
    // Bomber: daha geniş ve daha kısa balon, zırh plakaları, bomba meki̇zi̇
    const bR = R * 1.25;
    const bHalf = HALF * 0.78;
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(bR, 18, 12), hullMat);
    balloon.scale.set(1.15, 0.72, 1.6);
    parts.add(balloon);

    // nose cone — daha kısa ve geniş
    const nose = new THREE.Mesh(new THREE.ConeGeometry(3 * s, 4.2 * s, 10), bandMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -bHalf * 1.02 - 0.4 * s;
    parts.add(nose);

    // ribs
    for (const f of [-0.72, -0.4, -0.1, 0.1, 0.4, 0.72]) {
      const zp = f * bHalf;
      const rr = Math.sqrt(Math.max(0.001, 1 - f * f)) * bR * 1.02;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.22 * s, 6, 18), brass);
      rib.position.z = zp;
      rib.scale.y = 0.72;
      parts.add(rib);
    }

    // armor plating — yan plakalar
    for (const side of [-1, 1] as const) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, bR * 1.1, bHalf * 1.4), bandMat);
      plate.position.set(bR * 1.12 * side, 0, 0);
      parts.add(plate);
    }

    // bomb bay hatch — alt
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(3.8 * s, 0.3 * s, 5.4 * s), dark);
    hatch.position.set(0, -bR * 0.72 - 0.2 * s, 0);
    parts.add(hatch);
    for (const dz of [-1.8, 0, 1.8]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.08 * s, 5 * s, 4), brass);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(0, -bR * 0.85, dz * s);
      parts.add(rail);
    }

    // tail fins — heavier双垂直
    const finV = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 4.8 * s, 3 * s), hullMat);
    finV.position.set(0, 1.6 * s, bHalf + 0.4 * s);
    parts.add(finV);
    const finH = new THREE.Mesh(new THREE.BoxGeometry(8 * s, 0.4 * s, 2.8 * s), hullMat);
    finH.position.set(0, 0.2 * s, bHalf + 0.5 * s);
    parts.add(finH);
    // Dikey kuyruk destekleri
    for (const side of [-1, 1] as const) {
      const finSup = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 3 * s, 2 * s), dark);
      finSup.position.set(3.6 * s * side, 1 * s, bHalf + 0.8 * s);
      parts.add(finSup);
    }

    // ---- gondola / bomb bay ----
    const gondola = new THREE.Mesh(
      new THREE.BoxGeometry(4.6 * s, 2.6 * s, 12 * s),
      stone(0x252220, 0.65),
    );
    gondola.position.y = -7.2 * s;
    parts.add(gondola);
    const gRoof = new THREE.Mesh(new THREE.BoxGeometry(5 * s, 0.5 * s, 12.4 * s), hullMat);
    gRoof.position.y = -5.8 * s;
    parts.add(gRoof);
    const cabinGlow = new THREE.Mesh(new THREE.BoxGeometry(3.4 * s, 0.8 * s, 8 * s), litWindow);
    cabinGlow.position.y = -7 * s;
    parts.add(cabinGlow);

    // bomb racks inside gondola
    for (const [bx, bz] of [[-1.2, -3.5], [-1.2, 0], [-1.2, 3.5], [1.2, -3.5], [1.2, 0], [1.2, 3.5]] as const) {
      const bomb = new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * s, 1.6 * s, 4, 6), dark);
      bomb.position.set(bx * s, -8.2 * s, bz * s);
      parts.add(bomb);
    }

    // side engines — kapalı nacelle
    for (const side of [-1, 1] as const) {
      const mx = 6.8 * s * side;
      const my = -4 * s;
      const mz = bHalf * 0.5;
      const nacelle = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1 * s, 0.7 * s, 4 * s, 10),
        hullMat,
      );
      nacelle.rotation.x = Math.PI / 2;
      nacelle.position.set(mx, my, mz);
      parts.add(nacelle);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.18 * s, 3.4 * s, 5), dark);
      arm.position.set(mx, my + 2.8 * s, mz);
      parts.add(arm);
    }

    // keel cables
    for (const [sx, sz] of [[-2, -4], [2, -4], [-2, 4], [2, 4]] as const) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 2.8 * s, 4), dark);
      cable.position.set(sx * s, -6.8 * s, sz * s);
      parts.add(cable);
    }

    // reassign halfLen for bomber for weakpoint positions
    halfLen = bHalf;
  } else {
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 14), hullMat);
    balloon.scale.set(1, 0.8, 2.44);
    parts.add(balloon);

    // nose cone (-Z = travel direction)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.1 * s, 5.5 * s, 12), bandMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -HALF - 0.4 * s;
    parts.add(nose);

    // hooped ribs hugging the hull
    for (const f of [-0.77, -0.45, -0.16, 0, 0.16, 0.45, 0.77]) {
      const zp = f * HALF;
      const rr = Math.sqrt(Math.max(0.001, 1 - f * f)) * R * 1.012;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.16 * s, 6, 20), brass);
      rib.position.z = zp;
      rib.scale.y = 0.8;
      parts.add(rib);
    }

    // tail fins (+Z = rear)
    const finV = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 5.4 * s, 3.6 * s), hullMat);
    finV.position.set(0, 2.2 * s, HALF + 0.4 * s);
    parts.add(finV);
    const finH = new THREE.Mesh(new THREE.BoxGeometry(7.6 * s, 0.34 * s, 3.2 * s), hullMat);
    finH.position.set(0, 0.4 * s, HALF + 0.6 * s);
    parts.add(finH);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6 * s, 0.9 * s), flagMat);
    flag.position.set(0, 5.6 * s, HALF + 2.9 * s);
    parts.add(flag);

    // ---- gondola ----
    const gondola = new THREE.Mesh(
      new THREE.BoxGeometry(3.6 * s, 2.2 * s, 9.5 * s),
      stone(0x2e2822, 0.6),
    );
    gondola.position.y = -6.6 * s;
    parts.add(gondola);
    const gRoof = new THREE.Mesh(new THREE.BoxGeometry(3.9 * s, 0.5 * s, 9.9 * s), hullMat);
    gRoof.position.y = -5.4 * s;
    parts.add(gRoof);
    const cabinGlow = new THREE.Mesh(new THREE.BoxGeometry(2.9 * s, 0.8 * s, 6.8 * s), litWindow);
    cabinGlow.position.y = -6.4 * s;
    parts.add(cabinGlow);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 8, 6), lanternMat);
    lantern.position.y = -8.1 * s;
    parts.add(lantern);

    // keel cables balloon -> gondola
    for (const [sx, sz] of [
      [-1.6, -3.2],
      [1.6, -3.2],
      [-1.6, 3.2],
      [1.6, 3.2],
    ] as const) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 2.2 * s, 4), dark);
      cable.position.set(sx * s, -6.2 * s, sz * s);
      parts.add(cable);
    }
  }

  // ---- engine pods / props ----
  // Pervaneler dönüyor: birleştirilmiş gövdenin dışında kalmalılar.
  const props: THREE.Object3D[] = [];
  const blade = new THREE.BoxGeometry(0.2 * s, 2.6 * s, 0.4 * s);
  const weakPoints: WeakPoint[] = [];
  const wantWeak = opts.weakPoints ?? role !== "scout";

  if (role === "bomber") {
    // Bomber: yan nacelle'lerde pervaneler — zırhlı kapak
    for (const side of [-1, 1] as const) {
      const mx = 6.8 * s * side;
      const my = -4 * s;
      const mz = halfLen * 0.5;

      if (wantWeak) {
        weakPoints.push(
          makeWeakPoint(
            side < 0 ? "motorSol" : "motorSag",
            enginePod(s),
            new THREE.Vector3(mx, my, mz - 1 * s),
            2.8 * s,
            180,
            "disableEngine",
          ),
        );
      }

      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.16 * s, 3 * s, 5), dark);
      strut.position.set(mx, my + 2.6 * s, mz);
      parts.add(strut);

      const bladeParts = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(blade, dark);
        b.rotation.z = (i * Math.PI) / 2;
        b.position.set(
          Math.sin((i * Math.PI) / 2) * 1.15 * s,
          Math.cos((i * Math.PI) / 2) * 1.15 * s,
          0,
        );
        bladeParts.add(b);
      }
      const prop = new THREE.Group();
      for (const mesh of bake(bladeParts, { castShadow: false, receiveShadow: false }))
        prop.add(mesh);
      prop.position.set(mx, my, mz + 1.6 * s);
      props.push(prop);
      group.add(prop);
    }
  } else {
    for (const side of [-1, 1] as const) {
      const mx = 5.2 * s * side;
      const my = -3.2 * s;
      const mz = 8.6 * s;

      if (wantWeak) {
        // Motor podu modülü: imhası gemiyi yavaşlatır.
        weakPoints.push(
          makeWeakPoint(
            side < 0 ? "motorSol" : "motorSag",
            enginePod(s),
            new THREE.Vector3(mx, my, mz - 1.2 * s),
            2.6 * s,
            160,
            "disableEngine",
          ),
        );
      } else {
        const nacelle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.75 * s, 0.55 * s, 3.4 * s, 10),
          brass,
        );
        nacelle.rotation.x = Math.PI / 2;
        nacelle.position.set(mx, my, mz - 1.2 * s);
        parts.add(nacelle);
      }

      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.13 * s, 3.4 * s, 5), dark);
      strut.position.set(mx, my + 2.5 * s, mz - 0.6 * s);
      parts.add(strut);

      const bladeParts = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(blade, dark);
        b.rotation.z = (i * Math.PI) / 2;
        b.position.set(
          Math.sin((i * Math.PI) / 2) * 1.25 * s,
          Math.cos((i * Math.PI) / 2) * 1.25 * s,
          0,
        );
        bladeParts.add(b);
      }
      // Pervane dönerken tek mesh olarak dönsün: 4 çizim yerine 1.
      const prop = new THREE.Group();
      for (const mesh of bake(bladeParts, { castShadow: false, receiveShadow: false }))
        prop.add(mesh);
      prop.position.set(mx, my, mz + 1.4 * s);
      props.push(prop);
      group.add(prop);
    }
  }

  if (wantWeak) {
    weakPoints.push(
      makeWeakPoint(
        "balonOn",
        balloonCell(s),
        new THREE.Vector3(0, R * 0.55, -HALF * 0.5),
        3.4 * s,
        220,
        "sink",
      ),
      makeWeakPoint(
        "balonArka",
        balloonCell(s),
        new THREE.Vector3(0, R * 0.55, HALF * 0.4),
        3.4 * s,
        220,
        "sink",
      ),
      makeWeakPoint(
        "batarya",
        gunBattery(s),
        new THREE.Vector3(R * 0.92, -3.4 * s, 0),
        3.2 * s,
        200,
        "disableGuns",
      ),
      makeWeakPoint(
        "kopru",
        bridgeModule(s),
        new THREE.Vector3(0, -9.6 * s, -3.4 * s),
        3 * s,
        260,
        "phase",
      ),
    );
    // Ek modüller: firkateynler için ekstra zayıf noktalar
    if (role === "frigate") {
      weakPoints.push(
        makeWeakPoint(
          "kanatSol",
          wingStrut(s),
          new THREE.Vector3(-R * 0.8, 2 * s, -6 * s),
          3 * s,
          180,
          "disableEngine",
        ),
        makeWeakPoint(
          "kanatSag",
          wingStrut(s),
          new THREE.Vector3(R * 0.8, 2 * s, -6 * s),
          3 * s,
          180,
          "disableEngine",
        ),
        makeWeakPoint(
          "radar",
          antennaTower(s),
          new THREE.Vector3(0, R * 0.7, 2 * s),
          2.5 * s,
          160,
          "disableGuns",
        ),
        makeWeakPoint(
          "kalkan",
          shieldGen(s),
          new THREE.Vector3(-R * 0.6, -4 * s, 8 * s),
          2.8 * s,
          200,
          "disableEngine",
        ),
        makeWeakPoint(
          "yakit",
          fuelTank(s),
          new THREE.Vector3(R * 0.5, -5 * s, -8 * s),
          2.6 * s,
          150,
          "sink",
        ),
        makeWeakPoint(
          "komuta",
          commandModule(s),
          new THREE.Vector3(0, R * 0.35, -HALF * 0.3),
          3.2 * s,
          300,
          "phase",
        ),
        makeWeakPoint(
          "taretSol",
          gunTurret(s),
          new THREE.Vector3(-R * 0.7, -3 * s, 4 * s),
          2.4 * s,
          150,
          "disableGuns",
        ),
        makeWeakPoint(
          "taretSag",
          gunTurret(s),
          new THREE.Vector3(R * 0.7, -3 * s, 4 * s),
          2.4 * s,
          150,
          "disableGuns",
        ),
        makeWeakPoint(
          "egzost",
          exhaustPort(s),
          new THREE.Vector3(0, -2 * s, HALF * 0.85),
          2.2 * s,
          140,
          "disableEngine",
        ),
        makeWeakPoint(
          "navigasyon",
          navTower(s),
          new THREE.Vector3(R * 0.4, R * 0.5, -HALF * 0.2),
          2 * s,
          120,
          "phase",
        ),
        makeWeakPoint(
          "zirh",
          armorPlate(s),
          new THREE.Vector3(-R * 0.3, -4.5 * s, 10 * s),
          3 * s,
          260,
          "sink",
        ),
      );
    }
    if (role === "bomber") {
      const bHalf = halfLen;
      weakPoints.push(
        makeWeakPoint(
          "taretSol",
          gunTurret(s),
          new THREE.Vector3(-R * 1.1 * 1.25, -3.2 * s, -2 * s),
          2.6 * s,
          160,
          "disableGuns",
        ),
        makeWeakPoint(
          "taretSag",
          gunTurret(s),
          new THREE.Vector3(R * 1.1 * 1.25, -3.2 * s, -2 * s),
          2.6 * s,
          160,
          "disableGuns",
        ),
        makeWeakPoint(
          "egzost",
          exhaustPort(s),
          new THREE.Vector3(0, -3 * s, bHalf * 0.85),
          2.2 * s,
          140,
          "disableEngine",
        ),
        makeWeakPoint(
          "navigasyon",
          navTower(s),
          new THREE.Vector3(0, R * 0.72, -bHalf * 0.4),
          2 * s,
          130,
          "phase",
        ),
        makeWeakPoint(
          "zirh",
          armorPlate(s),
          new THREE.Vector3(R * 0.6 * 1.25, -R * 0.5, bHalf * 0.3),
          3 * s,
          220,
          "sink",
        ),
      );
    }
    for (const wp of weakPoints) group.add(wp.group);
  }

  for (const mesh of bake(parts)) group.add(mesh);

  const hp = ROLE_HP[role];
  return {
    id: opts.id ?? `ship-${Math.round(x)}-${Math.round(z)}`,
    role,
    group,
    pos: group.position,
    dir: new THREE.Vector3(rng() < 0.5 ? 1 : -1, 0, rng.range(-0.4, 0.4)).normalize(),
    hp,
    maxHp: hp,
    cool: rng.range(0, 3),
    gunsDisabled: false,
    dead: false,
    burn: 0,
    props,
    hullMat,
    hullColor: hullMat.color.clone(),
    weakPoints,
    lightY: 2,
    splitDone: false,
  };
}

/** Modül konumlarını dünya uzayına taşır — yalnız yakındaki gemiler için. */
export function refreshWeakPoints(ship: Airship): void {
  for (const wp of ship.weakPoints) {
    if (wp.dead) continue;
    wp.group.getWorldPosition(wp.world);
  }
}
