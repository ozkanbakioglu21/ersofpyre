import * as THREE from "three";

export type DragonRig = {
  root: THREE.Group;
  body: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  tail: THREE.Group[];
  neck: THREE.Group[];
  jaw: THREE.Mesh;
  glow: THREE.PointLight;
  maw: THREE.Mesh;
};

// Materyaller modül düzeyinde paylaşılıyor: her parça için yeni materyal
// üretmek gereksiz uniform yüklemesi ve shader varyantı demek.
// userData.shared, sahne yıkılırken bunların dispose edilmemesini sağlar.
const shared = <T extends THREE.Material>(m: T): T => {
  m.userData["shared"] = true;
  return m;
};

const scaleCache = new Map<string, THREE.MeshStandardMaterial>();
const scaleMat = (color: number, rough = 0.55) => {
  const key = `${color}:${rough}`;
  let m = scaleCache.get(key);
  if (!m) {
    m = shared(
      new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        metalness: 0.25,
        flatShading: true,
      }),
    );
    scaleCache.set(key, m);
  }
  return m;
};

const magma = shared(
  new THREE.MeshStandardMaterial({
    color: 0x2a0f08,
    emissive: 0xff5a12,
    emissiveIntensity: 2.2,
    roughness: 0.4,
  }),
);
const eyeMat = shared(
  new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb347, emissiveIntensity: 3 }),
);
const membraneMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0x4a1710,
    emissive: 0x3a0a04,
    emissiveIntensity: 0.6,
    roughness: 0.75,
    side: THREE.DoubleSide,
  }),
);

function spikes(parent: THREE.Object3D, count: number, from: number, to: number, size: number) {
  const mat = scaleMat(0x1b1210, 0.8);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1 || 1);
    const s = size * (0.5 + Math.sin(t * Math.PI) * 0.8);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(s * 0.35, s * 1.6, 4), mat);
    spike.position.set(0, 0.55 * s + 0.6, THREE.MathUtils.lerp(from, to, t));
    parent.add(spike);
  }
}

export function createDragon(): DragonRig {
  /** Yalnız bu mesh'ler gölge döker (bkz. aşağıdaki traverse). */
  const casters = new Set<THREE.Mesh>();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const hide = scaleMat(0x2b1a15, 0.65);
  const belly = scaleMat(0x5a3a22, 0.7);

  // torso
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 14), hide);
  torso.scale.set(1.0, 0.95, 2.0);
  casters.add(torso);
  body.add(torso);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12), belly);
  chest.scale.set(0.85, 0.7, 1.25);
  chest.position.set(0, -0.45, 0.7);
  body.add(chest);

  // magma veins along back
  for (let i = 0; i < 7; i++) {
    const vein = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), magma);
    vein.position.set(Math.sin(i) * 0.25, 1.15 - i * 0.03, 1.6 - i * 0.55);
    body.add(vein);
  }
  spikes(body, 9, 2.2, -2.4, 0.5);

  // neck + head
  const neck: THREE.Group[] = [];
  let attach: THREE.Object3D = body;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.35 : 0.12, i === 0 ? 2.1 : 0.85);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.78 - i * 0.1, 14, 10), hide);
    m.scale.set(1, 0.95, 1.35);
    casters.add(m);
    seg.add(m);
    attach.add(seg);
    neck.push(seg);
    attach = seg;
  }

  const head = new THREE.Group();
  head.position.set(0, 0.05, 0.85);
  attach.add(head);

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.72, 1.5), hide);
  casters.add(skull);
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.9), hide);
  snout.position.set(0, -0.08, 1.05);
  head.add(snout);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 1.0), scaleMat(0x1d1210, 0.8));
  jaw.position.set(0, -0.32, 0.95);
  head.add(jaw);

  // Ağız parlaklığı her karede değiştiği için bu materyal ejderhaya özel.
  const maw = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 10),
    new THREE.MeshStandardMaterial({
      color: 0x2a0f08,
      emissive: 0xff5a12,
      emissiveIntensity: 2.2,
      roughness: 0.4,
    }),
  );
  maw.position.set(0, -0.1, 1.5);
  maw.scale.setScalar(0.6);
  head.add(maw);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
    eye.position.set(0.3 * s, 0.16, 0.45);
    head.add(eye);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.95, 5), scaleMat(0x6b5330, 0.6));
    horn.position.set(0.32 * s, 0.42, -0.35);
    horn.rotation.set(-0.9, 0, 0.25 * s);
    head.add(horn);
  }

  const glow = new THREE.PointLight(0xff6a1a, 0, 26, 2);
  glow.position.set(0, -0.1, 1.9);
  head.add(glow);

  // wings
  const makeWing = (side: 1 | -1) => {
    const g = new THREE.Group();
    g.position.set(1.0 * side, 0.55, 0.25);
    const boneMat = scaleMat(0x241713, 0.85);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 2.6, 4, 8), boneMat);
    upper.rotation.z = Math.PI / 2;
    upper.position.set(1.4 * side, 0, 0);
    g.add(upper);

    const fingers = new THREE.Group();
    fingers.position.set(2.8 * side, 0, 0);
    g.add(fingers);
    for (let i = 0; i < 4; i++) {
      const len = 3.4 - i * 0.5;
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, len, 4, 6), boneMat);
      f.rotation.z = Math.PI / 2;
      f.rotation.y = -(0.35 + i * 0.42) * side;
      f.position.set(
        (len / 2) * side * Math.cos(0.35 + i * 0.42),
        0,
        -(len / 2) * Math.sin(0.35 + i * 0.42),
      );
      fingers.add(f);
    }

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(2.2, 0.5, 5.6, -0.2);
    shape.quadraticCurveTo(4.6, -1.9, 3.4, -3.0);
    shape.quadraticCurveTo(2.2, -1.6, 0, -1.2);
    const web = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), membraneMat);
    web.rotation.x = -Math.PI / 2;
    web.scale.x = side;
    casters.add(web);
    g.add(web);
    return g;
  };

  const wingR = makeWing(1);
  const wingL = makeWing(-1);
  body.add(wingR, wingL);

  // legs
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.1, 4, 8), hide);
    leg.position.set(0.75 * s, -0.9, 0.7);
    leg.rotation.x = 0.6;
    body.add(leg);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 5), scaleMat(0x8a7a5f, 0.5));
    claw.position.set(0.75 * s, -1.5, 1.2);
    claw.rotation.x = Math.PI;
    body.add(claw);
  }

  // tail
  const tail: THREE.Group[] = [];
  let tAttach: THREE.Object3D = body;
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.1 : 0, i === 0 ? -2.3 : -0.72);
    const r = 0.62 - i * 0.065;
    const m = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.08, r), 10, 8), hide);
    m.scale.set(1, 1, 1.4);
    if (i < 4) casters.add(m);
    seg.add(m);
    if (i % 2 === 0) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 4), scaleMat(0x1b1210, 0.8));
      fin.position.set(0, r + 0.2, 0);
      seg.add(fin);
    }
    tAttach.add(seg);
    tail.push(seg);
    tAttach = seg;
  }
  const barb = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.2, 5), magma);
  barb.rotation.x = -Math.PI / 2;
  barb.position.set(0, 0, -0.6);
  tAttach.add(barb);

  // Gölge geçişi sahnenin ikinci kez çizilmesi demek. Ejderhanın ~50 küçük
  // parçasının hepsini gölge dökücü yapmak yerine yalnız siluete katkısı olan
  // büyük parçaları işaretliyoruz.
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = casters.has(m);
    m.receiveShadow = false;
  });

  return { root, body, wingL, wingR, tail, neck, jaw, glow, maw };
}
