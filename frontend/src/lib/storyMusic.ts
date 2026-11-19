/*
 * Original background music for the "How it works" story, played live with the Web Audio API
 * (no music files, no licence needed). An uplifting loop in C major: Am - F - C - G at 92 BPM.
 *   bars 1-4   warm pads + a soft plucked arpeggio with an echo
 *   bars 5-8   + a gentle beat (soft kick, light shaker)
 *   bars 9+    + bass; the arpeggio pattern alternates every 4 bars so it does not feel repetitive
 * The volume drops (ducks) while the narrator speaks.
 */

const BPM = 92;
const STEP = 60 / BPM / 4; // one 16th note in seconds
// chord tones (MIDI) and bass root per bar
const CHORDS: { notes: number[]; bass: number }[] = [
  { notes: [57, 60, 64], bass: 45 }, // A minor
  { notes: [53, 57, 60], bass: 41 }, // F major
  { notes: [55, 60, 64], bass: 48 }, // C major
  { notes: [55, 59, 62], bass: 43 }, // G major
];
const ARP_A = [0, 1, 2, 3, 2, 1, 2, 3];
const ARP_B = [0, 2, 1, 3, 0, 2, 3, 2];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class StoryMusic {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private echo!: DelayNode;
  private noise!: AudioBuffer;
  private timer: number | undefined;
  private nextTime = 0;
  private step = 0;
  private level = 0.2;

  /** Start (or continue) the music. Must be called from a click (browser autoplay rule). */
  start(): void {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
    if (this.timer === undefined) {
      this.nextTime = this.ctx!.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 50);
    }
    this.fadeTo(this.level, 1.2);
  }

  pause(): void { void this.ctx?.suspend(); }
  resume(): void { void this.ctx?.resume(); }

  /** Quieter under the narrator, a bit louder without it. */
  setDucked(ducked: boolean): void {
    this.level = ducked ? 0.11 : 0.22;
    if (this.ctx) this.fadeTo(this.level, 0.8);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) {
      this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      window.setTimeout(() => void ctx.close(), 800);
    }
    this.step = 0;
  }

  private fadeTo(v: number, seconds: number): void {
    const now = this.ctx!.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(v, now, seconds / 3);
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    // Reverb: a short room made of decaying noise
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.master);

    // Echo for the arpeggio (dotted eighth)
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.4;
    this.echo.connect(feedback).connect(this.echo);
    this.echo.connect(echoOut).connect(this.master);

    // White noise for the shaker
    this.noise = ctx.createBuffer(1, ctx.sampleRate / 4, ctx.sampleRate);
    const n = this.noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const chord = CHORDS[bar % 4];
    if (inBar === 0) this.pad(chord.notes, t, STEP * 16);
    if (inBar % 2 === 0) {
      const pattern = Math.floor(bar / 4) % 2 === 0 ? ARP_A : ARP_B;
      const idx = pattern[inBar / 2];
      const note = idx === 3 ? chord.notes[0] + 12 : chord.notes[idx];
      this.pluck(note + 12, t);
    }
    if (bar >= 4) {
      if (inBar === 0 || inBar === 8) this.kick(t);
      if (inBar % 4 === 2) this.shaker(t, inBar === 6 || inBar === 14 ? 0.05 : 0.03);
    }
    if (bar >= 8 && (inBar === 0 || inBar === 6 || inBar === 8)) this.bass(chord.bass, t, inBar === 6 ? STEP * 2 : STEP * 5);
  }

  private voice(type: OscillatorType, freq: number, t: number, dur: number, peak: number, attack: number, release: number,
                out: AudioNode[], filterHz?: number, detune = 0): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0, t + dur, release / 3);
    let node: AudioNode = osc;
    if (filterHz) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = filterHz;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    for (const o of out) g.connect(o);
    osc.start(t);
    osc.stop(t + dur + release + 0.1);
  }

  private pad(notes: number[], t: number, dur: number): void {
    for (const n of notes) {
      for (const detune of [-7, 7]) this.voice("sawtooth", hz(n), t, dur * 0.92, 0.035, 0.7, 1.4, [this.master, this.reverb], 900, detune);
    }
  }

  private pluck(note: number, t: number): void {
    this.voice("triangle", hz(note), t, 0.05, 0.11, 0.004, 0.45, [this.master, this.echo, this.reverb]);
  }

  private bass(note: number, t: number, dur: number): void {
    this.voice("sine", hz(note), t, dur, 0.22, 0.01, 0.25, [this.master]);
    this.voice("triangle", hz(note + 12), t, dur, 0.04, 0.01, 0.2, [this.master], 600);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  private shaker(t: number, peak: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.08);
  }
}
