import type { CitySpec } from "../city";
import type { TerrainMod } from "../world";
import type {
  AirshipRole,
  EnemyKind,
  GameEventKind,
  Speaker,
  TargetKind,
  WeakPointId,
} from "../types";

/**
 * Kampanya veri modeli.
 *
 * Oyun döngüsü hiçbir bölümün adını bilmez: bölümler tamamen veri, döngü
 * yalnız olay yayınlar ve tetikleyicileri değerlendirir. Altı bölüm de,
 * Serbest Yıkım da aynı kod yolundan geçer.
 */

export type ChapterId = "c01" | "c02" | "c03" | "c04" | "c05" | "c06" | "c07" | "sandbox";

export type Ability = "flame" | "fireball" | "roll" | "shock" | "rage" | "steepDive";

export type ScatterSpec = Partial<Record<TargetKind, number>>;

export type PropSpec =
  | { t: "gate"; x: number; y: number; z: number; radius: number }
  | { t: "structure"; kind: TargetKind; x: number; z: number; scale: number; id?: string }
  | { t: "flagship"; x: number; y: number; z: number; hidden: boolean }
  | { t: "caravan"; x: number; z: number; count: number; spacing: number; angle?: number }
  | { t: "deco"; x: number; z: number; kind: "rock" | "cactus" | "deadtree" | "tent" | "barrel" | "campfire"; scale?: number };

export type AirshipSpawn = {
  x: number;
  y: number;
  z: number;
  role: AirshipRole;
  id?: string;
  weakPoints?: boolean;
};

export type WaveSpec = {
  enemy: EnemyKind;
  count: number;
  /** Ejderhanın çevresinde hangi mesafede doğsunlar. */
  radius: number;
  altitude: [number, number];
};

export type ZoneDef = { id: string; x: number; z: number; r: number; label: string };

export type WorldSpec = {
  radius: number;
  terrain?: TerrainMod[];
  city?: CitySpec;
  scatter?: ScatterSpec;
  props?: PropSpec[];
  airships?: AirshipSpawn[];
  waves?: Record<string, WaveSpec>;
  zones?: ZoneDef[];
  /** Rüzgâr: yön (radyan) ve 0..1 şiddet. Yangın cephesini yönlendirir. */
  wind?: { dir: number; strength: number };
  fogScale?: number;
  /** Bölüm özel gökyüzü/fog rengi (hex). Belirtilmezse global şafak paleti. */
  skyColor?: number;
  fogColor?: number;
  /** Güneş ışık rengi (hex). */
  sunColor?: number;
  /** Exposure multiplier (1 = normal). */
  exposure?: number;
  start?: { x: number; y: number; z: number };
  /** Sonsuz ileri yol modu: ejderha otomatik +Z'ye uçar, chunk'lar oluşturulur. */
  mode?: "infinite";
};

export type ObjectiveBase = { id: string; label: string; optional?: boolean; hidden?: boolean };

export type Objective = ObjectiveBase &
  (
    | { type: "destroyPercent"; pct: number }
    | { type: "destroyKind"; kind: TargetKind; count: number }
    | { type: "killEnemies"; enemy: EnemyKind; count: number }
    | { type: "killAirships"; role: AirshipRole; count: number }
    | { type: "survive"; seconds: number }
    | { type: "reachZone"; zone: string }
    | { type: "passGates"; gates: number }
    | { type: "destroyWeakPoints"; shipId: string; modules: WeakPointId[] }
    | { type: "perfectDodges"; count: number }
  );

export type StatKey = "hp" | "heat" | "combo" | "destroyed" | "destroyPct" | "rage" | "time";

export type Trigger =
  | { at: "start" }
  | { at: "time"; t: number }
  | { at: "objectiveDone"; id: string }
  | { at: "objectiveProgress"; id: string; pct: number }
  | { at: "zone"; zone: string }
  | { at: "stat"; key: StatKey; op: "<" | ">="; value: number }
  | { at: "event"; event: GameEventKind }
  | { at: "all"; of: Trigger[] }
  | { at: "any"; of: Trigger[] };

export type BeatAction =
  | { do: "spawnWave"; wave: string }
  | { do: "enableObjective"; id: string }
  | { do: "setWind"; dir: number; strength: number }
  | { do: "hint"; text: string; keys?: string[]; dur: number }
  | { do: "slowmo"; scale: number; dur: number }
  | { do: "shake"; amp: number }
  | { do: "unlockAbility"; ability: Ability }
  | { do: "reveal"; prop: string }
  | { do: "roar" }
  | { do: "end"; outcome: "won" | "lost" };

export type Line = { who: Speaker; text: string; dur: number };

export type Beat = {
  id: string;
  trigger: Trigger;
  lines?: Line[];
  actions?: BeatAction[];
};

export type FailCond = { type: "death" } | { type: "timeout"; seconds: number };

export type ChapterDef = {
  id: ChapterId;
  index: number;
  title: string;
  subtitle: string;
  briefing: { lore: string; objectives: string[]; tips: string[] };
  world: WorldSpec;
  objectives: Objective[];
  fail: FailCond[];
  beats: Beat[];
  abilities: Record<Ability, boolean>;
  par: { time: number; score: number };
  rewardEmbers: number;
  bondXp: number;
  unlocks: ChapterId[];
};
