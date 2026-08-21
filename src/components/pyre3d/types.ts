import type * as THREE from "three";

/* ------------------------------------------------------------------ *
 * Girdi
 * ------------------------------------------------------------------ */

/**
 * Oyuncu girdisi — 5 eksenli uçuş kontrolü.
 *
 * Eksenler:
 *   throttle  → İleri hız (0..1; 0=boşlukta, 1=maks hız/sprint)
 *   pitch     → Burun yukarı/aşağı (-1=dalma, 0=düz, +1=yukarı)
 *   roll      → Yatay banking (-1=sol, 0=merkez, +1=sağ)
 *   yaw       → Saf kamera-dönüşlü yön (-1=sol, 0=merkez, +1=sağ)
 *   hover     → Askıda kalma modu (stamina tüketir)
 *
 * Kenar tetikli inputlar: dodge, fireball, shock, rage.
 * Sürekli inputlar: fire (basılı tutulur).
 */
export type Ctrl = {
  /** İleri hız kontrolü: 0 boşluk, 1 sprint. */
  throttle: number;
  /** Burun pitch: -1 dalma, +1 yükselif. */
  pitch: number;
  /** Yatay bank/roll: -1 sol, +1 sağ. */
  roll: number;
  /** Saf yaw: kamerayı bozmadan döner. -1 sol, +1 sağ. */
  yaw: number;
  /** Hover modu: yerde/alçakta askı. */
  hover: boolean;
  /** Fren: ileri hızı sıfıra çeker ama dönüşü ve irtifayı SERBEST bırakır —
   *  binanın önünde durup nişan alarak yakmak için. `hover`'dan farkı bu:
   *  hover heading güncellemesini tamamen atlıyor, yani asılıyken dönemiyorsun. */
  brake: boolean;
  /** Konik alev — basılı tutulur. */
  fire: boolean;
  /** Köz Mermisi — kenar tetikli, döngü tükettikten sonra sıfırlanır. */
  fireball: boolean;
  /** Barrel roll yönü: -1 sol, +1 sağ, 0 yok. Kenar tetikli. */
  dodge: number;
  /** Kanat şoku — kenar tetikli. */
  shock: boolean;
  /** Ejderha Öfkesi — kenar tetikli. */
  rage: boolean;
  /** Hız boost butonu — toggle. Joystick'ten bağımsız, parmak kaldırınca
   *  sıfırlanmaz. */
  boost: boolean;
};

export function createCtrl(): Ctrl {
  return {
    throttle: 0,
    pitch: 0,
    roll: 0,
    yaw: 0,
    hover: false,
    brake: false,
    fire: false,
    fireball: false,
    dodge: 0,
    shock: false,
    rage: false,
    boost: false,
  };
}

/* ------------------------------------------------------------------ *
 * Dünya nesneleri
 * ------------------------------------------------------------------ */

export type TargetKind =
  | "house"
  | "tenement"
  | "workshop"
  | "warehouse"
  | "factory"
  | "tower"
  | "mast"
  | "elevator"
  | "bridge"
  | "gate"
  | "barracks"
  | "armory"
  | "command_post"
  | "ammo_depot"
  | "watchtower";

export type TowerKind = "tesla" | "flak" | "isildak";

/** Ateş ışığı havuzunun ve yangın yayılmanın ortak arayüzü. */
export type Burnable = {
  pos: THREE.Vector3;
  burn: number;
  dead: boolean;
  /** Ateş ışığının nesne merkezine göre yükseklik farkı. */
  lightY: number;
  /** Yıkılmış bina yarıya ayrıldı mı? */
  splitDone: boolean;
};

/**
 * Yıkılabilir her yer hedefi. Şehir binaları da, dağınık yapılar da bu tipte:
 * hasar/yangın/ışık/skor döngüleri tek dizi üzerinde çalışsın diye.
 *
 * Görsel güncelleme `apply` ile soyutlanıyor — şehir binası paylaşılan bir
 * vertex attribute'una yazar, bağımsız yapı ise kendi grubunu gizler.
 */
export type Target = Burnable & {
  id: number;
  kind: TargetKind;
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  /** 0..1 tutuşma eğilimi; yangın yayılma olasılığını ölçekler. */
  flammable: number;
  score: number;
  cool: number;
  tower: TowerKind | null;
  /** Işıldak konisi / tesla yayı gibi kuleye özel canlı parçalar. */
  rig: THREE.Object3D | null;
  /** Yanma/ölüm durumunu sahneye yansıtır. */
  apply: (t: Target) => void;
  /** `apply` çağrısını gereksiz tekrarlamamak için son yazılan yanma değeri. */
  wrote: number;
  /** Bina yarıya ayrıldı mı? */
  splitDone: boolean;
};

export type WeakPointId =
  | "balonOn" | "balonArka" | "motorSol" | "motorSag" | "batarya" | "kopru" | "cekirdek"
  | "kanatSol" | "kanatSag" | "radar" | "kalkan" | "yakit" | "komuta"
  | "taretSol" | "taretSag" | "egzost" | "navigasyon" | "zirh";

export type WeakPointEffect = "sink" | "disableGuns" | "disableEngine" | "phase";

export type WeakPoint = {
  id: WeakPointId;
  label: string;
  group: THREE.Group;
  local: THREE.Vector3;
  world: THREE.Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  onDestroy: WeakPointEffect;
};

export type AirshipRole = "scout" | "bomber" | "frigate" | "flagship";

export type Airship = Burnable & {
  id: string;
  role: AirshipRole;
  group: THREE.Group;
  dir: THREE.Vector3;
  hp: number;
  maxHp: number;
  cool: number;
  /** Top yuvası imha edilince Infinity olur. */
  gunsDisabled: boolean;
  props: THREE.Object3D[];
  hullMat: THREE.MeshStandardMaterial;
  hullColor: THREE.Color;
  weakPoints: WeakPoint[];
};

export type EnemyKind = "wasp";

export type Enemy = Burnable & {
  id: number;
  kind: EnemyKind;
  group: THREE.Group;
  vel: THREE.Vector3;
  hp: number;
  maxHp: number;
  radius: number;
  cool: number;
  props: THREE.Object3D[];
  hullMat: THREE.MeshStandardMaterial;
  state: "chase" | "flee";
};

/* ------------------------------------------------------------------ *
 * Koşu durumu
 * ------------------------------------------------------------------ */

export type RunState = {
  hp: number;
  maxHp: number;
  heat: number;
  maxHeat: number;
  overheat: number;
  stamina: number;
  invuln: number;
  shockCd: number;
  fireballCd: number;
  rollCd: number;
  speed: number;
  combo: number;
  comboT: number;
  bestCombo: number;
  score: number;
  embers: number;
  destroyed: number;
  totalTargets: number;
  /** Ejderha Öfkesi barı 0..100 ve kalan süre. */
  rage: number;
  rageT: number;
  /** Kusursuz kaçınma ödülü: kalan süre. */
  emberRush: number;
  perfectDodges: number;
  /** Harpunla yavaşlatılma: kalan süre. */
  snared: number;
  /** Işıldak işaretlemesi: kalan süre. */
  marked: number;
  /** En yakın merminin en-yakın-yaklaşma süresi; -1 = tehdit yok. */
  threatT: number;
  /** Alev topu geri tepmesi (0..1 → 0, 0.4s decay). */
  fireballKickT: number;
  flap: number;
  /** Kamera sarsıntısı: kalan süre ve genlik. */
  shakeT: number;
  shakeAmp: number;
  /** Hasar vinyeti için son isabetten bu yana. */
  hitFlash: number;
  wind: THREE.Vector2;
  time: number;
  status: "playing" | "won" | "lost";
};

/* ------------------------------------------------------------------ *
 * Görev olayları
 * ------------------------------------------------------------------ */

export type GameEvent =
  | { kind: "targetDestroyed"; target: TargetKind }
  | { kind: "enemyKilled"; enemy: EnemyKind }
  | { kind: "airshipKilled"; role: AirshipRole }
  | { kind: "weakPointDown"; shipId: string; module: WeakPointId }
  | { kind: "perfectDodge" }
  | { kind: "firstFlame" }
  | { kind: "overheat" }
  | { kind: "gatePassed" }
  | { kind: "zoneEnter"; zone: string }
  | { kind: "damaged"; amount: number };

export type GameEventKind = GameEvent["kind"];

/* ------------------------------------------------------------------ *
 * HUD köprüsü
 * ------------------------------------------------------------------ */

export type ObjectiveState = {
  id: string;
  label: string;
  have: number;
  need: number;
  done: boolean;
  optional: boolean;
};

export type Speaker = "Kayra" | "Pyra" | "Vorren" | "Ashkeep" | "sistem";

export type Subtitle = { who: Speaker; text: string };
export type Hint = { text: string; keys: string[] };

/** 5 Hz, dirty-check'li React state. */
export type HudSnapshot = {
  score: number;
  embers: number;
  destroyed: number;
  total: number;
  goal: number;
  combo: number;
  hp: number;
  heat: number;
  stamina: number;
  rage: number;
  status: "playing" | "won" | "lost";
  objectives: ObjectiveState[];
  subtitle: Subtitle | null;
  hint: Hint | null;
  boss: { label: string; hp: number; modules: { label: string; dead: boolean }[] } | null;
  marked: boolean;
  chapterTitle: string;
  elapsed: number;
  bestTime: number;
};

export type MarkerKind = "objective" | "threat" | "weakpoint" | "optional";

export type Marker = {
  active: boolean;
  kind: MarkerKind;
  /** Ekran pikseli; ekran dışındaysa kenara kelepçelenmiş konum. */
  x: number;
  y: number;
  onScreen: boolean;
  /** Ekran dışı okun dönüş açısı (derece). */
  angle: number;
  dist: number;
  hp01: number;
};

export const MARKER_POOL = 14;

/** 60 Hz, React'e uğramadan doğrudan DOM'a boyanan alanlar. */
export type HudFrame = {
  hp: number;
  heat: number;
  stamina: number;
  rage: number;
  overheat: number;
  overheatMax: number;
  comboT: number;
  combo: number;
  speed: number;
  alt: number;
  fps: number;
  hitFlash: number;
  rageActive: number;
  marked: number;
  emberRush: number;
  /** Yetenek soğumaları 0..1 (1 = yeni basıldı, 0 = hazır). Dokunmatik
   *  butonlar bunu halka olarak çiziyor: boşa giden dokunuşun sebebi
   *  ekranda görünsün. */
  fireballCd: number;
  shockCd: number;
  rollCd: number;
  /** Burnun tutulan eğimi -1..1. Çubuktaki eğim göstergesi bunu çiziyor:
   *  pitch artık bırakınca sıfırlanmadığı için oyuncunun burnun nerede
   *  olduğunu görmesi gerekiyor. */
  pitch: number;
  /** Fren açık mı (0/1). Buton kendi durumunu buradan okuyor: stamina
   *  bitince oyun döngüsü freni zorla kapatabiliyor. */
  braking: number;
  markers: Marker[];
  /** Bölümde geçen süre (saniye). */
  elapsed: number;
  /** Kişisel en iyi süre (saniye, 0 = henüz yok). */
  bestTime: number;
};

export type MissionResult = {
  outcome: "won" | "lost";
  score: number;
  embers: number;
  destroyed: number;
  total: number;
  destroyPct: number;
  bestCombo: number;
  perfectDodges: number;
  time: number;
  objectives: ObjectiveState[];
};
