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
    this._ctx         = null;
    this._master      = null;  // master gain
    this._musicBus    = null;  // music sub-mix
    this._sfxBus      = null;  // sfx sub-mix
    this._ambienceBus = null;  // ambient soundscape sub-mix
    this._reverb      = null;  // shared convolver reverb
    this._muted       = false;
    this._loopTimer   = null;
    // Ambience
    this._windSrc     = null;  // wind noise buffer source
    this._windGain    = null;
    this._insectOscs  = [];    // insect chorus oscillators
    this._birdTimer   = null;
    this._ambiPlaying = false;
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

    // Ambience bus — jungle sounds, very quiet under music
    this._ambienceBus = this._ctx.createGain();
    this._ambienceBus.gain.value = 0;
    this._ambienceBus.connect(this._master);
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

  /** Game start fanfare — triumphant ascending three-chord progression. */
  playGameStart() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    // Rising chord stabs: Dm → F → C → G (majors)
    const stabs = [
      { dt: 0.00, notes: [293.66, 369.99, 440.00] },  // D minor
      { dt: 0.22, notes: [349.23, 440.00, 523.25] },  // F major
      { dt: 0.44, notes: [261.63, 329.63, 392.00] },  // C major
      { dt: 0.70, notes: [392.00, 493.88, 587.33, 740.00] }, // G major + 9th
    ];
    stabs.forEach(({ dt, notes }) => {
      notes.forEach((f) => {
        this._osc(f, t + dt, 0.28, 0.18, this._sfxBus, 'sine');
        this._osc(f * 2, t + dt, 0.14, 0.04, this._sfxBus, 'triangle');
      });
    });
    // Sparkle run up after the final chord
    [392, 494, 587, 659, 784, 988, 1175, 1319].forEach((f, i) => {
      this._osc(f, t + 0.72 + i * 0.07, 0.30, 0.09, this._sfxBus, 'sine');
    });
  }

  /**
   * Overshoot bounce — quick ascending whoosh + descending "boing"
   * played when a piece overshoots square 100 and bounces back.
   */
  playOvershoot() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    // Whoosh up
    const osc1 = ctx.createOscillator();
    const g1   = ctx.createGain();
    osc1.type  = 'sine';
    osc1.frequency.setValueAtTime(400, t);
    osc1.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
    g1.gain.setValueAtTime(0.28, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc1.connect(g1); g1.connect(this._sfxBus);
    osc1.start(t); osc1.stop(t + 0.25);
    // Boing down
    const osc2 = ctx.createOscillator();
    const g2   = ctx.createGain();
    osc2.type  = 'sine';
    osc2.frequency.setValueAtTime(1100, t + 0.20);
    osc2.frequency.exponentialRampToValueAtTime(180, t + 0.55);
    g2.gain.setValueAtTime(0.24, t + 0.20);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.60);
    osc2.connect(g2); g2.connect(this._sfxBus);
    osc2.start(t + 0.20); osc2.stop(t + 0.65);
  }

  /** Warm bell tone for animal selection confirmation. */
  playAnimalSelect() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    // Fundamental + two partials for a metallic bell
    this._osc(880.00, t,        0.55, 0.16, this._sfxBus, 'sine');
    this._osc(1760.0, t + 0.01, 0.35, 0.06, this._sfxBus, 'sine');
    this._osc(2640.0, t + 0.01, 0.20, 0.03, this._sfxBus, 'triangle');
  }

  // ── Ambient Jungle Soundscape ──────────────────────────────────────────────

  /**
   * Start the looping procedural jungle ambience:
   *  - Filtered wind noise with slow tremolo
   *  - Insect chorus (beating sine drones)
   *  - Random bird tweets
   * Safe to call multiple times — ignored if already playing.
   */
  startAmbience() {
    if (!this._ready || this._ambiPlaying) return;
    this._ambiPlaying = true;

    // Fade ambience bus in slowly
    this._ambienceBus.gain.setValueAtTime(0, this._ctx.currentTime);
    this._ambienceBus.gain.linearRampToValueAtTime(0.18, this._ctx.currentTime + 4.0);

    this._startWind();
    this._startInsects();
    this._scheduleBirdTweet();
  }

  stopAmbience() {
    if (!this._ctx || !this._ambiPlaying) return;
    this._ambiPlaying = false;

    // Fade out ambience bus
    this._ambienceBus.gain.setTargetAtTime(0, this._ctx.currentTime, 0.8);

    // Stop wind sources (buf source + LFO)
    if (this._windNodes) {
      this._windNodes.forEach((n) => { try { n.stop(); } catch (_) { /* already stopped */ } });
      this._windNodes = null;
    }
    this._windSrc = null;

    this._insectOscs.forEach((o) => { try { o.stop(); } catch (_) { /* ok */ } });
    this._insectOscs = [];

    clearTimeout(this._birdTimer);
    this._birdTimer = null;
  }

  /** Continuous wind layer: bandpass-filtered noise with LFO tremolo. */
  _startWind() {
    const ctx = this._ctx;
    const t   = ctx.currentTime;

    // Long noise buffer (10 s) looped
    const dur = 10;
    const buf = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }

    const src  = ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;

    // Multi-band shape: keep the low-mid "whoosh"
    const lo = ctx.createBiquadFilter(); lo.type = 'highpass';  lo.frequency.value = 120;
    const hi = ctx.createBiquadFilter(); hi.type = 'lowpass';   hi.frequency.value = 600;

    // Slow tremolo LFO (0.12 Hz)
    const lfo  = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.12;
    lfoG.gain.value     = 0.12;
    const windG = ctx.createGain();
    windG.gain.value    = 0.55;
    lfo.connect(lfoG);
    lfoG.connect(windG.gain);

    src.connect(lo); lo.connect(hi); hi.connect(windG);
    windG.connect(this._ambienceBus);

    lfo.start(t);
    src.start(t);

    this._windSrc = src;
    // Store refs to stop them
    src.onended = null;
    this._windNodes = [lfo, src];
  }

  /** Insect chorus: 4 slightly detuned sine drones creating beating effect. */
  _startInsects() {
    const ctx   = this._ctx;
    const t     = ctx.currentTime;
    const freqs = [320, 323.5, 327, 330.8]; // close pitches → psychoacoustic beat (≈3 Hz)

    // Keep references to the per-oscillator gain nodes for AM wiring
    const insectGains = [];
    freqs.forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type  = 'sine';
      osc.frequency.value = f;
      const g   = ctx.createGain();
      g.gain.value = 0.06;
      osc.connect(g);
      g.connect(this._ambienceBus);
      osc.start(t);
      this._insectOscs.push(osc);
      insectGains.push(g);
    });

    // AM modulation at 3.2 Hz — modulates the gain of every insect drone
    const amLfo  = ctx.createOscillator();
    const amGain = ctx.createGain();
    amLfo.frequency.value = 3.2;
    amGain.gain.value     = 0.04;  // modulation depth
    amLfo.connect(amGain);
    insectGains.forEach((g) => amGain.connect(g.gain));
    amLfo.start(t);
    this._insectOscs.push(amLfo);
  }

  /**
   * Schedule a random bird tweet at a random future time, then reschedule.
   * Creates short melodic 2-4 note fragments.
   */
  _scheduleBirdTweet() {
    if (!this._ambiPlaying) return;
    const delay = 3500 + Math.random() * 8000; // 3.5–11.5 s between tweets
    this._birdTimer = setTimeout(() => {
      if (!this._ambiPlaying || !this._ready) return;
      const ctx   = this._ctx;
      const t     = ctx.currentTime;
      const base  = 900 + Math.random() * 1200; // random bird pitch range
      const notes = Math.floor(2 + Math.random() * 3); // 2–4 notes
      for (let i = 0; i < notes; i++) {
        const freq = base * (0.9 + Math.random() * 0.35);
        const when = t + i * (0.075 + Math.random() * 0.08);
        const dur  = 0.04 + Math.random() * 0.06;
        this._osc(freq, when, dur, 0.042, this._ambienceBus, 'sine');
      }
      this._scheduleBirdTweet();
    }, delay);
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
