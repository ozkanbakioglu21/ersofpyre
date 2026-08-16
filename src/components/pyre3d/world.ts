import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type Burnable = {
  pos: THREE.Vector3;
  burn: number;
  dead: boolean;
  /** Ateş ışığının nesne merkezine göre yükseklik farkı. */
  lightY: number;
};

export type Structure = Burnable & {
  group: THREE.Group;
  radius: number;
  hp: number;
  maxHp: number;
  kind: "house" | "factory" | "tower";
  cool: number;
};

export type Airship = Burnable & {
  group: THREE.Group;
  dir: THREE.Vector3;
  hp: number;
  maxHp: number;
  cool: number;
  props: THREE.Object3D[];
  hullMat: THREE.MeshStandardMaterial;
  hullColor: THREE.Color;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Dünya koordinatlarında zemin yüksekliği — arazi mesh'iyle birebir aynı formül. */
export function terrainHeight(x: number, z: number): number {
  return Math.sin(x * 0.012) * 9 + Math.cos(z * 0.015) * 7 + Math.sin((x - z) * 0.03) * 2.5;
}

/* ------------------------------------------------------------------ *
 * Paylaşılan materyaller
 * Her yapı için yeni materyal üretmek, three.js'te her materyal başına
 * ayrı shader programı ve ayrı draw call demek. Renk/pürüzlülük başına
 * tek örnek tutuyoruz.
 * ------------------------------------------------------------------ */
const sharedMats = new Map<string, THREE.MeshStandardMaterial>();

const shared = <T extends THREE.Material>(m: T): T => {
  m.userData["shared"] = true;
  return m;
};

const stone = (c: number, r = 0.85) => {
  const key = `${c}:${r}`;
  let m = sharedMats.get(key);
  if (!m) {
    m = shared(
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: r,
        metalness: 0.15,
        flatShading: true,
      }),
    );
    sharedMats.set(key, m);
  }
  return m;
};

const brass = shared(
  new THREE.MeshStandardMaterial({ color: 0x8a6b32, roughness: 0.35, metalness: 0.9 }),
);
const litWindow = shared(
  new THREE.MeshStandardMaterial({
    color: 0x1a1208,
    emissive: 0xffa23c,
    emissiveIntensity: 1.6,
    roughness: 0.4,
  }),
);
const bandMat = shared(
  new THREE.MeshStandardMaterial({ color: 0x8a2f22, roughness: 0.8, metalness: 0.15 }),
);
const flagMat = shared(new THREE.MeshBasicMaterial({ color: 0xd84a2a, side: THREE.DoubleSide }));
const windowGeo = new THREE.PlaneGeometry(0.5, 0.7);

/**
 * Parçacıklar için yumuşak yuvarlak maske. PointsMaterial dokusuz kullanılınca
 * her parçacık kenarları keskin bir kare olarak çiziliyor.
 */
let softTex: THREE.Texture | null = null;
export function softParticleTexture(): THREE.Texture {
  if (softTex) return softTex;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.65)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softTex = new THREE.CanvasTexture(c);
  softTex.userData["shared"] = true;
  return softTex;
}

const coilMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0x0a1a22,
    emissive: 0x39c6ff,
    emissiveIntensity: 2.4,
    roughness: 0.3,
  }),
);

const lanternMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0x2a1404,
    emissive: 0xffb04a,
    emissiveIntensity: 2.2,
    roughness: 0.4,
  }),
);

const groundMat = shared(
  new THREE.MeshStandardMaterial({ color: 0x2a1a13, roughness: 1, flatShading: true }),
);
const peakMat = shared(
  new THREE.MeshStandardMaterial({ color: 0x150e0b, roughness: 1, flatShading: true }),
);

/* ------------------------------------------------------------------ *
 * Geometri birleştirme
 * Bir yapının onlarca parçası tek mesh'e indirilir: draw call sayısı
 * ~10 kat düşer, gölge geçişi de aynı oranda ucuzlar.
 * ------------------------------------------------------------------ */
function bake(src: THREE.Object3D): THREE.Mesh[] {
  src.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    g.deleteAttribute("uv1");
    const mat = m.material as THREE.Material;
    const list = buckets.get(mat);
    if (list) list.push(g);
    else buckets.set(mat, [g]);
  });

  const out: THREE.Mesh[] = [];
  for (const [mat, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (!merged) continue;
    if (geos.length > 1) for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged, mat);
    // Camlar düzlem; gölge dökmeleri hem gereksiz hem de gölge kirliliği yapıyor.
    mesh.castShadow = mat !== litWindow;
    mesh.receiveShadow = true;
    out.push(mesh);
  }
  return out;
}

function addWindows(g: THREE.Object3D, w: number, h: number, d: number) {
  for (let y = 1.2; y < h - 0.6; y += 1.6) {
    for (let x = -w / 2 + 0.8; x < w / 2 - 0.4; x += 1.4) {
      if (Math.random() < 0.45) continue;
      const a = new THREE.Mesh(windowGeo, litWindow);
      a.position.set(x, y, d / 2 + 0.02);
      g.add(a);
      const b = new THREE.Mesh(windowGeo, litWindow);
      b.position.set(x, y, -d / 2 - 0.02);
      b.rotation.y = Math.PI;
      g.add(b);
    }
  }
}

export function createStructure(kind: Structure["kind"], x: number, z: number): Structure {
  const parts = new THREE.Group();
  let radius = 4;
  let hp = 60;

  if (kind === "house") {
    const w = rand(4, 6.5);
    const h = rand(4, 7);
    const d = rand(4, 6.5);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone(0x4a3527));
    base.position.y = h / 2;
    parts.add(base);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.8, 2.6, 4),
      stone(0x2c1c14),
    );
    roof.position.y = h + 1.3;
    roof.rotation.y = Math.PI / 4;
    parts.add(roof);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 3, 8), brass);
    pipe.position.set(w / 2 - 0.8, h + 1.2, d / 2 - 0.8);
    parts.add(pipe);
    addWindows(parts, w, h, d);
    radius = Math.max(w, d) * 0.7;
    hp = 70;
  } else if (kind === "factory") {
    const w = rand(9, 14);
    const h = rand(7, 11);
    const d = rand(8, 12);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone(0x3a332c));
    base.position.y = h / 2;
    parts.add(base);
    for (let i = 0; i < 3; i++) {
      const stackH = rand(6, 11);
      const st = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.2, stackH, 10),
        stone(0x2b241e, 0.9),
      );
      st.position.set(-w / 3 + i * (w / 3), h + stackH / 2, rand(-d / 4, d / 4));
      parts.add(st);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 6, 14), brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(st.position.x, st.position.y + stackH / 2 - 0.7, st.position.z);
      parts.add(ring);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 5, 14), brass);
    tank.position.set(w / 2 + 2.4, 2.5, -d / 3);
    parts.add(tank);
    addWindows(parts, w, h, d);
    radius = Math.max(w, d) * 0.75;
    hp = 190;
  } else {
    const h = rand(14, 22);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.8, h, 8), stone(0x463a2c));
    base.position.y = h / 2;
    parts.add(base);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 2.2, 2.2, 8), brass);
    cap.position.y = h + 0.8;
    parts.add(cap);
    const coil = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), coilMat);
    coil.position.y = h + 2.5;
    parts.add(coil);
    radius = 3.4;
    hp = 130;
  }

  const group = new THREE.Group();
  group.position.set(x, terrainHeight(x, z), z);
  for (const mesh of bake(parts)) group.add(mesh);

  return {
    group,
    pos: group.position.clone(),
    radius,
    hp,
    maxHp: hp,
    burn: 0,
    dead: false,
    kind,
    cool: rand(0, 3),
    lightY: 5,
  };
}

export function createAirship(x: number, y: number, z: number): Airship {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  // Gövde yanınca renk değiştiği için bu materyal zeplin başına özel.
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x5c5145,
    roughness: 0.7,
    metalness: 0.35,
  });
  const dark = stone(0x1d1a16, 0.5);
  const parts = new THREE.Group();

  // ---- balloon ----
  const R = 6.4;
  const HALF = R * 2.44;
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 14), hullMat);
  balloon.scale.set(1, 0.8, 2.44);
  parts.add(balloon);

  // nose cone (-Z = travel direction)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.1, 5.5, 14), bandMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -HALF - 0.4;
  parts.add(nose);

  // hooped ribs hugging the hull
  for (const zp of [-12, -7, -2.5, 0, 2.5, 7, 12]) {
    const rr = Math.sqrt(Math.max(0.001, 1 - (zp / HALF) ** 2)) * R * 1.012;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.16, 6, 22), brass);
    rib.position.z = zp;
    rib.scale.y = 0.8;
    parts.add(rib);
  }

  // tail fins (+Z = rear)
  const finV = new THREE.Mesh(new THREE.BoxGeometry(0.34, 5.4, 3.6), hullMat);
  finV.position.set(0, 2.2, HALF + 0.4);
  parts.add(finV);
  const finH = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.34, 3.2), hullMat);
  finH.position.set(0, 0.4, HALF + 0.6);
  parts.add(finH);
  const finVtip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 1.4), bandMat);
  finVtip.position.set(0, 5.1, HALF + 2.4);
  parts.add(finVtip);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), flagMat);
  flag.position.set(0, 5.6, HALF + 2.9);
  parts.add(flag);

  // ---- gondola ----
  const gondola = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 9.5), stone(0x2e2822, 0.6));
  gondola.position.y = -6.6;
  parts.add(gondola);
  const gRoof = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.5, 9.9), hullMat);
  gRoof.position.y = -5.4;
  parts.add(gRoof);
  const cabinGlow = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.8, 6.8), litWindow);
  cabinGlow.position.y = -6.4;
  parts.add(cabinGlow);
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), brass);
    frame.position.set(0, -6.4, i * 1.35);
    parts.add(frame);
  }
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), lanternMat);
  lantern.position.y = -8.1;
  parts.add(lantern);
  const lanternCord = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), brass);
  lanternCord.position.y = -7.7;
  parts.add(lanternCord);

  // keel cables balloon -> gondola
  for (const [sx, sz] of [
    [-1.6, -3.2],
    [1.6, -3.2],
    [-1.6, 3.2],
    [1.6, 3.2],
  ] as const) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), dark);
    cable.position.set(sx, -6.2, sz);
    parts.add(cable);
  }

  // ---- engine pods (rear +Z) ----
  // Pervaneler dönüyor: birleştirilmiş gövdenin dışında kalmalılar.
  const props: THREE.Object3D[] = [];
  const blade = new THREE.BoxGeometry(0.2, 2.6, 0.4);
  for (const s of [-1, 1]) {
    const mx = 5.2 * s;
    const my = -3.2;
    const mz = 8.6;
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 3.4, 12), brass);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(mx, my, mz - 1.2);
    parts.add(nacelle);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 10), brass);
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.set(mx, my, mz - 2.9);
    parts.add(spinner);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 3.4, 6), dark);
    strut.position.set(mx, my + 2.5, mz - 0.6);
    parts.add(strut);

    const bladeParts = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(blade, dark);
      b.rotation.z = (i * Math.PI) / 2;
      b.position.set(Math.sin((i * Math.PI) / 2) * 1.25, Math.cos((i * Math.PI) / 2) * 1.25, 0);
      bladeParts.add(b);
    }
    // Pervane dönerken tek mesh olarak dönsün: 4 çizim yerine 1.
    const prop = new THREE.Group();
    for (const mesh of bake(bladeParts)) prop.add(mesh);
    prop.position.set(mx, my, mz + 1.4);
    props.push(prop);
    group.add(prop);
  }

  for (const mesh of bake(parts)) group.add(mesh);

  return {
    group,
    pos: group.position,
    dir: new THREE.Vector3(Math.random() < 0.5 ? 1 : -1, 0, rand(-0.4, 0.4)).normalize(),
    hp: 320,
    maxHp: 320,
    cool: rand(0, 3),
    dead: false,
    burn: 0,
    props,
    hullMat,
    hullColor: hullMat.color.clone(),
    lightY: 2,
  };
}

export function createTerrain(size: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(size, size, 72, 72);
  const posAttr = geo.attributes["position"] as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    // Düzlem -90° X ile döndürülüyor: yerel (x, y, z) -> dünya (x, z, -y)
    posAttr.setZ(i, terrainHeight(x, -y));
  }
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);

  // distant jagged peaks — tek mesh'e birleştiriliyor
  const peaks = new THREE.Group();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = size * 0.44 + rand(-40, 40);
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(rand(30, 70), rand(80, 190), 5), peakMat);
    peak.position.set(px, terrainHeight(px, pz) - 12, pz);
    peaks.add(peak);
  }
  for (const mesh of bake(peaks)) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    g.add(mesh);
  }
  return g;
}

export function createAsh(count: number, area: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(-area, area);
    pos[i * 3 + 1] = rand(0, 220);
    pos[i * 3 + 2] = rand(-area, area);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x8a8078,
    map: softParticleTexture(),
    size: 1.6,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}
