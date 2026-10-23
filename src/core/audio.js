// Small procedural sound layer (no audio files): filtered noise for rain,
// short synthesised clicks / thuds for switches, doors and windows.
// The AudioContext is created lazily on the first user gesture.

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.rainGain = null;
    this._rainTarget = 0;
    this._indoor = false;
  }

  resume() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) this._init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      this.enabled = false;
    }
  }

  _init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);
    // 4 s of pink-ish noise, looped
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      }
    }
    this.noise = buf;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainFilter.frequency.value = 6000;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    src.connect(this.rainFilter).connect(this.rainGain).connect(this.master);
    src.start();
  }

  setRain(intensity, indoor) {
    if (!this.ctx || !this.rainGain) return;
    const t = this.ctx.currentTime;
    const g = intensity * (indoor ? 0.35 : 0.9);
    this.rainGain.gain.setTargetAtTime(g, t, 0.4);
    this.rainFilter.frequency.setTargetAtTime(indoor ? 900 : 5500, t, 0.3);
  }

  play(kind) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.connect(this.master);
    const noiseBurst = (dur, freq, q, gain) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(out);
      s.start(t, Math.random() * 3, dur + 0.05);
    };
    if (kind === 'click') {
      noiseBurst(0.04, 3200, 4, 0.9);
    } else if (kind === 'doorOpen' || kind === 'doorClose') {
      noiseBurst(0.35, kind === 'doorOpen' ? 700 : 500, 1.2, 0.35);
      if (kind === 'doorClose') setTimeout(() => this._thud(), 650);
    } else if (kind === 'window') {
      noiseBurst(0.5, 1500, 2, 0.18);
    } else if (kind === 'drawer') {
      noiseBurst(0.3, 1100, 1.5, 0.25);
    }
  }

  _thud() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.22);
  }
}
