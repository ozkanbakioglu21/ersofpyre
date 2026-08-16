/**
 * Tohumlanabilir rastgelelik. Şehir üretimi bunu kullanır: aynı bölüm her
 * açılışta aynı şehri kursun, "en iyi skor" adil kalsın ve hata ayıklama
 * tekrarlanabilir olsun.
 */
export type Rng = {
  (): number;
  range(a: number, b: number): number;
  int(a: number, b: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  /** Ağırlıklı seçim; ağırlıklar toplamı 0'dan büyük olmalı. */
  weighted<T extends string>(weights: Record<T, number>): T;
};

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng = next as Rng;
  rng.range = (lo, hi) => lo + next() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  rng.pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  rng.chance = (p) => next() < p;
  rng.weighted = <T extends string>(weights: Record<T, number>): T => {
    const keys = Object.keys(weights) as T[];
    let total = 0;
    for (const k of keys) total += weights[k];
    let r = next() * total;
    for (const k of keys) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return keys[keys.length - 1]!;
  };
  return rng;
}

/** Tohumsuz kısa yol — görsel titreşim gibi tekrarlanabilir olması gerekmeyen yerler için. */
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
