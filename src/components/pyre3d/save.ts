import type { ChapterId } from "./story/types";

/**
 * İlerleme kaydı. Şema versiyonlu: alan eklendiğinde eski kayıt silinmek
 * yerine `migrate` ile tamamlanıyor — oyuncu bölümlerini kaybetmesin.
 */
const KEY = "pyre3d-save";
const VERSION = 1;

export type Grade = "kul" | "kor" | "alev";

export type ChapterRecord = {
  done: boolean;
  bestScore: number;
  bestDestroyPct: number;
  bestTime: number;
  grade: Grade | null;
};

export type SaveData = {
  v: number;
  unlocked: ChapterId[];
  chapters: Partial<Record<ChapterId, ChapterRecord>>;
  embers: number;
  /** Pyra ile Bağ Seviyesi 1..10 ve mevcut seviyedeki ilerleme puanı. */
  bond: number;
  bondXp: number;
  /** Görülen diyalog beat'leri — tekrar oynayışta atlanabilsin diye. */
  seenBeats: string[];
  muted: boolean;
  volume: number;
};

export const BOND_MAX = 10;
/** Bir seviyeden diğerine gereken puan. */
export const BOND_STEP = 100;

export function emptySave(): SaveData {
  return {
    v: VERSION,
    unlocked: ["c01", "sandbox"],
    chapters: {},
    embers: 0,
    bond: 1,
    bondXp: 0,
    seenBeats: [],
    muted: false,
    volume: 0.7,
  };
}

function migrate(raw: unknown): SaveData {
  const base = emptySave();
  if (!raw || typeof raw !== "object") return base;
  const p = raw as Partial<SaveData>;
  return {
    v: VERSION,
    unlocked: Array.isArray(p.unlocked) && p.unlocked.length ? p.unlocked : base.unlocked,
    chapters: p.chapters && typeof p.chapters === "object" ? p.chapters : {},
    embers: Number.isFinite(p.embers) ? Number(p.embers) : 0,
    bond: Number.isFinite(p.bond) ? Math.min(BOND_MAX, Math.max(1, Number(p.bond))) : 1,
    bondXp: Number.isFinite(p.bondXp) ? Number(p.bondXp) : 0,
    seenBeats: Array.isArray(p.seenBeats) ? p.seenBeats : [],
    muted: p.muted === true,
    volume: Number.isFinite(p.volume) ? Math.min(1, Math.max(0, Number(p.volume))) : 0.7,
  };
}

export function loadSave(): SaveData {
  if (typeof window === "undefined") return emptySave();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptySave();
    return migrate(JSON.parse(raw));
  } catch {
    return emptySave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* kota dolu veya gizli mod — sessizce geç */
  }
}

export function resetSave(): SaveData {
  const fresh = emptySave();
  writeSave(fresh);
  return fresh;
}

export function isUnlocked(save: SaveData, id: ChapterId): boolean {
  return save.unlocked.includes(id);
}

export function gradeFor(scorePar: number, score: number, destroyPct: number): Grade {
  if (score >= scorePar * 1.35 || destroyPct >= 0.95) return "alev";
  if (score >= scorePar) return "kor";
  return "kul";
}

export const GRADE_LABEL: Record<Grade, string> = {
  kul: "Kül",
  kor: "Kor",
  alev: "Alev",
};

/**
 * Bağ Seviyesi pasif güçlenmeleri. GDD'nin eyer/mücevher ekseninin hafif
 * hâli: mağaza yok, ilerleme doğrudan hikâyeye bağlı.
 */
export type BondBuffs = {
  maxHp: number;
  maxHeat: number;
  staminaRegen: number;
  flameRange: number;
};

export function bondBuffs(bond: number): BondBuffs {
  const t = (Math.min(BOND_MAX, Math.max(1, bond)) - 1) / (BOND_MAX - 1);
  return {
    maxHp: 100 + Math.round(t * 40),
    maxHeat: 100 + Math.round(t * 25),
    staminaRegen: 11 + t * 5,
    flameRange: 1 + t * 0.2,
  };
}

export type BondGain = { xp: number; levels: number; bond: number; bondXp: number };

/** Kazanılan puanı uygular ve kaç seviye atlandığını döndürür. */
export function applyBondXp(save: SaveData, xp: number): BondGain {
  let bond = save.bond;
  let bondXp = save.bondXp + xp;
  let levels = 0;
  while (bondXp >= BOND_STEP && bond < BOND_MAX) {
    bondXp -= BOND_STEP;
    bond++;
    levels++;
  }
  if (bond >= BOND_MAX) bondXp = 0;
  return { xp, levels, bond, bondXp };
}
