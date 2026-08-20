/**
 * Hibrit ses motoru — gerçek CC0 ses dosyaları (WAV/OGG) + prosedürel yedek.
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
  /** Dalma rüzgarı: 0..1 yoğunluk. */
  diveWind(intensity: number): void;
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
  diveWind() {},
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

/* ───── sample bazlı ses dosyası sistemi ───── */
const SFX_BASE = "/sfx/";

/** Her ses kategorisi için birden fazla dosya — rastgele seçim */
const SFX_MANIFEST: Record<string, string[]> = {
  explosion: [
    "explosion_01.ogg", "explosion_02.ogg", "explosion_03.ogg",
    "explosion_04.ogg", "explosion_05.ogg", "explosion_06.ogg",
    "explosion_07.ogg", "dynamite.wav",
    "blast_01.ogg", "blast_02.ogg", "blast_03.ogg", "blast_04.ogg",
  ],
  bigExplosion: [
    "big_explosion.wav", "big_boom.wav", "dynamite.wav",
    "explosion_04.ogg", "explosion_05.ogg", "explosion_06.ogg", "explosion_07.ogg",
    "blast_01.ogg", "blast_03.ogg",
  ],
  mechExplosion: [
    "mech_explosion.wav",
    "metal_hit_01.ogg", "metal_hit_02.ogg", "metal_hit_03.ogg",
  ],
  distantBoom: ["distant_boom.wav"],
  glassBreak: [
    "glass_break_01.ogg", "glass_break_02.ogg", "glass_break_03.ogg",
    "glass_break_04.wav",
  ],
  metalHit: ["metal_hit_01.ogg", "metal_hit_02.ogg", "metal_hit_03.ogg"],
  metalFall: ["metal_fall_01.ogg", "metal_fall_02.ogg"],
  rockBreak: ["rock_break_01.ogg", "rock_break_02.ogg"],
  debris: ["debris_01.ogg", "debris_02.ogg", "debris_03.ogg"],
  woodBreak: ["wood_break_01.ogg", "wood_break_02.ogg"],
  crack: ["crack_01.ogg", "crack_02.ogg"],
  gunshot: [
    "gunshot_01.ogg", "gunshot_02.ogg", "gunshot_03.ogg",
    "crack_01.ogg", "crack_02.ogg",
  ],
  laser: [
    "laser_01.wav", "laser_02.wav", "laser_03.wav",
    "laser_rifle.ogg",
  ],
  cannon: ["cannon_01.ogg", "cannon_02.ogg", "cannon_03.ogg"],
  rocket: ["rocket_01.wav"],
  fireWhoosh: [
    "fire_whoosh.wav", "flame_burst_01.ogg", "flame_burst_02.ogg",
  ],
  flameLoop: ["flame_loop.ogg"],
  screamMale: [
    "scream_male_01.flac", "scream_male_02.flac", "scream_male_03.flac",
    "scream_male_04.flac", "scream_male_05.flac", "scream_male_06.flac",
    "scream_male_07.flac", "scream_male_08.flac", "scream_male_09.flac",
    "scream_male_10.flac", "scream_male_11.flac", "scream_male_12.flac",
    "scream_male_13.flac", "scream_male_14.flac", "scream_male_15.flac",
  ],
  screamFemale: [
    "scream_female_01.ogg", "scream_female_02.ogg",
  ],
  screamHigh: [
    "scream_high_01.mp3", "scream_high_02.mp3",
  ],
  crowdScream: ["crowd_shout.ogg"],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
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
  const MAX_VOICES = 24;
  let lastExplosion = 0;

  /* ── sample buffer önbellek ── */
  const sfxCache = new Map<string, AudioBuffer>();
  let sfxLoading = false;

  /** Dosyayı indirip decode eder; hata olursa null döner. */
  const loadSample = async (file: string): Promise<AudioBuffer | null> => {
    const cached = sfxCache.get(file);
    if (cached) return cached;
    try {
      const url = SFX_BASE + file;
      const res = await fetch(url);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      const c = ctx;
      if (!c) return null;
      const buf = await c.ac.decodeAudioData(ab);
      sfxCache.set(file, buf);
      return buf;
    } catch {
      return null;
    }
  };

  /** Kategorideki dosyalardan rastgele birini yükler (eş zamanlı). */
  const preloadCategory = (cat: string) => {
    const files = SFX_MANIFEST[cat];
    if (!files) return;
    for (const f of files) void loadSample(f);
  };

  /** Tüm ses dosyalarını arka planda yükle. */
  const preloadAll = () => {
    if (sfxLoading) return;
    sfxLoading = true;
    for (const cat of Object.keys(SFX_MANIFEST)) preloadCategory(cat);
  };

  /** Rastgele bir sample oynat; deterministik parameterentering ile. */
  const playSample = (
    c: Ctx,
    cat: string,
    opts?: { pitch?: number; vol?: number; delay?: number },
  ) => {
    const files = SFX_MANIFEST[cat];
    if (!files) return;
    const file = pickRandom(files);
    const buf = sfxCache.get(file);
    if (!buf) return; // henüz yüklenmedi — prosedürel yedek çalışır
    if (voices > MAX_VOICES) return;

    const t = c.ac.currentTime + (opts?.delay ?? 0);
    const src = c.ac.createBufferSource();
    src.buffer = buf;
    // Rastgele pitch varyasyonu: %10
    src.playbackRate.value = opts?.pitch ?? (0.9 + Math.random() * 0.2);
    const gain = c.ac.createGain();
    const vol = opts?.vol ?? 1;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.setValueAtTime(vol, t + buf.duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, t + buf.duration);
    src.connect(gain).connect(c.master);
    src.start(t);
    track(src, t + buf.duration + 0.02);
  };

  let flameNodes: {
    src: AudioBufferSourceNode;
    gain: GainNode;
    lfo: OscillatorNode;
    sub: OscillatorNode;
    subGain: GainNode;
    loopSrc: AudioBufferSourceNode;
    loopGain: GainNode;
    crackleTimer: number;
  } | null = null;
  let ambientNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let sirenNodes: { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
  let flameWanted = false;
  let ambientWanted = false;
  let sirenWanted = false;
  let musicWanted = false;
  let diveWindNodes: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  let musicNodes: {
    pad1: OscillatorNode;
    pad2: OscillatorNode;
    padGain: GainNode;
    subPulse: OscillatorNode;
    subPulseGain: GainNode;
    tension: OscillatorNode;
    tensionGain: GainNode;
    metallic: AudioBufferSourceNode;
    metallicGain: GainNode;
    lfo: OscillatorNode;
    lfoGain: GainNode;
  } | null = null;

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

    // ── flame_loop sample katmanı — sürekli yanan ateş sesi ──
    let loopSrc: AudioBufferSourceNode | null = null;
    let loopGain: AudioBufferSourceNode | null = null;
    const flameBuf = sfxCache.get("flame_loop.ogg");
    if (flameBuf) {
      const lSrc = c.ac.createBufferSource();
      lSrc.buffer = flameBuf;
      lSrc.loop = true;
      const lGain = c.ac.createGain();
      lGain.gain.setValueAtTime(0.0001, t);
      lGain.gain.exponentialRampToValueAtTime(0.3, t + 0.15);
      // Bandpass ile orta frekansları vurgula
      const lBand = c.ac.createBiquadFilter();
      lBand.type = "bandpass";
      lBand.frequency.value = 520;
      lBand.Q.value = 0.8;
      lSrc.connect(lBand).connect(lGain).connect(c.master);
      lSrc.start(t);
      loopSrc = lSrc;
      loopGain = lGain as unknown as AudioBufferSourceNode;
    }

    flameNodes = {
      src, gain, lfo, sub, subGain,
      loopSrc: loopSrc as unknown as AudioBufferSourceNode,
      loopGain: loopGain as unknown as GainNode,
      crackleTimer: 0,
    };
  };

  const stopFlame = (c: Ctx) => {
    if (!flameNodes) return;
    const { src, gain, lfo, sub, subGain, loopSrc, loopGain } = flameNodes;
    flameNodes = null;
    const t = c.ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    subGain.gain.cancelScheduledValues(t);
    subGain.gain.setValueAtTime(Math.max(0.0001, subGain.gain.value), t);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    if (loopGain) {
      const lg = loopGain as unknown as GainNode;
      lg.gain.cancelScheduledValues(t);
      lg.gain.setValueAtTime(Math.max(0.0001, lg.gain.value), t);
      lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    }
    src.stop(t + 0.18);
    lfo.stop(t + 0.18);
    sub.stop(t + 0.18);
    const loopSrcNode = loopSrc as unknown as AudioBufferSourceNode | null;
    if (loopSrcNode) loopSrcNode.stop(t + 0.25);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
      lfo.disconnect();
      sub.disconnect();
      subGain.disconnect();
      if (loopSrcNode) { loopSrcNode.disconnect(); }
      if (loopGain) { (loopGain as unknown as GainNode).disconnect(); }
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

    // Katman 1: Ana drone — iki detune sawtooth, orta frekans
    const pad1 = c.ac.createOscillator();
    pad1.type = "sawtooth";
    pad1.frequency.value = 110;
    const pad2 = c.ac.createOscillator();
    pad2.type = "sawtooth";
    pad2.frequency.value = 110.8;
    const padGain = c.ac.createGain();
    padGain.gain.setValueAtTime(0.0001, t);
    padGain.gain.linearRampToValueAtTime(0.35, t + 1);
    const padFilter = c.ac.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 600;
    padFilter.Q.value = 0.7;
    pad1.connect(padFilter);
    pad2.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(c.master);

    // Katman 2: Dip nabız — kalp atışı
    const subPulse = c.ac.createOscillator();
    subPulse.type = "sine";
    subPulse.frequency.value = 65;
    const subPulseGain = c.ac.createGain();
    subPulseGain.gain.setValueAtTime(0.0001, t);
    subPulseGain.gain.linearRampToValueAtTime(0.4, t + 0.8);
    const pulseLfo = c.ac.createOscillator();
    pulseLfo.type = "sine";
    pulseLfo.frequency.value = 0.4;
    const pulseLfoGain = c.ac.createGain();
    pulseLfoGain.gain.value = 0.35;
    pulseLfo.connect(pulseLfoGain).connect(subPulseGain.gain);
    subPulse.connect(subPulseGain);
    subPulseGain.connect(c.master);

    // Katman 3: Gerilim — taramalı sawtooth
    const tension = c.ac.createOscillator();
    tension.type = "sawtooth";
    tension.frequency.value = 220;
    const tensionGain = c.ac.createGain();
    tensionGain.gain.setValueAtTime(0.0001, t);
    tensionGain.gain.linearRampToValueAtTime(0.15, t + 1.5);
    tension.frequency.setValueAtTime(165, t);
    tension.frequency.linearRampToValueAtTime(330, t + 8);
    const tensionFilter = c.ac.createBiquadFilter();
    tensionFilter.type = "lowpass";
    tensionFilter.frequency.value = 800;
    tensionFilter.Q.value = 0.5;
    tension.connect(tensionFilter);
    tensionFilter.connect(tensionGain);
    tensionGain.connect(c.master);

    // Katman 4: Metalik doku — gürültü
    const metallic = c.ac.createBufferSource();
    metallic.buffer = c.noise;
    metallic.loop = true;
    const metalFilter = c.ac.createBiquadFilter();
    metalFilter.type = "bandpass";
    metalFilter.frequency.value = 2400;
    metalFilter.Q.value = 3;
    const metallicGain = c.ac.createGain();
    metallicGain.gain.setValueAtTime(0.0001, t);
    metallicGain.gain.linearRampToValueAtTime(0.08, t + 1);
    const lfo = c.ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.15;
    const lfoGain = c.ac.createGain();
    lfoGain.gain.value = 1200;
    lfo.connect(lfoGain).connect(metalFilter.frequency);
    metallic.connect(metalFilter);
    metalFilter.connect(metallicGain);
    metallicGain.connect(c.master);

    // Gerilim periyodik tarama
    const scheduleTension = () => {
      if (!musicNodes) return;
      const now = c.ac.currentTime;
      tension.frequency.setValueAtTime(165, now);
      tension.frequency.linearRampToValueAtTime(330, now + 8);
      tensionTimer = setTimeout(scheduleTension, 8000);
    };
    let tensionTimer = setTimeout(scheduleTension, 8000);

    pad1.start(t);
    pad2.start(t);
    subPulse.start(t);
    pulseLfo.start(t);
    tension.start(t);
    metallic.start(t);
    lfo.start(t);

    musicNodes = {
      pad1, pad2, padGain,
      subPulse, subPulseGain,
      tension, tensionGain,
      metallic, metallicGain,
      lfo, lfoGain,
    };
    (musicNodes as unknown as { _timer: ReturnType<typeof setTimeout> })._timer = tensionTimer;
    (musicNodes as unknown as { _pulseLfo: OscillatorNode })._pulseLfo = pulseLfo;
    (musicNodes as unknown as { _tensionFilter: BiquadFilterNode })._tensionFilter = tensionFilter;
    (musicNodes as unknown as { _padFilter: BiquadFilterNode })._padFilter = padFilter;
    (musicNodes as unknown as { _metalFilter: BiquadFilterNode })._metalFilter = metalFilter;
  };

  const stopMusic = (c: Ctx) => {
    if (!musicNodes) return;
    const timerId = (musicNodes as unknown as { _timer: ReturnType<typeof setTimeout> })._timer;
    const pulseLfo = (musicNodes as unknown as { _pulseLfo: OscillatorNode })._pulseLfo;
    const m = musicNodes;
    musicNodes = null;
    clearTimeout(timerId);
    const t = c.ac.currentTime;

    // Tüm gain'leri kademeli olarak sustur
    m.padGain.gain.cancelScheduledValues(t);
    m.padGain.gain.setValueAtTime(Math.max(0.0001, m.padGain.gain.value), t);
    m.padGain.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    m.subPulseGain.gain.cancelScheduledValues(t);
    m.subPulseGain.gain.setValueAtTime(Math.max(0.0001, m.subPulseGain.gain.value), t);
    m.subPulseGain.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    m.tensionGain.gain.cancelScheduledValues(t);
    m.tensionGain.gain.setValueAtTime(Math.max(0.0001, m.tensionGain.gain.value), t);
    m.tensionGain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    m.metallicGain.gain.cancelScheduledValues(t);
    m.metallicGain.gain.setValueAtTime(Math.max(0.0001, m.metallicGain.gain.value), t);
    m.metallicGain.gain.exponentialRampToValueAtTime(0.0001, t + 2);

    // Tüm oscillator'ları durdur
    const stopTime = t + 3;
    m.pad1.stop(stopTime);
    m.pad2.stop(stopTime);
    m.subPulse.stop(stopTime);
    pulseLfo.stop(stopTime);
    m.tension.stop(stopTime);
    m.metallic.stop(stopTime);
    m.lfo.stop(stopTime);

    m.pad1.onended = () => {
      m.pad1.disconnect();
      m.pad2.disconnect();
      (m as unknown as { _padFilter: BiquadFilterNode })._padFilter.disconnect();
      m.padGain.disconnect();
      m.subPulse.disconnect();
      pulseLfo.disconnect();
      m.subPulseGain.disconnect();
      m.tension.disconnect();
      (m as unknown as { _tensionFilter: BiquadFilterNode })._tensionFilter.disconnect();
      m.tensionGain.disconnect();
      m.metallic.disconnect();
      (m as unknown as { _metalFilter: BiquadFilterNode })._metalFilter?.disconnect();
      m.metallicGain.disconnect();
      m.lfo.disconnect();
      m.lfoGain.disconnect();
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
      preloadAll();
    },
    setMuted(m) {
      muted = m;
      const c = ctx;
      if (!c) return;
      c.master.gain.setTargetAtTime(m ? 0 : volume, c.ac.currentTime, 0.02);
      if (m) {
        stopFlame(c);
        stopSiren(c);
        stopMusic(c);
      } else {
        if (flameWanted) startFlame(c);
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
    tickFlame(dt) {
      if (!flameNodes) return;
      const c = ctx;
      if (!c || muted || c.ac.state !== "running") return;
      flameNodes.crackleTimer -= dt;
      if (flameNodes.crackleTimer <= 0) {
        flameNodes.crackleTimer = 0.06 + Math.random() * 0.14;
        const t = c.ac.currentTime;
        // Kısa tiz gürültü patlaması — çıtırtı
        if (voices < MAX_VOICES) {
          const crSrc = c.ac.createBufferSource();
          crSrc.buffer = c.noise;
          const crFilt = c.ac.createBiquadFilter();
          crFilt.type = "highpass";
          crFilt.frequency.value = 3200 + Math.random() * 4800;
          crFilt.Q.value = 1.5;
          const crGain = c.ac.createGain();
          const dur = 0.02 + Math.random() * 0.04;
          crGain.gain.setValueAtTime(0.0001, t);
          crGain.gain.exponentialRampToValueAtTime(0.12 + Math.random() * 0.18, t + 0.005);
          crGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          crSrc.connect(crFilt).connect(crGain).connect(c.master);
          crSrc.start(t);
          track(crSrc, t + dur + 0.01);
        }
      }
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
        if (now - lastExplosion < 0.045) return;
        lastExplosion = now;
        const s = Math.min(2, Math.max(0.5, size));
        // Büyük patlamalar için güçlü ses
        if (s >= 1.2) {
          playSample(c, "bigExplosion", { pitch: 0.75 + Math.random() * 0.3, vol: 0.8 * s });
        } else {
          playSample(c, "explosion", { pitch: 0.8 + Math.random() * 0.4, vol: 0.7 * s });
        }
        // Metal/mekanik patlama katmanı (orta-büyük)
        if (s >= 0.8) {
          playSample(c, "mechExplosion", {
            pitch: 0.7 + Math.random() * 0.4,
            vol: 0.45 * s,
            delay: 0.015,
          });
        }
        // Prosedürel katman
        noiseBurst(c, {
          dur: 0.42 * s,
          peak: 0.34 * s,
          type: "lowpass",
          from: 1800,
          to: 90,
          q: 0.8,
        });
        tone(c, { type: "sine", from: 130 * s, to: 26, dur: 0.5 * s, peak: 0.36 });
        noiseBurst(c, {
          dur: 0.1,
          peak: 0.3 * s,
          type: "highpass",
          from: 4200,
          to: 2000,
          q: 2.5,
        });
        // Metal gıcırtısı
        playSample(c, "metalHit", { pitch: 0.7 + Math.random() * 0.6, vol: 0.3, delay: 0.04 });
        // Uzak yankı — yankı gerçekçiliği için rastgele gecikme
        playSample(c, "distantBoom", {
          pitch: 0.6 + Math.random() * 0.2,
          vol: 0.25 * s,
          delay: 0.3 + Math.random() * 0.5,
        });
      });
    },
    fireball() {
      withCtx((c) => {
        // Alev fırlatma — whoosh + rocket
        playSample(c, "fireWhoosh", { pitch: 0.9 + Math.random() * 0.2, vol: 0.5 });
        playSample(c, "rocket", { pitch: 0.85 + Math.random() * 0.3, vol: 0.35, delay: 0.02 });
        noiseBurst(c, { dur: 0.18, peak: 0.18, type: "bandpass", from: 1100, to: 320, q: 1.6 });
        tone(c, { type: "sawtooth", from: 380, to: 120, dur: 0.16, peak: 0.12 });
      });
    },
    bombHit() {
      withCtx((c) => {
        // Büyük bomba sesi — çoklu patlama sample'ı
        playSample(c, "bigExplosion", { pitch: 0.7 + Math.random() * 0.3, vol: 0.9 });
        playSample(c, "bigBoom", { pitch: 0.6 + Math.random() * 0.3, vol: 0.7, delay: 0.04 });
        // Prosedürel derin bass
        noiseBurst(c, {
          dur: 0.7,
          peak: 0.44,
          type: "lowpass",
          from: 600,
          to: 55,
          q: 0.6,
        });
        tone(c, { type: "sine", from: 85, to: 18, dur: 0.65, peak: 0.42 });
        // Mekanik patlama katmanı
        playSample(c, "mechExplosion", { pitch: 0.65 + Math.random() * 0.3, vol: 0.45, delay: 0.02 });
        // Cam kırığı
        playSample(c, "glassBreak", { pitch: 0.8 + Math.random() * 0.4, vol: 0.55, delay: 0.03 });
        // Tiz crack
        noiseBurst(c, {
          dur: 0.12,
          peak: 0.38,
          type: "highpass",
          from: 4800,
          to: 2200,
          q: 3,
          delay: 0.01,
        });
        // Enkaz düşmesi
        playSample(c, "debris", { pitch: 0.8 + Math.random() * 0.4, vol: 0.4, delay: 0.1 });
        noiseBurst(c, {
          dur: 0.55,
          peak: 0.08,
          type: "bandpass",
          from: 480,
          to: 200,
          q: 1.2,
          delay: 0.12,
        });
        // Uzak yankı
        playSample(c, "distantBoom", { pitch: 0.55 + Math.random() * 0.2, vol: 0.35, delay: 0.4 + Math.random() * 0.4 });
      });
    },
    hit() {
      withCtx((c) => {
        // Gerçek çarpm sesi
        playSample(c, "metalHit", { pitch: 0.8 + Math.random() * 0.4, vol: 0.6 });
        playSample(c, "crack", { pitch: 0.9 + Math.random() * 0.2, vol: 0.35, delay: 0.01 });
        noiseBurst(c, { dur: 0.16, peak: 0.26, type: "lowpass", from: 1200, to: 160 });
        tone(c, { type: "square", from: 190, to: 60, dur: 0.14, peak: 0.14 });
      });
    },
    enemyShot() {
      withCtx((c) => {
        // Silah sesi — lazer veya tabanca
        if (Math.random() < 0.5) {
          playSample(c, "laser", { pitch: 0.9 + Math.random() * 0.3, vol: 0.25 });
        } else {
          playSample(c, "gunshot", { pitch: 0.8 + Math.random() * 0.4, vol: 0.3 });
        }
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
    scream() {
      withCtx((c) => {
        // Rastgele çığlık türü seç: erkek (%50), kadın (%25), tiz (%15), kalabalık (%10)
        const r = Math.random();
        if (r < 0.50) {
          playSample(c, "screamMale", { pitch: 0.8 + Math.random() * 0.4, vol: 0.55 });
          // İkinci çığlık — hafif gecikme ile çoğaltma efekti
          playSample(c, "screamMale", { pitch: 0.7 + Math.random() * 0.5, vol: 0.3, delay: 0.06 + Math.random() * 0.12 });
        } else if (r < 0.75) {
          playSample(c, "screamFemale", { pitch: 0.85 + Math.random() * 0.3, vol: 0.5 });
          playSample(c, "screamFemale", { pitch: 0.75 + Math.random() * 0.4, vol: 0.25, delay: 0.08 });
        } else if (r < 0.90) {
          playSample(c, "screamHigh", { pitch: 0.9 + Math.random() * 0.2, vol: 0.45 });
          playSample(c, "screamMale", { pitch: 0.9 + Math.random() * 0.3, vol: 0.25, delay: 0.05 });
        } else {
          playSample(c, "crowdScream", { pitch: 0.9 + Math.random() * 0.2, vol: 0.4 });
          playSample(c, "crowdScream", { pitch: 0.8 + Math.random() * 0.3, vol: 0.2, delay: 0.1 });
        }
      });
    },
    diveWind(intensity: number) {
      const c = ctx;
      if (!c) return;
      // İlk çağrıda sürekli dalma rüzgarı düğümü kur
      if (!diveWindNodes) {
        const t = c.ac.currentTime;
        const src = c.ac.createBufferSource();
        src.buffer = c.noise;
        src.loop = true;
        // Bandpass: rüzgar uğultusu — orta frekans
        const bp = c.ac.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 800;
        bp.Q.value = 0.6;
        // Yüksek kesim — çok tiz olmasın
        const hp = c.ac.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 200;
        hp.Q.value = 0.3;
        const gain = c.ac.createGain();
        gain.gain.value = 0.0001;
        // LFO ile frekans dalgalanması
        const lfo = c.ac.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.3;
        const lfoGain = c.ac.createGain();
        lfoGain.gain.value = 300;
        lfo.connect(lfoGain).connect(bp.frequency);
        src.connect(hp).connect(bp).connect(gain).connect(c.master);
        src.start(t);
        lfo.start(t);
        diveWindNodes = { src, gain, lfo };
      }
      // Gain'i yoğunluğa göre ayarla
      const now = c.ac.currentTime;
      diveWindNodes.gain.gain.cancelScheduledValues(now);
      const target = intensity * 0.18;
      diveWindNodes.gain.gain.setTargetAtTime(target, now, 0.08);
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
        diveWindNodes.gain.gain.cancelScheduledValues(c.ac.currentTime);
        diveWindNodes.gain.gain.setValueAtTime(0.0001, c.ac.currentTime);
        diveWindNodes.src.stop(c.ac.currentTime + 0.1);
        diveWindNodes.lfo.stop(c.ac.currentTime + 0.1);
        diveWindNodes = null;
      }
      flameWanted = false;
      ambientWanted = false;
      sirenWanted = false;
      musicWanted = false;
    },
    dispose() {
      const c = ctx;
      if (!c) return;
      stopFlame(c);
      stopAmbient(c);
      stopSiren(c);
      stopMusic(c);
      if (diveWindNodes) {
        diveWindNodes.src.stop();
        diveWindNodes.lfo.stop();
        diveWindNodes = null;
      }
      ctx = null;
      void c.ac.close().catch(() => {});
    },
  };
}
