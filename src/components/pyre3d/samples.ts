/**
 * Örnek (sample) ses bankası — public/sfx/ altındaki CC0 kayıtlar.
 *
 * Karma model: motor prosedürel kalır, insan sesleri ve "kahraman anlar"
 * (dalış çığlığı, büyük patlama, zafer kükremesi) gerçek kayıttan çalınır.
 * Safari ogg/flac çözemiyor; format kontrolü decode denemesinin kendisi —
 * çözülemeyen dosya kalıcı olarak devre dışı kalır, kategori boş kalırsa
 * çağıran taraf prosedürel gövdesine düşer.
 */

export type SampleCategory =
  | "menuGrowl"
  | "diveScream"
  | "fireballLaunch"
  | "fireballImpact"
  | "explosion"
  | "humanScreamF"
  | "humanScreamM"
  | "crowd"
  | "laser"
  | "victoryRoar"
  | "wingFlap"
  | "breathStart"
  | "fireLoop"
  | "debris";

type CategoryDef = {
  /** Güvenli formatlar (mp3/wav) önce — Safari'de en az biri çözülsün. */
  files: string[];
  /** Kategori taban kazancı. */
  gain: number;
  /** 0 = menü jesti, 1 = brifing yüklemesi, 2 = tembel. */
  tier: 0 | 1 | 2;
  /** ± playbackRate sapması (varsayılan 0.06). */
  jitter?: number;
};

const CATS: Record<SampleCategory, CategoryDef> = {
  menuGrowl: {
    files: [
      "beast_growl_01.mp3",
      "beast_growl_02.mp3",
      "beast_growl_03.mp3",
      "beast_growl_04.mp3",
      "creature_growl_01.wav",
      "creature_growl_02.wav",
      "dragon_growl_angry.wav",
    ],
    gain: 0.5,
    tier: 0,
  },
  diveScream: {
    files: [
      "dragon_roar_wild.wav",
      "dragon_roar_deep.wav",
      "creature_scream_01.wav",
      "creature_scream_02.wav",
      "creature_scream_03.wav",
      "dragon_scream_03.ogg",
      "dragon_scream_07.ogg",
      "dive_roar_01.ogg",
      "dive_roar_02.ogg",
      "dive_monster_01.ogg",
    ],
    gain: 0.85,
    tier: 1,
  },
  fireballLaunch: {
    files: ["fire_whoosh.wav", "rocket_01.wav", "flame_burst_01.ogg", "flame_burst_02.ogg"],
    gain: 0.55,
    tier: 1,
  },
  fireballImpact: {
    files: [
      "big_boom.wav",
      "big_explosion.wav",
      "mech_explosion.wav",
      "blast_01.ogg",
      "blast_02.ogg",
    ],
    gain: 0.9,
    tier: 1,
  },
  explosion: {
    files: [
      "dynamite.wav",
      "distant_boom.wav",
      "explosion_01.ogg",
      "explosion_02.ogg",
      "explosion_03.ogg",
      "explosion_05.ogg",
      "explosion_07.ogg",
    ],
    gain: 0.6,
    tier: 1,
  },
  humanScreamF: {
    files: [
      "scream_high_01.mp3",
      "scream_high_02.mp3",
      "scream_female_01.ogg",
      "scream_female_02.ogg",
    ],
    gain: 0.5,
    tier: 1,
  },
  humanScreamM: {
    files: [
      "scream_male_01.flac",
      "scream_male_03.flac",
      "scream_male_05.flac",
      "scream_male_07.flac",
      "scream_male_09.flac",
      "scream_male_11.flac",
      "scream_male_13.flac",
      "scream_male_15.flac",
    ],
    gain: 0.5,
    tier: 2,
  },
  crowd: {
    files: ["crowd_shout.ogg"],
    gain: 0.45,
    tier: 2,
  },
  laser: {
    files: ["laser_01.wav", "laser_02.wav", "laser_03.wav", "laser_rifle.ogg"],
    gain: 0.32,
    tier: 1,
  },
  victoryRoar: {
    files: ["dragon_roar_echo.wav", "creature_deep_roar.wav", "dragon_roar_deep.wav"],
    gain: 1.0,
    tier: 1,
  },
  wingFlap: {
    files: ["dragon_flap.mp3", "dragon_flap.wav"],
    gain: 0.3,
    tier: 2,
  },
  breathStart: {
    files: ["dragon_fire_breath.wav"],
    gain: 0.45,
    tier: 1,
  },
  fireLoop: {
    files: ["flame_loop.ogg"],
    gain: 0.5,
    tier: 2,
  },
  debris: {
    files: [
      "glass_break_04.wav",
      "wood_break_01.ogg",
      "wood_break_02.ogg",
      "metal_fall_01.ogg",
      "rock_break_01.ogg",
      "debris_01.ogg",
      "debris_02.ogg",
    ],
    gain: 0.4,
    tier: 2,
  },
};

export type PlayHandle = { stop(fade?: number): void };

export type SampleBank = {
  /** Verilen katmana kadar (dahil) tüm dosyaları sırayla yüklemeye başlar. */
  preload(tier: 0 | 1 | 2): void;
  /** Kategoride çözülmüş en az bir dosya var mı? */
  ready(cat: SampleCategory): boolean;
  play(
    cat: SampleCategory,
    opts: { dest: AudioNode; gain?: number; rate?: number; loop?: boolean },
  ): PlayHandle | null;
  /** Tanı: kategori başına {çalındı, decodeHatası} sayaçları. */
  stats(): Record<string, { plays: number; failed: number }>;
  dispose(): void;
};

export function createSampleBank(getCtx: () => AudioContext | null): SampleBank {
  const buffers = new Map<string, AudioBuffer>();
  const failed = new Set<string>();
  const queued = new Set<string>();
  const lastIdx = new Map<SampleCategory, number>();
  const plays = new Map<SampleCategory, number>();
  let queue: string[] = [];
  let loading = false;
  let disposed = false;
  let maxTier = -1;

  const pump = () => {
    if (loading || disposed) return;
    const file = queue.shift();
    if (!file) return;
    loading = true;
    const ac = getCtx();
    if (!ac) {
      // Bağlam henüz yok — kuyruğa geri koy, unlock sonrası preload tekrar çağrılır.
      queue.unshift(file);
      loading = false;
      return;
    }
    fetch(`/sfx/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      })
      .then((ab) => ac.decodeAudioData(ab))
      .then((buf) => {
        if (!disposed) buffers.set(file, buf);
      })
      .catch(() => {
        failed.add(file);
      })
      .finally(() => {
        loading = false;
        // Kuyruğu boşalt ama kare başına tek decode: ana thread'i boğma.
        if (queue.length) setTimeout(pump, 40);
      });
  };

  const enqueueTier = (tier: number) => {
    for (const [, def] of Object.entries(CATS) as [SampleCategory, CategoryDef][]) {
      if (def.tier !== tier) continue;
      for (const f of def.files) {
        if (queued.has(f) || failed.has(f) || buffers.has(f)) continue;
        queued.add(f);
        queue.push(f);
      }
    }
  };

  return {
    preload(tier) {
      // Daha önce istenen katmanlar da dahil — unlock gecikirse tekrar çağrı güvenli.
      for (let t = 0; t <= tier; t++) {
        if (t > maxTier) enqueueTier(t);
      }
      maxTier = Math.max(maxTier, tier);
      pump();
    },
    ready(cat) {
      return CATS[cat].files.some((f) => buffers.has(f));
    },
    play(cat, opts) {
      const ac = getCtx();
      if (!ac || ac.state !== "running") return null;
      const def = CATS[cat];
      // Çözülmüş dosyalar arasından art arda aynısı gelmeyecek şekilde seç.
      const avail: string[] = [];
      for (const f of def.files) if (buffers.has(f)) avail.push(f);
      if (!avail.length) return null;
      let idx = Math.floor(Math.random() * avail.length);
      const prev = lastIdx.get(cat);
      if (avail.length > 1 && idx === prev) idx = (idx + 1) % avail.length;
      lastIdx.set(cat, idx);
      const buf = buffers.get(avail[idx]!)!;

      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = opts.loop ?? false;
      const jitter = def.jitter ?? 0.06;
      src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() - 0.5) * 2 * jitter);
      const g = ac.createGain();
      g.gain.value = def.gain * (opts.gain ?? 1);
      src.connect(g).connect(opts.dest);
      src.onended = () => {
        try {
          src.disconnect();
          g.disconnect();
        } catch {
          /* boş */
        }
      };
      src.start();
      plays.set(cat, (plays.get(cat) ?? 0) + 1);
      return {
        stop(fade = 0.08) {
          const t = ac.currentTime;
          try {
            g.gain.cancelScheduledValues(t);
            g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
            src.stop(t + fade + 0.02);
          } catch {
            /* zaten durmuş */
          }
        },
      };
    },
    stats() {
      const out: Record<string, { plays: number; failed: number }> = {};
      for (const [cat, def] of Object.entries(CATS) as [SampleCategory, CategoryDef][]) {
        out[cat] = {
          plays: plays.get(cat) ?? 0,
          failed: def.files.filter((f) => failed.has(f)).length,
        };
      }
      return out;
    },
    dispose() {
      disposed = true;
      queue = [];
      buffers.clear();
    },
  };
}
