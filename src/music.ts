// An original soundtrack, played live by synthesizers so the game ships with no audio files.

export type Track = 'menu' | 'battle';

const STEPS_PER_BAR = 16;
const LOOKAHEAD = 0.3;
/** Timers slow right down in a hidden tab, so it has to plan further ahead there. */
const HIDDEN_LOOKAHEAD = 1.6;
const FADE = 0.5;

interface Song {
  bpm: number;
  /** The bass note of each bar, as a MIDI note. */
  bars: number[];
  volume: number;
}

const SONGS: Record<Track, Song> = {
  menu: { bpm: 92, bars: [45, 45, 41, 43, 45, 48, 43, 40], volume: 0.75 },
  battle: { bpm: 140, bars: [33, 33, 29, 31, 33, 36, 31, 28], volume: 0.8 },
};

const KICK = 'x.....x.x.....x.';
const SNARE = '....x.......x...';
const CHUG = 'x.xx.xx.x.xx.x.x';
/** A riff in A minor pentatonic, over two bars. Dots are rests. */
const RIFF = [69, 0, 72, 0, 74, 72, 69, 0, 67, 0, 69, 0, 0, 0, 64, 0, 69, 0, 72, 0, 76, 74, 72, 0, 74, 0, 72, 69, 67, 0, 69, 0];
const ARPEGGIO = [0, 7, 12, 15, 19, 15, 12, 7];

function hz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Soft-clips whatever goes through it, which gives the battle bass its grit. */
function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

export class Music {
  private track: Track | null = null;
  private trackGain: GainNode | null = null;
  private drive: WaveShaperNode | null = null;
  private step = 0;
  private nextTime = 0;
  private readonly timer: number;

  constructor(
    private readonly ctx: AudioContext,
    private readonly output: AudioNode,
    private readonly noise: AudioBuffer,
  ) {
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  /** Fades out whatever is playing, and starts the new track from the top. Null means silence. */
  play(track: Track | null): void {
    if (track === this.track) return;
    this.track = track;
    const now = this.ctx.currentTime;
    if (this.trackGain) {
      const old = this.trackGain;
      old.gain.setTargetAtTime(0, now, FADE / 3);
      window.setTimeout(() => old.disconnect(), (FADE + LOOKAHEAD) * 2000);
    }
    this.trackGain = null;
    this.drive = null;
    if (!track) return;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(SONGS[track].volume, now + FADE);
    gain.connect(this.output);
    this.trackGain = gain;
    const drive = this.ctx.createWaveShaper();
    drive.curve = distortionCurve(5);
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1500;
    drive.connect(tone).connect(gain);
    this.drive = drive;
    this.step = 0;
    this.nextTime = now + 0.08;
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.play(null);
  }

  private schedule(): void {
    const { track, ctx } = this;
    if (!track || ctx.state !== 'running') return;
    const song = SONGS[track];
    const stepTime = 60 / song.bpm / 4;
    // Coming back from a long stall, carry on from now rather than playing everything missed.
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    const until = ctx.currentTime + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
    while (this.nextTime < until) {
      if (track === 'battle') this.battleStep(song, stepTime);
      else this.menuStep(song, stepTime);
      this.nextTime += stepTime;
      this.step++;
    }
  }

  private battleStep(song: Song, stepTime: number): void {
    const t = this.nextTime;
    const inBar = this.step % STEPS_PER_BAR;
    const bar = Math.floor(this.step / STEPS_PER_BAR);
    const root = song.bars[bar % song.bars.length];
    // Sections of eight bars: the first time through is just the band, then the riff joins.
    const section = Math.floor(bar / song.bars.length) % 4;

    if (KICK[inBar] === 'x') this.kick(t, 0.9);
    if (SNARE[inBar] === 'x') this.snare(t, 0.42);
    if (inBar % 2 === 0) this.hat(t, inBar % 4 === 2 ? 0.14 : 0.08);

    if (CHUG[inBar] === 'x' && this.drive) {
      this.voice('sawtooth', hz(root), t, stepTime * 0.85, 0.3, this.drive);
      this.voice('square', hz(root - 12), t, stepTime * 0.85, 0.16, this.drive);
    }
    // A power chord on the first beat of each bar.
    if (inBar === 0 && this.drive) {
      for (const interval of [12, 19, 24]) this.voice('sawtooth', hz(root + interval), t, stepTime * 5, 0.11, this.drive);
    }
    if (section !== 0) {
      const note = RIFF[(this.step % (STEPS_PER_BAR * 2)) % RIFF.length];
      if (note && this.trackGain) {
        this.voice('square', hz(note), t, stepTime * 1.5, 0.085, this.trackGain);
        this.voice('sawtooth', hz(note + 12) * 1.003, t, stepTime * 1.5, 0.03, this.trackGain);
      }
    }
  }

  private menuStep(song: Song, stepTime: number): void {
    const { trackGain } = this;
    if (!trackGain) return;
    const t = this.nextTime;
    const inBar = this.step % STEPS_PER_BAR;
    const bar = Math.floor(this.step / STEPS_PER_BAR);
    const root = song.bars[bar % song.bars.length];

    // A slow pad under everything, renewed each bar.
    if (inBar === 0) {
      const barTime = stepTime * STEPS_PER_BAR;
      for (const interval of [0, 7, 12, 15]) this.voice('triangle', hz(root + interval), t, barTime * 1.05, 0.2, trackGain, barTime * 0.2);
      this.voice('sawtooth', hz(root - 12), t, barTime, 0.24, trackGain, 0.05);
    }
    if (inBar % 2 === 0) {
      const note = root + 24 + ARPEGGIO[(inBar / 2) % ARPEGGIO.length];
      this.voice('square', hz(note), t, stepTime * 1.4, 0.1, trackGain);
    }
    if (inBar === 0 || inBar === 8) this.kick(t, 0.8);
    if (inBar === 12) this.snare(t, 0.26);
    if (inBar % 4 === 2) this.hat(t, 0.1);
  }

  private voice(type: OscillatorType, freq: number, t: number, duration: number, volume: number, destination: AudioNode, attack = 0.004): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + duration);
    osc.connect(gain).connect(destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private kick(t: number, volume: number): void {
    const { ctx, trackGain } = this;
    if (!trackGain) return;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(trackGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private noiseHit(t: number, duration: number, volume: number, filterType: BiquadFilterType, freq: number): void {
    const { ctx, trackGain, noise } = this;
    if (!trackGain) return;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(trackGain);
    source.start(t, Math.random() * 0.5, duration + 0.02);
  }

  private snare(t: number, volume: number): void {
    this.noiseHit(t, 0.16, volume, 'bandpass', 1900);
    if (this.trackGain) this.voice('triangle', 190, t, 0.1, volume * 0.5, this.trackGain);
  }

  private hat(t: number, volume: number): void {
    this.noiseHit(t, 0.035, volume, 'highpass', 7000);
  }
}
