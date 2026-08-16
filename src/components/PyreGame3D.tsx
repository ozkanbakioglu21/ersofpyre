import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createDragon } from "./pyre3d/dragon";
import {
  createAirship,
  createAsh,
  createStructure,
  createTerrain,
  softParticleTexture,
  terrainHeight,
  type Airship,
  type Burnable,
  type Structure,
} from "./pyre3d/world";
import {
  ASH_MAX,
  FIRE_LIGHTS,
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
const FWD = new THREE.Vector3(0, 0, 1);
const SUN_OFFSET = new THREE.Vector3(-140, 200, -110);
const STRUCTURE_COUNT = 78;
const AIRSHIP_COUNT = 6;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const burnColor = new THREE.Color(0x1a0c06);

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
  const [progress, setProgress] = useState(0);
  const [loadLabel, setLoadLabel] = useState("Hazırlanıyor");
  const [ready, setReady] = useState(false);
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

    let cancelled = false;
    let raf = 0;
    const cleanups: Array<() => void> = [];

    setReady(false);
    setProgress(0);

    /** Bir sonraki kareye kadar bekler: yükleme çubuğu gerçekten çizilebilsin diye. */
    const yieldFrame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
    const step = async (p: number, label: string) => {
      setProgress(p);
      setLoadLabel(label);
      await yieldFrame();
    };

    const build = async () => {
      let preset = QUALITY_PRESETS[settingsRef.current.quality];

      const renderer = new THREE.WebGLRenderer({
        // Yüksek DPI ekranlarda MSAA'nın maliyeti karşılığını vermiyor;
        // orada zaten piksel oranı kenarları yumuşatıyor.
        antialias: window.devicePixelRatio < 1.5,
        powerPreference: "high-performance",
      });
      let resScale = 1;
      const applyPixelRatio = () =>
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio) * resScale);
      applyPixelRatio();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.shadowMap.enabled = preset.shadows;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      cleanups.push(() => {
        // Geometriler sahneye özel; materyaller (userData.shared) modüller
        // arasında paylaşıldığı için yeniden başlatmada korunur.
        scene.traverse((o) => {
          const m = o as THREE.Mesh | THREE.Points;
          if (m.geometry) m.geometry.dispose();
          const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (!mat) return;
          for (const mm of Array.isArray(mat) ? mat : [mat]) {
            if (!mm.userData["shared"]) mm.dispose();
          }
        });
        renderer.dispose();
        // WebGL bağlam sayısı tarayıcıda sınırlı: yeniden başlatmalarda
        // bağlam sızdırmamak için açıkça bırakıyoruz.
        renderer.forceContextLoss();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      });

      scene.background = new THREE.Color(0x1a1210);
      const fog = new THREE.FogExp2(0x2a1a14, preset.fogDensity);
      scene.fog = fog;

      const camera = new THREE.PerspectiveCamera(
        66,
        mount.clientWidth / mount.clientHeight,
        0.5,
        2400,
      );

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

      /**
       * Yanan hedefler için sabit sayıda ışık havuzu.
       * Önceden her yapı kendi PointLight'ını taşıyordu (84 ışık): her materyal
       * bu ışıkların hepsini fragment başına hesaplıyordu ve bir bina yıkılıp
       * ışığı sahneden düştüğünde three.js tüm shader'ları yeniden derleyip
       * oyunu donduruyordu. Havuz sabit kaldığı için yeniden derleme olmuyor.
       */
      const firePool: THREE.PointLight[] = [];
      const lightSrc: Array<Burnable | null> = [];
      for (let i = 0; i < FIRE_LIGHTS; i++) {
        const l = new THREE.PointLight(0xff6a1a, 0, 46, 2);
        l.position.set(0, -600, 0);
        scene.add(l);
        firePool.push(l);
        lightSrc.push(null);
      }

      await step(8, "Kül vadisi dokunuyor");
      if (cancelled) return;

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
        resScale = 1;
        applyPixelRatio();
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
      cleanups.push(() => {
        applyRef.current = null;
      });
      applyQuality();

      await step(20, "Arazi şekilleniyor");
      if (cancelled) return;

      // structures — parça parça kuruluyor ki tarayıcı kilitlenmesin
      const structures: Structure[] = [];
      const CHUNK = 20;
      for (let i = 0; i < STRUCTURE_COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * WORLD * 0.8;
        const roll = Math.random();
        const kind: Structure["kind"] = roll < 0.55 ? "house" : roll < 0.85 ? "factory" : "tower";
        const s = createStructure(kind, Math.cos(a) * r, Math.sin(a) * r);
        structures.push(s);
        scene.add(s.group);
        if (i % CHUNK === CHUNK - 1) {
          await step(20 + Math.round((i / STRUCTURE_COUNT) * 45), "Köyler kuruluyor");
          if (cancelled) return;
        }
      }

      await step(66, "Zeplin filosu geliyor");
      if (cancelled) return;

      const airships: Airship[] = [];
      for (let i = 0; i < AIRSHIP_COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = rand(180, WORLD * 0.7);
        const z = createAirship(Math.cos(a) * r, rand(60, 130), Math.sin(a) * r);
        airships.push(z);
        scene.add(z.group);
      }

      await step(76, "Pyra uyanıyor");
      if (cancelled) return;

      const dragon = createDragon();
      dragon.root.position.set(0, 90, 220);
      scene.add(dragon.root);

      // flame breath (layered cones + particle jet)
      const flameMat = new THREE.MeshBasicMaterial({
        color: 0xff7a1a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(6.5, 48, 14, 1, true), flameMat);
      flame.rotation.x = Math.PI / 2;
      flame.position.set(0, 0, 26);
      const flameMidMat = new THREE.MeshBasicMaterial({
        color: 0xffc83c,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const flameMid = new THREE.Mesh(new THREE.ConeGeometry(3.8, 44, 12, 1, true), flameMidMat);
      flameMid.rotation.x = Math.PI / 2;
      flameMid.position.set(0, 0, 22);
      const flameCoreMat = new THREE.MeshBasicMaterial({
        color: 0xfff6d0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const flameCore = new THREE.Mesh(new THREE.ConeGeometry(1.7, 38, 10, 1, true), flameCoreMat);
      flameCore.rotation.x = Math.PI / 2;
      flameCore.position.set(0, 0, 19);
      const flameRig = new THREE.Group();
      flameRig.add(flame, flameMid, flameCore);
      dragon.root.add(flameRig);
      const flameLight = new THREE.PointLight(0xff7a1a, 0, 55, 2);
      flameLight.position.set(0, 0.4, 3);
      dragon.root.add(flameLight);

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
          map: softParticleTexture(),
          size: 2.6,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      // Parçacıklar her karede yer değiştiriyor ama sınır küresi ilk karede
      // (hepsi y=-9999'dayken) hesaplanıp önbelleğe alınıyordu; bu yüzden
      // korlar frustum dışında sayılıp hiç çizilmiyordu.
      embersPts.frustumCulled = false;
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

      // fire jet particle pool (per-vertex gradient for realistic color fade)
      const FM = 340;
      const fpPos = new Float32Array(FM * 3);
      const fpCol = new Float32Array(FM * 3);
      const fpVel = new Float32Array(FM * 3);
      const fpLife = new Float32Array(FM);
      const fpMax = new Float32Array(FM);
      const fpGeo = new THREE.BufferGeometry();
      fpGeo.setAttribute("position", new THREE.BufferAttribute(fpPos, 3));
      fpGeo.setAttribute("color", new THREE.BufferAttribute(fpCol, 3));
      const flamePts = new THREE.Points(
        fpGeo,
        new THREE.PointsMaterial({
          color: 0xffffff,
          map: softParticleTexture(),
          size: 3.6,
          transparent: true,
          opacity: 0.75,
          vertexColors: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      flamePts.frustumCulled = false;
      scene.add(flamePts);
      let fpIdx = 0;
      const fpA = new THREE.Color(0xfff6d0);
      const fpB = new THREE.Color(0xffc83c);
      const fpC = new THREE.Color(0xff6a1a);
      const fpD = new THREE.Color(0x5a1200);
      const fpColTmp = new THREE.Color();
      const spawnFlame = (p: THREE.Vector3, n: number) => {
        for (let i = 0; i < n; i++) {
          const i3 = fpIdx * 3;
          fpPos[i3] = p.x + rand(-0.7, 0.7);
          fpPos[i3 + 1] = p.y + rand(-0.7, 0.7);
          fpPos[i3 + 2] = p.z + rand(-0.7, 0.7);
          fpVel[i3] = rand(-4, 4);
          fpVel[i3 + 1] = rand(3, 12);
          fpVel[i3 + 2] = rand(52, 96);
          const life = rand(0.35, 0.85);
          fpLife[fpIdx] = life;
          fpMax[fpIdx] = life;
          fpCol[i3] = fpA.r;
          fpCol[i3 + 1] = fpA.g;
          fpCol[i3 + 2] = fpA.b;
          fpIdx = (fpIdx + 1) % FM;
        }
      };
      for (let i = 0; i < FM; i++) {
        fpLife[i] = 0;
        fpPos[i * 3 + 1] = -9999;
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
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
          e.preventDefault();
      };
      const ku = (e: KeyboardEvent) => {
        keys[e.code] = false;
      };
      // Sekme değişince tuşlar basılı kalıyordu: ejderha kendi kendine uçuyordu.
      const clearKeys = () => {
        for (const k of Object.keys(keys)) keys[k] = false;
      };
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);
      window.addEventListener("blur", clearKeys);

      const resize = () => {
        if (!mount.clientWidth) return;
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
      };
      window.addEventListener("resize", resize);
      cleanups.push(() => {
        window.removeEventListener("resize", resize);
        window.removeEventListener("keydown", kd);
        window.removeEventListener("keyup", ku);
        window.removeEventListener("blur", clearKeys);
      });

      const fwd = FWD.clone();
      const headPos = new THREE.Vector3();
      const tmp = new THREE.Vector3();
      const tmp2 = new THREE.Vector3();
      const camPos = new THREE.Vector3();
      const camGoal = new THREE.Vector3();
      const lookGoal = new THREE.Vector3();
      camera.position.set(0, 104, 180);

      /**
       * Düşman mermisi ejderhanın o anki konumuna nişan alıyor. 2.5D
       * kontrollerde boşta durmak "havada asılı kal" demek olduğu için tam
       * nişanlı mermi sabit hedefi %100 vuruyordu — kaçış yoktu. Hafif açısal
       * sapma, yakında isabetli kalırken uzakta ıskalamayı mümkün kılıyor.
       */
      const AIM_SPREAD = 0.045;
      const aimAtDragon = (from: THREE.Vector3, speed: number) => {
        tmp.copy(dragon.root.position).sub(from).normalize();
        tmp.x += rand(-AIM_SPREAD, AIM_SPREAD);
        tmp.y += rand(-AIM_SPREAD, AIM_SPREAD);
        tmp.z += rand(-AIM_SPREAD, AIM_SPREAD);
        return tmp.normalize().multiplyScalar(speed).clone();
      };

      let last = performance.now();
      let pushT = 0;
      let frames = 0;
      let fpsT = 0;
      let slowSamples = 0;
      let fastSamples = 0;
      let lightT = 0;
      const burning: Burnable[] = [];
      let lastPush: GameStats | null = null;

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
          const measured = Math.round(frames / fpsT);
          setFps(measured);
          frames = 0;
          fpsT = 0;
          // ---- uyarlanabilir çözünürlük ----
          // Kare hızı hedefin altında kalırsa iç render çözünürlüğünü düşürüyoruz;
          // en pahalı iş fragment shader olduğu için en hızlı kazanç burada.
          const targetFps = cap > 0 ? cap : 60;
          if (measured < targetFps * 0.8) {
            slowSamples++;
            fastSamples = 0;
          } else if (measured > targetFps * 0.95) {
            fastSamples++;
            slowSamples = 0;
          } else {
            slowSamples = 0;
            fastSamples = 0;
          }
          if (slowSamples >= 2 && resScale > 0.6) {
            resScale = Math.max(0.6, resScale - 0.15);
            applyPixelRatio();
            slowSamples = 0;
          } else if (fastSamples >= 8 && resScale < 1) {
            resScale = Math.min(1, resScale + 0.1);
            applyPixelRatio();
            fastSamples = 0;
          }
        }
        const c = ctrl.current;
        const kx =
          (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0) -
          (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0);
        const ky =
          (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0) - (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0);
        const kalt = (keys["KeyE"] ? 1 : 0) - (keys["KeyQ"] ? 1 : 0);
        const inX = Math.abs(c.x) > 0.05 ? c.x : kx;
        const inY = Math.abs(c.y) > 0.05 ? c.y : ky;
        const firing =
          (c.fire || !!keys["Space"]) && state.overheat <= 0 && state.status === "playing";

        if (state.status === "playing") {
          // ---- flight (2.5D: fixed facing, plane movement) ----
          const boosting =
            (c.boost || !!keys["ShiftLeft"] || !!keys["ShiftRight"]) && state.stamina > 0;
          const target = boosting ? 118 : 62;
          state.speed += (target - state.speed) * Math.min(1, dt * 1.6);
          if (boosting) state.stamina = Math.max(0, state.stamina - 16 * dt);
          else state.stamina = Math.min(100, state.stamina + 11 * dt);

          // screen-space plane movement: A/D yana, W ileri; boşta havada asılı kalır
          dragon.root.position.x += inX * state.speed * dt;
          dragon.root.position.z -= inY * state.speed * dt;
          // Q = dive, E = rise — zemine gömülmemesi için arazi yüksekliğine göre sınırlanıyor
          const groundY = terrainHeight(dragon.root.position.x, dragon.root.position.z);
          dragon.root.position.y = THREE.MathUtils.clamp(
            dragon.root.position.y + kalt * 70 * dt,
            groundY + 12,
            320,
          );
          // strafe banking for juice
          const bank = -inX * 0.6;
          dragon.body.rotation.z += (bank - dragon.body.rotation.z) * Math.min(1, dt * 5);

          // Sınır dışına çıkınca yalnız yatay yarıçap kısılır.
          // Eskiden konum vektörünün tamamı ölçekleniyordu; irtifa da düşüyordu.
          const rr = Math.hypot(dragon.root.position.x, dragon.root.position.z);
          if (rr > WORLD) {
            const k = WORLD / rr;
            dragon.root.position.x *= k;
            dragon.root.position.z *= k;
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
            flameLight.intensity = 22 + Math.random() * 24;
            // layered flicker
            const len = 0.9 + Math.random() * 0.22 + Math.sin(now * 0.05) * 0.05;
            flameMat.opacity = 0.42 + Math.random() * 0.18;
            flameMidMat.opacity = 0.6 + Math.random() * 0.2;
            flameCoreMat.opacity = 0.7 + Math.random() * 0.2;
            flame.scale.set(1 + Math.random() * 0.16, 1, len);
            flameMid.scale.set(1 + Math.random() * 0.1, 1, len * (0.8 + Math.random() * 0.2));
            flameCore.scale.set(1 + Math.random() * 0.08, 1, len * 0.72);
            flame.rotation.z = rand(-0.05, 0.05);
            flameMid.rotation.z = rand(-0.04, 0.04);
            flameCore.rotation.z = rand(-0.03, 0.03);
            // particle jet streaming from the mouth
            spawnFlame(headPos, 7);
            burst(headPos, 3, 5);

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
              if (hit(z.pos, 12)) {
                z.hp -= 95 * dt;
                z.burn = Math.min(1, z.burn + 2 * dt);
              }
            }
          } else {
            state.heat = Math.max(0, state.heat - 24 * dt);
            dragon.glow.intensity += (0 - dragon.glow.intensity) * Math.min(1, dt * 6);
            flameLight.intensity += (0 - flameLight.intensity) * Math.min(1, dt * 10);
            flameMat.opacity += (0 - flameMat.opacity) * Math.min(1, dt * 10);
            flameMidMat.opacity += (0 - flameMidMat.opacity) * Math.min(1, dt * 10);
            flameCoreMat.opacity += (0 - flameCoreMat.opacity) * Math.min(1, dt * 12);
          }
          (dragon.maw.material as THREE.MeshStandardMaterial).emissiveIntensity =
            1.5 + state.heat * 0.06;

          // ---- structures burn / destroy / towers ----
          for (const s of structures) {
            if (s.dead) continue;
            if (s.burn > 0) {
              s.hp -= s.burn * 16 * dt;
              if (Math.random() < s.burn * 0.7) {
                tmp.set(
                  s.pos.x + rand(-s.radius, s.radius),
                  s.pos.y + rand(2, 12),
                  s.pos.z + rand(-s.radius, s.radius),
                );
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
              // Alev menzili 70; kule 320'den atınca oyuncu karşılık veremeden
              // tüm yaklaşmayı ateş altında geçiyordu.
              if (s.cool <= 0 && s.pos.distanceTo(dragon.root.position) < 150) {
                s.cool = 3;
                const m = new THREE.Mesh(shotGeo, shotMat);
                m.position.copy(s.pos).setY(s.pos.y + 22);
                scene.add(m);
                shots.push({ mesh: m, vel: aimAtDragon(m.position, 85), life: 6 });
              }
            }
          }

          state.comboT -= dt;
          if (state.comboT <= 0) state.combo = 1;

          // ---- airships ----
          for (const z of airships) {
            if (z.dead) continue;
            if (z.burn > 0) {
              z.hp -= z.burn * 30 * dt;
              z.hullMat.color.copy(z.hullColor).lerp(burnColor, Math.min(1, z.burn * 1.4));
              z.hullMat.emissive.set(0xff4000);
              z.hullMat.emissiveIntensity = z.burn * 1.8 + Math.random() * 0.5;
              if (Math.random() < z.burn * 0.55) {
                tmp.set(
                  z.group.position.x + rand(-5, 5),
                  z.group.position.y + rand(0, 9),
                  z.group.position.z + rand(-5, 5),
                );
                burst(tmp, 1, 5);
              }
              // yanınca alçalır
              z.group.position.y -= z.burn * 7 * dt;
            } else {
              // Kare hızından bağımsız sönümleme
              z.hullMat.emissiveIntensity *= Math.max(0, 1 - 9 * dt);
            }
            z.group.position.y += Math.sin(now * 0.0004 + z.group.position.x) * 4 * dt;
            if (z.burn < 0.3) {
              z.group.position.addScaledVector(z.dir, 12 * dt);
              if (Math.hypot(z.group.position.x, z.group.position.z) > WORLD * 0.85) {
                z.dir.set(-z.group.position.x, 0, -z.group.position.z).normalize();
              }
              z.group.lookAt(tmp2.copy(z.group.position).add(z.dir));
              z.group.rotateY(Math.PI);
            }
            for (const p of z.props) p.rotation.z += dt * 9;
            z.cool -= dt;
            if (
              z.burn < 0.15 &&
              z.cool <= 0 &&
              z.group.position.distanceTo(dragon.root.position) < 220
            ) {
              z.cool = 1.6;
              const m = new THREE.Mesh(shotGeo, shotMat);
              m.position.copy(z.group.position).setY(z.group.position.y - 6);
              scene.add(m);
              shots.push({ mesh: m, vel: aimAtDragon(m.position, 100), life: 6 });
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

        // ---- ateş ışığı havuzu: en yakın yanan hedeflere atanır ----
        lightT -= dt;
        if (lightT <= 0) {
          lightT = 0.25;
          burning.length = 0;
          for (const s of structures) if (!s.dead && s.burn > 0.04) burning.push(s);
          for (const z of airships) if (!z.dead && z.burn > 0.04) burning.push(z);
          const dp = dragon.root.position;
          burning.sort((a, b) => a.pos.distanceToSquared(dp) - b.pos.distanceToSquared(dp));
          for (let i = 0; i < FIRE_LIGHTS; i++) lightSrc[i] = burning[i] ?? null;
        }
        for (let i = 0; i < FIRE_LIGHTS; i++) {
          const src = lightSrc[i];
          const l = firePool[i]!;
          if (!src || src.dead) {
            l.intensity = Math.max(0, l.intensity - 200 * dt);
            continue;
          }
          l.position.set(src.pos.x, src.pos.y + src.lightY, src.pos.z);
          l.intensity = 20 + src.burn * 52 + Math.sin(now * 0.011 + src.pos.x) * 10;
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

        // fire jet particles update (rise, turbulence, color fade)
        for (let i = 0; i < FM; i++) {
          if (fpLife[i]! <= 0) continue;
          fpLife[i] = fpLife[i]! - dt;
          const i3 = i * 3;
          fpVel[i3 + 1] = fpVel[i3 + 1]! + 14 * dt;
          const drag = Math.max(0, 1 - 1.2 * dt);
          fpVel[i3] = fpVel[i3]! * drag;
          fpVel[i3 + 1] = fpVel[i3 + 1]! * drag;
          fpVel[i3 + 2] = fpVel[i3 + 2]! * drag;
          fpVel[i3] = fpVel[i3]! + Math.sin(now * 0.02 + i) * 10 * dt;
          fpPos[i3] = fpPos[i3]! + fpVel[i3]! * dt;
          fpPos[i3 + 1] = fpPos[i3 + 1]! + fpVel[i3 + 1]! * dt;
          fpPos[i3 + 2] = fpPos[i3 + 2]! + fpVel[i3 + 2]! * dt;
          const age = 1 - Math.max(0, fpLife[i]!) / Math.max(1e-5, fpMax[i]!);
          if (age < 0.25) fpColTmp.lerpColors(fpA, fpB, age / 0.25);
          else if (age < 0.6) fpColTmp.lerpColors(fpB, fpC, (age - 0.25) / 0.35);
          else fpColTmp.lerpColors(fpC, fpD, Math.min(1, (age - 0.6) / 0.4));
          fpCol[i3] = fpColTmp.r;
          fpCol[i3 + 1] = fpColTmp.g;
          fpCol[i3 + 2] = fpColTmp.b;
          if (fpLife[i]! <= 0) fpPos[i3 + 1] = -9999;
        }
        (fpGeo.attributes["position"] as THREE.BufferAttribute).needsUpdate = true;
        (fpGeo.attributes["color"] as THREE.BufferAttribute).needsUpdate = true;

        // ash drift follows dragon
        ash.position.x = dragon.root.position.x;
        ash.position.z = dragon.root.position.z;
        ash.rotation.y += dt * 0.01;

        sun.position.copy(dragon.root.position).add(SUN_OFFSET);
        sun.target.position.copy(dragon.root.position);
        sky.position.copy(dragon.root.position);

        // ---- fixed 2.5D camera (behind-above, locked orientation) ----
        const back = state.status === "playing" ? 34 + state.speed * 0.16 : 40;
        fill.position.copy(camera.position);
        camGoal.set(0, 14, -back).add(dragon.root.position);
        camPos.copy(camera.position).lerp(camGoal, Math.min(1, dt * 4.2));
        // kamerayı arazinin altına sokma
        camPos.y = Math.max(terrainHeight(camPos.x, camPos.z) + 8, camPos.y);
        camera.position.copy(camPos);
        lookGoal.copy(dragon.root.position).addScaledVector(fwd, 26);
        lookGoal.y += 3;
        camera.lookAt(lookGoal);

        renderer.render(scene, camera);

        pushT += dt;
        if (pushT > 0.2) {
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
          // Değişmediyse React'i boşuna çalıştırma
          const p = lastPush;
          if (
            !p ||
            p.score !== snap.score ||
            p.hp !== snap.hp ||
            p.heat !== snap.heat ||
            p.stamina !== snap.stamina ||
            p.destroyed !== snap.destroyed ||
            p.combo !== snap.combo ||
            p.status !== snap.status
          ) {
            lastPush = snap;
            setStats(snap);
            statsRef.current(snap);
          }
        }
      };

      await step(88, "Gölgeler derleniyor");
      if (cancelled) return;

      // Shader'lar ilk çizimde tembel derlenir; bunu yükleme ekranına
      // alıyoruz, yoksa oyun başlar başlamaz saniyelerce takılıyordu.
      camera.position.set(0, 104, 180);
      camera.lookAt(dragon.root.position);
      if (typeof renderer.compileAsync === "function") {
        await renderer.compileAsync(scene, camera);
      } else {
        renderer.compile(scene, camera);
      }
      if (cancelled) return;

      await step(96, "Isınma karesi");
      if (cancelled) return;
      renderer.render(scene, camera);

      await step(100, "Hazır");
      if (cancelled) return;

      setReady(true);
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    void build();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      for (const c of cleanups) c();
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

      {/* Yükleme ekranı — sahne kurulup shader'lar derlenene kadar */}
      {!ready && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-background">
          <p className="font-display text-2xl font-black uppercase tracking-[0.35em] text-primary">
            Era of Pyre
          </p>
          <div className="h-1 w-56 overflow-hidden rounded-full bg-foreground/15">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {loadLabel} · %{progress}
          </p>
        </div>
      )}

      {/* Top-left minimal bars */}
      <div className="pointer-events-none absolute left-4 top-4 w-32 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-8 text-[10px] uppercase tracking-widest text-foreground/70">HP</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/70">
            <div
              className="h-full rounded-full bg-destructive transition-all"
              style={{ width: pct(s?.hp ?? 100) }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-[10px] uppercase tracking-widest text-foreground/70">STM</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/70">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: pct(s?.stamina ?? 100) }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-[10px] uppercase tracking-widest text-foreground/70">HEAT</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/70">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: pct(s?.heat ?? 0) }}
            />
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
          className="rounded-md border border-foreground/25 bg-background/70 px-2 py-1 text-[10px] uppercase tracking-widest text-foreground/80 active:bg-foreground/20"
        >
          {QUALITY_PRESETS[quality].label} · {fps} FPS
        </button>
        {showSettings && (
          <div className="w-44 space-y-3 rounded-lg border border-foreground/20 bg-background/90 p-3">
            <div>
              <p className="mb-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                Grafik Kalitesi
              </p>
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
              <p className="mb-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                FPS Hedefi
              </p>
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
              Kare hızı hedefin altına düşerse çözünürlük otomatik kısılır.
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
        className="absolute bottom-8 left-6 h-32 w-32 touch-none rounded-full border border-foreground/20 bg-foreground/5"
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
        <button
          {...hold("shock")}
          className="h-16 w-16 touch-none rounded-full border border-accent/50 bg-accent/15 text-[10px] font-bold uppercase tracking-widest text-accent active:bg-accent/40"
        >
          Şok
        </button>
        <button
          {...hold("fire")}
          className="h-24 w-24 touch-none rounded-full border-2 border-primary/70 bg-primary/25 text-xs font-black uppercase tracking-widest text-primary active:bg-primary/50"
        >
          Alev
        </button>
      </div>

      {/* End screen */}
      {s && s.status !== "playing" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/90">
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
