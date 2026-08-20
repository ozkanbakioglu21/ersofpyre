import * as THREE from "three";

export type DragonRig = {
  root: THREE.Group;
  body: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  tail: THREE.Group[];
  neck: THREE.Group[];
  /** Boyun ile baş arasında bağımsız bakış eklemi */
  headLook: THREE.Group;
  jaw: THREE.Mesh;
  glow: THREE.PointLight;
  maw: THREE.Mesh;
  /** Bacak reference'ları — sol ve sağ, üst bacak + alt bacak */
  legs: { thigh: THREE.Mesh; shin: THREE.Mesh }[];
};

const shared = <T extends THREE.Material>(m: T): T => {
  m.userData["shared"] = true;
  return m;
};

/* ------------------------------------------------------------------ *
 *  Materyaller — koyu pullu gövde,contractık karın, magma damarları
 * ------------------------------------------------------------------ */
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

// Ana gövde pulları — koyu kahve-siyah
const hide = scaleMat(0x1a100c, 0.72);
// Karın pulları — biraz daha açık
const belly = scaleMat(0x3a2818, 0.7);
// Magma damarları
const magma = shared(
  new THREE.MeshStandardMaterial({
    color: 0x2a0f08,
    emissive: 0xff5a12,
    emissiveIntensity: 2.2,
    roughness: 0.4,
  }),
);
// Canlı magma (daha parlak)
const magmaHot = shared(
  new THREE.MeshStandardMaterial({
    color: 0x3a1508,
    emissive: 0xff8830,
    emissiveIntensity: 3.0,
    roughness: 0.35,
  }),
);
// Göz
const eyeMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffb347,
    emissiveIntensity: 3,
  }),
);
// Göz bebeği
const pupilMat = shared(
  new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.2 }),
);
// Zar
const membraneMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0x3a1510,
    emissive: 0x220800,
    emissiveIntensity: 0.4,
    roughness: 0.8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
  }),
);
// Boynuz/tırnak
const hornMat = scaleMat(0x5a4830, 0.6);
// Diş
const toothMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0xd8d0c0,
    roughness: 0.4,
    metalness: 0.1,
  }),
);
// Ateş kesesi
const fireSackMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0x3a1008,
    emissive: 0xff6600,
    emissiveIntensity: 1.5,
    roughness: 0.6,
    transparent: true,
    opacity: 0.9,
  }),
);

/* ------------------------------------------------------------------ *
 *  Yardımcı fonksiyonlar
 * ------------------------------------------------------------------ */

/** Sırt dikenleri */
function backSpines(parent: THREE.Object3D, count: number, from: number, to: number, maxSize: number) {
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1 || 1);
    const sz = maxSize * (0.4 + Math.sin(t * Math.PI) * 0.8);
    const spine = new THREE.Mesh(
      new THREE.ConeGeometry(sz * 0.3, sz * 1.8, 5),
      scaleMat(0x15100c, 0.85),
    );
    spine.position.set(0, 0.5 * sz + 0.5, THREE.MathUtils.lerp(from, to, t));
    spine.rotation.x = 0.08;
    parent.add(spine);
  }
}

/** Küçük dikenler (yan taraflar) */
function sideSpines(parent: THREE.Object3D, count: number, from: number, to: number, size: number, side: 1 | -1) {
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1 || 1);
    const s = size * (0.3 + Math.sin(t * Math.PI) * 0.5);
    const spine = new THREE.Mesh(
      new THREE.ConeGeometry(s * 0.2, s * 1.0, 4),
      scaleMat(0x1a1410, 0.8),
    );
    spine.position.set(side * 0.6, 0.2 * s + 0.3, THREE.MathUtils.lerp(from, to, t));
    spine.rotation.z = side * 0.5;
    spine.rotation.x = 0.15;
    parent.add(spine);
  }
}

/** Deri kabartma / pullu plaka */
function armorPlates(parent: THREE.Object3D, count: number, from: number, to: number, size: number) {
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1 || 1);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(size * 1.2, size * 0.25, size * 0.8),
      scaleMat(0x201810, 0.75),
    );
    plate.position.set(0, 0.6 + size * 0.15, THREE.MathUtils.lerp(from, to, t));
    plate.rotation.x = (Math.random() - 0.5) * 0.15;
    parent.add(plate);
  }
}

export function createDragon(): DragonRig {
  const casters = new Set<THREE.Mesh>();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  /* ================================================================== *
   *  GÖVDE — uzun, alçak, kaslı
   * ================================================================== */
  // Ana gövde — iki sphere ile organik eğrilik
  const torsoFront = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 16), hide);
  torsoFront.scale.set(1.05, 0.88, 1.3);
  torsoFront.position.set(0, 0, 0.6);
  casters.add(torsoFront);
  body.add(torsoFront);

  const torsoRear = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 14), hide);
  torsoRear.scale.set(1.0, 0.82, 1.5);
  torsoRear.position.set(0, -0.08, -0.5);
  casters.add(torsoRear);
  body.add(torsoRear);

  // Karın — daha açık renk, yuvarlak
  const bellyMesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), belly);
  bellyMesh.scale.set(0.85, 0.6, 1.6);
  bellyMesh.position.set(0, -0.45, 0.15);
  body.add(bellyMesh);

  // Göğüs kafesi kabartmaları
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(0.9 - i * 0.02, 0.06, 4, 8, Math.PI),
      scaleMat(0x2a1c12, 0.8),
    );
    rib.position.set(0, -0.3, 1.0 - i * 0.4);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = Math.PI;
    body.add(rib);
  }

  // Sırt zırh plakaları
  armorPlates(body, 8, 1.8, -2.2, 0.35);

  // Sırt dikenleri — ana hat
  backSpines(body, 11, 2.0, -2.8, 0.55);
  // Yan dikenler
  sideSpines(body, 7, 1.2, -1.8, 0.3, 1);
  sideSpines(body, 7, 1.2, -1.8, 0.3, -1);

  // Magma damarları — sırt boyunca
  for (let i = 0; i < 9; i++) {
    const vein = new THREE.Mesh(
      new THREE.SphereGeometry(0.1 + Math.random() * 0.06, 6, 6),
      i < 3 ? magmaHot : magma,
    );
    vein.position.set(
      Math.sin(i * 0.7) * 0.3,
      1.05 - i * 0.02,
      1.8 - i * 0.5,
    );
    body.add(vein);
  }

  // Yan magma damarları
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const v = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 5), magma);
      v.position.set(s * (0.7 + Math.random() * 0.2), 0.3, 0.8 - i * 0.6);
      body.add(v);
    }
  }

  /* ================================================================== *
   *  BOYUN — 9 segment, esnek S-eğrisi
   * ================================================================== */
  const neck: THREE.Group[] = [];
  let attach: THREE.Object3D = body;
  const neckSegs = 9;
  for (let i = 0; i < neckSegs; i++) {
    const seg = new THREE.Group();
    const t = i / (neckSegs - 1);
    const yOff = i === 0 ? 0.45 : 0.12 + Math.sin(t * Math.PI * 0.8) * 0.08;
    const zOff = i === 0 ? 1.9 : 0.42;
    seg.position.set(0, yOff, zOff);

    const r = THREE.MathUtils.lerp(0.72, 0.28, t);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), hide);
    m.scale.set(1, 0.92, 1.3);
    casters.add(m);
    seg.add(m);

    // Boyun altı — karın rengi (ilk 4 segment)
    if (i < 4) {
      const throat = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.7, 8, 6),
        belly,
      );
      throat.scale.set(0.8, 0.6, 1.1);
      throat.position.set(0, -r * 0.35, 0);
      seg.add(throat);
    }

    // Boyun dikenleri (orta segmentler)
    if (i > 0 && i < neckSegs - 1 && i % 2 === 1) {
      const ns = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.35, 4),
        scaleMat(0x1a1410, 0.8),
      );
      ns.position.set(0, r * 0.7, 0);
      seg.add(ns);
    }

    attach.add(seg);
    neck.push(seg);
    attach = seg;
  }

  /* ================================================================== *
   *  BAŞ — detaylı (headLook eklemi ile)
   * ================================================================== */
  const headLook = new THREE.Group();
  headLook.position.set(0, 0.08, 0.42);
  attach.add(headLook);

  const head = new THREE.Group();
  head.position.set(0, 0, 0.43);
  headLook.add(head);

  // Kafatası — ana kütle
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), hide);
  skull.scale.set(1.0, 0.85, 1.35);
  casters.add(skull);
  head.add(skull);

  // Kaş çıkıntısı — gözlerin üstünde
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.18, 0.5),
      scaleMat(0x1a1410, 0.8),
    );
    brow.position.set(0.28 * s, 0.32, 0.3);
    brow.rotation.z = s * 0.2;
    head.add(brow);
  }

  // Burun ucu — genişletilmiş
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), hide);
  snout.scale.set(0.85, 0.6, 1.4);
  snout.position.set(0, -0.06, 0.85);
  head.add(snout);

  // Burun delikleri
  for (const s of [-1, 1]) {
    const nostril = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x0a0604, roughness: 0.3 }),
    );
    nostril.position.set(0.12 * s, 0.02, 1.15);
    nostril.scale.set(1, 0.6, 1.2);
    head.add(nostril);

    // Burun deliği çıkıntısı
    const nRidge = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.2, 4),
      scaleMat(0x1a1410, 0.8),
    );
    nRidge.position.set(0.12 * s, 0.1, 1.1);
    nRidge.rotation.x = -0.5;
    nRidge.rotation.z = s * 0.3;
    head.add(nRidge);
  }

  // Alt çene — daha geniş, güçlü
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), scaleMat(0x1d1210, 0.8));
  jaw.scale.set(0.8, 0.45, 1.5);
  jaw.position.set(0, -0.28, 0.75);
  head.add(jaw);

  // Çene ucu sivri
  const chin = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.35, 5),
    scaleMat(0x1a1410, 0.8),
  );
  chin.position.set(0, -0.35, 1.15);
  chin.rotation.x = Math.PI * 0.6;
  head.add(chin);

  // Dişler — üst ve alt çene
  for (const s of [-1, 1]) {
    // Üst canine
    const fang = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.28, 5),
      toothMat,
    );
    fang.position.set(0.18 * s, -0.12, 1.05);
    fang.rotation.x = Math.PI + 0.3;
    head.add(fang);

    // Yan dişler (3'er tane)
    for (let i = 0; i < 3; i++) {
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(0.025, 0.16, 4),
        toothMat,
      );
      tooth.position.set(0.22 * s, -0.18, 0.7 + i * 0.15);
      tooth.rotation.x = Math.PI + 0.2;
      tooth.rotation.z = s * 0.3;
      head.add(tooth);
    }
  }

  // Ağız içi parlaklık
  const maw = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 10, 10),
    new THREE.MeshStandardMaterial({
      color: 0x2a0f08,
      emissive: 0xff5a12,
      emissiveIntensity: 2.2,
      roughness: 0.4,
    }),
  );
  maw.position.set(0, -0.08, 1.3);
  maw.scale.setScalar(0.55);
  head.add(maw);

  // Ateş kesesi — boğazın altında, alev püskürtmeden önce şişer
  const fireSack = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    fireSackMat,
  );
  fireSack.position.set(0, -0.45, 0.5);
  fireSack.scale.set(0.7, 0.5, 1.2);
  head.add(fireSack);

  // Gözler — daha detaylı
  for (const s of [-1, 1]) {
    // Göz küresi
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(0.32 * s, 0.18, 0.35);
    head.add(eyeGroup);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeMat);
    eyeGroup.add(eye);

    // Dikey pupil
    const pupil = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.08, 0.02),
      pupilMat,
    );
    pupil.position.set(0, 0, 0.08);
    eyeGroup.add(pupil);

    // Göz kapagi — üst
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
      scaleMat(0x1a1410, 0.8),
    );
    lid.position.set(0, 0.02, 0);
    lid.scale.set(1, 0.5, 0.8);
    eyeGroup.add(lid);
  }

  // Boynuzlar — 2 ana boynuz + 2 küçük
  for (const s of [-1, 1]) {
    // Ana boynuz — geriye doğru eğik, kalın
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 1.2, 6),
      hornMat,
    );
    horn.position.set(0.28 * s, 0.5, -0.25);
    horn.rotation.set(-0.75, 0, 0.3 * s);
    head.add(horn);

    // Küçük boynuz — yan tarafta
    const smallHorn = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.5, 5),
      hornMat,
    );
    smallHorn.position.set(0.4 * s, 0.25, 0.0);
    smallHorn.rotation.set(-0.4, 0, 0.6 * s);
    head.add(smallHorn);

    // Başın arkasında diken
    const crest = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.4, 4),
      scaleMat(0x1a1410, 0.8),
    );
    crest.position.set(0.15 * s, 0.4, -0.45);
    crest.rotation.set(-0.5, 0, 0.4 * s);
    head.add(crest);
  }

  // Işık
  const glow = new THREE.PointLight(0xff6a1a, 0, 26, 2);
  glow.position.set(0, -0.08, 1.7);
  head.add(glow);

  /* ================================================================== *
   *  KANATLAR — yarasa benzeri, detaylı iskelet
   * ================================================================== */
  const makeWing = (side: 1 | -1) => {
    const g = new THREE.Group();
    g.position.set(0.95 * side, 0.5, 0.3);

    // Omuz eklemi
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      scaleMat(0x1a1410, 0.75),
    );
    g.add(shoulder);

    // Üst kol (humerus)
    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 2.8, 4, 8),
      scaleMat(0x1e1510, 0.8),
    );
    upper.rotation.z = Math.PI / 2;
    upper.position.set(1.5 * side, 0, 0);
    g.add(upper);

    // Dirsek eklemi
    const elbow = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 6),
      scaleMat(0x1a1410, 0.8),
    );
    elbow.position.set(2.9 * side, 0, 0);
    g.add(elbow);

    // El parmakları — 4 ana yumuşak kamış (ince, yuvarlak)
    const fingers = new THREE.Group();
    fingers.position.set(2.9 * side, 0, 0);
    g.add(fingers);

    const fingerAngles = [0.25, 0.6, 0.95, 1.3];
    const fingerLens = [3.6, 3.0, 2.4, 1.8];
    for (let i = 0; i < 4; i++) {
      const len = fingerLens[i]!;
      const f = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035 - i * 0.004, 0.025 - i * 0.003, len, 5),
        scaleMat(0x1e1510, 0.8),
      );
      f.rotation.z = Math.PI / 2;
      f.rotation.y = -fingerAngles[i]! * side;
      f.position.set(
        (len / 2) * side * Math.cos(fingerAngles[i]!),
        0,
        -(len / 2) * Math.sin(fingerAngles[i]!),
      );
      fingers.add(f);
    }

    // Baş parmak (kçik, geriye)
    const thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.05, 0.8, 4, 5),
      scaleMat(0x1e1510, 0.8),
    );
    thumb.position.set(1.0 * side, -0.2, 0.3);
    thumb.rotation.z = side * 0.8;
    thumb.rotation.x = -0.3;
    g.add(thumb);

    // Kanat zarı — çok katlı, yarı saydam
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(2.4, 0.6, 6.0, -0.1);
    shape.quadraticCurveTo(5.2, -2.2, 3.8, -3.4);
    shape.quadraticCurveTo(2.4, -1.8, 0, -1.4);
    const web = new THREE.Mesh(new THREE.ShapeGeometry(shape, 14), membraneMat);
    web.rotation.x = -Math.PI / 2;
    web.scale.x = side;
    casters.add(web);
    g.add(web);

    // Zar damarları — kanat zarının üzerinde
    for (let i = 0; i < 3; i++) {
      const vein = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.02, 2.5 - i * 0.5, 3, 4),
        scaleMat(0x2a1510, 0.7),
      );
      vein.position.set((1.8 + i * 0.8) * side, -0.1 - i * 0.2, -0.5 - i * 0.3);
      vein.rotation.z = side * (0.15 + i * 0.12);
      g.add(vein);
    }

    return g;
  };

  const wingR = makeWing(1);
  const wingL = makeWing(-1);
  body.add(wingR, wingL);

  /* ================================================================== *
   *  BACAKLAR — kalın, kaslı, pençeli
   * ================================================================== */
  const legs: { thigh: THREE.Mesh; shin: THREE.Mesh }[] = [];
  for (const s of [-1, 1]) {
    // Üst bacak (uyluk)
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 1.3, 4, 8),
      hide,
    );
    thigh.position.set(0.7 * s, -0.85, 0.8);
    thigh.rotation.x = 0.55;
    body.add(thigh);

    // Diz eklemi
    const knee = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 6, 6),
      scaleMat(0x1a1410, 0.75),
    );
    knee.position.set(0.7 * s, -1.4, 1.2);
    body.add(knee);

    // Alt bacak (kaval)
    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16, 0.9, 4, 6),
      hide,
    );
    shin.position.set(0.7 * s, -1.7, 1.1);
    shin.rotation.x = -0.2;
    body.add(shin);

    legs.push({ thigh, shin });

    // Ayak pençeleri — 3 ana pençe + arka pençe
    const footPos = new THREE.Vector3(0.7 * s, -2.1, 1.4);
    for (let c = 0; c < 3; c++) {
      const angle = (c - 1) * 0.35;
      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.55, 5),
        hornMat,
      );
      claw.position.set(
        footPos.x + Math.sin(angle) * 0.25 * s,
        footPos.y - 0.1,
        footPos.z + Math.cos(angle) * 0.2,
      );
      claw.rotation.x = Math.PI + 0.3;
      claw.rotation.z = s * 0.2;
      body.add(claw);
    }

    // Arka pençe (dikandan)
    const rearClaw = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.35, 4),
      hornMat,
    );
    rearClaw.position.set(0.7 * s, -1.9, 0.9);
    rearClaw.rotation.x = Math.PI * 0.7;
    body.add(rearClaw);
  }

  /* ================================================================== *
   *  KUYRUK — 14 segment, akıcı kırbaç hareketi
   * ================================================================== */
  const tail: THREE.Group[] = [];
  let tAttach: THREE.Object3D = body;
  const tailSegs = 14;
  for (let i = 0; i < tailSegs; i++) {
    const seg = new THREE.Group();
    const t = i / (tailSegs - 1);
    seg.position.set(
      0,
      i === 0 ? 0.08 : (i < 3 ? 0.02 : 0),
      i === 0 ? -2.5 : -0.5,
    );
    const r = THREE.MathUtils.lerp(0.55, 0.06, t);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), hide);
    m.scale.set(1, 0.9, 1.4);
    if (i < 6) casters.add(m);
    seg.add(m);

    // Kuyruk üst dikenleri
    if (i % 2 === 0 && i < tailSegs - 3) {
      const fin = new THREE.Mesh(
        new THREE.ConeGeometry(0.1 * (1 - t * 0.7), 0.4 * (1 - t * 0.5), 4),
        scaleMat(0x1a1410, 0.8),
      );
      fin.position.set(0, r + 0.12, 0);
      seg.add(fin);
    }

    // Magma damarları kuyrukta
    if (i < 8 && i % 2 === 0) {
      const v = new THREE.Mesh(new THREE.SphereGeometry(0.05 * (1 - t * 0.5), 5, 5), magma);
      v.position.set(0, r * 0.8, 0);
      seg.add(v);
    }

    tAttach.add(seg);
    tail.push(seg);
    tAttach = seg;
  }

  // Kuyruk ucu — kama şeklinde, zehirli diken
  const spade = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.4, 4),
    magma,
  );
  spade.rotation.x = -Math.PI / 2;
  spade.position.set(0, 0, -0.7);
  tAttach.add(spade);

  // Kama yan dikenleri
  for (const s of [-1, 1]) {
    const sideBarb = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.5, 4),
      scaleMat(0x1a1410, 0.8),
    );
    sideBarb.position.set(0.2 * s, 0, -0.3);
    sideBarb.rotation.z = s * Math.PI / 3;
    tAttach.add(sideBarb);
  }

  /* ================================================================== *
   *  GÖLGE — yalnız büyük parçalar
   * ================================================================== */
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = casters.has(m);
    m.receiveShadow = false;
  });

  return { root, body, wingL, wingR, tail, neck, headLook, jaw, glow, maw, legs };
}
