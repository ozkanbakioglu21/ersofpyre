/**
 * Karma ses motoru — prosedürel çekirdek + CC0 örnek katmanı.
 *
 * Prosedürel gövdeler her zaman hazır (SSR ve decode hatası güvenli);
 * örnekler (public/sfx/) çözüldükçe insan sesleri, dalış çığlığı, patlama
 * ve lazer gibi "sinematik" kategoriler gerçek kayıttan çalınır.
 *
 * Performans sözleşmesi:
 *  - Her SFX kategori bazında gate'lenir (min aralık + eşzamanlılık tavanı).
 *    Gate edilen çağrı HİÇ node kurmadan döner — kalabalık bir karede yüzlerce
 *    WebAudio düğümü yaratılması (eski takılma sebebi) imkânsız hale gelir.
 *  - AudioContext ilk kullanıcı jestine kadar kurulmaz.
 */

import { createSampleBank, type SampleBank } from "./samples";

export type AudioEngine = {
  unlock(): void;
  setMuted(muted: boolean): void;
  setVolume(v: number): void;
  /** Örnek dosyaları katman katman yükle (0=menü, 1=görev, 2=tembel). */
  preload(tier: 0 | 1 | 2): void;
  flame(on: boolean): void;
  ambient(on: boolean): void;
  siren(on: boolean): void;
  music(on: boolean): void;
  /** Müzik gerginliği 0..1 — pad filtresi, davul deseni ve riser buna uyar. */
  setIntensity(v: number): void;
  /** Savaş alanı yatağı: combat = lazer/patlama yoğunluğu, fire = yangın. */
  battleLoop(combat: number, fire: number): void;
  explosion(size: number): void;
  fireballLaunch(): void;
  /** Köz Mermisi uçuş ıslığı; mermi ölünce stop() çağrılır. */
  fireballTravel(): { stop(): void } | null;
  fireballImpact(): void;
  hit(): void;
  enemyShot(): void;
  roll(): void;
  perfect(): void;
  overheat(): void;
  lockOn(): void;
  rage(): void;
  roar(): void;
  /** İnsan çığlığı — örnek destekli, gate'li. */
  scream(): void;
  growl(): void;
  bellow(): void;
  snarl(): void;
  wingFlap(): void;
  creatureAttack(): void;
  creatureDeath(): void;
  creatureAmbient(): void;
  /** Dalış girişinde tek korkunç ejderha çığlığı (0..1 yoğunluk). */
  dragonDiveScream(intensity: number): void;
  /** Dalma rüzgarı: 0..1 yoğunluk. */
  diveWind(intensity: number): void;
  /** Menü canavar hırıltısı. */
  menuGrowl(): void;
  /** Zafer sinematiği kükremesi. */
  victoryRoar(): void;
  ui(): void;
  win(): void;
  lose(): void;
  suspend(): void;
  dispose(): void;
  /** Tanı: canlı voice sayısı ve örnek istatistikleri. */
  debug(): { voices: number; samples: Record<string, { plays: number; failed: number }> };
};

type Buses = {
  voice: GainNode;
  creature: GainNode;
  weapon: GainNode;
  explosion: GainNode;
  hero: GainNode;
  music: GainNode;
  ui: GainNode;
};

type Ctx = {
  ac: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
  snareNoise: AudioBuffer;
  bus: Buses;
};

/** Sessiz motor — SSR ve WebAudio desteklemeyen ortamlar için. */
const NOOP: AudioEngine = {
  unlock() {},
  setMuted() {},
  setVolume() {},
  preload() {},
  flame() {},
  ambient() {},
  siren() {},
  music() {},
  setIntensity() {},
  battleLoop() {},
  explosion() {},
  fireballLaunch() {},
  fireballTravel() {
    return null;
  },
  fireballImpact() {},
  hit() {},
  enemyShot() {},
  roll() {},
  perfect() {},
  overheat() {},
  lockOn() {},
  rage() {},
  roar() {},
  scream() {},
  growl() {},
  bellow() {},
  snarl() {},
  wingFlap() {},
  creatureAttack() {},
  creatureDeath() {},
  creatureAmbient() {},
  dragonDiveScream() {},
  diveWind() {},
  menuGrowl() {},
  victoryRoar() {},
  ui() {},
  win() {},
  lose() {},
  suspend() {},
  dispose() {},
  debug() {
    return { voices: 0, samples: {} };
  },
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

function makeSnareNoise(ac: AudioContext): AudioBuffer {
  // Trampet/hat için tek seferlik beyaz gürültü — her vuruşta yeni buffer
  // ayırmak ana thread'de kare düşürüyordu.
  const len = Math.floor(ac.sampleRate * 0.15);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Alev bozulma eğrisi — her startFlame'de 256 tanh hesaplamamak için sabit. */
const FLAME_CURVE = (() => {
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 128 - 1;
    curve[i] = Math.tanh(x * 3.5);
  }
  return curve;
})();

/** Kategori bazlı gate: min aralık (sn) + aynı anda çalabilen üst sınır. */
const THROTTLE: Record<string, { gap: number; max: number; dur: number }> = {
  scream: { gap: 0.15, max: 3, dur: 1.2 },
  creatureDeath: { gap: 0.25, max: 2, dur: 1.6 },
  creatureAttack: { gap: 0.12, max: 3, dur: 0.4 },
  enemyShot: { gap: 0.09, max: 4, dur: 0.3 },
  explosion: { gap: 0.07, max: 4, dur: 0.9 },
  fireballImpact: { gap: 0.2, max: 2, dur: 1.4 },
  hit: { gap: 0.08, max: 2, dur: 0.2 },
  snarl: { gap: 0.15, max: 2, dur: 0.4 },
  wingFlap: { gap: 0.2, max: 1, dur: 0.2 },
  growl: { gap: 0.5, max: 1, dur: 1.0 },
  creatureAmbient: { gap: 0.8, max: 1, dur: 1.2 },
  diveScream: { gap: 1.5, max: 1, dur: 1.6 },
  debris: { gap: 0.2, max: 2, dur: 0.8 },
};

export function createAudio(initial: { muted: boolean; volume: number }): AudioEngine {
  if (typeof window === "undefined") return NOOP;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return NOOP;

  let ctx: Ctx | null = null;
  let muted = initial.muted;
  let volume = initial.volume;

  // Voice bütçesi: bir karede yaratılabilecek düğüm sayısını sınırlar.
  // Kalıcı döngüler (alev, müzik...) başlarken bütçeden pay ayırır.
  let voices = 0;
  const MAX_VOICES = 72;

  const gateState = new Map<string, { last: number; ends: number[] }>();
  /** true dönerse ses çalınabilir; false dönerse HİÇBİR düğüm kurulmadan çık. */
  const gate = (name: keyof typeof THROTTLE): boolean => {
    const c = ctx;
    if (!c) return false;
    const cfg = THROTTLE[name]!;
    const now = c.ac.currentTime;
    let st = gateState.get(name);
    if (!st) {
      st = { last: -99, ends: [] };
      gateState.set(name, st);
    }
    while (st.ends.length && st.ends[0]! <= now) st.ends.shift();
    if (now - st.last < cfg.gap || st.ends.length >= cfg.max) return false;
    st.last = now;
    st.ends.push(now + cfg.dur);
    return true;
  };

  const bank: SampleBank = createSampleBank(() => ctx?.ac ?? null);

  let flameNodes: {
    src: AudioBufferSourceNode;
    gain: GainNode;
    lfo: OscillatorNode;
    lfo2: OscillatorNode;
    lfo3: OscillatorNode;
    sub: OscillatorNode;
    subGain: GainNode;
    subLfo: OscillatorNode;
    band: BiquadFilterNode;
    band2: BiquadFilterNode;
    ws: WaveShaperNode;
    low: BiquadFilterNode;
  } | null = null;
  let ambientNodes: {
    src: AudioBufferSourceNode;
    gain: GainNode;
    lfo: OscillatorNode;
    low: BiquadFilterNode;
  } | null = null;
  let sirenNodes: {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    gain: GainNode;
    stop: () => void;
  } | null = null;
  let flameWanted = false;
  let ambientWanted = false;
  let sirenWanted = false;
  let musicWanted = false;
  let diveWindNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let diveWindTarget = -1;
  let diveWindSilentAt = 0;
  let onVis: (() => void) | null = null;

  /* ---- müzik durumu ---- */
  let intensity = 0.2;
  let musicNodes: {
    masterGain: GainNode;
    padGain: GainNode;
    drumGain: GainNode;
    padOscs: OscillatorNode[];
    padFilters: BiquadFilterNode[];
    tensionOsc: OscillatorNode;
    tensionFilter: BiquadFilterNode;
    tensionGain: GainNode;
    stop: () => void;
  } | null = null;

  /* ---- savaş alanı yatağı ---- */
  let battleCombat = 0;
  let battleFire = 0;
  let battleNodes: {
    bedSrc: AudioBufferSourceNode;
    bedGain: GainNode;
    bedLow: BiquadFilterNode;
    lastFireGain: number;
    quietSince: number;
    timer: ReturnType<typeof setInterval>;
  } | null = null;

  const ensure = (): Ctx | null => {
    if (ctx) return ctx;
    try {
      const ac = new AC();
      const master = ac.createGain();
      master.gain.value = muted ? 0 : volume;
      // Limiter — birden fazla ses üst üste bindiğinde kliplamayı önler
      const limiter = ac.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 6;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.15;
      master.connect(limiter).connect(ac.destination);
      const mkBus = (g: number) => {
        const b = ac.createGain();
        b.gain.value = g;
        b.connect(master);
        return b;
      };
      const bus: Buses = {
        voice: mkBus(0.9),
        creature: mkBus(1.0),
        weapon: mkBus(0.7),
        explosion: mkBus(1.0),
        hero: mkBus(1.0),
        music: mkBus(1.0),
        ui: mkBus(0.8),
      };
      ctx = { ac, master, noise: makeNoise(ac), snareNoise: makeSnareNoise(ac), bus };
      // Tab arka plana gittiğinde otomatik durdur/ön plana geldiğinde devam ettir
      onVis = () => {
        if (document.hidden) {
          if (ac.state === "running") void ac.suspend();
        } else {
          if (ac.state === "suspended") void ac.resume();
        }
      };
      document.addEventListener("visibilitychange", onVis);
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
      dest?: AudioNode;
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
    src
      .connect(filter)
      .connect(gain)
      .connect(opts.dest ?? c.master);
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
      dest?: AudioNode;
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
    osc.connect(gain).connect(opts.dest ?? c.master);
    osc.start(t);
    track(osc, t + opts.dur + 0.02);
  };

  const startFlame = (c: Ctx) => {
    if (flameNodes) return;
    const t = c.ac.currentTime;
    voices += 4; // kalıcı döngü bütçeden pay alsın

    // Ana gürültü kaynağı — kahverengi gürültü
    const src = c.ac.createBufferSource();
    src.buffer = c.noise;
    src.loop = true;

    // Bantgeçiren filtre — ateşin "hırlaması"
    const band = c.ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 680;
    band.Q.value = 1.1;

    // Düşük frekans tırmalama — sub-bass katmanı
    const band2 = c.ac.createBiquadFilter();
    band2.type = "bandpass";
    band2.frequency.value = 320;
    band2.Q.value = 1.8;

    // Bozulma — waveshaper ile korkunç tırtıklı doku
    const ws = c.ac.createWaveShaper();
    ws.curve = FLAME_CURVE;
    ws.oversample = "2x";

    // Düşük geçiren — tiz sızırtıyı kes
    const low = c.ac.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 1800;

    // Ana kazanç
    const gain = c.ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.42, t + 0.06);

    // Sub-bass osc — göğsü titreten dip frekans (LFO ile modüle)
    const sub = c.ac.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 55;
    const subGain = c.ac.createGain();
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(0.18, t + 0.08);
    // Sub-bass LFO — hafif frekans titreşimi
    const subLfo = c.ac.createOscillator();
    subLfo.type = "sine";
    subLfo.frequency.value = 0.6;
    const subLfoGain = c.ac.createGain();
    subLfoGain.gain.value = 5;
    subLfo.connect(subLfoGain).connect(sub.frequency);

    // LFO — hızlı nabız, alevin "hırlaması"
    const lfo = c.ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 11;
    const lfoGain = c.ac.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(band.frequency);

    // İkinci LFO — daha yavaş, genlik dalgalanması
    const lfo2 = c.ac.createOscillator();
    lfo2.type = "triangle";
    lfo2.frequency.value = 2.8;
    const lfo2Gain = c.ac.createGain();
    lfo2Gain.gain.value = 0.14;
    lfo2.connect(lfo2Gain).connect(gain.gain);

    // Üçüncü LFO — çok yavaş, alevin doğal "nefes alması"
    const lfo3 = c.ac.createOscillator();
    lfo3.type = "sine";
    lfo3.frequency.value = 0.18;
    const lfo3Gain = c.ac.createGain();
    lfo3Gain.gain.value = 0.08;
    lfo3.connect(lfo3Gain).connect(gain.gain);

    // Sinyal zinciri: gürültü → bant → bant2 → bozulma → lowpass → gain
    src.connect(band);
    src.connect(band2);
    band2.connect(ws);
    band.connect(ws);
    ws.connect(low);
    low.connect(gain);
    gain.connect(c.bus.hero);

    // Sub-bass bağımsız yol
    sub.connect(subGain);
    subGain.connect(c.bus.hero);

    src.start(t);
    lfo.start(t);
    lfo2.start(t);
    lfo3.start(t);
    sub.start(t);
    subLfo.start(t);

    flameNodes = { src, gain, lfo, lfo2, lfo3, sub, subGain, subLfo, band, band2, ws, low };

    // Nefes başlangıcı: gerçek ejderha alev püskürtme kaydı üstte
    bank.play("breathStart", { dest: c.bus.hero, gain: 1 });
  };

  const stopFlame = (c: Ctx) => {
    if (!flameNodes) return;
    const n = flameNodes;
    flameNodes = null;
    voices = Math.max(0, voices - 4);
    const t = c.ac.currentTime;
    // Fade out
    n.gain.gain.cancelScheduledValues(t);
    n.gain.gain.setValueAtTime(Math.max(0.0001, n.gain.gain.value), t);
    n.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    n.subGain.gain.cancelScheduledValues(t);
    n.subGain.gain.setValueAtTime(Math.max(0.0001, n.subGain.gain.value), t);
    n.subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    // Tüm oscillator'ları durdur
    n.src.stop(t + 0.18);
    n.lfo.stop(t + 0.18);
    n.lfo2.stop(t + 0.18);
    n.lfo3.stop(t + 0.18);
    n.sub.stop(t + 0.18);
    n.subLfo.stop(t + 0.18);
    // Tüm node'ları disconnect et
    n.src.onended = () => {
      try {
        n.src.disconnect();
        n.gain.disconnect();
        n.lfo.disconnect();
        n.lfo2.disconnect();
        n.lfo3.disconnect();
        n.sub.disconnect();
        n.subGain.disconnect();
        n.subLfo.disconnect();
        n.band.disconnect();
        n.band2.disconnect();
        n.ws.disconnect();
        n.low.disconnect();
      } catch {
        /* boş */
      }
    };
  };

  const startAmbient = (c: Ctx) => {
    if (ambientNodes) return;
    const t = c.ac.currentTime;
    voices += 2;
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
    ambientNodes = { src, gain, lfo, low };
  };

  const stopAmbient = (c: Ctx) => {
    if (!ambientNodes) return;
    const { src, gain, lfo, low } = ambientNodes;
    ambientNodes = null;
    voices = Math.max(0, voices - 2);
    const t = c.ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.stop(t + 0.7);
    lfo.stop(t + 0.7);
    src.onended = () => {
      try {
        src.disconnect();
        gain.disconnect();
        lfo.disconnect();
        low.disconnect();
      } catch {
        /* boş */
      }
    };
  };

  /* ---- hava saldırısı sireni ---- */
  const SIREN_PERIOD = 3.5;

  const startSiren = (c: Ctx) => {
    if (sirenNodes) return;
    const t = c.ac.currentTime;
    voices += 2;
    const gain = c.ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 1.2);

    // Birincil siren: 400–800 Hz arası sawtooth tarama
    const osc1 = c.ac.createOscillator();
    osc1.type = "sawtooth";
    // İkincil siren: fazda kayık (duraklama etkisi)
    const osc2 = c.ac.createOscillator();
    osc2.type = "sawtooth";

    // Düşük geçiren filtre — tiz sızırtıyı yumuşat
    const filter = c.ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    filter.Q.value = 1.2;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(c.master);

    // Tarama planlayıcı: kapanış bayrağı closure'da — eski kodda mevcut olan
    // "stopSiren timer'ı temizledikten sonra döngü kendini yeniden kurar"
    // yarışı bu bayrakla bitiyor.
    let running = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const scheduleSweep = (from: number) => {
      osc1.frequency.setValueAtTime(400, from);
      osc1.frequency.linearRampToValueAtTime(800, from + SIREN_PERIOD / 2);
      osc1.frequency.linearRampToValueAtTime(400, from + SIREN_PERIOD);
      osc2.frequency.setValueAtTime(420, from);
      osc2.frequency.linearRampToValueAtTime(820, from + SIREN_PERIOD / 2);
      osc2.frequency.linearRampToValueAtTime(420, from + SIREN_PERIOD);
    };
    const loop = () => {
      if (!running) return;
      scheduleSweep(c.ac.currentTime);
      timerId = setTimeout(loop, SIREN_PERIOD * 1000);
    };
    scheduleSweep(t);
    timerId = setTimeout(loop, SIREN_PERIOD * 1000);

    osc1.start(t);
    osc2.start(t);
    sirenNodes = {
      osc1,
      osc2,
      gain,
      stop: () => {
        running = false;
        if (timerId) clearTimeout(timerId);
      },
    };
  };

  const stopSiren = (c: Ctx) => {
    if (!sirenNodes) return;
    const { osc1, osc2, gain, stop } = sirenNodes;
    stop();
    sirenNodes = null;
    voices = Math.max(0, voices - 2);
    const t = c.ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc1.stop(t + 1.4);
    osc2.stop(t + 1.4);
    osc1.onended = () => {
      osc1.disconnect();
      osc2.disconnect();
      gain.disconnect();
    };
  };

  /* ---- prosedürel savaş müziği — yoğunluğa tepkili ---- */
  const musicVol = () => 0.35 + 0.25 * intensity;

  const startMusic = (c: Ctx) => {
    if (musicNodes) return;
    const t = c.ac.currentTime;
    voices += 6;

    const masterGain = c.ac.createGain();
    masterGain.gain.setValueAtTime(0.0001, t);
    masterGain.gain.linearRampToValueAtTime(musicVol(), t + 1.5);
    masterGain.connect(c.bus.music);

    // KATMAN 1: Dark pad — Dm chord drone (D3, F3, A3)
    const padGain = c.ac.createGain();
    padGain.gain.value = 0.25;
    padGain.connect(masterGain);

    const padOscs: OscillatorNode[] = [];
    const padFilters: BiquadFilterNode[] = [];
    [146.8, 174.6, 220].forEach((f) => {
      const osc = c.ac.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      const osc2 = c.ac.createOscillator();
      osc2.type = "sawtooth";
      osc2.frequency.value = f * 1.003;
      const g = c.ac.createGain();
      g.gain.value = 0.12;
      const filter = c.ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500 + 1400 * intensity;
      filter.Q.value = 0.6;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(g);
      g.connect(padGain);
      osc.start(t);
      osc2.start(t);
      padOscs.push(osc, osc2);
      padFilters.push(filter);
    });

    // KATMAN 2: Savaş davulları — lookahead planlayıcı.
    // setInterval yalnız "sıradaki vuruşları kuyruğa yaz" işini yapar; vuruş
    // zamanları ac.currentTime ızgarasında ilerler, timer jitter'ı duyulmaz.
    const drumGain = c.ac.createGain();
    drumGain.gain.value = 0.4;
    drumGain.connect(masterGain);

    const playKick = (time: number) => {
      const osc = c.ac.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
      const g = c.ac.createGain();
      g.gain.setValueAtTime(0.7, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
      osc.connect(g).connect(drumGain);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
      osc.start(time);
      osc.stop(time + 0.3);
    };
    const playSnare = (time: number) => {
      const nSrc = c.ac.createBufferSource();
      nSrc.buffer = c.snareNoise;
      const nFilter = c.ac.createBiquadFilter();
      nFilter.type = "highpass";
      nFilter.frequency.value = 2000;
      const nGain = c.ac.createGain();
      nGain.gain.setValueAtTime(0.5, time);
      nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      nSrc.connect(nFilter).connect(nGain).connect(drumGain);
      nSrc.onended = () => {
        nSrc.disconnect();
        nFilter.disconnect();
        nGain.disconnect();
      };
      nSrc.start(time);
      nSrc.stop(time + 0.15);
      const osc = c.ac.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(200, time);
      osc.frequency.exponentialRampToValueAtTime(80, time + 0.08);
      const oGain = c.ac.createGain();
      oGain.gain.setValueAtTime(0.3, time);
      oGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      osc.connect(oGain).connect(drumGain);
      osc.onended = () => {
        osc.disconnect();
        oGain.disconnect();
      };
      osc.start(time);
      osc.stop(time + 0.15);
    };
    const playHat = (time: number) => {
      const nSrc = c.ac.createBufferSource();
      nSrc.buffer = c.snareNoise;
      const nFilter = c.ac.createBiquadFilter();
      nFilter.type = "highpass";
      nFilter.frequency.value = 6500;
      const nGain = c.ac.createGain();
      nGain.gain.setValueAtTime(0.16, time);
      nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      nSrc.connect(nFilter).connect(nGain).connect(drumGain);
      nSrc.onended = () => {
        nSrc.disconnect();
        nFilter.disconnect();
        nGain.disconnect();
      };
      nSrc.start(time);
      nSrc.stop(time + 0.07);
    };

    // 120 BPM, 2 sn'lik bar, 8 adım (çeyrek = 0.5 sn, adım = 0.25 sn).
    const STEP = 0.25;
    let running = true;
    let stepIdx = 0;
    let nextStep = t + 0.05;
    const scheduleStep = (time: number, i: number) => {
      if (i === 0 || i === 4) playKick(time);
      if ((i === 2 || i === 6) && intensity >= 0.3) playSnare(time);
      if (i % 2 === 1 && intensity > 0.7) playHat(time);
    };
    const tick = () => {
      if (!running) return;
      const now = c.ac.currentTime;
      // Suspend sonrası zaman sıçraması: ızgarayı yeniden hizala.
      if (nextStep < now - 0.2) {
        nextStep = now + 0.05;
        stepIdx = 0;
      }
      while (nextStep < now + 0.6) {
        scheduleStep(nextStep, stepIdx);
        nextStep += STEP;
        stepIdx = (stepIdx + 1) % 8;
      }
    };
    const drumTimer = setInterval(tick, 250);
    tick();

    // KATMAN 3: Tension riser
    const tensionOsc = c.ac.createOscillator();
    tensionOsc.type = "sawtooth";
    tensionOsc.frequency.value = 110;
    const tensionFilter = c.ac.createBiquadFilter();
    tensionFilter.type = "lowpass";
    tensionFilter.frequency.value = 400;
    tensionFilter.Q.value = 1.2;
    const tensionGain = c.ac.createGain();
    tensionGain.gain.value = 0.001;
    tensionOsc.connect(tensionFilter).connect(tensionGain).connect(masterGain);
    tensionOsc.start(t);

    let tensionTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleTension = () => {
      if (!running) return;
      const now = c.ac.currentTime;
      const sweep = 6 - intensity * 2; // gerginlik arttıkça riser hızlanır
      tensionOsc.frequency.setValueAtTime(110, now);
      tensionOsc.frequency.linearRampToValueAtTime(220, now + sweep);
      tensionFilter.frequency.setValueAtTime(400, now);
      tensionFilter.frequency.linearRampToValueAtTime(1200, now + sweep);
      tensionGain.gain.cancelScheduledValues(now);
      tensionGain.gain.setValueAtTime(0.001, now);
      tensionGain.gain.linearRampToValueAtTime(0.02 + 0.12 * intensity, now + sweep * 0.5);
      tensionGain.gain.linearRampToValueAtTime(0.001, now + sweep);
      tensionTimer = setTimeout(scheduleTension, (sweep + 1 + (1 - intensity) * 2) * 1000);
    };
    tensionTimer = setTimeout(scheduleTension, 3000);

    musicNodes = {
      masterGain,
      padGain,
      drumGain,
      padOscs,
      padFilters,
      tensionOsc,
      tensionFilter,
      tensionGain,
      stop: () => {
        running = false;
        clearInterval(drumTimer);
        if (tensionTimer) clearTimeout(tensionTimer);
      },
    };
  };

  const stopMusic = (c: Ctx) => {
    if (!musicNodes) return;
    const m = musicNodes;
    m.stop();
    musicNodes = null;
    voices = Math.max(0, voices - 6);
    const t = c.ac.currentTime;

    m.masterGain.gain.cancelScheduledValues(t);
    m.masterGain.gain.setValueAtTime(Math.max(0.0001, m.masterGain.gain.value), t);
    m.masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 2);

    m.tensionOsc.stop(t + 2.5);
    m.padOscs.forEach((o) => {
      try {
        o.stop(t + 2.5);
      } catch {
        /* boş */
      }
    });

    m.tensionOsc.onended = () => {
      try {
        m.masterGain.disconnect();
        m.padGain.disconnect();
        m.drumGain.disconnect();
        m.tensionOsc.disconnect();
        m.tensionFilter.disconnect();
        m.tensionGain.disconnect();
        m.padOscs.forEach((o) => o.disconnect());
      } catch {
        /* boş */
      }
    };
  };

  const applyIntensity = () => {
    const c = ctx;
    if (!c || !musicNodes) return;
    const now = c.ac.currentTime;
    musicNodes.masterGain.gain.setTargetAtTime(muted ? 0.0001 : musicVol(), now, 1.0);
    const cutoff = 500 + 1400 * intensity;
    for (const f of musicNodes.padFilters) f.frequency.setTargetAtTime(cutoff, now, 1.2);
    musicNodes.drumGain.gain.setTargetAtTime(0.4 + Math.max(0, intensity - 0.5) * 0.3, now, 1.0);
  };

  /* ---- savaş alanı yatağı ---- */
  const startBattle = (c: Ctx) => {
    if (battleNodes) return;
    voices += 2;
    const t = c.ac.currentTime;
    // Yangın yatağı: alçak geçirilmiş kahverengi gürültü — uzak yangın uğultusu.
    const bedSrc = c.ac.createBufferSource();
    bedSrc.buffer = c.noise;
    bedSrc.loop = true;
    const bedLow = c.ac.createBiquadFilter();
    bedLow.type = "lowpass";
    bedLow.frequency.value = 420;
    const bedGain = c.ac.createGain();
    bedGain.gain.value = 0.0001;
    bedSrc.connect(bedLow).connect(bedGain).connect(c.master);
    bedSrc.start(t);

    // Planlayıcı: uzak lazer atışları ve ara patlamalar. Yoğunluk değişkenleri
    // battleLoop() çağrılarından okunur; ses üretimi bu tek timer'dan çıkar.
    const timer = setInterval(() => {
      const cc = ctx;
      if (!cc || muted || cc.ac.state !== "running" || !battleNodes) return;
      if (battleCombat > 0.05) {
        if (Math.random() < battleCombat * 0.55) {
          // Uzak lazer — örnek varsa kayıttan, yoksa kısa tarama tonu
          if (!bank.play("laser", { dest: cc.bus.weapon, gain: 0.35 + Math.random() * 0.3 })) {
            tone(cc, {
              type: "sawtooth",
              from: 1500,
              to: 250,
              dur: 0.16,
              peak: 0.05,
              dest: cc.bus.weapon,
            });
          }
        }
        if (Math.random() < battleCombat * 0.14) {
          // Uzak patlama
          if (!bank.play("explosion", { dest: cc.bus.explosion, gain: 0.35 })) {
            tone(cc, {
              type: "sine",
              from: 80,
              to: 26,
              dur: 0.8,
              peak: 0.1,
              dest: cc.bus.explosion,
            });
            noiseBurst(cc, {
              dur: 0.7,
              peak: 0.07,
              type: "lowpass",
              from: 500,
              to: 60,
              dest: cc.bus.explosion,
            });
          }
        }
      }
      if (battleFire > 0.15 && Math.random() < battleFire * 0.4) {
        // Yangın çıtırtısı
        noiseBurst(cc, {
          dur: 0.12,
          peak: 0.05 + battleFire * 0.05,
          type: "bandpass",
          from: 2400,
          to: 900,
          q: 1.8,
        });
      }
      // Uzun süredir sessizsek yatağı kapat.
      if (battleCombat < 0.03 && battleFire < 0.03) {
        if (battleNodes.quietSince === 0) battleNodes.quietSince = cc.ac.currentTime;
        else if (cc.ac.currentTime - battleNodes.quietSince > 4) stopBattle(cc);
      } else {
        battleNodes.quietSince = 0;
      }
    }, 550);

    battleNodes = { bedSrc, bedGain, bedLow, lastFireGain: 0, quietSince: 0, timer };
  };

  const stopBattle = (c: Ctx) => {
    if (!battleNodes) return;
    const b = battleNodes;
    battleNodes = null;
    voices = Math.max(0, voices - 2);
    clearInterval(b.timer);
    const t = c.ac.currentTime;
    b.bedGain.gain.cancelScheduledValues(t);
    b.bedGain.gain.setTargetAtTime(0, t, 0.3);
    b.bedSrc.stop(t + 1.2);
    b.bedSrc.onended = () => {
      try {
        b.bedSrc.disconnect();
        b.bedLow.disconnect();
        b.bedGain.disconnect();
      } catch {
        /* boş */
      }
    };
  };

  const withCtx = (fn: (c: Ctx) => void) => {
    if (muted) return;
    const c = ctx;
    if (!c || c.ac.state !== "running") return;
    fn(c);
  };

  /* ---- prosedürel yedek gövdeler (örnek yokken) ---- */
  const proceduralScream = (c: Ctx) => {
    // Rastgele çığlık türü seç: derin (%50), orta (%25), tiz (%15), kalabalık (%10)
    const r = Math.random();
    const base = r < 0.5 ? 480 : r < 0.75 ? 640 : r < 0.9 ? 900 : 380;
    tone(c, {
      type: "sawtooth",
      from: base,
      to: base * 1.6,
      dur: 0.5,
      peak: 0.18,
      dest: c.bus.voice,
    });
    tone(c, {
      type: "square",
      from: base * 1.34,
      to: base * 1.9,
      dur: 0.42,
      peak: 0.08,
      delay: 0.05,
      dest: c.bus.voice,
    });
    noiseBurst(c, {
      dur: 0.5,
      peak: 0.1,
      type: "bandpass",
      from: base * 2,
      to: base * 2.6,
      q: 1.2,
      dest: c.bus.voice,
    });
  };

  const proceduralDiveScream = (c: Ctx, p: number) => {
    tone(c, {
      type: "sawtooth",
      from: 500 * p,
      to: 130 * p,
      dur: 1.2,
      peak: 0.4,
      dest: c.bus.hero,
    });
    tone(c, {
      type: "sawtooth",
      from: 340 * p,
      to: 95 * p,
      dur: 1.3,
      peak: 0.32,
      delay: 0.04,
      dest: c.bus.hero,
    });
    noiseBurst(c, {
      dur: 1.2,
      peak: 0.3,
      type: "bandpass",
      from: 1400 * p,
      to: 300,
      q: 1.2,
      dest: c.bus.hero,
    });
    tone(c, { type: "sine", from: 90, to: 30, dur: 1.4, peak: 0.22, dest: c.bus.hero });
  };

  return {
    unlock() {
      const c = ensure();
      if (!c) return;
      if (c.ac.state === "suspended") void c.ac.resume();
      bank.preload(0);
      if (flameWanted) startFlame(c);
      if (ambientWanted) startAmbient(c);
      if (sirenWanted) startSiren(c);
      if (musicWanted) startMusic(c);
    },
    setMuted(m) {
      muted = m;
      const c = ctx;
      if (!c) return;
      c.master.gain.setTargetAtTime(m ? 0 : volume, c.ac.currentTime, 0.02);
      if (m) {
        stopFlame(c);
        stopAmbient(c);
        stopSiren(c);
        stopMusic(c);
        stopBattle(c);
      } else {
        if (flameWanted) startFlame(c);
        if (ambientWanted) startAmbient(c);
        if (sirenWanted) startSiren(c);
        if (musicWanted) startMusic(c);
      }
    },
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      const c = ctx;
      if (!c || muted) return;
      c.master.gain.setTargetAtTime(volume, c.ac.currentTime, 0.02);
    },
    preload(tier) {
      // Bağlam yoksa kur (decode için resume gerekmez, jest sonrası ses açılır).
      ensure();
      bank.preload(tier);
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
      if (!c || muted) return;
      if (on) startAmbient(c);
      else stopAmbient(c);
    },
    siren(on) {
      sirenWanted = on;
      const c = ctx;
      if (!c || muted) return;
      if (on) startSiren(c);
      else stopSiren(c);
    },
    music(on) {
      musicWanted = on;
      const c = ctx;
      if (!c || muted) return;
      if (on) startMusic(c);
      else stopMusic(c);
    },
    setIntensity(v) {
      intensity = Math.min(1, Math.max(0, v));
      applyIntensity();
    },
    battleLoop(combat, fire) {
      battleCombat = Math.min(1, Math.max(0, combat));
      battleFire = Math.min(1, Math.max(0, fire));
      const c = ctx;
      if (!c || muted || c.ac.state !== "running") return;
      if ((battleCombat > 0.03 || battleFire > 0.03) && !battleNodes) startBattle(c);
      if (battleNodes) {
        const target = battleFire * 0.14;
        if (Math.abs(target - battleNodes.lastFireGain) > 0.005) {
          battleNodes.lastFireGain = target;
          battleNodes.bedGain.gain.setTargetAtTime(target, c.ac.currentTime, 0.6);
        }
      }
    },
    explosion(size) {
      withCtx((c) => {
        if (!gate("explosion")) return;
        const s = Math.min(2, Math.max(0.5, size));
        // Örnek varsa: kayıt (2 düğüm) + prosedürel dip vuruş; yoksa tam prosedürel.
        if (
          bank.play("explosion", { dest: c.bus.explosion, gain: 0.45 * s, rate: 1.05 - s * 0.1 })
        ) {
          tone(c, {
            type: "sine",
            from: 110 * s,
            to: 24,
            dur: 0.5 * s,
            peak: 0.3,
            dest: c.bus.explosion,
          });
          return;
        }
        noiseBurst(c, {
          dur: 0.45 * s,
          peak: 0.38 * s,
          type: "lowpass",
          from: 1800,
          to: 90,
          q: 0.8,
          dest: c.bus.explosion,
        });
        tone(c, {
          type: "sine",
          from: 130 * s,
          to: 26,
          dur: 0.55 * s,
          peak: 0.4,
          dest: c.bus.explosion,
        });
        noiseBurst(c, {
          dur: 0.1,
          peak: 0.26 * s,
          type: "highpass",
          from: 4200,
          to: 2000,
          q: 2.5,
          dest: c.bus.explosion,
        });
      });
    },
    fireballLaunch() {
      withCtx((c) => {
        if (!bank.play("fireballLaunch", { dest: c.bus.hero, gain: 1 })) {
          noiseBurst(c, {
            dur: 0.35,
            peak: 0.22,
            type: "bandpass",
            from: 1400,
            to: 300,
            q: 1.4,
            dest: c.bus.hero,
          });
        }
        tone(c, { type: "sawtooth", from: 380, to: 120, dur: 0.3, peak: 0.14, dest: c.bus.hero });
        tone(c, {
          type: "sine",
          from: 90,
          to: 40,
          dur: 0.25,
          peak: 0.16,
          delay: 0.02,
          dest: c.bus.hero,
        });
      });
    },
    fireballTravel() {
      const c = ctx;
      if (!c || muted || c.ac.state !== "running") return null;
      if (voices > MAX_VOICES - 4) return null;
      const t = c.ac.currentTime;
      // Düşen perdeli ıslık + hava kesiği — mermi uçtukça alçalır.
      const gain = c.ac.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
      gain.gain.setValueAtTime(0.12, t + 1.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      gain.connect(c.bus.hero);
      const osc = c.ac.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(760, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 2.5);
      const low = c.ac.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 1600;
      osc.connect(low).connect(gain);
      const nsrc = c.ac.createBufferSource();
      nsrc.buffer = c.noise;
      nsrc.loop = true;
      const bp = c.ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1200, t);
      bp.frequency.exponentialRampToValueAtTime(350, t + 2.5);
      bp.Q.value = 0.8;
      const ng = c.ac.createGain();
      ng.gain.value = 0.6;
      nsrc.connect(bp).connect(ng).connect(gain);
      osc.start(t);
      nsrc.start(t);
      track(osc, t + 2.65);
      track(nsrc, t + 2.65);
      let stopped = false;
      return {
        stop() {
          if (stopped) return;
          stopped = true;
          const now = c.ac.currentTime;
          try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
            osc.stop(now + 0.12);
            nsrc.stop(now + 0.12);
          } catch {
            /* zaten durmuş */
          }
        },
      };
    },
    fireballImpact() {
      withCtx((c) => {
        if (!gate("fireballImpact")) return;
        // Şiddetli patlama: kayıt + prosedürel gövde (dip + basınç dalgası)
        bank.play("fireballImpact", { dest: c.bus.explosion, gain: 1 });
        tone(c, { type: "sine", from: 65, to: 12, dur: 1.0, peak: 0.5, dest: c.bus.explosion });
        noiseBurst(c, {
          dur: 1.1,
          peak: 0.4,
          type: "lowpass",
          from: 900,
          to: 40,
          q: 0.5,
          dest: c.bus.explosion,
        });
        noiseBurst(c, {
          dur: 0.9,
          peak: 0.16,
          type: "lowpass",
          from: 400,
          to: 60,
          q: 0.6,
          delay: 0.35,
          dest: c.bus.explosion,
        });
      });
    },
    hit() {
      withCtx((c) => {
        if (!gate("hit")) return;
        noiseBurst(c, { dur: 0.12, peak: 0.28, type: "lowpass", from: 1600, to: 200 });
        tone(c, { type: "square", from: 190, to: 60, dur: 0.14, peak: 0.14 });
      });
    },
    enemyShot() {
      withCtx((c) => {
        if (!gate("enemyShot")) return;
        // Lazer: örnek varsa kayıttan (2 düğüm), yoksa tarama tonu.
        if (bank.play("laser", { dest: c.bus.weapon, gain: 1 })) return;
        if (Math.random() < 0.5) {
          tone(c, {
            type: "sawtooth",
            from: 1100,
            to: 180,
            dur: 0.14,
            peak: 0.12,
            dest: c.bus.weapon,
          });
        } else {
          tone(c, { type: "square", from: 520, to: 90, dur: 0.09, peak: 0.13, dest: c.bus.weapon });
        }
        noiseBurst(c, {
          dur: 0.06,
          peak: 0.14,
          type: "highpass",
          from: 3000,
          to: 1500,
          q: 1.5,
          dest: c.bus.weapon,
        });
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
        tone(c, { type: "sine", from: 1180, to: 1180, dur: 0.34, peak: 0.16, dest: c.bus.ui });
        tone(c, {
          type: "sine",
          from: 1770,
          to: 1770,
          dur: 0.26,
          peak: 0.09,
          delay: 0.02,
          dest: c.bus.ui,
        });
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
        tone(c, { type: "square", from: 620, to: 620, dur: 0.08, peak: 0.08, dest: c.bus.ui });
        tone(c, {
          type: "square",
          from: 620,
          to: 620,
          dur: 0.08,
          peak: 0.08,
          delay: 0.14,
          dest: c.bus.ui,
        });
      });
    },
    rage() {
      withCtx((c) => {
        tone(c, { type: "sawtooth", from: 60, to: 180, dur: 1.1, peak: 0.3, dest: c.bus.hero });
        noiseBurst(c, {
          dur: 1.2,
          peak: 0.2,
          type: "lowpass",
          from: 300,
          to: 1600,
          dest: c.bus.hero,
        });
      });
    },
    roar() {
      withCtx((c) => {
        if (bank.play("victoryRoar", { dest: c.bus.hero, gain: 0.7 })) return;
        tone(c, { type: "sawtooth", from: 150, to: 55, dur: 1.3, peak: 0.32, dest: c.bus.hero });
        noiseBurst(c, {
          dur: 1.4,
          peak: 0.24,
          type: "bandpass",
          from: 420,
          to: 160,
          q: 1.6,
          dest: c.bus.hero,
        });
        tone(c, { type: "sine", from: 70, to: 32, dur: 1.1, peak: 0.18, dest: c.bus.hero });
      });
    },
    scream() {
      withCtx((c) => {
        if (!gate("scream")) return;
        // İnsan sesleri: erkek/kadın çığlık ağırlıklı; yıkım büyükse kalabalık.
        const r = Math.random();
        if (r < 0.45 && bank.play("humanScreamM", { dest: c.bus.voice, gain: 1 })) return;
        if (r < 0.8 && bank.play("humanScreamF", { dest: c.bus.voice, gain: 1 })) return;
        if (r < 0.9 && bank.play("crowd", { dest: c.bus.voice, gain: 1 })) return;
        // Kadın çığlığı örneği erkek yerine de düşebilsin (Safari: flac yok)
        if (bank.play("humanScreamF", { dest: c.bus.voice, gain: 1 })) return;
        proceduralScream(c);
      });
    },
    growl() {
      withCtx((c) => {
        if (!gate("growl")) return;
        tone(c, { type: "sawtooth", from: 40, to: 30, dur: 0.9, peak: 0.22, dest: c.bus.creature });
        tone(c, { type: "triangle", from: 120, to: 80, dur: 0.7, peak: 0.1, dest: c.bus.creature });
        noiseBurst(c, {
          dur: 0.6,
          peak: 0.12,
          type: "lowpass",
          from: 180,
          to: 60,
          q: 1.0,
          dest: c.bus.creature,
        });
      });
    },
    bellow() {
      withCtx((c) => {
        tone(c, { type: "sawtooth", from: 80, to: 200, dur: 0.3, peak: 0.35, dest: c.bus.hero });
        tone(c, {
          type: "sawtooth",
          from: 200,
          to: 50,
          dur: 1.0,
          peak: 0.35,
          delay: 0.3,
          dest: c.bus.hero,
        });
        tone(c, { type: "square", from: 160, to: 45, dur: 1.2, peak: 0.18, dest: c.bus.hero });
        noiseBurst(c, {
          dur: 1.4,
          peak: 0.25,
          type: "lowpass",
          from: 400,
          to: 80,
          q: 1.2,
          dest: c.bus.hero,
        });
        tone(c, { type: "sine", from: 35, to: 20, dur: 0.5, peak: 0.2, dest: c.bus.hero });
      });
    },
    snarl() {
      withCtx((c) => {
        if (!gate("snarl")) return;
        tone(c, {
          type: "sawtooth",
          from: 300,
          to: 180,
          dur: 0.35,
          peak: 0.26,
          dest: c.bus.creature,
        });
        noiseBurst(c, {
          dur: 0.2,
          peak: 0.18,
          type: "bandpass",
          from: 900,
          to: 500,
          q: 1.5,
          dest: c.bus.creature,
        });
        tone(c, { type: "sine", from: 80, to: 40, dur: 0.15, peak: 0.14, dest: c.bus.creature });
      });
    },
    wingFlap() {
      withCtx((c) => {
        if (!gate("wingFlap")) return;
        if (bank.play("wingFlap", { dest: c.bus.creature, gain: 1 })) return;
        noiseBurst(c, {
          dur: 0.18,
          peak: 0.16,
          type: "bandpass",
          from: 800,
          to: 200,
          q: 0.8,
          dest: c.bus.creature,
        });
        tone(c, { type: "sine", from: 60, to: 30, dur: 0.1, peak: 0.1, dest: c.bus.creature });
      });
    },
    creatureAttack() {
      withCtx((c) => {
        if (!gate("creatureAttack")) return;
        tone(c, {
          type: "sawtooth",
          from: 700,
          to: 220,
          dur: 0.22,
          peak: 0.3,
          dest: c.bus.creature,
        });
        noiseBurst(c, {
          dur: 0.3,
          peak: 0.22,
          type: "bandpass",
          from: 1200,
          to: 400,
          q: 1.4,
          dest: c.bus.creature,
        });
      });
    },
    creatureDeath() {
      withCtx((c) => {
        if (!gate("creatureDeath")) return;
        tone(c, { type: "sawtooth", from: 320, to: 45, dur: 1.4, peak: 0.3, dest: c.bus.creature });
        noiseBurst(c, {
          dur: 1.2,
          peak: 0.18,
          type: "lowpass",
          from: 900,
          to: 100,
          q: 0.9,
          dest: c.bus.creature,
        });
        tone(c, {
          type: "sine",
          from: 90,
          to: 28,
          dur: 1.6,
          peak: 0.16,
          delay: 0.2,
          dest: c.bus.creature,
        });
      });
    },
    creatureAmbient() {
      withCtx((c) => {
        if (!gate("creatureAmbient")) return;
        tone(c, { type: "sawtooth", from: 65, to: 42, dur: 1.1, peak: 0.2, dest: c.bus.creature });
        noiseBurst(c, {
          dur: 1.0,
          peak: 0.1,
          type: "lowpass",
          from: 240,
          to: 90,
          q: 1.1,
          dest: c.bus.creature,
        });
      });
    },
    dragonDiveScream(i) {
      withCtx((c) => {
        if (!gate("diveScream")) return;
        const p = 0.85 + Math.random() * 0.3;
        // Korkunç ejderha çığlığı: gerçek kayıt önde, prosedürel katman altta ağırlık verir.
        if (
          bank.play("diveScream", { dest: c.bus.hero, gain: 0.7 + i * 0.3, rate: 0.92 + i * 0.12 })
        ) {
          tone(c, {
            type: "sawtooth",
            from: 340 * p,
            to: 95 * p,
            dur: 1.3,
            peak: 0.14,
            delay: 0.04,
            dest: c.bus.hero,
          });
          tone(c, { type: "sine", from: 90, to: 30, dur: 1.4, peak: 0.14, dest: c.bus.hero });
          return;
        }
        proceduralDiveScream(c, p);
      });
    },
    diveWind(intensityIn) {
      const c = ctx;
      const target = Math.min(1, Math.max(0, intensityIn)) * 0.22;
      if (!c || muted || c.ac.state !== "running") {
        if (diveWindNodes && c) {
          const t = c.ac.currentTime;
          diveWindNodes.gain.gain.cancelScheduledValues(t);
          diveWindNodes.gain.gain.setTargetAtTime(0, t, 0.08);
          diveWindTarget = 0;
        }
        return;
      }
      // Hedef değişmediyse AudioParam'a hiç dokunma — eski kod her karede
      // cancelScheduledValues + setTargetAtTime çağırıyordu.
      if (Math.abs(target - diveWindTarget) < 0.004) {
        // Uzun süre sıfırda kalan döngüyü tamamen durdur.
        if (target < 0.004 && diveWindNodes) {
          if (diveWindSilentAt === 0) diveWindSilentAt = c.ac.currentTime;
          else if (c.ac.currentTime - diveWindSilentAt > 2) {
            const n = diveWindNodes;
            diveWindNodes = null;
            diveWindTarget = -1;
            diveWindSilentAt = 0;
            voices = Math.max(0, voices - 2);
            try {
              n.src.stop(c.ac.currentTime + 0.05);
              n.src.onended = () => {
                try {
                  n.src.disconnect();
                  n.gain.disconnect();
                } catch {
                  /* boş */
                }
              };
            } catch {
              /* boş */
            }
          }
        }
        return;
      }
      diveWindSilentAt = 0;
      if (!diveWindNodes) {
        if (target < 0.004) {
          diveWindTarget = target;
          return; // sıfır hedef için döngü kurma
        }
        voices += 2;
        const src = c.ac.createBufferSource();
        src.buffer = c.noise;
        src.loop = true;
        const hp = c.ac.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 200;
        hp.Q.value = 0.3;
        const bp = c.ac.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 800;
        bp.Q.value = 0.6;
        const gain = c.ac.createGain();
        gain.gain.value = 0.0001;
        src.connect(hp).connect(bp).connect(gain).connect(c.master);
        src.start();
        diveWindNodes = { src, gain };
      }
      diveWindTarget = target;
      diveWindNodes.gain.gain.setTargetAtTime(target, c.ac.currentTime, 0.08);
    },
    menuGrowl() {
      withCtx((c) => {
        if (
          bank.play("menuGrowl", {
            dest: c.bus.creature,
            gain: 1,
            rate: 0.94 + Math.random() * 0.12,
          })
        )
          return;
        // Yedek: derin prosedürel hırıltı
        tone(c, { type: "sawtooth", from: 44, to: 30, dur: 1.4, peak: 0.2, dest: c.bus.creature });
        tone(c, {
          type: "triangle",
          from: 110,
          to: 70,
          dur: 1.1,
          peak: 0.09,
          dest: c.bus.creature,
        });
        noiseBurst(c, {
          dur: 1.0,
          peak: 0.1,
          type: "lowpass",
          from: 200,
          to: 70,
          q: 1.1,
          dest: c.bus.creature,
        });
      });
    },
    victoryRoar() {
      withCtx((c) => {
        bank.play("victoryRoar", { dest: c.bus.hero, gain: 1, rate: 0.96 });
        // Prosedürel gövde her durumda altta: kükremeye göğüs veren dip katman.
        tone(c, { type: "sawtooth", from: 150, to: 50, dur: 2.0, peak: 0.3, dest: c.bus.hero });
        noiseBurst(c, {
          dur: 2.2,
          peak: 0.22,
          type: "bandpass",
          from: 420,
          to: 140,
          q: 1.5,
          dest: c.bus.hero,
        });
        tone(c, { type: "sine", from: 66, to: 28, dur: 1.8, peak: 0.2, dest: c.bus.hero });
      });
    },
    ui() {
      withCtx((c) => {
        tone(c, { type: "square", from: 420, to: 300, dur: 0.05, peak: 0.05, dest: c.bus.ui });
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
            dest: c.bus.ui,
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
      stopSiren(c);
      stopMusic(c);
      stopBattle(c);
      if (diveWindNodes) {
        const t = c.ac.currentTime;
        diveWindNodes.gain.gain.cancelScheduledValues(t);
        diveWindNodes.gain.gain.setTargetAtTime(0, t, 0.05);
        diveWindNodes.src.stop(t + 0.15);
        diveWindNodes = null;
        diveWindTarget = -1;
        voices = Math.max(0, voices - 2);
      }
    },
    dispose() {
      const c = ctx;
      bank.dispose();
      if (!c) return;
      if (onVis) {
        document.removeEventListener("visibilitychange", onVis);
        onVis = null;
      }
      stopFlame(c);
      stopAmbient(c);
      stopSiren(c);
      stopMusic(c);
      stopBattle(c);
      if (diveWindNodes) {
        try {
          diveWindNodes.src.stop();
          diveWindNodes.gain.disconnect();
        } catch {
          /* boş */
        }
        diveWindNodes = null;
      }
      ctx = null;
      void c.ac.close().catch(() => {});
    },
    debug() {
      return { voices, samples: bank.stats() };
    },
  };
}
