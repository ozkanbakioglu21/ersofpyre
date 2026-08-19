import * as THREE from "three";
import { createAirship, refreshWeakPoints } from "./airships";
import type { AudioEngine } from "./audio";
import { createCity, cityFlattenMod, type CityHandle } from "./city";
import {
  addCombo,
  BREATH,
  damageTarget,
  explode,
  FIREBALL_BLAST,
  killAirship,
  resetSpread,
  updateBreath,
  updateBurning,
  updateFireSpread,
} from "./combat";
import { createDragon } from "./dragon";
import {
  createSearchlightRig,
  createTeslaRig,
  createWasp,
  resetEnemyIds,
  SEARCHLIGHT_HALF_ANGLE,
  SEARCHLIGHT_RANGE,
  TESLA_RANGE,
  updateTeslaArc,
  type SearchlightRig,
  type TeslaRig,
} from "./enemies";
import { createFireLights } from "./firelights";
import { createFx, type FxSystem } from "./fx";
import { createGrid, type Grid } from "./grid";
import {
  FLIGHT,
  shake,
  tryRoll,
  updateCamera,
  updateFlight,
  createFlightAxes,
  type RollState,
  type FlightAxes,
} from "./flight";
import {
  createInfinitePath,
  initInfinitePath,
  updateInfinitePath,
  type InfinitePath,
} from "./infinitePath";
import {
  createFireballPool,
  createShotPool,
  FIREBALL,
  launchElevation,
  type FireballPool,
  type ShotPool,
} from "./projectiles";
import {
  ASH_MAX,
  FIRE_LIGHTS,
  QUALITY_PRESETS,
  type FpsTarget,
  type QualityLevel,
} from "./quality";
import { mulberry32 } from "./rng";
import { bondBuffs, type BondBuffs, type SaveData } from "./save";
import { createMission, type MissionRuntime } from "./story/mission";
import {
  createFlagshipSilhouette,
  createGateRing,
  createStructure,
  resetTargetIds,
} from "./structures";
import type { ChapterDef } from "./story/types";
import type {
  Airship,
  Ctrl,
  Enemy,
  HudFrame,
  HudSnapshot,
  Marker,
  MissionResult,
  RunState,
  Target,
} from "./types";
import { MARKER_POOL } from "./types";
import { createAsh, createTerrain, setTerrainMods, terrainHeight } from "./world";

/**
 * Oyun çekirdeği.
 *
 * React'in bildiği tek şey burası: `createGame()` sahneyi kurar, döngüyü
 * çalıştırır ve iki kanaldan dışarı konuşur — 5 Hz'te dirty-check'li
 * anlık görüntü (React state) ve 60 Hz'te doğrudan DOM'a boyanan kare
 * verisi (React'e hiç uğramaz).
 */

export type Game = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  fog: THREE.FogExp2;
  sun: THREE.DirectionalLight;
  fill: THREE.PointLight;
  sky: THREE.Mesh;
  ash: THREE.Points;

  dragon: ReturnType<typeof createDragon>;
  city: CityHandle | null;
  targets: Target[];
  towers: Target[];
  burning: Target[];
  airships: Airship[];
  enemies: Enemy[];
  grid: Grid<Target>;

  fx: FxSystem;
  shots: ShotPool;
  fireballs: FireballPool;

  mission: MissionRuntime;
  audio: AudioEngine;
  state: RunState;
  ctrl: Ctrl;
  buffs: BondBuffs;
  abilities: ChapterDef["abilities"];

  fwd: THREE.Vector3;
  vel: THREE.Vector3;
  dive: number;
  /** Fren bu karede gerçekten uygulandı mı (stamina/takla kapısından geçti). */
  braking: boolean;
  roll: RollState;
  worldRadius: number;
  streetAt(x: number, z: number): boolean;
  autoForward: boolean;
  infinite: InfinitePath | null;
  flightAxes: FlightAxes;
  fireT: number;

  timeScale: number;
  paused: boolean;
};

export type GameCommand =
  { t: "pause" } | { t: "resume" } | { t: "skipLine" } | { t: "applyQuality" } | { t: "abort" };

export type HudBridgeLike = {
  frame: HudFrame;
  push(s: HudSnapshot): void;
  paint(): void;
};

export type CreateGameOpts = {
  mount: HTMLElement;
  renderer: THREE.WebGLRenderer;
  chapter: ChapterDef;
  save: SaveData;
  ctrl: { current: Ctrl };
  settings: { current: { quality: QualityLevel; fps: FpsTarget } };
  bridge: HudBridgeLike;
  audio: AudioEngine;
  onProgress: (pct: number, label: string) => void;
  onReady: () => void;
  onResult: (r: MissionResult) => void;
};

export type GameHandle = { cmd(c: GameCommand): void; dispose(): void };

/** origin/main'in sis inceltmesi — üç ayar yolunda da aynı kalmalı. */
const FOG_SCALE = 0.8;
const SUN_OFFSET = new THREE.Vector3(-180, 110, -140);
const FWD = new THREE.Vector3(0, 0, 1);

type Gate = { pos: THREE.Vector3; radius: number; passed: boolean; group: THREE.Group };
type Zone = { id: string; pos: THREE.Vector3; r: number; entered: boolean };

export async function createGame(o: CreateGameOpts): Promise<GameHandle | null> {
  const { mount, renderer, chapter, ctrl, settings, bridge, audio } = o;
  let cancelled = false;
  let raf = 0;
  const cleanups: Array<() => void> = [];
  let preset = QUALITY_PRESETS[settings.current.quality];

  const yieldFrame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
  const step = async (p: number, label: string) => {
    o.onProgress(p, label);
    await yieldFrame();
  };

  /* ---------------- renderer ---------------- */
  let resScale = 1;
  const applyPixelRatio = () =>
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio) * resScale);
  applyPixelRatio();
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  if (renderer.domElement.parentElement !== mount) mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a2828);
  const fogScale = chapter.world.fogScale ?? 1;
  const fog = new THREE.FogExp2(0x5a3838, preset.fogDensity * fogScale * FOG_SCALE);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(66, mount.clientWidth / mount.clientHeight, 0.5, 2400);

  /* ---------------- ışıklar ----------------
   * Sahnedeki ışık SAYISI derlemeden sonra asla değişmez (bkz. quality.ts).
   * Hepsi burada doğuyor, kullanılmayan yoğunluğu 0'da bekliyor.
   */
  // Yoğunluklar three.js'in fiziksel birimlerine göre: dağınık BRDF ışınımı
  // 1/PI ile ölçekliyor, yani albedosu %3 civarında olan bu kül paletinin
  // okunabilmesi için toplam ışınımın PI mertebesinde olması gerekiyor.
  // Renkler origin/main'in şafak paletinden, şiddetler fiziksel ölçekten.
  scene.add(new THREE.HemisphereLight(0xb08868, 0x3a2020, 2.3));
  // Kameraya bağlı dolgu. decay=2 fiziksel sönüm demek: eski 3.6'lık değer
  // 40 birim uzakta 3.6/1600 ≈ 0.002 ışınım üretiyordu, yani hiç yoktu.
  const fill = new THREE.PointLight(0xff9070, 600, 220, 2);
  scene.add(fill);
  const sun = new THREE.DirectionalLight(0xffb070, 4.6);
  sun.position.copy(SUN_OFFSET);
  sun.castShadow = true;
  sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  sun.shadow.camera.far = 600;
  scene.add(sun, sun.target);

  await step(6, "Kül perdesi aralanıyor");
  if (cancelled) return null;

  /* ---------------- gökyüzü ---------------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1600, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      // Renkler SAHNE-LİNEER uzayda; sahnenin geri kalanıyla aynı işlemden
      // geçmeleri için tonemapping ve çıkış renk uzayı yamalarını dahil
      // etmek ZORUNLU. Bunlar olmadan gökyüzü ton eşlemesini atlayıp ham
      // lineer değerle sRGB tampona yazılıyor: yeşil/mavi kanal ezilip
      // ufuk kıpkırmızı bir perdeye dönüşüyordu.
      fragmentShader: `varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 low = vec3(0.46,0.16,0.06);
        vec3 mid = vec3(0.13,0.09,0.09);
        vec3 top = vec3(0.035,0.035,0.055);
        vec3 c = mix(low, mid, smoothstep(-0.15,0.25,h));
        c = mix(c, top, smoothstep(0.2,0.85,h));
        gl_FragColor = vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  scene.add(sky);

  /* ---------------- arazi ---------------- */
  const worldRadius = chapter.world.radius;
  const terrainMods = [...(chapter.world.terrain ?? [])];
  if (chapter.world.city) terrainMods.push(cityFlattenMod(chapter.world.city));
  setTerrainMods(terrainMods);
  cleanups.push(() => setTerrainMods([]));

  const isInfinite = chapter.world.mode === "infinite";
  scene.add(createTerrain(isInfinite ? 20000 : worldRadius * 2.4, isInfinite ? 140 : 72));
  const ash = createAsh(ASH_MAX, worldRadius);
  ash.geometry.setDrawRange(0, preset.ashCount);
  scene.add(ash);

  await step(16, "Arazi şekilleniyor");
  if (cancelled) return null;

  /* ---------------- hedefler ---------------- */
  resetTargetIds();
  resetEnemyIds();
  resetSpread();
  const rng = mulberry32(chapter.world.city?.seed ?? 1337);
  const targets: Target[] = [];
  let idCounter = 1;
  const nextId = () => idCounter++;

  let city: CityHandle | null = null;
  if (chapter.world.city) {
    city = await createCity(chapter.world.city, step, 20, 62, () => cancelled, nextId);
    if (cancelled || !city) return null;
    scene.add(city.group);
    targets.push(...city.targets);
  }

  const scatter = chapter.world.scatter;
  if (scatter) {
    const entries = Object.entries(scatter) as [Target["kind"], number][];
    let made = 0;
    const total = entries.reduce((a, [, n]) => a + n, 0);
    for (const [kind, count] of entries) {
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * worldRadius * 0.72 + 60;
        const { target, group } = createStructure(kind, Math.cos(a) * r, Math.sin(a) * r, rng);
        target.id = nextId();
        targets.push(target);
        scene.add(group);
        made++;
        if (made % 20 === 0) {
          await step(62 + Math.round((made / Math.max(1, total)) * 8), "Köyler kuruluyor");
          if (cancelled) return null;
        }
      }
    }
  }

  /* ---------------- proplar ---------------- */
  const gates: Gate[] = [];
  const revealables = new Map<string, THREE.Object3D>();
  for (const p of chapter.world.props ?? []) {
    if (p.t === "gate") {
      const g = createGateRing(p.x, p.y, p.z, p.radius);
      scene.add(g);
      gates.push({
        pos: new THREE.Vector3(p.x, p.y, p.z),
        radius: p.radius,
        passed: false,
        group: g,
      });
    } else if (p.t === "structure") {
      const { target, group } = createStructure(p.kind, p.x, p.z, rng, p.scale);
      target.id = nextId();
      targets.push(target);
      scene.add(group);
    } else {
      const f = createFlagshipSilhouette();
      f.position.set(p.x, p.y, p.z);
      f.visible = !p.hidden;
      scene.add(f);
      revealables.set("flagship", f);
    }
  }

  const zones: Zone[] = (chapter.world.zones ?? []).map((z) => ({
    id: z.id,
    pos: new THREE.Vector3(z.x, 0, z.z),
    r: z.r,
    entered: false,
  }));

  await step(72, "Zeplin filosu geliyor");
  if (cancelled) return null;

  /* ---------------- zeplinler ---------------- */
  const airships: Airship[] = [];
  for (const s of chapter.world.airships ?? []) {
    const ship = createAirship(s.x, s.y, s.z, rng, {
      role: s.role,
      ...(s.id ? { id: s.id } : {}),
      ...(s.weakPoints !== undefined ? { weakPoints: s.weakPoints } : {}),
    });
    airships.push(ship);
    scene.add(ship.group);
  }

  /* ---------------- ejderha ---------------- */
  const dragon = createDragon();
  const start = chapter.world.start ?? { x: 0, y: 90, z: 220 };
  dragon.root.position.set(start.x, start.y, start.z);
  scene.add(dragon.root);

  await step(80, "Pyra uyanıyor");
  if (cancelled) return null;

  /* ---------------- alev donanımı ---------------- */
  /**
   * Alev konisi.
   *
   * Üç şey birden yanlıştı ve üçü de "alev görünmüyor" olarak çıkıyordu:
   *
   *  - Koni ejderhanın 26 birim ÖNÜNDE, kök yüksekliğinde duruyordu; ağız
   *    ise 5 birim önde ve 3 birim aşağıda. Arada ~20 birimlik boşluk vardı,
   *    alev ağızdan çıkmıyor havada asılı duruyordu.
   *  - Koninin geniş ucu ağızda, sivri ucu ileridedeydi — jet değil mızrak.
   *  - Boy animasyonu `scale.z`'ye yazıyordu; ama geometri yerel +Y boyunca
   *    uzanıyor, Z ise YARIÇAP ekseni. Yani alev hiç uzayıp kısalmıyor,
   *    sadece şişip iniyordu.
   *
   * Şimdi: tepe noktası ağızda, ileri doğru açılıyor, boy `scale.y` ile
   * nefesle birlikte uzuyor.
   */
  const mkFlame = (color: number, r: number, h: number, seg: number) => {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const geo = new THREE.ConeGeometry(r, h, seg, 1, true);
    // Tepe noktasını başlangıca al: rotateX ile ucu -Y'ye çevirip yukarı ötele.
    geo.rotateX(Math.PI);
    geo.translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    // Yerel +Y (koninin boyu) ejderhanın ileri yönü olan +Z'ye bakıyor.
    mesh.rotation.x = Math.PI / 2;
    return { mesh, mat };
  };
  // Boylar BREATH.range (70) ile aynı mertebede: gördüğün alev yaktığın alan.
  const flameOuter = mkFlame(0xff7a1a, 10, 64, 14);
  const flameMid = mkFlame(0xffc83c, 6.4, 58, 12);
  const flameCore = mkFlame(0xfff6d0, 3.2, 50, 10);
  const flameRig = new THREE.Group();
  flameRig.add(flameOuter.mesh, flameMid.mesh, flameCore.mesh);
  // Hafif aşağı eğim. İki işe yarıyor: takip kamerası tam arkadan baktığı
  // için düz ileri giden koni eksenden görülüyor ve jet yerine leke gibi
  // duruyordu; ayrıca yaktığın şey zaten altındaki şehir. Eğim hasar
  // konisinin yarı açısının (~31°) çok içinde, nişan kaymıyor.
  flameRig.rotation.x = 0.2;
  dragon.root.add(flameRig);
  /** Ağzın kök uzayındaki yeri — her karede güncelleniyor, kafa oynuyor. */
  const flameAnchor = new THREE.Vector3();
  const flameLight = new THREE.PointLight(0xff7a1a, 0, 55, 2);
  flameLight.position.set(0, 0.4, 3);
  dragon.root.add(flameLight);

  /* ---------------- havuzlar ---------------- */
  const fx = createFx(scene);
  const shots = createShotPool(scene);
  const fireballs = createFireballPool(scene);
  const fireLights = createFireLights(scene);

  // Kule donanımları: ışıldak konisi ve tesla yayı. SpotLight kullanılmıyor —
  // ışık sayısı değişimi tüm shader'ları yeniden derletir.
  const searchlights: { t: Target; rig: SearchlightRig }[] = [];
  const teslas: { t: Target; rig: TeslaRig }[] = [];
  const towers: Target[] = [];
  for (const t of targets) {
    if (t.kind !== "tower" || !t.tower) continue;
    towers.push(t);
    if (t.tower === "isildak") {
      const rig = createSearchlightRig(t.height);
      rig.group.position.set(t.pos.x, t.pos.y, t.pos.z);
      scene.add(rig.group);
      t.rig = rig.group;
      searchlights.push({ t, rig });
    } else if (t.tower === "tesla") {
      const rig = createTeslaRig(t.height);
      rig.group.position.set(t.pos.x, t.pos.y, t.pos.z);
      scene.add(rig.group);
      t.rig = rig.group;
      teslas.push({ t, rig });
    }
  }

  /* ---------------- uzamsal ızgara ---------------- */
  const grid = createGrid<Target>(26);
  for (const t of targets) grid.insert(t, t.pos.x, t.pos.z);

  /* ---------------- durum ---------------- */
  const buffs = bondBuffs(o.save.bond);
  const state: RunState = {
    hp: buffs.maxHp,
    maxHp: buffs.maxHp,
    heat: 0,
    maxHeat: buffs.maxHeat,
    overheat: 0,
    stamina: 100,
    invuln: 0,
    shockCd: 0,
    fireballCd: 0,
    rollCd: 0,
    speed: FLIGHT.baseSpeed,
    combo: 1,
    comboT: 0,
    bestCombo: 1,
    score: 0,
    embers: 0,
    destroyed: 0,
    totalTargets: targets.length + airships.length,
    rage: 0,
    rageT: 0,
    emberRush: 0,
    perfectDodges: 0,
    snared: 0,
    marked: 0,
    threatT: -1,
    flap: 0,
    shakeT: 0,
    shakeAmp: 0,
    hitFlash: 0,
    wind: new THREE.Vector2(
      Math.cos(chapter.world.wind.dir) * chapter.world.wind.strength,
      Math.sin(chapter.world.wind.dir) * chapter.world.wind.strength,
    ),
    time: 0,
    status: "playing",
  };

  let finished = false;
  let musicStarted = false;
  let slowmoT = 0;

  const g: Game = {
    scene,
    camera,
    renderer,
    fog,
    sun,
    fill,
    sky,
    ash,
    dragon,
    city,
    targets,
    towers,
    burning: [],
    airships,
    enemies: [],
    grid,
    fx,
    shots,
    fireballs,
    mission: null as unknown as MissionRuntime,
    audio,
    state,
    ctrl: ctrl.current,
    buffs,
    abilities: { ...chapter.abilities },
    fwd: FWD.clone(),
    vel: new THREE.Vector3(),
    dive: 0,
    braking: false,
    roll: null,
    worldRadius,
    streetAt: city ? (x, z) => city!.streetAt(x, z) : () => false,
    autoForward: isInfinite,
    infinite: null,
    flightAxes: createFlightAxes(),
    fireT: 0,
    timeScale: 1,
    paused: false,
  };

  /* ---------------- sonsuz yol ---------------- */
  if (isInfinite) {
    const inf = createInfinitePath(chapter.world.city?.seed ?? 1337);
    g.infinite = inf;
    initInfinitePath(g, inf);
  }

  /* ---------------- görev ---------------- */
  const spawnWave = (name: string) => {
    const w = chapter.world.waves?.[name];
    if (!w) return;
    for (let i = 0; i < w.count; i++) {
      const a = rng() * Math.PI * 2;
      const x = dragon.root.position.x + Math.cos(a) * w.radius;
      const z = dragon.root.position.z + Math.sin(a) * w.radius;
      const y = rng.range(w.altitude[0], w.altitude[1]);
      const e = createWasp(x, y, z, rng);
      g.enemies.push(e);
      scene.add(e.group);
    }
    audio.lockOn();
  };

  const result = (): MissionResult => ({
    outcome: state.status === "won" ? "won" : "lost",
    score: Math.round(state.score),
    embers: Math.round(state.embers),
    destroyed: state.destroyed,
    total: state.totalTargets,
    destroyPct: state.totalTargets ? state.destroyed / state.totalTargets : 0,
    bestCombo: state.bestCombo,
    perfectDodges: state.perfectDodges,
    time: state.time,
    objectives: g.mission.objectives.map((x) => ({ ...x })),
  });

  g.mission = createMission(chapter, {
    spawnWave,
    setWind: (dir, strength) => {
      state.wind.set(Math.cos(dir) * strength, Math.sin(dir) * strength);
    },
    slowmo: (scale, dur) => {
      g.timeScale = scale;
      slowmoT = dur;
    },
    shake: (amp) => shake(g, amp * 2),
    unlockAbility: (a) => {
      g.abilities[a] = true;
    },
    reveal: (prop) => {
      const obj = revealables.get(prop);
      if (obj) obj.visible = true;
    },
    roar: () => audio.roar(),
    readStat: (key) => {
      switch (key) {
        case "hp":
          return state.hp;
        case "heat":
          return state.heat;
        case "combo":
          return state.combo;
        case "destroyed":
          return state.destroyed;
        case "destroyPct":
          return state.totalTargets ? state.destroyed / state.totalTargets : 0;
        case "rage":
          return state.rage;
        case "time":
          return state.time;
      }
    },
    zoneDist: (id) => {
      const z = zones.find((x) => x.id === id);
      if (!z) return Infinity;
      const dx = dragon.root.position.x - z.pos.x;
      const dz = dragon.root.position.z - z.pos.z;
      return Math.hypot(dx, dz);
    },
    zoneRadius: (id) => zones.find((x) => x.id === id)?.r ?? 0,
    onEnd: (outcome) => {
      if (finished) return;
      finished = true;
      state.status = outcome;
      audio.flame(false);
      audio.siren(false);
      audio.music(false);
      if (outcome === "won") audio.win();
      else audio.lose();
      o.onResult(result());
    },
    onLine: () => {},
  });

  /* ---------------- pencere olayları ---------------- */
  const resize = () => {
    if (!mount.clientWidth) return;
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
  };
  window.addEventListener("resize", resize);
  cleanups.push(() => window.removeEventListener("resize", resize));

  /**
   * Gölge haritasını aç/kapat.
   *
   * `renderer.shadowMap.enabled` program önbellek anahtarının parçası
   * (WebGLPrograms: shadowMapEnabled), ama three bunun değiştiğini
   * KENDİLİĞİNDEN fark etmiyor — `setProgram()` içindeki needsProgramChange
   * zincirinde bu bayrağın kontrolü yok. Bayrak çevrildiğinde eski program
   * gölge örnekleyicisini (sampler2DShadow) bildirmeye devam ediyor ama
   * arkasında geçerli derinlik dokusu kalmıyor; sürücü çizimi
   * "GL_INVALID_OPERATION: Mismatch between texture format and sampler type"
   * ile düşürüyor ve nesne ekrandan tamamen kayboluyor.
   *
   * Bu yüzden bayrağı her çevirişte sahnedeki materyalleri yeniden
   * derletiyoruz. Nadir bir işlem, maliyeti önemsiz.
   */
  const setShadowsEnabled = (on: boolean) => {
    if (renderer.shadowMap.enabled === on && sun.castShadow === on) return;
    renderer.shadowMap.enabled = on;
    renderer.shadowMap.needsUpdate = on;
    sun.castShadow = on;
    scene.traverse((obj) => {
      const m = (obj as THREE.Mesh).material;
      if (!m) return;
      if (Array.isArray(m)) for (const x of m) x.needsUpdate = true;
      else m.needsUpdate = true;
    });
  };

  const applyQuality = () => {
    preset = QUALITY_PRESETS[settings.current.quality];
    resScale = 1;
    applyPixelRatio();
    sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    setShadowsEnabled(preset.shadows);
    fog.density = preset.fogDensity * fogScale * FOG_SCALE;
    ash.geometry.setDrawRange(0, preset.ashCount);
    const am = ash.material as THREE.PointsMaterial;
    am.size = preset.ashSize;
    am.opacity = preset.ashOpacity;
    fx.setDensity(settings.current.quality === "low" ? 0.5 : 1);
  };
  applyQuality();

  /* ---------------- döngü değişkenleri ---------------- */
  const headPos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let last = performance.now();
  let pushT = 0;
  let frames = 0;
  let fpsT = 0;
  let measuredFps = 0;
  let slowSamples = 0;
  let fastSamples = 0;
  let burnT = 0;
  let markerT = 0;
  let shadowsDropped = false;
  let firedOnce = false;
  let lastPush: HudSnapshot | null = null;

  const markers = bridge.frame.markers;

  /* ---------------- hedef işaretçileri ----------------
   * Dünya çok büyük ve sis mesafeyi kesiyor; işaretçi olmadan hedef bulmak
   * bir keşif oyununa dönüşüyordu. Seçim 5 Hz, çizim 60 Hz.
   */
  type MarkSrc = { pos: THREE.Vector3; kind: Marker["kind"]; hp01: number };
  const picks: MarkSrc[] = [];

  const selectMarkers = () => {
    picks.length = 0;
    const dp = dragon.root.position;

    for (const gt of gates) {
      if (!gt.passed) picks.push({ pos: gt.pos, kind: "objective", hp01: 1 });
    }
    for (const z of zones) {
      if (!z.entered) {
        tmp2.set(z.pos.x, terrainHeight(z.pos.x, z.pos.z) + 60, z.pos.z);
        picks.push({ pos: tmp2.clone(), kind: "objective", hp01: 1 });
      }
    }
    for (const s of g.airships) {
      if (s.dead) continue;
      for (const wp of s.weakPoints) {
        if (!wp.dead) picks.push({ pos: wp.world, kind: "weakpoint", hp01: wp.hp / wp.maxHp });
      }
      if (s.role === "frigate") picks.push({ pos: s.pos, kind: "objective", hp01: s.hp / s.maxHp });
    }

    // Görev türüne göre öncelikli hedef cinsleri.
    const wanted = new Set<Target["kind"]>();
    for (const ob of chapter.objectives) {
      if (ob.type === "destroyKind") wanted.add(ob.kind);
    }
    const near: Target[] = [];
    grid.query(dp.x, dp.z, 420, near);
    near.sort((a, b) => a.pos.distanceToSquared(dp) - b.pos.distanceToSquared(dp));
    let optional = 0;
    for (const t of near) {
      if (t.dead) continue;
      if (wanted.has(t.kind)) {
        picks.push({ pos: t.pos, kind: "objective", hp01: t.hp / t.maxHp });
      } else if (t.tower && optional < 3) {
        picks.push({ pos: t.pos, kind: "threat", hp01: t.hp / t.maxHp });
        optional++;
      }
      if (picks.length >= MARKER_POOL) break;
    }
    // Görev cinsi olmayan bölümlerde en yakın birkaç hedefi işaretle.
    if (!wanted.size) {
      for (const t of near) {
        if (picks.length >= MARKER_POOL) break;
        if (!t.dead && !t.tower) picks.push({ pos: t.pos, kind: "optional", hp01: t.hp / t.maxHp });
      }
    }
    for (const e of g.enemies) {
      if (picks.length >= MARKER_POOL) break;
      if (!e.dead) picks.push({ pos: e.pos, kind: "threat", hp01: e.hp / e.maxHp });
    }
  };

  const paintMarkers = () => {
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    const pad = 46;
    const dp = dragon.root.position;
    for (let i = 0; i < MARKER_POOL; i++) {
      const m = markers[i]!;
      const src = picks[i];
      if (!src) {
        m.active = false;
        continue;
      }
      m.active = true;
      m.kind = src.kind;
      m.hp01 = src.hp01;
      m.dist = src.pos.distanceTo(dp);
      projected.copy(src.pos).project(camera);
      const behind = projected.z > 1;
      let sx = (projected.x * 0.5 + 0.5) * w;
      let sy = (-projected.y * 0.5 + 0.5) * h;
      const on = !behind && sx > pad && sx < w - pad && sy > pad && sy < h - pad;
      m.onScreen = on;
      if (on) {
        m.x = sx;
        m.y = sy;
        m.angle = 0;
      } else {
        // Ekran dışı: merkezden hedefe doğru bir ışın çizip kenara kelepçele.
        if (behind) {
          sx = w - sx;
          sy = h - sy;
        }
        const cx = w / 2;
        const cy = h / 2;
        let dx = sx - cx;
        let dy = sy - cy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const maxX = (w / 2 - pad) / Math.max(1e-3, Math.abs(dx));
        const maxY = (h / 2 - pad) / Math.max(1e-3, Math.abs(dy));
        const t = Math.min(maxX, maxY);
        m.x = cx + dx * t;
        m.y = cy + dy * t;
        m.angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      }
    }
  };

  /* ---------------- ana döngü ---------------- */
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const cap = settings.current.fps;
    const elapsed = (now - last) / 1000;
    if (cap > 0 && elapsed < 1 / cap - 0.002) return;
    const rawDt = Math.min(0.05, elapsed);
    last = now;

    frames++;
    fpsT += rawDt;
    if (fpsT >= 0.5) {
      measuredFps = Math.round(frames / fpsT);
      frames = 0;
      fpsT = 0;
      // ---- uyarlanabilir kalite ----
      // Önce gölgeleri düşürüyoruz, sonra çözünürlüğü: yoğun şehirde gölge
      // geçişi tek en pahalı iş ve görsel kaybı çözünürlükten daha az.
      const targetFps = cap > 0 ? cap : 60;
      if (measuredFps < targetFps * 0.8) {
        slowSamples++;
        fastSamples = 0;
      } else if (measuredFps > targetFps * 0.95) {
        fastSamples++;
        slowSamples = 0;
      } else {
        slowSamples = 0;
        fastSamples = 0;
      }
      if (slowSamples >= 2) {
        if (!shadowsDropped && renderer.shadowMap.enabled) {
          shadowsDropped = true;
          setShadowsEnabled(false);
          slowSamples = 0;
        } else if (resScale > 0.6) {
          resScale = Math.max(0.6, resScale - 0.15);
          applyPixelRatio();
          slowSamples = 0;
        }
      } else if (fastSamples >= 8 && resScale < 1) {
        resScale = Math.min(1, resScale + 0.1);
        applyPixelRatio();
        fastSamples = 0;
      }
    }

    if (slowmoT > 0) {
      slowmoT -= rawDt;
      if (slowmoT <= 0) g.timeScale = 1;
    }
    const dt = g.paused ? 0 : rawDt * g.timeScale;
    const playing = state.status === "playing" && !g.paused;

    const c = ctrl.current;
    g.ctrl = c;

    if (playing) {
      state.time += dt;
      g.mission.update(dt);

      /* ---- uçuş ---- */
      updateFlight(g, dt);
      if (g.infinite) updateInfinitePath(g, g.infinite, dt);
      dragon.maw.getWorldPosition(headPos);

      /* ---- alev ---- */
      state.overheat = Math.max(0, state.overheat - dt);
      const firing = c.fire && g.abilities.flame && state.overheat <= 0;
      g.fireT += ((firing ? 1 : 0) - g.fireT) * Math.min(1, dt * 8);
      if (firing && !firedOnce) {
        firedOnce = true;
        g.mission.emit({ kind: "firstFlame" });
      }
      audio.flame(firing);
      if (firing) audio.tickFlame(dt);
      dragon.jaw.rotation.x = firing ? 0.45 : 0.06;
      if (firing) {
        dragon.glow.intensity = 26 + Math.sin(now * 0.03) * 8;
        flameLight.intensity = 22 + Math.random() * 24;
        const rangeK = (state.rageT > 0 ? 1.5 : 1) * (state.emberRush > 0 ? 1.2 : 1);
        const len = (0.9 + Math.random() * 0.22 + Math.sin(now * 0.05) * 0.05) * rangeK;
        flameOuter.mat.opacity = 0.42 + Math.random() * 0.18;
        flameMid.mat.opacity = 0.6 + Math.random() * 0.2;
        flameCore.mat.opacity = 0.7 + Math.random() * 0.2;
        const wOuter = 1 + Math.random() * 0.16;
        const wMid = 1 + Math.random() * 0.1;
        const wCore = 1 + Math.random() * 0.08;
        // Alev titreşimi — koniler hafifçe sağa-sola sallanır
        const sway = Math.sin(now * 0.04) * 0.08 + Math.sin(now * 0.07) * 0.04;
        flameOuter.mesh.scale.set(wOuter, len, wOuter);
        flameOuter.mesh.rotation.z = sway;
        const midLen = len * (0.8 + Math.random() * 0.2);
        flameMid.mesh.scale.set(wMid, midLen, wMid);
        flameMid.mesh.rotation.z = sway * 1.3 + Math.sin(now * 0.09) * 0.03;
        flameCore.mesh.scale.set(wCore, len * 0.72, wCore);
        flameCore.mesh.rotation.z = -sway * 0.6;
        fx.flameJet(headPos, 7, g.fwd);
        fx.ember(headPos, 3, 5);
      } else {
        dragon.glow.intensity += (0 - dragon.glow.intensity) * Math.min(1, dt * 6);
        flameLight.intensity += (0 - flameLight.intensity) * Math.min(1, dt * 10);
        flameOuter.mat.opacity += (0 - flameOuter.mat.opacity) * Math.min(1, dt * 10);
        flameMid.mat.opacity += (0 - flameMid.mat.opacity) * Math.min(1, dt * 10);
        flameCore.mat.opacity += (0 - flameCore.mat.opacity) * Math.min(1, dt * 12);
      }
      // Alev donanımını ağza kilitle: kafa uçuşta ve alev püskürtürken
      // eğiliyor, sabit bir ofset alevi gövdenin içinde ya da havada bırakıyor.
      flameAnchor.copy(headPos);
      dragon.root.worldToLocal(flameAnchor);
      flameRig.position.copy(flameAnchor);

      updateBreath(g, dt, firing, headPos);
      (dragon.maw.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.5 + state.heat * 0.06;

      /* ---- Köz Mermisi ---- */
      if (c.fireball) {
        c.fireball = false;
        if (g.abilities.fireball && state.fireballCd <= 0 && state.overheat <= 0) {
          state.fireballCd = FIREBALL.cooldown;
          if (state.rageT <= 0) state.heat = Math.min(state.maxHeat, state.heat + FIREBALL.heat);
          // Nişan yardımı: pitch etkisiyle hafif dikey kayma.
          let elev = 0.12 + g.flightAxes.pitch * 0.18;
          let aimX = 0;
          let best = Infinity;
          const near: Target[] = [];
          grid.query(headPos.x, headPos.z, 300, near);
          for (const t of near) {
            if (t.dead) continue;
            tmp.copy(t.pos).sub(headPos);
            const d = tmp.length();
            if (d > 300 || d < 12) continue;
            tmp.normalize();
            if (tmp.dot(g.fwd) < 0.82) continue;
            if (d < best) {
              best = d;
              aimX = t.pos.x - headPos.x;
              elev = launchElevation(d, FIREBALL.speed, FIREBALL.gravity);
            }
          }
          for (const s of g.airships) {
            if (s.dead) continue;
            tmp.copy(s.pos).sub(headPos);
            const d = tmp.length();
            if (d > 320 || d < 12) continue;
            tmp.normalize();
            if (tmp.dot(g.fwd) < 0.8) continue;
            if (d < best) {
              best = d;
              aimX = s.pos.x - headPos.x;
              elev = Math.atan2(s.pos.y - headPos.y, d);
            }
          }
          const vy = Math.sin(elev) * FIREBALL.speed;
          const vz = Math.cos(elev) * FIREBALL.speed;
          const vx = best < Infinity ? THREE.MathUtils.clamp(aimX * 0.35, -46, 46) : 0;
          // Hız vektörünü heading'e göre döndür.
          const h = g.flightAxes.heading;
          const cosH = Math.cos(h);
          const sinH = Math.sin(h);
          const rvx = vx * cosH + vz * sinH;
          const rvz = -vx * sinH + vz * cosH;
          fireballs.spawn(headPos, tmp.set(rvx, vy, rvz));
          audio.fireball();
          fx.ember(headPos, 8, 6);
        }
      }

      /* ---- şok ---- */
      if (c.shock) {
        c.shock = false;
        if (g.abilities.shock && state.shockCd <= 0 && state.stamina > 25) {
          state.shockCd = 5;
          state.stamina -= 25;
          fx.shock(dragon.root.position);
          explode(g, dragon.root.position, { radius: 92, damage: 110, ignite: 0.5 });
          shake(g, 0.8);
        }
      }

      /* ---- Ejderha Öfkesi ---- */
      if (c.rage) {
        c.rage = false;
        if (g.abilities.rage && state.rage >= 100 && state.rageT <= 0) {
          state.rage = 0;
          state.rageT = 12;
          audio.rage();
        }
      }
      if (state.rageT > 0) {
        state.rageT = Math.max(0, state.rageT - dt);
        fill.color.setHex(0xff7050);
        fog.density = preset.fogDensity * fogScale * 0.7;
      } else {
        fill.color.setHex(0xff9070);
        fog.density = preset.fogDensity * fogScale * FOG_SCALE;
        if (state.time > 1) state.rage = Math.max(0, state.rage - 0.5 * dt);
      }

      /* ---- alev topları ---- */
      for (const b of fireballs.balls) {
        if (!b.active) continue;
        b.vel.y += FIREBALL.gravity * dt;
        // Hava sürtünmesi — yatay hızı yavaşlatır, bomba gibi dik düşüş sağlar
        const dragFactor = 1 - FIREBALL.drag * dt;
        b.vel.x *= dragFactor;
        b.vel.z *= dragFactor;
        b.mesh.position.addScaledVector(b.vel, dt);
        b.life -= dt;
        fx.ember(b.mesh.position, 1, 3);
        let hit = false;
        if (b.mesh.position.y <= terrainHeight(b.mesh.position.x, b.mesh.position.z) + 1)
          hit = true;
        if (!hit) {
          const near: Target[] = [];
          grid.query(b.mesh.position.x, b.mesh.position.z, 12, near);
          for (const t of near) {
            if (t.dead) continue;
            const dx = t.pos.x - b.mesh.position.x;
            const dz = t.pos.z - b.mesh.position.z;
            if (dx * dx + dz * dz > (t.radius + 2) ** 2) continue;
            if (b.mesh.position.y > t.pos.y + t.height + 3) continue;
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const s of g.airships) {
            if (s.dead) continue;
            if (b.mesh.position.distanceTo(s.pos) < 14) {
              hit = true;
              break;
            }
            for (const wp of s.weakPoints) {
              if (!wp.dead && b.mesh.position.distanceTo(wp.world) < wp.radius + 2) {
                hit = true;
                break;
              }
            }
            if (hit) break;
          }
        }
        if (!hit) {
          for (const e of g.enemies) {
            if (!e.dead && b.mesh.position.distanceTo(e.pos) < e.radius + 2) {
              hit = true;
              break;
            }
          }
        }
        if (hit || b.life <= 0) {
          if (hit) {
            // Köz Mermisi yönü — oval yıkım için
            const fbDir = tmp.copy(b.vel).normalize();
            explode(g, b.mesh.position, { ...FIREBALL_BLAST, dir: fbDir, fireball: true });
          }
          b.active = false;
          b.mesh.visible = false;
        }
      }

      /* ---- yanan hedefler ---- */
      burnT -= dt;
      if (burnT <= 0) {
        burnT = 0.25;
        g.burning.length = 0;
        for (const t of targets) if (!t.dead && t.burn > 0.04) g.burning.push(t);
      }
      updateBurning(g, dt);
      updateFireSpread(g, dt);

      state.comboT -= dt;
      if (state.comboT <= 0) state.combo = 1;

      /* ---- kuleler ---- */
      const dp = dragon.root.position;
      for (const t of towers) {
        if (t.dead) continue;
        t.cool -= dt;
        const d = t.pos.distanceTo(dp);
        const rate = state.marked > 0 ? 0.62 : 1;
        if (t.tower === "flak") {
          if (t.cool <= 0 && d < 210) {
            t.cool = 3.2 * rate;
            tmp.copy(dp).sub(t.pos).normalize();
            tmp.x += (Math.random() - 0.5) * 0.09;
            tmp.z += (Math.random() - 0.5) * 0.09;
            tmp2.copy(t.pos).setY(t.pos.y + t.height);
            // Fünye ejderhanın o anki irtifasına ayarlanır: yüksek uçmak cezalı.
            shots.spawn("flak", tmp2, tmp.normalize().multiplyScalar(95), 14, dp.y);
            audio.enemyShot();
          }
        } else if (t.tower === "tesla") {
          if (d < TESLA_RANGE) {
            const rig = teslas.find((x) => x.t === t);
            if (rig) {
              rig.rig.mat.opacity = 0.75;
              tmp.set(0, 0, 0);
              tmp2.copy(dp).sub(rig.rig.group.position);
              updateTeslaArc(rig.rig, tmp, tmp2);
            }
            if (state.invuln <= 0) {
              state.hp -= 9 * dt;
              state.hitFlash = Math.max(state.hitFlash, 0.25);
            }
          } else {
            const rig = teslas.find((x) => x.t === t);
            if (rig) rig.rig.mat.opacity = Math.max(0, rig.rig.mat.opacity - 3 * dt);
          }
        } else {
          // Işıldak: koni içinde kalırsan bölge ateşini üstüne çeker.
          const rig = searchlights.find((x) => x.t === t);
          if (rig) {
            rig.rig.phase += dt * 0.55;
            rig.rig.group.rotation.z = Math.sin(rig.rig.phase) * 0.6;
            rig.rig.group.rotation.x = Math.PI - 0.5 + Math.cos(rig.rig.phase * 0.7) * 0.25;
            if (d < SEARCHLIGHT_RANGE) {
              tmp.copy(dp).sub(rig.rig.group.position).normalize();
              rig.rig.group.getWorldDirection(tmp2);
              if (tmp.dot(tmp2.negate()) > Math.cos(SEARCHLIGHT_HALF_ANGLE * 1.6)) {
                t.cool -= dt;
                if (t.cool <= 0) {
                  t.cool = 4;
                  if (state.marked <= 0) audio.lockOn();
                  state.marked = 5;
                }
              }
            }
          }
        }
      }

      /* ---- kapı kuleleri topçu ---- */
      if (city) {
        for (const gt of city.gateTurrets) {
          gt.cool -= dt;
          const d = gt.pos.distanceTo(dp);
          const rate = state.marked > 0 ? 0.62 : 1;
          if (gt.cool <= 0 && d < 180) {
            gt.cool = (2.5 + Math.random() * 0.8) * rate;
            tmp.copy(dp).sub(gt.pos).normalize();
            tmp.x += (Math.random() - 0.5) * 0.12;
            tmp.z += (Math.random() - 0.5) * 0.12;
            tmp2.copy(gt.pos);
            shots.spawn("bolt", tmp2, tmp.normalize().multiplyScalar(80), 6, 0);
            audio.enemyShot();
          }
        }
      }

      /* ---- zeplinler ---- */
      for (const z of g.airships) {
        if (z.dead) continue;
        if (z.weakPoints.length && z.pos.distanceTo(dp) < 520) refreshWeakPoints(z);
        if (z.burn > 0) {
          z.hp -= z.burn * 30 * dt;
          z.hullMat.color
            .copy(z.hullColor)
            .lerp(new THREE.Color(0x1a0c06), Math.min(1, z.burn * 1.4));
          z.hullMat.emissive.set(0xff4000);
          z.hullMat.emissiveIntensity = z.burn * 1.8 + Math.random() * 0.5;
          if (Math.random() < z.burn * 0.55) {
            tmp.set(
              z.group.position.x + (Math.random() - 0.5) * 10,
              z.group.position.y + Math.random() * 9,
              z.group.position.z + (Math.random() - 0.5) * 10,
            );
            fx.ember(tmp, 1, 5);
          }
          z.group.position.y -= z.burn * 7 * dt;
        } else {
          z.hullMat.emissiveIntensity *= Math.max(0, 1 - 9 * dt);
        }
        z.group.position.y += Math.sin(now * 0.0004 + z.group.position.x) * 4 * dt;
        if (z.burn < 0.3) {
          z.group.position.addScaledVector(z.dir, 12 * dt);
          if (g.autoForward) {
            tmp.copy(dp).sub(z.group.position);
            tmp.y = 0;
            tmp.normalize();
            z.dir.lerp(tmp, Math.min(1, dt * 0.5));
          } else if (Math.hypot(z.group.position.x, z.group.position.z) > worldRadius * 0.85) {
            z.dir.set(-z.group.position.x, 0, -z.group.position.z).normalize();
          }
          z.group.lookAt(tmp2.copy(z.group.position).add(z.dir));
          z.group.rotateY(Math.PI);
        }
        for (const p of z.props) p.rotation.z += dt * 9;
        z.cool -= dt;
        if (!z.gunsDisabled && z.burn < 0.15 && z.cool <= 0 && z.pos.distanceTo(dp) < 220) {
          z.cool = (z.role === "frigate" ? 0.9 : 1.6) * (state.marked > 0 ? 0.62 : 1);
          tmp2.copy(z.group.position).setY(z.group.position.y - 6);
          tmp.copy(dp).sub(tmp2).normalize();
          tmp.x += (Math.random() - 0.5) * 0.09;
          tmp.y += (Math.random() - 0.5) * 0.09;
          tmp.z += (Math.random() - 0.5) * 0.09;
          shots.spawn("bolt", tmp2, tmp.normalize().multiplyScalar(100), 8);
          audio.enemyShot();
        }
        if (z.hp <= 0) killAirship(g, z);
      }

      /* ---- Wasp sürüsü ---- */
      for (const e of g.enemies) {
        if (e.dead) continue;
        if (e.burn > 0) {
          e.hp -= e.burn * 26 * dt;
          e.hullMat.emissive.set(0xff4000);
          e.hullMat.emissiveIntensity = e.burn * 1.6;
        }
        if (e.hp <= 0) {
          e.dead = true;
          e.group.visible = false;
          fx.explosion(e.pos, 1.1);
          audio.explosion(1.1);
          addCombo(g);
          state.score += 380 * state.combo;
          state.embers += 120;
          state.rage = Math.min(100, state.rage + 5);
          g.mission.emit({ kind: "enemyKilled", enemy: "wasp" });
          continue;
        }
        if (e.hp < e.maxHp * 0.25) e.state = "flee";

        // Hedef: ejderhanın biraz arkası/üstü. Doğrudan üstüne gitmek
        // sürüyü ejderhanın içine gömüyor.
        tmp.copy(dp).add(tmp2.set(0, 18, -46));
        if (e.state === "flee") tmp.copy(e.pos).sub(dp).normalize().multiplyScalar(400).add(dp);
        tmp.sub(e.pos);
        const dist = tmp.length() || 1;
        tmp.divideScalar(dist).multiplyScalar(52);
        // Ayrışma: sürü tek piksele yığılmasın.
        for (const o2 of g.enemies) {
          if (o2 === e || o2.dead) continue;
          const dd = e.pos.distanceTo(o2.pos);
          if (dd < 26 && dd > 0.01) {
            tmp2
              .copy(e.pos)
              .sub(o2.pos)
              .multiplyScalar(28 / dd);
            tmp.add(tmp2);
          }
        }
        e.vel.lerp(tmp, Math.min(1, dt * 1.6));
        e.group.position.addScaledVector(e.vel, dt);
        e.group.position.y = Math.max(
          terrainHeight(e.pos.x, e.pos.z) + 20,
          Math.min(300, e.group.position.y),
        );
        tmp2.copy(e.pos).add(e.vel);
        e.group.lookAt(tmp2);
        e.group.rotateY(Math.PI);
        for (const p of e.props) p.rotation.z += dt * 22;

        e.cool -= dt;
        if (e.state === "chase" && e.cool <= 0 && dist < 150) {
          e.cool = 2.6;
          tmp2.copy(dp).sub(e.pos).normalize();
          tmp2.x += (Math.random() - 0.5) * 0.07;
          tmp2.y += (Math.random() - 0.5) * 0.07;
          shots.spawn("harpoon", e.pos, tmp2.normalize().multiplyScalar(120), 10);
          audio.enemyShot();
        }
      }

      /* ---- mermiler ---- */
      state.threatT = -1;
      for (const s of shots.shots) {
        if (!s.active) continue;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.life -= dt;

        // Flak fünyesi: hedef irtifayı geçince havada patlar.
        if (s.kind === "flak" && Math.sign(s.fuseY - s.mesh.position.y) !== s.fuseSign) {
          const d = s.mesh.position.distanceTo(dp);
          fx.explosion(s.mesh.position, 0.9);
          if (d < 24 && state.invuln <= 0) {
            state.hp -= s.damage * (1 - d / 24);
            state.invuln = 0.35;
            state.hitFlash = 1;
            shake(g, 0.7);
            audio.hit();
            g.mission.emit({ kind: "damaged", amount: s.damage });
          }
          s.active = false;
          s.mesh.visible = false;
          continue;
        }

        // En yakın yaklaşma zamanı — kusursuz kaçınma penceresinin ölçüsü.
        tmp.copy(dp).sub(s.mesh.position);
        const closing = tmp.dot(s.vel);
        if (closing > 0) {
          const t2 = closing / Math.max(1e-3, s.vel.lengthSq());
          tmp2.copy(s.vel).multiplyScalar(t2).add(s.mesh.position);
          if (tmp2.distanceTo(dp) < 14 && (state.threatT < 0 || t2 < state.threatT)) {
            state.threatT = t2;
          }
        }

        if (s.mesh.position.distanceTo(dp) < 6) {
          if (state.invuln <= 0) {
            state.hp -= s.damage;
            state.invuln = 0.35;
            state.hitFlash = 1;
            audio.hit();
            shake(g, 0.45);
            fx.ember(s.mesh.position, 14, 8);
            g.mission.emit({ kind: "damaged", amount: s.damage });
            // Harpun: Pyra ağırlaşır, takla ile kurtulunur.
            if (s.kind === "harpoon") state.snared = 2.5;
          }
          s.active = false;
          s.mesh.visible = false;
          continue;
        }
        if (s.life <= 0) {
          s.active = false;
          s.mesh.visible = false;
        }
      }

      /* ---- geçitler ve bölgeler ---- */
      for (const gt of gates) {
        if (gt.passed) continue;
        if (gt.pos.distanceTo(dp) < gt.radius * 0.95) {
          gt.passed = true;
          (gt.group.children[0] as THREE.Mesh | undefined)?.scale.setScalar(1);
          audio.perfect();
          g.mission.emit({ kind: "gatePassed" });
        }
      }
      for (const z of zones) {
        if (z.entered) continue;
        if (Math.hypot(dp.x - z.pos.x, dp.z - z.pos.z) < z.r) {
          z.entered = true;
          g.mission.emit({ kind: "zoneEnter", zone: z.id });
        }
      }

      state.hitFlash = Math.max(0, state.hitFlash - dt * 2.2);
      if (state.hp <= 0) {
        state.hp = 0;
        g.mission.fail();
      }
    } else if (state.status === "playing") {
      // Duraklatıldı: sahne çizilmeye devam ediyor ama simülasyon durdu.
      audio.flame(false);
      audio.siren(false);
      audio.music(false);
    }

    /* ---- her durumda ---- */
    fireLights.update(rawDt, now, g.burning, dragon.root.position);
    fx.update(rawDt, now);

    ash.position.x = dragon.root.position.x;
    ash.position.z = dragon.root.position.z;
    ash.rotation.y += rawDt * 0.01;

    sun.position.copy(dragon.root.position).add(SUN_OFFSET);
    sun.target.position.copy(dragon.root.position);
    sky.position.copy(dragon.root.position);
    fill.position.copy(camera.position);

    // NPC güncellemesi (siviller kaçışır, askerler ateş eder)
    if (city && playing) {
      city.npcs.update(rawDt, dragon.root.position, g.fwd);
    }

    updateCamera(g, rawDt, playing);
    renderer.render(scene, camera);

    /* ---- HUD ---- */
    markerT -= rawDt;
    if (markerT <= 0) {
      markerT = 0.2;
      selectMarkers();
    }
    paintMarkers();

    const f = bridge.frame;
    f.hp = (state.hp / state.maxHp) * 100;
    f.heat = (state.heat / state.maxHeat) * 100;
    f.stamina = state.stamina;
    f.rage = state.rage;
    f.overheat = state.overheat;
    f.overheatMax = BREATH.overheatLock;
    f.comboT = state.comboT;
    f.combo = state.combo;
    f.speed = state.speed;
    f.alt = dragon.root.position.y;
    f.fps = measuredFps;
    f.hitFlash = state.hitFlash;
    f.rageActive = state.rageT;
    f.marked = state.marked;
    f.emberRush = state.emberRush;
    f.pitch = g.flightAxes.pitch / FLIGHT.maxPitch;
    f.braking = g.braking ? 1 : 0;
    f.fireballCd = state.fireballCd / FIREBALL.cooldown;
    f.shockCd = state.shockCd / 5;
    f.rollCd = state.rollCd / FLIGHT.rollCooldown;
    bridge.paint();

    pushT += rawDt;
    if (pushT > 0.2) {
      pushT = 0;
      const goalObj = chapter.objectives.find((x) => x.type === "destroyPercent");
      const snap: HudSnapshot = {
        score: Math.round(state.score),
        embers: Math.round(state.embers),
        destroyed: state.destroyed,
        total: state.totalTargets,
        goal:
          goalObj && goalObj.type === "destroyPercent"
            ? Math.ceil(state.totalTargets * goalObj.pct)
            : state.totalTargets,
        combo: state.combo,
        hp: Math.round(state.hp),
        heat: Math.round(state.heat),
        stamina: Math.round(state.stamina),
        rage: Math.round(state.rage),
        status: state.status,
        objectives: g.mission.objectives,
        subtitle: g.mission.subtitle,
        hint: g.mission.hint,
        boss: bossSnapshot(),
        marked: state.marked > 0,
        chapterTitle: chapter.title,
      };
      const p = lastPush;
      if (
        !p ||
        p.score !== snap.score ||
        p.hp !== snap.hp ||
        // Isı/stamina/öfke HUD'a 60 Hz'te doğrudan boyanıyor, ama `onStats`
        // tüketicileri (harness, testler) yalnız bu anlık görüntüyü görüyor:
        // karşılaştırmadan düşürülürlerse bayat kalıyorlar.
        p.heat !== snap.heat ||
        p.stamina !== snap.stamina ||
        p.rage !== snap.rage ||
        p.destroyed !== snap.destroyed ||
        p.combo !== snap.combo ||
        p.status !== snap.status ||
        p.marked !== snap.marked ||
        p.subtitle?.text !== snap.subtitle?.text ||
        p.hint?.text !== snap.hint?.text ||
        p.objectives.some((x, i) => {
          const y = snap.objectives[i];
          return !y || x.have !== y.have || x.done !== y.done;
        }) ||
        p.objectives.length !== snap.objectives.length ||
        p.boss?.hp !== snap.boss?.hp
      ) {
        lastPush = { ...snap, objectives: snap.objectives.map((x) => ({ ...x })) };
        bridge.push(snap);
      }
    }
  };

  const bossSnapshot = (): HudSnapshot["boss"] => {
    const boss = g.airships.find((s) => s.role === "frigate" && !s.dead);
    if (!boss) return null;
    return {
      label: "Bulwark",
      hp: Math.round((boss.hp / boss.maxHp) * 100),
      modules: boss.weakPoints.map((w) => ({ label: w.label, dead: w.dead })),
    };
  };

  /* ---------------- ısınma ---------------- */
  await step(90, "Gölgeler derleniyor");
  if (cancelled) return null;
  camera.position.set(start.x, start.y + 14, start.z - 40);
  camera.lookAt(dragon.root.position);
  // Shader'lar ilk çizimde tembel derlenir; bunu yükleme ekranına alıyoruz,
  // yoksa oyun başlar başlamaz saniyelerce takılıyor.
  if (typeof renderer.compileAsync === "function") await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  if (cancelled) return null;

  await step(97, "Isınma karesi");
  if (cancelled) return null;
  renderer.render(scene, camera);
  await step(100, "Hazır");
  if (cancelled) return null;

  audio.ambient(true);
  audio.siren(true);
  // İlk 5 saniye siren, ardından müzik başlar
  setTimeout(() => {
    if (finished) return;
    musicStarted = true;
    audio.siren(false);
    audio.music(true);
  }, 10000);
  o.onReady();
  last = performance.now();
  raf = requestAnimationFrame(loop);

  return {
    cmd(command) {
      switch (command.t) {
        case "pause":
          g.paused = true;
          audio.flame(false);
          audio.siren(false);
          audio.music(false);
          // Basılı kalan girdiler duraklatmayı aşmasın: menüden dönünce
          // ejderha kendi kendine alev püskürtüyor ya da frende kalıyordu.
          ctrl.current.fire = false;
          ctrl.current.brake = false;
          ctrl.current.hover = false;
          ctrl.current.throttle = 0;
          ctrl.current.yaw = 0;
          ctrl.current.pitch = 0;
          ctrl.current.roll = 0;
          break;
        case "resume":
          g.paused = false;
          if (musicStarted) {
            audio.music(true);
          } else {
            audio.siren(true);
          }
          last = performance.now();
          break;
        case "skipLine":
          g.mission.skipLine();
          break;
        case "applyQuality":
          shadowsDropped = false;
          applyQuality();
          break;
        case "abort":
          g.mission.fail();
          break;
      }
    },
    dispose() {
      cancelled = true;
      cancelAnimationFrame(raf);
      audio.suspend();
      for (const c2 of cleanups) c2();
      // Geometriler sahneye özel; materyaller (userData.shared) modüller
      // arasında paylaşıldığı için yeniden başlatmada korunur.
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh | THREE.Points;
        if (m.geometry) m.geometry.dispose();
        const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!mat) return;
        for (const mm of Array.isArray(mat) ? mat : [mat]) {
          if (!mm.userData["shared"]) mm.dispose();
        }
      });
      scene.clear();
      shots.dispose();
      fireballs.dispose();
      fx.dispose();
      void FIRE_LIGHTS;
    },
  };
}
