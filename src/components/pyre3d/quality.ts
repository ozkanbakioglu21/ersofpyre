export type QualityLevel = "low" | "medium" | "high";
export type FpsTarget = 30 | 60 | 0; // 0 = sınırsız

export type QualityPreset = {
  label: string;
  ashCount: number;
  ashSize: number;
  ashOpacity: number;
  fogDensity: number;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
};

export const ASH_MAX = 2600;

/**
 * Sahnedeki ateş ışığı sayısı SABİT tutulur. Three.js, sahnedeki görünür ışık
 * sayısı değiştiğinde tüm materyallerin shader'ını yeniden derler; bu da oyun
 * ortasında donmalara yol açar. Bu yüzden havuz boyutu kaliteye göre değişmez.
 */
export const FIRE_LIGHTS = 6;

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    label: "Düşük",
    ashCount: 500,
    ashSize: 1.8,
    ashOpacity: 0.4,
    fogDensity: 0.0046,
    pixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
  },
  medium: {
    label: "Orta",
    ashCount: 1100,
    ashSize: 1.4,
    ashOpacity: 0.5,
    fogDensity: 0.0038,
    pixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
  },
  high: {
    label: "Yüksek",
    ashCount: ASH_MAX,
    ashSize: 1.2,
    ashOpacity: 0.55,
    fogDensity: 0.0032,
    pixelRatio: 1.75,
    shadows: true,
    shadowMapSize: 2048,
  },
};

/** Cihaz sinyallerine göre başlangıç kalite/FPS tahmini. */
export function detectQuality(): { quality: QualityLevel; fps: FpsTarget } {
  if (typeof window === "undefined") return { quality: "medium", fps: 60 };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? (coarse ? 4 : 8);
  const small = Math.min(window.innerWidth, window.innerHeight) < 520;

  if (coarse && (cores <= 4 || mem <= 3 || small)) return { quality: "low", fps: 30 };
  if (coarse) return { quality: "medium", fps: 60 };
  if (cores <= 4 || mem <= 4) return { quality: "medium", fps: 60 };
  return { quality: "high", fps: 60 };
}

const KEY = "pyre3d-quality";

export function loadSettings(): { quality: QualityLevel; fps: FpsTarget } {
  if (typeof window === "undefined") return { quality: "medium", fps: 60 };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as { quality?: QualityLevel; fps?: FpsTarget };
      if (p.quality && QUALITY_PRESETS[p.quality]) {
        return { quality: p.quality, fps: (p.fps ?? 60) as FpsTarget };
      }
    }
  } catch {
    /* ignore */
  }
  return detectQuality();
}

export function saveSettings(quality: QualityLevel, fps: FpsTarget) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ quality, fps }));
  } catch {
    /* ignore */
  }
}
