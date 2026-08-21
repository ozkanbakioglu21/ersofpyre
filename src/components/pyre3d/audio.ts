/**
 * Tamamen prosedürel ses motoru — tüm efektler osilatör ve gürültü ile üretilir.
 * AudioContext ilk kullanıcı jestine kadar kurulmuyor.
 */

export type AudioEngine = {
  unlock(): void;
  setMuted(muted: boolean): void;
  setVolume(v: number): void;
  flame(on: boolean): void;
  tickFlame(dt: number): void;
  ambient(on: boolean): void;
  siren(on: boolean): void;
  bombHit(): void;
  music(on: boolean): void;
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
  scream(): void;
  growl(): void;
  bellow(): void;
  snarl(): void;
  wingFlap(): void;
  creatureAttack(): void;
  creatureDeath(): void;
  creatureAmbient(): void;
  diveCreatureScream(): void;
  /** Dalma rüzgarı: 0..1 yoğunluk. */
  diveWind(intensity: number): void;
  /** Dalma çığlığı: 0..1 yoğunluk. */
  diveScream(intensity: number): void;
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
  tickFlame() {},
  ambient() {},
  siren() {},
  bombHit() {},
  music() {},
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
  scream() {},
  growl() {},
  bellow() {},
  snarl() {},
  wingFlap() {},
  creatureAttack() {},
  creatureDeath() {},
  creatureAmbient() {},
  diveCreatureScream() {},
  diveWind() {},
  diveScream() {},
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
  const MAX_VOICES = 72;
  let lastExplosion = 0;

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
  let ambientNodes: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode; low: BiquadFilterNode } | null = null;
  let sirenNodes: { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
  let flameWanted = false;
  let ambientWanted = false;
  let sirenWanted = false;
  let musicWanted = false;
  let diveWindNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let diveScreamNodes: {
    osc: OscillatorNode;
    osc2: OscillatorNode;
    nsrc: AudioBufferSourceNode;
    gain: GainNode;
  } | null = null;
  let diveScreamLastStart = 0;
  let onVis: (() => void) | null = null;
  let musicNodes: {
    padGain: GainNode;
    drumGain: GainNode;
    masterGain: GainNode;
    padOscs: OscillatorNode[];
    _timer: ReturnType<typeof setInterval>;
    _tensionTimer: ReturnType<typeof setTimeout>;
    _tensionOsc: OscillatorNode;
    _tensionFilter: BiquadFilterNode;
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
      ctx = { ac, master, noise: makeNoise(ac) };
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
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 3.5);
    }
    ws.curve = curve;
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

    // LFO — hızlı nabız, alevin"hırlaması"
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
    gain.connect(c.master);

    // Sub-bass bağımsız yol
    sub.connect(subGain);
    subGain.connect(c.master);

    src.start(t);
    lfo.start(t);
    lfo2.start(t);
    lfo3.start(t);
    sub.start(t);
    subLfo.start(t);

    flameNodes = {
      src, gain, lfo, lfo2, lfo3, sub, subGain, subLfo,
      band, band2, ws, low,
    };
  };

  const stopFlame = (c: Ctx) => {
    if (!flameNodes) return;
    const n = flameNodes;
    flameNodes = null;
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
        n.src.disconnect(); n.gain.disconnect();
        n.lfo.disconnect(); n.lfo2.disconnect(); n.lfo3.disconnect();
        n.sub.disconnect(); n.subGain.disconnect(); n.subLfo.disconnect();
        n.band.disconnect(); n.band2.disconnect(); n.ws.disconnect(); n.low.disconnect();
      } catch {}
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
    ambientNodes = { src, gain, lfo, low };
  };

  const stopAmbient = (c: Ctx) => {
    if (!ambientNodes) return;
    const { src, gain, lfo, low } = ambientNodes;
    ambientNodes = null;
    const t = c.ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.stop(t + 0.7);
    lfo.stop(t + 0.7);
    src.onended = () => {
      try { src.disconnect(); gain.disconnect(); lfo.disconnect(); low.disconnect(); } catch {}
    };
  };

  /* ---- hava saldırısı siren ---- */
  const SIREN周期 = 3.5; /* frekans tarama süresi (saniye) */

  const startSiren = (c: Ctx) => {
    if (sirenNodes) return;
    const t = c.ac.currentTime;
    const gain = c.ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 1.2);

    // Birincil siren: 400–800 Hz arası sawtooth tarama
    const osc1 = c.ac.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(400, t);
    osc1.frequency.linearRampToValueAtTime(800, t + SIREN周期 / 2);
    osc1.frequency.linearRampToValueAtTime(400, t + SIREN周期);

    // İkincil siren: fazda kayık (duraklama etkisi)
    const osc2 = c.ac.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(420, t);
    osc2.frequency.linearRampToValueAtTime(820, t + SIREN周期 / 2);
    osc2.frequency.linearRampToValueAtTime(420, t + SIREN周期);

    // Düşük geçiren filtre — tiz sızırtıyı yumuşat
    const filter = c.ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    filter.Q.value = 1.2;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(c.master);

    // Sürekli döngü: her periyot sonunda yeniden başlat
    const scheduleLoop = () => {
      if (!sirenNodes) return;
      const now = c.ac.currentTime;
      osc1.frequency.setValueAtTime(400, now);
      osc1.frequency.linearRampToValueAtTime(800, now + SIREN周期 / 2);
      osc1.frequency.linearRampToValueAtTime(400, now + SIREN周期);
      osc2.frequency.setValueAtTime(420, now);
      osc2.frequency.linearRampToValueAtTime(820, now + SIREN周期 / 2);
      osc2.frequency.linearRampToValueAtTime(420, now + SIREN周期);
      timerId = setTimeout(scheduleLoop, SIREN周期 * 1000);
    };
    let timerId = setTimeout(scheduleLoop, SIREN周期 * 1000);

    osc1.start(t);
    osc2.start(t);
    // Periyodik tarama: ScheduledSource olmayan oscillator'lar durmaz; manuel
    // stop ile değil, sadece sirenNodes null yaparak durduruyoruz.
    sirenNodes = { osc1, osc2, gain };
    // Referansı temizlemek için timer'ı saklıyoruz
    (sirenNodes as unknown as { _timer: ReturnType<typeof setTimeout> })._timer = timerId;
  };

  const stopSiren = (c: Ctx) => {
    if (!sirenNodes) return;
    const { osc1, osc2, gain } = sirenNodes;
    const timerId = (sirenNodes as unknown as { _timer: ReturnType<typeof setTimeout> })._timer;
    clearTimeout(timerId);
    sirenNodes = null;
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

  /* ---- prosedürel savaş müziği ---- */
  const startMusic = (c: Ctx) => {
    if (musicNodes) return;
    const t = c.ac.currentTime;

    // Master music gain
    const masterGain = c.ac.createGain();
    masterGain.gain.setValueAtTime(0.0001, t);
    masterGain.gain.linearRampToValueAtTime(0.5, t + 1.5);
    masterGain.connect(c.master);

    // KATMAN 1: Dark pad — Dm chord drone (D3, F3, A3)
    const padGain = c.ac.createGain();
    padGain.gain.value = 0.25;
    padGain.connect(masterGain);

    const padOscs: OscillatorNode[] = [];
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
      filter.frequency.value = 500;
      filter.Q.value = 0.6;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(g);
      g.connect(padGain);
      osc.start(t);
      osc2.start(t);
      padOscs.push(osc, osc2);
    });

    // KATMAN 2: War drums
    const drumGain = c.ac.createGain();
    drumGain.gain.value = 0.4;
    drumGain.connect(masterGain);

    const playDrum = (time: number, type: "kick" | "snare") => {
      if (type === "kick") {
        const osc = c.ac.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
        const g = c.ac.createGain();
        g.gain.setValueAtTime(0.7, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
        osc.connect(g).connect(drumGain);
        osc.start(time);
        osc.stop(time + 0.3);
      } else {
        const noiseBuf = c.ac.createBuffer(1, c.ac.sampleRate * 0.15, c.ac.sampleRate);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        const nSrc = c.ac.createBufferSource();
        nSrc.buffer = noiseBuf;
        const nFilter = c.ac.createBiquadFilter();
        nFilter.type = "highpass";
        nFilter.frequency.value = 2000;
        const nGain = c.ac.createGain();
        nGain.gain.setValueAtTime(0.5, time);
        nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
        nSrc.connect(nFilter).connect(nGain).connect(drumGain);
        nSrc.start(time);
        const osc = c.ac.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(200, time);
        osc.frequency.exponentialRampToValueAtTime(80, time + 0.08);
        const oGain = c.ac.createGain();
        oGain.gain.setValueAtTime(0.3, time);
        oGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.connect(oGain).connect(drumGain);
        osc.start(time);
        osc.stop(time + 0.15);
      }
    };

    const scheduleDrums = () => {
      if (!musicNodes) return;
      const now = c.ac.currentTime;
      [0, 0.5, 1.0, 1.5].forEach((offset, i) => {
        const hitTime = now + offset;
        playDrum(hitTime, i % 2 === 0 ? "kick" : "snare");
      });
    };
    const drumTimer = setInterval(scheduleDrums, 2000);
    scheduleDrums();

    // KATMAN 3: Tension riser
    const tensionOsc = c.ac.createOscillator();
    tensionOsc.type = "sawtooth";
    tensionOsc.frequency.value = 110;
    const tensionFilter = c.ac.createBiquadFilter();
    tensionFilter.type = "lowpass";
    tensionFilter.frequency.value = 400;
    tensionFilter.Q.value = 1.2;
    const tensionGain = c.ac.createGain();
    tensionGain.gain.value = 0.08;
    tensionOsc.connect(tensionFilter).connect(tensionGain).connect(masterGain);
    tensionOsc.start(t);

    const scheduleTension = () => {
      if (!musicNodes) return;
      const now = c.ac.currentTime;
      tensionOsc.frequency.setValueAtTime(110, now);
      tensionOsc.frequency.linearRampToValueAtTime(220, now + 6);
      tensionFilter.frequency.setValueAtTime(400, now);
      tensionFilter.frequency.linearRampToValueAtTime(1200, now + 6);
      tensionGain.gain.cancelScheduledValues(now);
      tensionGain.gain.setValueAtTime(0.001, now);
      tensionGain.gain.linearRampToValueAtTime(0.1, now + 3);
      tensionGain.gain.linearRampToValueAtTime(0.001, now + 6);
      tensionTimer = setTimeout(scheduleTension, 7000);
    };
    let tensionTimer = setTimeout(scheduleTension, 3000);

    musicNodes = {
      padGain, drumGain, masterGain, padOscs,
      _timer: drumTimer,
      _tensionTimer: tensionTimer,
      _tensionOsc: tensionOsc,
      _tensionFilter: tensionFilter,
    };
  };

  const stopMusic = (c: Ctx) => {
    if (!musicNodes) return;
    const m = musicNodes;
    clearInterval(m._timer);
    clearTimeout(m._tensionTimer);
    musicNodes = null;
    const t = c.ac.currentTime;

    m.masterGain.gain.cancelScheduledValues(t);
    m.masterGain.gain.setValueAtTime(Math.max(0.0001, m.masterGain.gain.value), t);
    m.masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 2);

    m._tensionOsc.stop(t + 2.5);
    m.padOscs.forEach((o) => { try { o.stop(t + 2.5); } catch {} });

    m._tensionOsc.onended = () => {
      try {
        m.masterGain.disconnect(); m.padGain.disconnect(); m.drumGain.disconnect();
        m._tensionOsc.disconnect(); m._tensionFilter.disconnect();
        m.padOscs.forEach((o) => o.disconnect());
      } catch {}
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
    flame(on) {
      flameWanted = on;
      const c = ctx;
      if (!c || muted || c.ac.state !== "running") return;
      if (on) startFlame(c);
      else stopFlame(c);
    },
    tickFlame(_dt: number) {
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
    explosion(size) {
      withCtx((c) => {
        const now = c.ac.currentTime;
        if (now - lastExplosion < 0.07) return;
        lastExplosion = now;
        const s = Math.min(2, Math.max(0.5, size));
        noiseBurst(c, {
          dur: 0.45 * s,
          peak: 0.38 * s,
          type: "lowpass",
          from: 1800,
          to: 90,
          q: 0.8,
        });
        tone(c, { type: "sine", from: 130 * s, to: 26, dur: 0.55 * s, peak: 0.4 });
        noiseBurst(c, {
          dur: 0.1,
          peak: 0.26 * s,
          type: "highpass",
          from: 4200,
          to: 2000,
          q: 2.5,
        });
      });
    },
    fireball() {
      withCtx((c) => {
        noiseBurst(c, { dur: 0.35, peak: 0.22, type: "bandpass", from: 1400, to: 300, q: 1.4 });
        tone(c, { type: "sawtooth", from: 380, to: 120, dur: 0.3, peak: 0.14 });
        tone(c, { type: "sine", from: 90, to: 40, dur: 0.25, peak: 0.16, delay: 0.02 });
      });
    },
    bombHit() {
      withCtx((c) => {
        tone(c, { type: "sine", from: 65, to: 12, dur: 1.0, peak: 0.55 });
        tone(c, { type: "sine", from: 110, to: 30, dur: 0.6, peak: 0.3, delay: 0.01 });
        noiseBurst(c, { dur: 1.1, peak: 0.5, type: "lowpass", from: 900, to: 40, q: 0.5 });
        noiseBurst(c, { dur: 0.5, peak: 0.24, type: "highpass", from: 3500, to: 900, q: 1.8, delay: 0.03 });
        noiseBurst(c, { dur: 0.9, peak: 0.18, type: "lowpass", from: 400, to: 60, q: 0.6, delay: 0.35 });
      });
    },
    hit() {
      withCtx((c) => {
        noiseBurst(c, { dur: 0.12, peak: 0.28, type: "lowpass", from: 1600, to: 200 });
        tone(c, { type: "square", from: 190, to: 60, dur: 0.14, peak: 0.14 });
      });
    },
    enemyShot() {
      withCtx((c) => {
        if (Math.random() < 0.5) {
          tone(c, { type: "sawtooth", from: 1100, to: 180, dur: 0.14, peak: 0.12 });
        } else {
          tone(c, { type: "square", from: 520, to: 90, dur: 0.09, peak: 0.13 });
        }
        noiseBurst(c, { dur: 0.06, peak: 0.14, type: "highpass", from: 3000, to: 1500, q: 1.5 });
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
        tone(c, { type: "sine", from: 70, to: 32, dur: 1.1, peak: 0.18 });
      });
    },
    growl() {
      withCtx((c) => {
        tone(c, { type: "sawtooth", from: 40, to: 30, dur: 0.9, peak: 0.22 });
        tone(c, { type: "triangle", from: 120, to: 80, dur: 0.7, peak: 0.1 });
        noiseBurst(c, { dur: 0.6, peak: 0.12, type: "lowpass", from: 180, to: 60, q: 1.0 });
      });
    },
    bellow() {
      withCtx((c) => {
        tone(c, { type: "sawtooth", from: 80, to: 200, dur: 0.3, peak: 0.35 });
        tone(c, { type: "sawtooth", from: 200, to: 50, dur: 1.0, peak: 0.35, delay: 0.3 });
        tone(c, { type: "square", from: 160, to: 45, dur: 1.2, peak: 0.18 });
        noiseBurst(c, { dur: 1.4, peak: 0.25, type: "lowpass", from: 400, to: 80, q: 1.2 });
        tone(c, { type: "sine", from: 35, to: 20, dur: 0.5, peak: 0.2 });
      });
    },
    snarl() {
      withCtx((c) => {
        tone(c, { type: "sawtooth", from: 300, to: 180, dur: 0.35, peak: 0.26 });
        noiseBurst(c, { dur: 0.2, peak: 0.18, type: "bandpass", from: 900, to: 500, q: 1.5 });
        tone(c, { type: "sine", from: 80, to: 40, dur: 0.15, peak: 0.14 });
      });
    },
    wingFlap() {
      withCtx((c) => {
        noiseBurst(c, { dur: 0.18, peak: 0.16, type: "bandpass", from: 800, to: 200, q: 0.8 });
        tone(c, { type: "sine", from: 60, to: 30, dur: 0.1, peak: 0.1 });
      });
    },
    creatureAttack() {
      withCtx((c) => {
        tone(c, { type: "sawtooth", from: 700, to: 220, dur: 0.22, peak: 0.3 });
        noiseBurst(c, { dur: 0.3, peak: 0.22, type: "bandpass", from: 1200, to: 400, q: 1.4 });
      });
    },
    creatureDeath() {
      withCtx((c) => {
        tone(c, { type: "sawtooth", from: 320, to: 45, dur: 1.4, peak: 0.3 });
        noiseBurst(c, { dur: 1.2, peak: 0.18, type: "lowpass", from: 900, to: 100, q: 0.9 });
        tone(c, { type: "sine", from: 90, to: 28, dur: 1.6, peak: 0.16, delay: 0.2 });
      });
    },
    creatureAmbient() {
      withCtx((c) => {
        tone(c, { type: "sawtooth", from: 65, to: 42, dur: 1.1, peak: 0.2 });
        noiseBurst(c, { dur: 1.0, peak: 0.1, type: "lowpass", from: 240, to: 90, q: 1.1 });
      });
    },
    diveCreatureScream() {
      withCtx((c) => {
        const p = 0.85 + Math.random() * 0.3;
        tone(c, { type: "sawtooth", from: 500 * p, to: 130 * p, dur: 1.2, peak: 0.4 });
        tone(c, { type: "sawtooth", from: 340 * p, to: 95 * p, dur: 1.3, peak: 0.32, delay: 0.04 });
        noiseBurst(c, { dur: 1.2, peak: 0.3, type: "bandpass", from: 1400 * p, to: 300, q: 1.2 });
        tone(c, { type: "sine", from: 90, to: 30, dur: 1.4, peak: 0.22 });
      });
    },
    scream() {
      withCtx((c) => {
        // Rastgele çığlık türü seç: derin (%50), orta (%25), tiz (%15), kalabalık (%10)
        const r = Math.random();
        const base = r < 0.5 ? 480 : r < 0.75 ? 640 : r < 0.9 ? 900 : 380;
        tone(c, { type: "sawtooth", from: base, to: base * 1.6, dur: 0.5, peak: 0.18 });
        tone(c, { type: "square", from: base * 1.34, to: base * 1.9, dur: 0.42, peak: 0.08, delay: 0.05 });
        tone(c, {
          type: "sawtooth",
          from: base * 1.12,
          to: base * 0.7,
          dur: 0.6,
          peak: 0.12,
          delay: 0.08 + Math.random() * 0.1,
        });
        noiseBurst(c, { dur: 0.5, peak: 0.1, type: "bandpass", from: base * 2, to: base * 2.6, q: 1.2 });
      });
    },
    diveWind(intensity: number) {
      const c = ctx;
      if (!c || muted || c.ac.state !== "running") {
        // Sessiz/askıya alındıysa mevcut wind'i durdur
        const t = c?.ac.currentTime ?? 0;
        if (diveWindNodes) {
          diveWindNodes.gain.gain.cancelScheduledValues(t);
          diveWindNodes.gain.gain.setTargetAtTime(0, t, 0.08);
        }
        return;
      }
      if (!diveWindNodes) {
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
      const now = c.ac.currentTime;
      diveWindNodes.gain.gain.cancelScheduledValues(now);
      const target = intensity * 0.22;
      diveWindNodes.gain.gain.setTargetAtTime(target, now, 0.08);
    },
    diveScream(intensity: number) {
      const c = ctx;
      if (!c || muted || c.ac.state !== "running") return;
      const now = c.ac.currentTime;
      // Yeni çığlık tetikleme — 0.9s cooldown, sadece 0.15+ intensity
      if (intensity > 0.15 && now - diveScreamLastStart > 0.9) {
        diveScreamLastStart = now;
        // Önceki çığlığı yumuşakça kes
        if (diveScreamNodes) {
          const old = diveScreamNodes;
          old.gain.gain.cancelScheduledValues(now);
          old.gain.gain.setTargetAtTime(0, now, 0.06);
          try {
            old.osc.stop(now + 0.2);
            old.osc2.stop(now + 0.2);
            old.nsrc.stop(now + 0.2);
          } catch {}
          diveScreamNodes = null;
        }
        const vol = Math.min((intensity - 0.15) * 0.75, 0.7);
        const pitch = 0.8 + intensity * 0.6;
        const gain = c.ac.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(vol, now + 0.08);
        gain.gain.setValueAtTime(vol, now + 0.85);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);

        const osc = c.ac.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(620 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(190 * pitch, now + 1.15);

        const osc2 = c.ac.createOscillator();
        osc2.type = "sawtooth";
        osc2.frequency.setValueAtTime(430 * pitch, now);
        osc2.frequency.exponentialRampToValueAtTime(140 * pitch, now + 1.2);

        const nsrc = c.ac.createBufferSource();
        nsrc.buffer = c.noise;
        nsrc.loop = true;
        const bp = c.ac.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(1500 * pitch, now);
        bp.frequency.exponentialRampToValueAtTime(400, now + 1.15);
        bp.Q.value = 1.2;
        const ngain = c.ac.createGain();
        ngain.gain.value = 0.5;

        osc.connect(gain);
        osc2.connect(gain);
        nsrc.connect(bp).connect(ngain).connect(gain);
        gain.connect(c.master);

        const end = now + 1.3;
        osc.addEventListener("ended", () => {
          try { gain.disconnect(); bp.disconnect(); ngain.disconnect(); } catch {}
        });
        track(osc, end);
        track(osc2, end);
        track(nsrc, end);
        diveScreamNodes = { osc, osc2, nsrc, gain };
      }
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
      stopSiren(c);
      stopMusic(c);
      if (diveWindNodes) {
        const t = c.ac.currentTime;
        diveWindNodes.gain.gain.cancelScheduledValues(t);
        diveWindNodes.gain.gain.setTargetAtTime(0, t, 0.05);
        diveWindNodes.src.stop(t + 0.15);
        diveWindNodes = null;
      }
      if (diveScreamNodes) {
        const t = c.ac.currentTime;
        diveScreamNodes.gain.gain.cancelScheduledValues(t);
        diveScreamNodes.gain.gain.setTargetAtTime(0, t, 0.05);
        try {
          diveScreamNodes.osc.stop(t + 0.15);
          diveScreamNodes.osc2.stop(t + 0.15);
          diveScreamNodes.nsrc.stop(t + 0.15);
        } catch {}
        diveScreamNodes = null;
      }
    },
    dispose() {
      const c = ctx;
      if (!c) return;
      if (onVis) { document.removeEventListener("visibilitychange", onVis); onVis = null; }
      stopFlame(c);
      stopAmbient(c);
      stopSiren(c);
      stopMusic(c);
      if (diveWindNodes) {
        try { diveWindNodes.src.stop(); diveWindNodes.gain.disconnect(); } catch {}
        diveWindNodes = null;
      }
      if (diveScreamNodes) {
        try {
          diveScreamNodes.osc.stop();
          diveScreamNodes.osc2.stop();
          diveScreamNodes.nsrc.stop();
          diveScreamNodes.gain.disconnect();
        } catch {}
        diveScreamNodes = null;
      }
      ctx = null;
      void c.ac.close().catch(() => {});
    },
  };
}
