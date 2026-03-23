/**
 * Procedural audio engine built on the Web Audio API.
 * Zero external assets — all music and SFX are synthesised at runtime.
 *
 * Usage:
 *   const audio = new AudioManager();
 *   // Call resume() inside a user-gesture handler to unlock the context
 *   audio.resume().then(() => audio.startMusic());
 */
export class AudioManager {
  constructor() {
    this._ctx       = null;
    this._master    = null;  // master gain
    this._musicBus  = null;  // music sub-mix
    this._sfxBus    = null;  // sfx sub-mix
    this._reverb    = null;  // shared convolver reverb
    this._muted     = false;
    this._loopTimer = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Unlock / create the AudioContext (must be called inside a user gesture). */
  resume() {
    if (!this._ctx) this._init();
    return this._ctx.state === 'suspended'
      ? this._ctx.resume()
      : Promise.resolve();
  }

  _init() {
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();

    this._master = this._ctx.createGain();
    this._master.gain.value = 1;
    this._master.connect(this._ctx.destination);

    // Music bus — keep quiet under the SFX
    this._musicBus = this._ctx.createGain();
    this._musicBus.gain.value = 0.14;
    this._musicBus.connect(this._master);

    // SFX bus
    this._sfxBus = this._ctx.createGain();
    this._sfxBus.gain.value = 0.62;
    this._sfxBus.connect(this._master);

    // Reverb send for SFX — adds depth without muddying music
    this._reverb = this._buildReverb(1.4);
    const reverbSend = this._ctx.createGain();
    reverbSend.gain.value = 0.22;
    this._sfxBus.connect(reverbSend);
    reverbSend.connect(this._reverb);
    this._reverb.connect(this._master);
  }

  /** Synthesise a short reverb impulse response. */
  _buildReverb(durSeconds = 1.5) {
    const ctx  = this._ctx;
    const rate = ctx.sampleRate;
    const len  = Math.ceil(rate * durSeconds);
    const buf  = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
    }
    const conv  = ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  get _ready() { return this._ctx?.state === 'running'; }

  // ── Background Music ───────────────────────────────────────────────────────

  /**
   * Start the looping procedural background track.
   * Safe to call multiple times — ignored if already playing.
   */
  startMusic() {
    if (!this._ready || this._loopTimer !== null) return;
    // Fade music in over 2 s so it doesn't startle
    this._musicBus.gain.setValueAtTime(0, this._ctx.currentTime);
    this._musicBus.gain.linearRampToValueAtTime(0.14, this._ctx.currentTime + 2.0);
    this._scheduleLoop(this._ctx.currentTime);
  }

  stopMusic() {
    if (!this._ctx) return;
    clearTimeout(this._loopTimer);
    this._loopTimer = null;
    this._musicBus.gain.setTargetAtTime(0, this._ctx.currentTime, 0.6);
  }

  /**
   * Schedule one 4-bar loop of the background track:
   *  - Lead melody (sine) over C-major pentatonic
   *  - Pad harmony (triangle) — whole notes
   *  - Bass drone (triangle) — whole notes one octave down
   *  - Soft hi-hat tick (filtered noise) on beats 2 & 4
   */
  _scheduleLoop(t) {
    const ctx  = this._ctx;
    const out  = this._musicBus;
    const BPM  = 108;
    const BEAT = 60 / BPM;
    const BAR  = BEAT * 4;

    // C-major pentatonic: C4 D4 E4 G4 A4 C5 D5 E5 G5
    const P = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99];

    // Melody: 16 eighth-note steps (2 bars) — playful, bouncy feel
    const mel = [4, 5, 7, 5, 4, 2, 4, 5,  7, 8, 7, 5, 4, 2, 0, 2];
    mel.forEach((n, i) => {
      this._osc(P[n], t + i * BEAT * 0.5, BEAT * 0.40, 0.05, out, 'sine');
    });
    // Second half: same phrase shifted up a perfect 4th
    mel.forEach((n, i) => {
      this._osc(P[n] * 1.335, t + 2 * BAR + i * BEAT * 0.5, BEAT * 0.40, 0.038, out, 'sine');
    });

    // Pad harmonics — whole notes, soft triangle
    const pads = [P[0], P[4], P[2], P[4]];
    pads.forEach((f, i) => {
      this._osc(f * 1.5, t + i * BAR, BAR * 0.88, 0.030, out, 'triangle');
    });

    // Bass — one octave down, whole notes
    const bass = [P[0] / 2, P[4] / 2, P[2] / 2, P[0] / 2];
    bass.forEach((f, i) => {
      this._osc(f, t + i * BAR, BAR * 0.92, 0.055, out, 'triangle');
    });

    // Soft hi-hat click on beats 2 & 4
    for (let bar = 0; bar < 4; bar++) {
      [1, 3].forEach((beat) => {
        const when = t + bar * BAR + beat * BEAT;
        const src  = ctx.createBufferSource();
        src.buffer = this._noiseBuffer(0.035);
        const filt = ctx.createBiquadFilter();
        filt.type  = 'highpass';
        filt.frequency.value = 6000;
        const g    = ctx.createGain();
        g.gain.setValueAtTime(0.06, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.035);
        src.connect(filt);
        filt.connect(g);
        g.connect(out);
        src.start(when);
      });
    }

    const loopLen = BAR * 4;
    // Re-schedule ~200 ms before the loop ends for seamless transitions
    this._loopTimer = setTimeout(() => {
      this._loopTimer = null;
      if (!this._muted && this._ready) this._scheduleLoop(t + loopLen);
    }, Math.max(0, (t + loopLen - ctx.currentTime - 0.2) * 1000));
  }

  // ── Sound Effects ──────────────────────────────────────────────────────────

  /** Short UI click confirmation. */
  playClick() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    this._osc(1100, t,        0.055, 0.20, this._sfxBus, 'sine');
    this._osc(750,  t + 0.03, 0.045, 0.10, this._sfxBus, 'sine');
  }

  /** Dice rattling / tumbling. */
  playDiceRoll() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    // 10 noise bursts that fade out as the dice slows down
    for (let i = 0; i < 10; i++) {
      const when = t + i * 0.075;
      const src  = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(0.065);
      const filt = ctx.createBiquadFilter();
      filt.type  = 'bandpass';
      filt.frequency.value = 700 + Math.random() * 500;
      filt.Q.value = 2.5;
      const g = ctx.createGain();
      const vol = 0.28 * (1 - i / 12);
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.065);
      src.connect(filt);
      filt.connect(g);
      g.connect(this._sfxBus);
      src.start(when);
    }
  }

  /** Single piece hop — called per square during movement. */
  playHop() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type  = 'sine';
    osc.frequency.setValueAtTime(560, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.11);
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(g);
    g.connect(this._sfxBus);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** Snake slide — descending pitch with vibrato hiss. */
  playSnake() {
    if (!this._ready) return;
    const ctx  = this._ctx;
    const t    = ctx.currentTime;

    const osc  = ctx.createOscillator();
    const lfo  = ctx.createOscillator();
    const lfoG = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    const g    = ctx.createGain();

    osc.type  = 'sawtooth';
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(900, t);
    filt.frequency.exponentialRampToValueAtTime(120, t + 1.6);

    // Vibrato — gives the snake its "wriggle"
    lfo.frequency.value = 7;
    lfoG.gain.value     = 22;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);

    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 1.6);

    g.gain.setValueAtTime(0.30, t);
    g.gain.setTargetAtTime(0, t + 1.1, 0.20);

    osc.connect(filt);
    filt.connect(g);
    g.connect(this._sfxBus);

    lfo.start(t); osc.start(t);
    lfo.stop(t + 2.2); osc.stop(t + 2.2);
  }

  /** Ladder climb — ascending chime arpeggio. */
  playLadder() {
    if (!this._ready) return;
    const t     = this._ctx.currentTime;
    const freqs = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
    freqs.forEach((f, i) => {
      // Fundamental + octave shimmer
      this._osc(f,     t + i * 0.10, 0.42, 0.17, this._sfxBus, 'sine');
      this._osc(f * 2, t + i * 0.10, 0.14, 0.055, this._sfxBus, 'sine');
    });
  }

  /** Victory fanfare — chord progression + sparkle arpeggio. */
  playWin() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    const chords = [
      { dt: 0.00, notes: [261.63, 329.63, 392.00],         dur: 0.22 },
      { dt: 0.25, notes: [293.66, 369.99, 440.00],         dur: 0.22 },
      { dt: 0.50, notes: [329.63, 415.30, 523.25],         dur: 0.22 },
      { dt: 0.75, notes: [392.00, 493.88, 587.33, 783.99], dur: 1.30 },
    ];
    chords.forEach(({ dt, notes, dur }) => {
      notes.forEach((f) => this._osc(f, t + dt, dur, 0.14, this._sfxBus, 'sine'));
    });
    // Rising sparkle arpeggio on the final chord
    [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
      this._osc(f, t + 0.75 + i * 0.09, 0.55, 0.07, this._sfxBus, 'sine');
    });
  }

  /** Soft two-note chime for turn transitions. */
  playTurnChange() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    this._osc(659.25, t,       0.10, 0.10, this._sfxBus, 'sine');
    this._osc(783.99, t + 0.1, 0.10, 0.10, this._sfxBus, 'sine');
  }

  // ── Mute toggle ────────────────────────────────────────────────────────────

  /** Toggle mute. Returns new muted state. */
  toggleMute() {
    this._muted = !this._muted;
    if (this._ctx) {
      this._master.gain.setTargetAtTime(
        this._muted ? 0 : 1,
        this._ctx.currentTime,
        0.1,
      );
    }
    // Pause/resume loop scheduling
    if (this._muted) {
      clearTimeout(this._loopTimer);
      this._loopTimer = null;
    } else if (this._ready) {
      this._scheduleLoop(this._ctx.currentTime);
    }
    return this._muted;
  }

  get muted() { return this._muted; }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Create and connect a single oscillator note with an ADSR-like volume
   * envelope, then return the oscillator node.
   */
  _osc(freq, startTime, duration, peakGain, dest, type = 'sine') {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type  = type;
    osc.frequency.value = freq;

    const att = Math.min(0.018, duration * 0.1);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(peakGain, startTime + att);
    g.gain.setTargetAtTime(0, startTime + duration * 0.55, duration * 0.20);

    osc.connect(g);
    g.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.5);
    return osc;
  }

  /** Return a mono AudioBuffer filled with white noise. */
  _noiseBuffer(duration) {
    const ctx  = this._ctx;
    const len  = Math.ceil(ctx.sampleRate * duration);
    const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}
