import * as THREE from "three";

export type Structure = {
  group: THREE.Group;
  pos: THREE.Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  burn: number;
  dead: boolean;
  kind: "house" | "factory" | "tower";
  cool: number;
  fireLight: THREE.PointLight;
};

export type Airship = {
  group: THREE.Group;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  hp: number;
  maxHp: number;
  cool: number;
  dead: boolean;
  burn: number;
  props: THREE.Object3D[];
  hullMat: THREE.MeshStandardMaterial;
  hullColor: THREE.Color;
  fireLight: THREE.PointLight;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const stone = (c: number, r = 0.85) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.15, flatShading: true });
const brass = new THREE.MeshStandardMaterial({ color: 0x8a6b32, roughness: 0.35, metalness: 0.9 });
const litWindow = new THREE.MeshStandardMaterial({
  color: 0x1a1208,
  emissive: 0xffa23c,
  emissiveIntensity: 1.6,
  roughness: 0.4,
});

function addWindows(g: THREE.Group, w: number, h: number, d: number) {
  const geo = new THREE.PlaneGeometry(0.5, 0.7);
  for (let y = 1.2; y < h - 0.6; y += 1.6) {
    for (let x = -w / 2 + 0.8; x < w / 2 - 0.4; x += 1.4) {
      if (Math.random() < 0.45) continue;
      const a = new THREE.Mesh(geo, litWindow);
      a.position.set(x, y, d / 2 + 0.02);
      g.add(a);
      const b = new THREE.Mesh(geo, litWindow);
      b.position.set(x, y, -d / 2 - 0.02);
      b.rotation.y = Math.PI;
      g.add(b);
    }
  }
}

export function createStructure(kind: Structure["kind"], x: number, z: number): Structure {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  let radius = 4;
  let hp = 60;

  if (kind === "house") {
    const w = rand(4, 6.5);
    const h = rand(4, 7);
    const d = rand(4, 6.5);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone(0x4a3527));
    base.position.y = h / 2;
    group.add(base);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.8, 2.6, 4),
      stone(0x2c1c14),
    );
    roof.position.y = h + 1.3;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 3, 8), brass);
    pipe.position.set(w / 2 - 0.8, h + 1.2, d / 2 - 0.8);
    group.add(pipe);
    addWindows(group, w, h, d);
    radius = Math.max(w, d) * 0.7;
    hp = 70;
  } else if (kind === "factory") {
    const w = rand(9, 14);
    const h = rand(7, 11);
    const d = rand(8, 12);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone(0x3a332c));
    base.position.y = h / 2;
    group.add(base);
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.2, rand(6, 11), 10),
        stone(0x2b241e, 0.9),
      );
      st.position.set(
        -w / 3 + i * (w / 3),
        h + (st.geometry as THREE.CylinderGeometry).parameters.height / 2,
        rand(-d / 4, d / 4),
      );
      group.add(st);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 6, 14), brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(
        st.position.x,
        st.position.y + (st.geometry as THREE.CylinderGeometry).parameters.height / 2 - 0.7,
        st.position.z,
      );
      group.add(ring);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 5, 14), brass);
    tank.position.set(w / 2 + 2.4, 2.5, -d / 3);
    group.add(tank);
    addWindows(group, w, h, d);
    radius = Math.max(w, d) * 0.75;
    hp = 190;
  } else {
    const h = rand(14, 22);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.8, h, 8), stone(0x463a2c));
    base.position.y = h / 2;
    group.add(base);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 2.2, 2.2, 8), brass);
    cap.position.y = h + 0.8;
    group.add(cap);
    const coil = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0x0a1a22,
        emissive: 0x39c6ff,
        emissiveIntensity: 2.4,
        roughness: 0.3,
      }),
    );
    coil.position.y = h + 2.5;
    group.add(coil);
    radius = 3.4;
    hp = 130;
  }

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  const fireLight = new THREE.PointLight(0xff6a1a, 0, 40, 2);
  fireLight.position.y = 5;
  group.add(fireLight);

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
    fireLight,
  };
}

export function createAirship(x: number, y: number, z: number): Airship {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x5c5145,
    roughness: 0.7,
    metalness: 0.35,
  });
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0x8a2f22,
    roughness: 0.8,
    metalness: 0.15,
  });
  const dark = stone(0x1d1a16, 0.5);

  // ---- balloon ----
  const R = 6.4;
  const HALF = R * 2.44;
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 18), hullMat);
  balloon.scale.set(1, 0.8, 2.44);
  group.add(balloon);

  // nose cone (-Z = travel direction)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.1, 5.5, 14), bandMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -HALF - 0.4;
  group.add(nose);

  // hooped ribs hugging the hull
  for (const zp of [-12, -7, -2.5, 0, 2.5, 7, 12]) {
    const rr = Math.sqrt(Math.max(0.001, 1 - (zp / HALF) ** 2)) * R * 1.012;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.16, 6, 26), brass);
    rib.position.z = zp;
    rib.scale.y = 0.8;
    group.add(rib);
  }

  // tail fins (+Z = rear)
  const finV = new THREE.Mesh(new THREE.BoxGeometry(0.34, 5.4, 3.6), hullMat);
  finV.position.set(0, 2.2, HALF + 0.4);
  group.add(finV);
  const finH = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.34, 3.2), hullMat);
  finH.position.set(0, 0.4, HALF + 0.6);
  group.add(finH);
  const finVtip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 1.4), bandMat);
  finVtip.position.set(0, 5.1, HALF + 2.4);
  group.add(finVtip);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.9),
    new THREE.MeshBasicMaterial({ color: 0xd84a2a, side: THREE.DoubleSide }),
  );
  flag.position.set(0, 5.6, HALF + 2.9);
  group.add(flag);

  // ---- gondola ----
  const gondola = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 9.5), stone(0x2e2822, 0.6));
  gondola.position.y = -6.6;
  group.add(gondola);
  const gRoof = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.5, 9.9), hullMat);
  gRoof.position.y = -5.4;
  group.add(gRoof);
  const cabinGlow = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.8, 6.8), litWindow);
  cabinGlow.position.y = -6.4;
  group.add(cabinGlow);
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), brass);
    frame.position.set(0, -6.4, i * 1.35);
    group.add(frame);
  }
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0x2a1404,
      emissive: 0xffb04a,
      emissiveIntensity: 2.2,
      roughness: 0.4,
    }),
  );
  lantern.position.y = -8.1;
  group.add(lantern);
  const lanternCord = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), brass);
  lanternCord.position.y = -7.7;
  group.add(lanternCord);

  // keel cables balloon -> gondola
  for (const [sx, sz] of [
    [-1.6, -3.2],
    [1.6, -3.2],
    [-1.6, 3.2],
    [1.6, 3.2],
  ] as const) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), dark);
    cable.position.set(sx, -6.2, sz);
    group.add(cable);
  }

  // ---- engine pods (rear +Z) ----
  const props: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const mount = new THREE.Group();
    mount.position.set(5.2 * s, -3.2, 8.6);
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 3.4, 12), brass);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.z = -1.2;
    mount.add(nacelle);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 10), brass);
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.z = -2.9;
    mount.add(spinner);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 3.4, 6), dark);
    strut.position.set(0, 2.5, -0.6);
    mount.add(strut);
    const prop = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.4), dark);
      blade.rotation.z = (i * Math.PI) / 2;
      blade.position.set(Math.sin((i * Math.PI) / 2) * 1.25, Math.cos((i * Math.PI) / 2) * 1.25, 0);
      prop.add(blade);
    }
    prop.position.z = 1.4;
    mount.add(prop);
    props.push(prop);
    group.add(mount);
  }

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  const fireLight = new THREE.PointLight(0xff6a1a, 0, 45, 2);
  fireLight.position.set(0, 2, 0);
  group.add(fireLight);

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
    fireLight,
  };
}

export function createTerrain(size: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(size, size, 90, 90);
  const posAttr = geo.attributes["position"] as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const h = Math.sin(x * 0.012) * 9 + Math.cos(y * 0.015) * 7 + Math.sin((x + y) * 0.03) * 2.5;
    posAttr.setZ(i, h);
  }
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x2a1a13, roughness: 1, flatShading: true }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);

  // distant jagged peaks
  const peakMat = new THREE.MeshStandardMaterial({
    color: 0x150e0b,
    roughness: 1,
    flatShading: true,
  });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = size * 0.44 + rand(-40, 40);
    const peak = new THREE.Mesh(new THREE.ConeGeometry(rand(30, 70), rand(80, 190), 5), peakMat);
    peak.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.add(peak);
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
    size: 1.2,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}
