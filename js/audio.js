// WebAudio で全効果音を合成（外部ファイル不要）
class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.noiseBuf = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _out(pan = 0, gain = 1) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  _noise(dest, t, dur, { type = 'lowpass', freq = 2000, q = 1, gain = 1, attack = 0.002, freqEnd = null } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  _tone(dest, t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.5, attack = 0.003 } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _ok() { return !!this.ctx && this.ctx.state === 'running'; }

  // 距離とパンを計算して呼ぶ
  shot(kind, { pan = 0, dist = 0 } = {}) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const att = 1 / (1 + dist * 0.06);
    const out = this._out(pan, att);
    const far = Math.min(1, dist / 40);
    if (kind === 'ar') {
      this._noise(out, t, 0.16, { freq: 5200 - far * 3000, freqEnd: 600, gain: 0.9 });
      this._noise(out, t, 0.05, { type: 'highpass', freq: 3000, gain: 0.4 * (1 - far) });
      this._tone(out, t, 0.12, { freq: 150, freqEnd: 45, gain: 0.9 });
      this._noise(out, t + 0.02, 0.35, { freq: 900, freqEnd: 200, gain: 0.15 });
    } else {
      this._noise(out, t, 0.12, { freq: 6000 - far * 3000, freqEnd: 800, gain: 0.75 });
      this._tone(out, t, 0.09, { freq: 220, freqEnd: 60, gain: 0.7 });
      this._noise(out, t + 0.02, 0.25, { freq: 1200, freqEnd: 300, gain: 0.12 });
    }
  }

  punch({ pan = 0, dist = 0, hit = false } = {}) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const out = this._out(pan, 1 / (1 + dist * 0.08));
    this._noise(out, t, 0.12, { type: 'bandpass', freq: 900, freqEnd: 300, q: 0.8, gain: 0.35 });
    if (hit) {
      this._tone(out, t, 0.14, { freq: 120, freqEnd: 50, gain: 1.0 });
      this._noise(out, t, 0.08, { freq: 1800, gain: 0.7 });
    }
  }

  explosion({ pan = 0, dist = 0 } = {}) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const out = this._out(pan, 1.4 / (1 + dist * 0.04));
    this._noise(out, t, 1.6, { freq: 2400, freqEnd: 80, gain: 1.0, attack: 0.005 });
    this._tone(out, t, 0.9, { freq: 90, freqEnd: 28, gain: 1.2 });
    this._noise(out, t + 0.05, 2.2, { freq: 400, freqEnd: 60, gain: 0.4 });
  }

  bounce({ pan = 0, dist = 0 } = {}) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const out = this._out(pan, 0.6 / (1 + dist * 0.1));
    this._tone(out, t, 0.08, { type: 'triangle', freq: 900, freqEnd: 500, gain: 0.3 });
    this._noise(out, t, 0.04, { type: 'highpass', freq: 3000, gain: 0.2 });
  }

  pin() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, 0.6);
    this._tone(out, t, 0.06, { type: 'square', freq: 2400, gain: 0.08 });
    this._noise(out, t + 0.05, 0.15, { type: 'bandpass', freq: 1500, gain: 0.3 });
  }

  hit(head) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, 0.7);
    if (head) {
      this._tone(out, t, 0.12, { type: 'triangle', freq: 1760, gain: 0.35 });
      this._tone(out, t + 0.04, 0.18, { type: 'triangle', freq: 2640, gain: 0.3 });
    } else {
      this._tone(out, t, 0.07, { type: 'triangle', freq: 1300, gain: 0.3 });
      this._noise(out, t, 0.03, { type: 'highpass', freq: 4000, gain: 0.2 });
    }
  }

  kill() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, 0.6);
    [880, 1108, 1320, 1760].forEach((f, i) => this._tone(out, t + i * 0.06, 0.3, { type: 'triangle', freq: f, gain: 0.3 }));
  }

  hurt() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, 0.6);
    this._tone(out, t, 0.18, { type: 'sawtooth', freq: 180, freqEnd: 90, gain: 0.25 });
    this._noise(out, t, 0.1, { freq: 800, gain: 0.3 });
  }

  impact({ pan = 0, dist = 0 } = {}) {
    if (!this._ok() || dist > 45) return;
    const t = this.ctx.currentTime, out = this._out(pan, 0.35 / (1 + dist * 0.1));
    this._noise(out, t, 0.06, { type: 'bandpass', freq: 2500 + Math.random() * 2000, q: 2, gain: 0.5 });
  }

  whiz() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out((Math.random() - 0.5) * 1.6, 0.4);
    this._noise(out, t, 0.15, { type: 'bandpass', freq: 4000, freqEnd: 1500, q: 4, gain: 0.6, attack: 0.05 });
  }

  empty() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, 0.5);
    this._tone(out, t, 0.04, { type: 'square', freq: 1600, gain: 0.1 });
  }

  reload(stage) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0.2, 0.5);
    if (stage === 0) {
      this._noise(out, t, 0.08, { type: 'bandpass', freq: 1200, q: 3, gain: 0.6 });
    } else if (stage === 1) {
      this._noise(out, t, 0.06, { type: 'bandpass', freq: 2200, q: 3, gain: 0.7 });
      this._tone(out, t, 0.05, { type: 'square', freq: 700, gain: 0.08 });
    } else {
      this._noise(out, t, 0.05, { type: 'highpass', freq: 2500, gain: 0.7 });
      this._noise(out, t + 0.07, 0.06, { type: 'bandpass', freq: 1600, q: 2, gain: 0.7 });
    }
  }

  swap() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, 0.35);
    this._noise(out, t, 0.12, { type: 'bandpass', freq: 1800, freqEnd: 900, q: 1.5, gain: 0.4 });
  }

  step({ pan = 0, dist = 0 } = {}) {
    if (!this._ok() || dist > 30) return;
    const t = this.ctx.currentTime, out = this._out(pan, 0.22 / (1 + dist * 0.12));
    this._noise(out, t, 0.08, { freq: 500 + Math.random() * 300, gain: 0.8 });
  }

  jump() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, 0.25);
    this._noise(out, t, 0.12, { type: 'bandpass', freq: 700, freqEnd: 1400, gain: 0.5 });
  }

  land(hard) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, hard ? 0.5 : 0.25);
    this._noise(out, t, 0.14, { freq: 400, gain: 0.9 });
    this._tone(out, t, 0.1, { freq: 80, freqEnd: 40, gain: 0.4 });
  }

  beep(high) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, 0.5);
    this._tone(out, t, high ? 0.5 : 0.18, { type: 'square', freq: high ? 1320 : 660, gain: 0.12 });
  }

  fanfare(win) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, 0.6);
    const notes = win ? [523, 659, 784, 1046, 1318] : [440, 415, 392, 370, 330];
    notes.forEach((f, i) => {
      this._tone(out, t + i * 0.13, 0.5, { type: 'triangle', freq: f, gain: 0.25 });
      this._tone(out, t + i * 0.13, 0.5, { type: 'sine', freq: f / 2, gain: 0.15 });
    });
  }

  roundWin(win) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, out = this._out(0, 0.5);
    const notes = win ? [784, 1046] : [392, 311];
    notes.forEach((f, i) => this._tone(out, t + i * 0.12, 0.35, { type: 'triangle', freq: f, gain: 0.3 }));
  }
}

export const audio = new AudioSystem();
