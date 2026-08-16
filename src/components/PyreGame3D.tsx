import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createDragon } from "./pyre3d/dragon";
import { createAirship, createAsh, createStructure, createTerrain, type Airship, type Structure } from "./pyre3d/world";
import {
  ASH_MAX,
  QUALITY_PRESETS,
  loadSettings,
  saveSettings,
  type FpsTarget,
  type QualityLevel,
} from "./pyre3d/quality";

export type GameStats = {
  score: number;
  embers: number;
  destroyed: number;
  total: number;
  goal: number;
  combo: number;
  hp: number;
  heat: number;
  stamina: number;
  status: "playing" | "won" | "lost";
};

const WORLD = 900;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

type Ctrl = {
  x: number;
  y: number;
  fire: boolean;
  roll: boolean;
  shock: boolean;
  boost: boolean;
};

export default function PyreGame3D({ onStats }: { onStats: (s: GameStats) => void }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const statsRef = useRef(onStats);
  statsRef.current = onStats;
  const ctrl = useRef<Ctrl>({ x: 0, y: 0, fire: false, roll: false, shock: false, boost: false });
  const [restart, setRestart] = useState(0);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [joy, setJoy] = useState({ x: 0, y: 0, active: false });
  const [quality, setQuality] = useState<QualityLevel>("medium");
  const [fpsTarget, setFpsTarget] = useState<FpsTarget>(60);
  const [fps, setFps] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef({ quality: "medium" as QualityLevel, fps: 60 as FpsTarget });
  const applyRef = useRef<(() => void) | null>(null);

  // cihazdan/localStorage'dan başlangıç ayarı
  useEffect(() => {
    const s = loadSettings();
    settingsRef.current = s;
    setQuality(s.quality);
    setFpsTarget(s.fps);
  }, []);

  useEffect(() => {
    settingsRef.current = { quality, fps: fpsTarget };
    applyRef.current?.();
  }, [quality, fpsTarget]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let preset = QUALITY_PRESETS[settingsRef.current.quality];

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = preset.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1210);
    const fog = new THREE.FogExp2(0x2a1a14, preset.fogDensity);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(66, mount.clientWidth / mount.clientHeight, 0.5, 2400);

    scene.add(new THREE.HemisphereLight(0x50301f, 0x120a07, 0.7));
    const fill = new THREE.PointLight(0xffa860, 2.2, 120, 2);
    scene.add(fill);
    const sun = new THREE.DirectionalLight(0xff8a3c, 1.5);
    sun.position.set(-160, 190, -120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    sun.shadow.camera.left = -140;
    sun.shadow.camera.right = 140;
    sun.shadow.camera.top = 140;
    sun.shadow.camera.bottom = -140;
    sun.shadow.camera.far = 600;
    scene.add(sun, sun.target);

    // gloomy sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1600, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {},
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
        fragmentShader: `varying vec3 vP;
          void main(){
            float h = normalize(vP).y;
            vec3 low = vec3(0.42,0.15,0.07);
            vec3 mid = vec3(0.16,0.10,0.09);
            vec3 top = vec3(0.05,0.04,0.05);
            vec3 c = mix(low, mid, smoothstep(-0.15,0.25,h));
            c = mix(c, top, smoothstep(0.2,0.85,h));
            gl_FragColor = vec4(c,1.0);
          }`,
      }),
    );
    scene.add(sky);

    scene.add(createTerrain(WORLD * 2.4));
    const ash = createAsh(ASH_MAX, WORLD);
    ash.geometry.setDrawRange(0, preset.ashCount);
    scene.add(ash);

    const applyQuality = () => {
      preset = QUALITY_PRESETS[settingsRef.current.quality];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));
      renderer.shadowMap.enabled = preset.shadows;
      renderer.shadowMap.needsUpdate = true;
      sun.castShadow = preset.shadows;
      sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
      fog.density = preset.fogDensity;
      ash.geometry.setDrawRange(0, preset.ashCount);
      const am = ash.material as THREE.PointsMaterial;
      am.size = preset.ashSize;
      am.opacity = preset.ashOpacity;
    };
    applyRef.current = applyQuality;
    applyQuality();

    // structures
    const structures: Structure[] = [];
    for (let i = 0; i < 78; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * WORLD * 0.8;
      const roll = Math.random();
      const kind: Structure["kind"] = roll < 0.55 ? "house" : roll < 0.85 ? "factory" : "tower";
      const s = createStructure(kind, Math.cos(a) * r, Math.sin(a) * r);
      structures.push(s);
      scene.add(s.group);
    }

    const airships: Airship[] = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(180, WORLD * 0.7);
      const z = createAirship(Math.cos(a) * r, rand(60, 130), Math.sin(a) * r);
      airships.push(z);
      scene.add(z.group);
    }

    const dragon = createDragon();
    dragon.root.position.set(0, 90, 220);
    scene.add(dragon.root);

    // flame breath
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff8a1e,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(7, 46, 14, 1, true), flameMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, 0, 26);
    const flameCore = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 40, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe8a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    flameCore.rotation.x = Math.PI / 2;
    flameCore.position.set(0, 0, 22);
    const flameRig = new THREE.Group();
    flameRig.add(flame, flameCore);
    dragon.root.add(flameRig);

    // shockwave ring
    const shockMat = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 8, 40), shockMat);
    shock.rotation.x = Math.PI / 2;
    scene.add(shock);
    let shockT = -1;

    // ember particles pool
    const EM = 700;
    const emPos = new Float32Array(EM * 3);
    const emVel = new Float32Array(EM * 3);
    const emLife = new Float32Array(EM);
    const emGeo = new THREE.BufferGeometry();
    emGeo.setAttribute("position", new THREE.BufferAttribute(emPos, 3));
    const embersPts = new THREE.Points(
      emGeo,
      new THREE.PointsMaterial({
        color: 0xff9430,
        size: 2.4,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(embersPts);
    let emIdx = 0;
    const burst = (p: THREE.Vector3, n: number, spread = 14) => {
      for (let i = 0; i < n; i++) {
        const i3 = emIdx * 3;
        emPos[i3] = p.x;
        emPos[i3 + 1] = p.y;
        emPos[i3 + 2] = p.z;
        emVel[i3] = rand(-spread, spread);
        emVel[i3 + 1] = rand(2, spread);
        emVel[i3 + 2] = rand(-spread, spread);
        emLife[emIdx] = rand(0.7, 2);
        emIdx = (emIdx + 1) % EM;
      }
    };
    for (let i = 0; i < EM; i++) {
      emLife[i] = 0;
      emPos[i * 3 + 1] = -9999;
    }

    // enemy projectiles
    type Shot = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number };
    const shots: Shot[] = [];
    const shotGeo = new THREE.SphereGeometry(0.9, 8, 8);
    const shotMat = new THREE.MeshBasicMaterial({ color: 0x7fe4ff });

    // state
    const state = {
      hp: 100,
      heat: 0,
      overheat: 0,
      stamina: 100,
      invuln: 0,
      rollCd: 0,
      rollT: 0,
      shockCd: 0,
      speed: 55,
      combo: 1,
      comboT: 0,
      score: 0,
      embers: 0,
      destroyed: 0,
      status: "playing" as GameStats["status"],
      flap: 0,
    };
    const total = structures.length + airships.length;
    const goal = Math.ceil(total * 0.6);

    const keys: Record<string, boolean> = {};
    const kd = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const resize = () => {
      if (!mount.clientWidth) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", resize);

    const fwd = new THREE.Vector3();
    const headPos = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    const camGoal = new THREE.Vector3();
    const lookGoal = new THREE.Vector3();
    camera.position.set(0, 100, 260);

    let last = performance.now();
    let raf = 0;
    let pushT = 0;
    let frames = 0;
    let fpsT = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const cap = settingsRef.current.fps;
      const elapsed = (now - last) / 1000;
      if (cap > 0 && elapsed < 1 / cap - 0.002) return;
      const dt = Math.min(0.05, elapsed);
      last = now;
      frames++;
      fpsT += dt;
      if (fpsT >= 0.5) {
        setFps(Math.round(frames / fpsT));
        frames = 0;
        fpsT = 0;
      }
      const c = ctrl.current;
      const kx = (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) - (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);
      const ky = (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0) - (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0);
      const inX = Math.abs(c.x) > 0.05 ? c.x : kx;
      const inY = Math.abs(c.y) > 0.05 ? c.y : ky;
      const firing = (c.fire || !!keys["Space"]) && state.overheat <= 0 && state.status === "playing";

      if (state.status === "playing") {
        // ---- flight ----
        const yaw = -inX * 1.5 * dt;
        const pitch = -inY * 1.15 * dt;
        dragon.root.rotateY(yaw);
        dragon.root.rotateX(pitch);
        // roll visual banking
        const bank = -inX * 0.75;
        dragon.body.rotation.z += (bank - dragon.body.rotation.z) * Math.min(1, dt * 5);

        // keep upright-ish (kill accumulated z on root)
        const e = new THREE.Euler().setFromQuaternion(dragon.root.quaternion, "YXZ");
        e.z *= 0.9;
        e.x = THREE.MathUtils.clamp(e.x, -1.15, 1.15);
        dragon.root.quaternion.setFromEuler(e);

        const boosting = (c.boost || !!keys["ShiftRight"]) && state.stamina > 0;
        const target = boosting ? 118 : 62;
        state.speed += (target - state.speed) * Math.min(1, dt * 1.6);
        if (boosting) state.stamina = Math.max(0, state.stamina - 16 * dt);
        else state.stamina = Math.min(100, state.stamina + 11 * dt);

        dragon.root.getWorldDirection(fwd);
        dragon.root.position.addScaledVector(fwd, state.speed * dt);
        dragon.root.position.y = THREE.MathUtils.clamp(dragon.root.position.y, 14, 320);
        const rr = Math.hypot(dragon.root.position.x, dragon.root.position.z);
        if (rr > WORLD) {
          dragon.root.position.multiplyScalar(WORLD / rr);
          dragon.root.position.y = Math.max(14, dragon.root.position.y);
        }

        // wing flap
        state.flap += dt * (2.2 + state.speed * 0.03);
        const flapAmt = Math.sin(state.flap) * (boosting ? 0.75 : 0.5);
        dragon.wingR.rotation.z = -flapAmt - 0.1;
        dragon.wingL.rotation.z = flapAmt + 0.1;
        dragon.wingR.rotation.x = Math.sin(state.flap - 0.6) * 0.16;
        dragon.wingL.rotation.x = Math.sin(state.flap - 0.6) * 0.16;
        dragon.tail.forEach((t, i) => {
          t.rotation.y = Math.sin(state.flap * 0.7 - i * 0.45) * 0.13 - inX * 0.06;
          t.rotation.x = Math.sin(state.flap * 0.5 - i * 0.3) * 0.05;
        });
        dragon.neck.forEach((n, i) => {
          n.rotation.x = -inY * 0.09 + Math.sin(state.flap * 0.6 - i) * 0.03;
          n.rotation.y = -inX * 0.08;
        });
        dragon.jaw.rotation.x = firing ? 0.45 : 0.06;

        // ---- barrel roll ----
        state.rollCd = Math.max(0, state.rollCd - dt);
        if ((c.roll || keys["ShiftLeft"]) && state.rollCd <= 0 && state.stamina > 14) {
          state.rollCd = 1.7;
          state.rollT = 0.7;
          state.invuln = 0.75;
          state.stamina -= 14;
          burst(dragon.root.position, 26, 10);
        }
        if (state.rollT > 0) {
          state.rollT -= dt;
          dragon.body.rotation.z += Math.PI * 2 * (dt / 0.7);
        }
        state.invuln = Math.max(0, state.invuln - dt);

        // ---- shockwave ----
        state.shockCd = Math.max(0, state.shockCd - dt);
        if (c.shock && state.shockCd <= 0 && state.stamina > 25) {
          state.shockCd = 5;
          state.stamina -= 25;
          shockT = 0;
          shock.position.copy(dragon.root.position);
          for (const s of structures) {
            if (s.dead) continue;
            if (s.pos.distanceTo(dragon.root.position) < 90) {
              s.hp -= 90;
              s.burn = Math.min(1, s.burn + 0.5);
            }
          }
          for (const z of airships) {
            if (!z.dead && z.pos.distanceTo(dragon.root.position) < 110) z.hp -= 110;
          }
          burst(dragon.root.position, 60, 26);
        }

        // ---- flame ----
        state.overheat = Math.max(0, state.overheat - dt);
        dragon.maw.getWorldPosition(headPos);
        if (firing) {
          state.heat = Math.min(100, state.heat + 30 * dt);
          if (state.heat >= 100) state.overheat = 3.2;
          dragon.glow.intensity = 26 + Math.sin(now * 0.03) * 8;
          flameMat.opacity = 0.5 + Math.random() * 0.25;
          (flameCore.material as THREE.MeshBasicMaterial).opacity = 0.7;
          flame.scale.set(1 + Math.random() * 0.12, 1, 1 + Math.random() * 0.12);
          burst(headPos, 3, 5);

          dragon.root.getWorldDirection(fwd);
          const hit = (p: THREE.Vector3, extra: number) => {
            tmp.copy(p).sub(headPos);
            const dist = tmp.length();
            if (dist > 70 + extra) return false;
            tmp.normalize();
            return tmp.dot(fwd) > 0.86 - extra * 0.004;
          };
          for (const s of structures) {
            if (s.dead) continue;
            tmp.copy(s.pos).setY(s.pos.y + 5);
            if (hit(tmp, s.radius)) {
              s.hp -= 85 * dt;
              s.burn = Math.min(1, s.burn + 1.4 * dt);
            }
          }
          for (const z of airships) {
            if (z.dead) continue;
            if (hit(z.pos, 12)) z.hp -= 95 * dt;
          }
        } else {
          state.heat = Math.max(0, state.heat - 24 * dt);
          dragon.glow.intensity += (0 - dragon.glow.intensity) * Math.min(1, dt * 6);
          flameMat.opacity += (0 - flameMat.opacity) * Math.min(1, dt * 10);
          (flameCore.material as THREE.MeshBasicMaterial).opacity *= 0.85;
        }
        (dragon.maw.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + state.heat * 0.06;

        // ---- structures burn / destroy / towers ----
        for (const s of structures) {
          if (s.dead) continue;
          if (s.burn > 0) {
            s.hp -= s.burn * 16 * dt;
            s.fireLight.intensity = 20 + s.burn * 55 + Math.sin(now * 0.01 + s.pos.x) * 10;
            if (Math.random() < s.burn * 0.7) {
              tmp.set(s.pos.x + rand(-s.radius, s.radius), rand(2, 12), s.pos.z + rand(-s.radius, s.radius));
              burst(tmp, 1, 3);
            }
            if (Math.random() < 0.4 * dt) {
              for (const o of structures) {
                if (o.dead || o.burn > 0.2) continue;
                if (o.pos.distanceTo(s.pos) < 70) o.burn = Math.min(1, o.burn + 0.4);
              }
            }
          }
          if (s.hp <= 0) {
            s.dead = true;
            s.group.visible = false;
            state.destroyed++;
            state.comboT = 5;
            state.combo = Math.min(5, state.combo + 1);
            const base = s.kind === "factory" ? 260 : s.kind === "tower" ? 200 : 120;
            state.score += base * state.combo;
            state.embers += base * 0.35;
            tmp.copy(s.pos).setY(s.pos.y + 6);
            burst(tmp, 60, 22);
          }
          if (s.kind === "tower" && !s.dead) {
            s.cool -= dt;
            if (s.cool <= 0 && s.pos.distanceTo(dragon.root.position) < 320) {
              s.cool = 2.2;
              const m = new THREE.Mesh(shotGeo, shotMat);
              m.position.copy(s.pos).setY(s.pos.y + 22);
              const v = tmp.copy(dragon.root.position).sub(m.position).normalize().multiplyScalar(85);
              scene.add(m);
              shots.push({ mesh: m, vel: v.clone(), life: 6 });
            }
          }
        }

        state.comboT -= dt;
        if (state.comboT <= 0) state.combo = 1;

        // ---- airships ----
        for (const z of airships) {
          if (z.dead) continue;
          z.group.position.addScaledVector(z.dir, 12 * dt);
          z.group.position.y += Math.sin(now * 0.0004 + z.group.position.x) * 4 * dt;
          if (Math.hypot(z.group.position.x, z.group.position.z) > WORLD * 0.85) {
            z.dir.set(-z.group.position.x, 0, -z.group.position.z).normalize();
          }
          z.group.lookAt(z.group.position.clone().add(z.dir));
          z.group.rotateY(Math.PI);
          z.props.forEach((p) => (p.rotation.z += dt * 9));
          z.cool -= dt;
          if (z.cool <= 0 && z.group.position.distanceTo(dragon.root.position) < 400) {
            z.cool = 1.6;
            const m = new THREE.Mesh(shotGeo, shotMat);
            m.position.copy(z.group.position).setY(z.group.position.y - 6);
            const v = tmp.copy(dragon.root.position).sub(m.position).normalize().multiplyScalar(100);
            scene.add(m);
            shots.push({ mesh: m, vel: v.clone(), life: 6 });
          }
          if (z.hp <= 0) {
            z.dead = true;
            z.group.visible = false;
            state.destroyed++;
            state.comboT = 5;
            state.combo = Math.min(5, state.combo + 1);
            state.score += 700 * state.combo;
            state.embers += 260;
            burst(z.group.position, 120, 34);
          }
        }

        // ---- shots ----
        for (let i = shots.length - 1; i >= 0; i--) {
          const s = shots[i]!;
          s.mesh.position.addScaledVector(s.vel, dt);
          s.life -= dt;
          if (s.mesh.position.distanceTo(dragon.root.position) < 6 && state.invuln <= 0) {
            state.hp -= 8;
            state.invuln = 0.35;
            burst(s.mesh.position, 14, 8);
            s.life = 0;
          }
          if (s.life <= 0) {
            scene.remove(s.mesh);
            shots.splice(i, 1);
          }
        }

        if (state.hp <= 0) {
          state.hp = 0;
          state.status = "lost";
        }
        if (state.destroyed >= goal) state.status = "won";
      }

      // shockwave visual
      if (shockT >= 0) {
        shockT += dt;
        const k = shockT / 0.8;
        shock.scale.setScalar(1 + k * 90);
        shockMat.opacity = Math.max(0, 0.85 - k);
        if (k > 1) shockT = -1;
      }

      // embers update
      for (let i = 0; i < EM; i++) {
        if (emLife[i]! <= 0) continue;
        emLife[i] = emLife[i]! - dt;
        const i3 = i * 3;
        emPos[i3] = emPos[i3]! + emVel[i3]! * dt;
        emPos[i3 + 1] = emPos[i3 + 1]! + emVel[i3 + 1]! * dt;
        emPos[i3 + 2] = emPos[i3 + 2]! + emVel[i3 + 2]! * dt;
        emVel[i3 + 1] = emVel[i3 + 1]! + 6 * dt;
        if (emLife[i]! <= 0) emPos[i3 + 1] = -9999;
      }
      (emGeo.attributes["position"] as THREE.BufferAttribute).needsUpdate = true;

      // ash drift follows dragon
      ash.position.x = dragon.root.position.x;
      ash.position.z = dragon.root.position.z;
      ash.rotation.y += dt * 0.01;

      sun.position.copy(dragon.root.position).add(new THREE.Vector3(-140, 200, -110));
      sun.target.position.copy(dragon.root.position);
      sky.position.copy(dragon.root.position);

      // ---- TPS camera ----
      const back = state.status === "playing" ? 30 + state.speed * 0.16 : 34;
      fill.position.copy(camera.position);
      camGoal.set(0, 11, -back).applyQuaternion(dragon.root.quaternion).add(dragon.root.position);
      camGoal.y = Math.max(6, camGoal.y);
      camPos.copy(camera.position).lerp(camGoal, Math.min(1, dt * 4.2));
      camera.position.copy(camPos);
      lookGoal.copy(dragon.root.position).addScaledVector(fwd, 26).add(new THREE.Vector3(0, 3, 0));
      camera.lookAt(lookGoal);

      renderer.render(scene, camera);

      pushT += dt;
      if (pushT > 0.1) {
        pushT = 0;
        const snap: GameStats = {
          score: Math.round(state.score),
          embers: Math.round(state.embers),
          destroyed: state.destroyed,
          total,
          goal,
          combo: state.combo,
          hp: Math.round(state.hp),
          heat: Math.round(state.heat),
          stamina: Math.round(state.stamina),
          status: state.status,
        };
        setStats(snap);
        statsRef.current(snap);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      applyRef.current = null;
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [restart]);

  // ----- joystick -----
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyId = useRef<number | null>(null);
  const onJoyStart = (e: React.PointerEvent) => {
    joyId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    moveJoy(e);
  };
  const moveJoy = (e: React.PointerEvent) => {
    const el = joyRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len) / len;
    const x = dx * k;
    const y = dy * k;
    ctrl.current.x = x;
    ctrl.current.y = y;
    ctrl.current.boost = Math.hypot(x, y) > 0.88;
    setJoy({ x, y, active: true });
  };
  const endJoy = () => {
    joyId.current = null;
    ctrl.current.x = 0;
    ctrl.current.y = 0;
    ctrl.current.boost = false;
    setJoy({ x: 0, y: 0, active: false });
  };

  const hold = (k: "fire" | "roll" | "shock") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      ctrl.current[k] = true;
      if (k !== "fire") setTimeout(() => (ctrl.current[k] = false), 120);
    },
    onPointerUp: () => (ctrl.current[k] = false),
    onPointerLeave: () => (ctrl.current[k] = false),
    onPointerCancel: () => (ctrl.current[k] = false),
  });

  const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
  const s = stats;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background select-none">
      <div ref={mountRef} className="absolute inset-0 touch-none" />

      {/* Top-left minimal bars */}
      <div className="pointer-events-none absolute left-4 top-4 w-32 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-8 text-[10px] uppercase tracking-widest text-foreground/70">HP</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/50 backdrop-blur">
            <div className="h-full rounded-full bg-destructive transition-all" style={{ width: pct(s?.hp ?? 100) }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-[10px] uppercase tracking-widest text-foreground/70">STM</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/50 backdrop-blur">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: pct(s?.stamina ?? 100) }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-[10px] uppercase tracking-widest text-foreground/70">HEAT</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/50 backdrop-blur">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: pct(s?.heat ?? 0) }} />
          </div>
        </div>
      </div>

      {/* Top-right score */}
      <div className="pointer-events-none absolute right-4 top-4 text-right">
        <p className="font-display text-xl font-black text-foreground drop-shadow">
          {(s?.score ?? 0).toLocaleString("tr-TR")}
        </p>
        <p className="text-[10px] uppercase tracking-widest text-primary">
          Yıkım {s?.destroyed ?? 0}/{s?.goal ?? 0} · x{s?.combo ?? 1}
        </p>
      </div>

      {/* Performans ayarları */}
      <div className="absolute right-4 top-20 flex flex-col items-end gap-2">
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="rounded-md border border-foreground/25 bg-background/40 px-2 py-1 text-[10px] uppercase tracking-widest text-foreground/80 backdrop-blur active:bg-foreground/20"
        >
          {QUALITY_PRESETS[quality].label} · {fps} FPS
        </button>
        {showSettings && (
          <div className="w-44 space-y-3 rounded-lg border border-foreground/20 bg-background/80 p-3 backdrop-blur">
            <div>
              <p className="mb-1 text-[9px] uppercase tracking-widest text-muted-foreground">Grafik Kalitesi</p>
              <div className="flex gap-1">
                {(["low", "medium", "high"] as QualityLevel[]).map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setQuality(q);
                      saveSettings(q, fpsTarget);
                    }}
                    className={`flex-1 rounded border px-1 py-1 text-[9px] uppercase tracking-widest ${
                      quality === q
                        ? "border-primary bg-primary/25 text-primary"
                        : "border-foreground/20 text-foreground/70"
                    }`}
                  >
                    {QUALITY_PRESETS[q].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[9px] uppercase tracking-widest text-muted-foreground">FPS Hedefi</p>
              <div className="flex gap-1">
                {([30, 60, 0] as FpsTarget[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setFpsTarget(f);
                      saveSettings(quality, f);
                    }}
                    className={`flex-1 rounded border px-1 py-1 text-[9px] uppercase tracking-widest ${
                      fpsTarget === f
                        ? "border-accent bg-accent/25 text-accent"
                        : "border-foreground/20 text-foreground/70"
                    }`}
                  >
                    {f === 0 ? "Max" : f}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[9px] leading-snug text-muted-foreground">
              Düşük kalite sisi yoğunlaştırıp kül parçacıklarını ve gölgeleri azaltır.
            </p>
          </div>
        )}
      </div>

      {/* Joystick */}
      <div
        ref={joyRef}
        onPointerDown={onJoyStart}
        onPointerMove={(e) => joyId.current === e.pointerId && moveJoy(e)}
        onPointerUp={endJoy}
        onPointerCancel={endJoy}
        className="absolute bottom-8 left-6 h-32 w-32 touch-none rounded-full border border-foreground/20 bg-foreground/5 backdrop-blur-sm"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-primary/60 bg-primary/25"
          style={{
            transform: `translate(calc(-50% + ${joy.x * 34}px), calc(-50% + ${joy.y * 34}px))`,
            transition: joy.active ? "none" : "transform .15s ease-out",
          }}
        />
      </div>

      {/* Action buttons */}
      <div className="absolute bottom-8 right-6 flex items-end gap-3">
        <div className="flex flex-col gap-3">
          <button
            {...hold("shock")}
            className="h-16 w-16 touch-none rounded-full border border-accent/50 bg-accent/15 text-[10px] font-bold uppercase tracking-widest text-accent backdrop-blur active:bg-accent/40"
          >
            Şok
          </button>
          <button
            {...hold("roll")}
            className="h-16 w-16 touch-none rounded-full border border-foreground/30 bg-foreground/10 text-[10px] font-bold uppercase tracking-widest text-foreground backdrop-blur active:bg-foreground/25"
          >
            Roll
          </button>
        </div>
        <button
          {...hold("fire")}
          className="h-24 w-24 touch-none rounded-full border-2 border-primary/70 bg-primary/25 text-xs font-black uppercase tracking-widest text-primary backdrop-blur active:bg-primary/50"
        >
          Alev
        </button>
      </div>

      {/* End screen */}
      {s && s.status !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur">
          <p className="font-display text-3xl font-black uppercase text-foreground">
            {s.status === "won" ? "Bölge küle döndü" : "Pyra düştü"}
          </p>
          <p className="text-sm text-muted-foreground">
            Skor {s.score.toLocaleString("tr-TR")} · Kadim Köz {s.embers.toLocaleString("tr-TR")}
          </p>
          <button
            onClick={() => {
              setStats(null);
              setRestart((k) => k + 1);
            }}
            className="rounded-lg bg-primary px-6 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground"
          >
            Yeniden Başlat
          </button>
        </div>
      )}
    </div>
  );
}