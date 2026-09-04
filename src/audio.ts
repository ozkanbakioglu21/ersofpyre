type Osc = OscillatorType;

export class ZenAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private vinyl: GainNode | null = null;
  private timer: number | null = null;
  private chord = 0;
  private step = 0;
  musicPlaying = false;

  private ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(c.destination);

    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 2.5;
    }
  }

  unlock(): void {
    this.ensure();
    if (this.ctx && !this.musicPlaying) this.toggleMusic();
  }

  toggleMusic(): boolean {
    this.ensure();
    if (!this.ctx) return false;
    if (this.musicPlaying) {
      this.stopMusic();
    } else {
      this.startMusic();
    }
    return this.musicPlaying;
  }

  private startMusic(): void {
    if (!this.ctx) return;
    this.musicPlaying = true;
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.03;
    this.musicBus.connect(this.master!);

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 780;
    lp.connect(this.musicBus);
    this.musicBus = lp;

    this.vinyl = this.ctx.createGain();
    this.vinyl.gain.value = 0.004;
    this.vinyl.connect(this.master!);
    if (this.noiseBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.connect(this.vinyl);
      src.start();
    }

    this.chord = 0;
    this.step = 0;
    this.timer = window.setInterval(() => this.tick(), 300);
  }

  private stopMusic(): void {
    this.musicPlaying = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.musicBus = null;
    this.vinyl = null;
  }

  private chords = [
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [196.0, 233.08, 293.66, 349.23], // Gm7
    [146.83, 174.61, 220.0, 261.63], // Dm7
    [233.08, 261.63, 349.23, 440.0], // Bbmaj7
  ];

  private tick(): void {
    const c = this.ctx;
    if (!c || !this.musicBus) return;
    const chordArr = this.chords[this.chord];

    if (this.step % 3 === 0) {
      const f = chordArr[Math.floor(Math.random() * chordArr.length)];
      const mult = Math.random() < 0.35 ? 2 : 1;
      this.lofi(f * mult, 0.32, 0.05);
    }
    if (this.step % 12 === 0) {
      for (const f of chordArr) {
        this.lofi(f, 0.8, 0.012);
      }
    }
    if (this.step % 24 === 23) {
      this.chord = (this.chord + 1) % this.chords.length;
    }
    if (Math.random() < 0.05) this.crackle();
    this.step++;
  }

  private lofi(freq: number, dur: number, gain: number): void {
    const c = this.ctx;
    if (!c || !this.musicBus) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.linearRampToValueAtTime(freq * (1 + Math.random() * 0.008), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private crackle(): void {
    const c = this.ctx;
    if (!c || !this.vinyl) return;
    const dur = 0.02;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = 300 + Math.random() * 2500;
    const g = c.createGain();
    g.gain.setValueAtTime((Math.random() * 0.06 + 0.02) * 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.vinyl);
    o.start(t);
    o.stop(t + dur);
  }

  private hit(freq: number, dur: number, gain: number, type: Osc, slide?: number): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, freq: number, type: BiquadFilterType = "bandpass"): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noiseBuf) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  place(): void {
    this.hit(210, 0.14, 0.16, "triangle", 110);
    this.noise(0.09, 0.05, 1400);
  }

  cut(): void {
    this.hit(340, 0.06, 0.12, "triangle", 120);
    this.noise(0.1, 0.09, 2600, "highpass");
  }

  recycle(): void {
    this.hit(300, 0.1, 0.08, "sine", 150);
    this.hit(420, 0.12, 0.07, "sine", 210, );
  }

  refill(): void {
    this.hit(523, 0.14, 0.09, "triangle");
    this.hit(784, 0.2, 0.08, "triangle", undefined, );
  }

  complete(): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = c.createGain();
      const st = t + i * 0.14;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.07, st + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
      o.connect(g);
      g.connect(this.master!);
      o.start(st);
      o.stop(st + 0.6);
    });
    this.noise(1.6, 0.04, 400, "lowpass");
  }
}