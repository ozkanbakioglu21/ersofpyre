/**
 * Prosedürel ses motoru — tek bir ses dosyası yok, her şey WebAudio ile
 * sentezleniyor. GDD'nin ses yönü: "derin buhar homurtusu, metal gıcırtısı,
 * alev püskürtmede alçak frekanslı basınç patlaması."
 *
 * AudioContext ilk kullanıcı jestine kadar kurulmuyor: tarayıcılar jestsiz
 * başlatılan bağlamı askıya alır ve konsola uyarı basar.
 */

export type AudioEngine = {
  /** İlk kullanıcı jestinde çağrılır; bağlamı kurar veya devam ettirir. */
  unlock(): void;
  setMuted(muted: boolean): void;
  setVolume(v: number): void;
  /** Konik alev döngüsü — basılı tutuldukça açık kalır. */
  flame(on: boolean): void;
  ambient(on: boolean): void;
  explosion(size: number): void;
  fireball(): void;
  hit(): void;
  enemyShot(): void;
  roll(): void;
  perfect(): void;
  overheat(): void;
  lockOn(): void;
  rage(): void;
  roar(): void;
  ui(): void;
  win(): void;
  lose(): void;
  suspend(): void;
  dispose(): void;
};

type Ctx = {
  ac: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
};

/** Sessiz motor — SSR ve WebAudio desteklemeyen ortamlar için. */
const NOOP: AudioEngine = {
  unlock() {},
  setMuted() {},
  setVolume() {},
  flame() {},
  ambient() {},
  explosion() {},
  fireball() {},
  hit() {},
  enemyShot() {},
  roll() {},
  perfect() {},
  overheat() {},
  lockOn() {},
  rage() {},
  roar() {},
  ui() {},
  win() {},
  lose() {},
  suspend() {},
  dispose() {},
};

function makeNoise(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 2);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  // Kahverengi gürültü: beyaz gürültüden daha "gövdeli", alev ve patlama
  // için beyaz gürültünün tiz cızırtısından çok daha inandırıcı.
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

export function createAudio(initial: { muted: boolean; volume: number }): AudioEngine {
  if (typeof window === "undefined") return NOOP;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return NOOP;

  let ctx: Ctx | null = null;
  let muted = initial.muted;
  let volume = initial.volume;

  // Aynı anda çok fazla patlama sesi hem kulak tırmalıyor hem de düğüm
  // yaratma maliyeti kare süresine yansıyor: yangın zinciri onlarca binayı
  // aynı saniyede yıkabiliyor.
  let voices = 0;
  const MAX_VOICES = 14;
  let lastExplosion = 0;

  let flameNodes: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  let ambientNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let flameWanted = false;
  let ambientWanted = false;

  const ensure = (): Ctx | null => {
    if (ctx) return ctx;
    try {
      const ac = new AC();
      const master = ac.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ac.destination);
      ctx = { ac, master, noise: makeNoise(ac) };
      return ctx;
    } catch {
      return null;
    }
  };

  /** Zamanlanmış seslerde ses düğümlerini otomatik toplar. */
  const track = (node: AudioScheduledSourceNode, stopAt: number) => {
    voices++;
    node.onended = () => {
      voices--;
      node.disconnect();
    };
    node.stop(stopAt);
  };

  const noiseBurst = (
    c: Ctx,
    opts: {
      dur: number;
      peak: number;
      type: BiquadFilterType;
      from: number;
      to: number;
      q?: number;
      delay?: number;
    },
  ) => {
    if (voices > MAX_VOICES) return;
    const t = c.ac.currentTime + (opts.delay ?? 0);
    const src = c.ac.createBufferSource();
    src.buffer = c.noise;
    src.loop = true;
    const filter = c.ac.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.setValueAtTime(opts.from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.dur);
    filter.Q.value = opts.q ?? 1;
    const gain = c.ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(opts.peak, t + Math.min(0.02, opts.dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(filter).connect(gain).connect(c.master);
    src.start(t);
    track(src, t + opts.dur + 0.02);
  };

  const tone = (
    c: Ctx,
    opts: {
      type: OscillatorType;
      from: number;
      to: number;
      dur: number;
      peak: number;
      delay?: number;
    },
  ) => {
    if (voices > MAX_VOICES) return;
    const t = c.ac.currentTime + (opts.delay ?? 0);
    const osc = c.ac.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, opts.to), t + opts.dur);
    const gain = c.ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(opts.peak, t + Math.min(0.015, opts.dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    osc.connect(gain).connect(c.master);
    osc.start(t);
    track(osc, t + opts.dur + 0.02);
  };

  const startFlame = (c: Ctx) => {
    if (flameNodes) return;
    const t = c.ac.currentTime;
    const src = c.ac.createBufferSource();
    src.buffer = c.noise;
    src.loop = true;
    const band = c.ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 620;
    band.Q.value = 0.8;
    const low = c.ac.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 2400;
    const gain = c.ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.32, t + 0.08);
    // Alev düz bir "şşş" değil; yavaş bir LFO basınç dalgalanmasını taşıyor.
    const lfo = c.ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 7.5;
    const lfoGain = c.ac.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(band.frequency);
    src.connect(band).connect(low).connect(gain).connect(c.master);
    src.start(t);
    lfo.start(t);
    flameNodes = { src, gain, lfo };
  };

  const stopFlame = (c: Ctx) => {
    if (!flameNodes) return;
    const { src, gain, lfo } = flameNodes;
    flameNodes = null;
    const t = c.ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.stop(t + 0.16);
    lfo.stop(t + 0.16);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
      lfo.disconnect();
    };
  };

  const startAmbient = (c: Ctx) => {
    if (ambientNodes) return;
    const t = c.ac.currentTime;
    const src = c.ac.createBufferSource();
    src.buffer = c.noise;
    src.loop = true;
    const low = c.ac.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 300;
    const gain = c.ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11, t + 2);
    // Rüzgârın nefes alması: çok yavaş LFO ile kesim frekansı gezinir.
    const lfo = c.ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    const lfoGain = c.ac.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(low.frequency);
    src.connect(low).connect(gain).connect(c.master);
    src.start(t);
    lfo.start(t);
    ambientNodes = { src, gain };
  };

  const stopAmbient = (c: Ctx) => {
    if (!ambientNodes) return;
    const { src, gain } = ambientNodes;
    ambientNodes = null;
    const t = c.ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.stop(t + 0.7);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
    };
  };

  const withCtx = (fn: (c: Ctx) => void) => {
    if (muted) return;
    const c = ctx;
    if (!c || c.ac.state !== "running") return;
    fn(c);
  };

  return {
    unlock() {
      const c = ensure();
      if (!c) return;
      if (c.ac.state === "suspended") void c.ac.resume();
      if (flameWanted) startFlame(c);
      if (ambientWanted) startAmbient(c);
    },
    setMuted(m) {
      muted = m;
      const c = ctx;
      if (!c) return;
      c.master.gain.setTargetAtTime(m ? 0 : volume, c.ac.currentTime, 0.02);
      if (m) stopFlame(c);
      else if (flameWanted) startFlame(c);
    },
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      const c = ctx;
      if (!c || muted) return;
      c.master.gain.setTargetAtTime(volume, c.ac.currentTime, 0.02);
    },
    flame(on) {
      flameWanted = on;
      const c = ctx;
      if (!c || muted || c.ac.state !== "running") return;
      if (on) startFlame(c);
      else stopFlame(c);
    },
    ambient(on) {
      ambientWanted = on;
      const c = ctx;
      if (!c || muted || c.ac.state !== "running") return;
      if (on) startAmbient(c);
      else stopAmbient(c);
    },
    explosion(size) {
      withCtx((c) => {
        // Yangın zinciri saniyede onlarca yıkım üretebiliyor; kulak bunu
        // tek bir gürültü duvarı olarak duyuyor. Aralık sınırı koyuyoruz.
        const now = c.ac.currentTime;
        if (now - lastExplosion < 0.045) return;
        lastExplosion = now;
        const s = Math.min(2, Math.max(0.5, size));
        noiseBurst(c, {
          dur: 0.42 * s,
          peak: 0.34 * s,
          type: "lowpass",
          from: 1800,
          to: 90,
          q: 0.8,
        });
        tone(c, { type: "sine", from: 130 * s, to: 26, dur: 0.5 * s, peak: 0.36 });
        // Metal gıcırtısı: enkazın kendi üstüne çökmesi.
        noiseBurst(c, {
          dur: 0.3,
          peak: 0.07,
          type: "bandpass",
          from: 2600,
          to: 900,
          q: 5,
          delay: 0.06,
        });
      });
    },
    fireball() {
      withCtx((c) => {
        noiseBurst(c, { dur: 0.24, peak: 0.22, type: "bandpass", from: 900, to: 220, q: 1.4 });
        tone(c, { type: "sawtooth", from: 320, to: 90, dur: 0.22, peak: 0.14 });
      });
    },
    hit() {
      withCtx((c) => {
        noiseBurst(c, { dur: 0.16, peak: 0.26, type: "lowpass", from: 1200, to: 160 });
        tone(c, { type: "square", from: 190, to: 60, dur: 0.14, peak: 0.14 });
      });
    },
    enemyShot() {
      withCtx((c) => {
        tone(c, { type: "triangle", from: 880, to: 420, dur: 0.1, peak: 0.06 });
      });
    },
    roll() {
      withCtx((c) => {
        noiseBurst(c, { dur: 0.3, peak: 0.14, type: "bandpass", from: 320, to: 1500, q: 1.2 });
      });
    },
    perfect() {
      withCtx((c) => {
        // Pirinç çan: iki uyumlu ton, kısa ve parlak — ödül sinyali.
        tone(c, { type: "sine", from: 1180, to: 1180, dur: 0.34, peak: 0.16 });
        tone(c, { type: "sine", from: 1770, to: 1770, dur: 0.26, peak: 0.09, delay: 0.02 });
      });
    },
    overheat() {
      withCtx((c) => {
        // Buhar valfi boşalıyor.
        noiseBurst(c, { dur: 0.9, peak: 0.24, type: "highpass", from: 900, to: 3800, q: 0.7 });
        tone(c, { type: "sine", from: 220, to: 70, dur: 0.5, peak: 0.12 });
      });
    },
    lockOn() {
      withCtx((c) => {
        tone(c, { type: "square", from: 620, to: 620, dur: 0.08, peak: 0.08 });
        tone(c, { type: "square", from: 620, to: 620, dur: 0.08, peak: 0.08, delay: 0.14 });
      });
    },
    rage() {
      withCtx((c) => {
        tone(c, { type: "sawtooth", from: 60, to: 180, dur: 1.1, peak: 0.3 });
        noiseBurst(c, { dur: 1.2, peak: 0.2, type: "lowpass", from: 300, to: 1600 });
      });
    },
    roar() {
      withCtx((c) => {
        tone(c, { type: "sawtooth", from: 150, to: 55, dur: 1.3, peak: 0.32 });
        noiseBurst(c, { dur: 1.4, peak: 0.24, type: "bandpass", from: 420, to: 160, q: 1.6 });
      });
    },
    ui() {
      withCtx((c) => {
        tone(c, { type: "square", from: 420, to: 300, dur: 0.05, peak: 0.05 });
      });
    },
    win() {
      withCtx((c) => {
        [0, 0.16, 0.34].forEach((d, i) => {
          tone(c, {
            type: "sine",
            from: 330 * (1 + i * 0.26),
            to: 330 * (1 + i * 0.26),
            dur: 0.5,
            peak: 0.16,
            delay: d,
          });
        });
      });
    },
    lose() {
      withCtx((c) => {
        tone(c, { type: "sine", from: 240, to: 70, dur: 1.6, peak: 0.24 });
        noiseBurst(c, { dur: 1.5, peak: 0.16, type: "lowpass", from: 700, to: 90 });
      });
    },
    suspend() {
      const c = ctx;
      if (!c) return;
      stopFlame(c);
      stopAmbient(c);
      flameWanted = false;
      ambientWanted = false;
    },
    dispose() {
      const c = ctx;
      if (!c) return;
      stopFlame(c);
      stopAmbient(c);
      ctx = null;
      void c.ac.close().catch(() => {});
    },
  };
}
