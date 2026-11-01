// An original soundtrack, played live by synthesizers so the game ships with no audio files.

export type Track = 'menu' | 'battle';

const STEPS_PER_BAR = 16;
const LOOKAHEAD = 0.3;
/** Timers slow right down in a hidden tab, so it has to plan further ahead there. */
const HIDDEN_LOOKAHEAD = 1.6;
const FADE = 0.5;

export interface Song {
  name: string;
  bpm: number;
  /** The bass note of each bar, as a MIDI note. */
  bars: number[];
  volume: number;
  /** Bars it plays for before the next song takes over. */
  length: number;
  /** One bar of sixteen steps, where x is a hit. */
  kick: string;
  snare: string;
  /** The driving bass in a battle song. */
  chug: string;
  /** Two bars of melody, from the second section on. Zeros are rests. */
  riff: number[];
  /** Notes above the root: the power chord in battle, the pad on the menu. */
  chord: number[];
  /** A menu song's broken chord, above the root. */
  arpeggio: number[];
}

const BATTLE_KICK = 'x.....x.x.....x.';
const BATTLE_SNARE = '....x.......x...';
const NO_RIFF: number[] = [];

export const PLAYLISTS: Record<Track, Song[]> = {
  battle: [
    {
      name: 'Scrapyard', bpm: 140, bars: [33, 33, 29, 31, 33, 36, 31, 28], volume: 0.8, length: 40,
      kick: BATTLE_KICK, snare: BATTLE_SNARE, chug: 'x.xx.xx.x.xx.x.x',
      // A minor pentatonic.
      riff: [69, 0, 72, 0, 74, 72, 69, 0, 67, 0, 69, 0, 0, 0, 64, 0, 69, 0, 72, 0, 76, 74, 72, 0, 74, 0, 72, 69, 67, 0, 69, 0],
      chord: [12, 19, 24], arpeggio: [],
    },
    {
      // Fast and straight, with the kick on every beat.
      name: 'Overdrive', bpm: 158, bars: [28, 28, 31, 26, 28, 28, 24, 26], volume: 0.72, length: 48,
      kick: 'x...x...x...x...', snare: BATTLE_SNARE, chug: '..xx..xx..xx..xx',
      // E minor pentatonic.
      riff: [64, 0, 64, 67, 0, 64, 69, 0, 71, 0, 69, 67, 64, 0, 62, 0, 64, 0, 64, 67, 0, 69, 71, 0, 74, 0, 71, 0, 76, 74, 71, 69],
      chord: [12, 19, 24], arpeggio: [],
    },
    {
      // Slow and heavy, in half time, with the snare landing once a bar.
      name: 'Pistons', bpm: 112, bars: [26, 26, 29, 24, 26, 26, 22, 24], volume: 0.72, length: 32,
      kick: 'x..x....x..x..x.', snare: '........x.......', chug: 'x..x..x.x..x..x.',
      // D minor.
      riff: [62, 0, 0, 65, 0, 0, 62, 0, 67, 0, 0, 65, 0, 62, 0, 0, 62, 0, 0, 65, 0, 0, 67, 0, 69, 0, 72, 0, 69, 67, 65, 0],
      chord: [12, 15, 19], arpeggio: [],
    },
    {
      // A galloping rhythm under a busy lead.
      name: 'Short Fuse', bpm: 148, bars: [31, 31, 34, 29, 31, 27, 29, 26], volume: 0.76, length: 40,
      kick: 'x..x..x.x..x..x.', snare: '....x.......x..x', chug: 'x.xxx.xxx.xxx.xx',
      // G minor.
      riff: [67, 70, 72, 70, 67, 0, 74, 0, 72, 70, 67, 0, 65, 0, 67, 0, 67, 70, 72, 74, 77, 0, 74, 72, 74, 0, 72, 70, 72, 0, 67, 0],
      chord: [12, 19, 24], arpeggio: [],
    },
  ],
  menu: [
    {
      name: 'Workshop', bpm: 92, bars: [45, 45, 41, 43, 45, 48, 43, 40], volume: 0.75, length: 32,
      kick: 'x.......x.......', snare: '............x...', chug: '',
      riff: NO_RIFF, chord: [0, 7, 12, 15], arpeggio: [0, 7, 12, 15, 19, 15, 12, 7],
    },
    {
      // Slower and darker, with a broken chord that jumps around.
      name: 'Night Shift', bpm: 78, bars: [42, 42, 38, 45, 42, 40, 38, 37], volume: 0.8, length: 24,
      kick: 'x.........x.....', snare: '............x...', chug: '',
      riff: [66, 0, 0, 0, 69, 0, 0, 71, 0, 0, 69, 0, 66, 0, 0, 0, 64, 0, 0, 0, 66, 0, 0, 69, 0, 0, 0, 0, 61, 0, 0, 0],
      chord: [0, 7, 12, 15], arpeggio: [0, 12, 7, 15, 12, 19, 15, 7],
    },
    {
      // Brighter, in a major key, for when things are going well.
      name: 'Spare Parts', bpm: 106, bars: [36, 43, 45, 41, 36, 43, 41, 43], volume: 0.7, length: 32,
      kick: 'x.......x.x.....', snare: '....x.......x...', chug: '',
      riff: [72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 0, 0, 67, 0, 69, 0, 72, 0, 76, 0, 81, 0, 79, 76, 74, 0, 76, 0, 72, 0, 0, 0],
      chord: [0, 7, 12, 16], arpeggio: [0, 4, 7, 12, 16, 12, 7, 4],
    },
  ],
};

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
  /** Which song each track is on, so each match starts the next one. */
  private readonly playing: Record<Track, number> = { menu: -1, battle: -1 };
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
    this.playing[track] = (this.playing[track] + 1) % PLAYLISTS[track].length;
    gain.gain.linearRampToValueAtTime(PLAYLISTS[track][this.playing[track]].volume, now + FADE);
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
    let song = PLAYLISTS[track][this.playing[track]];
    let stepTime = 60 / song.bpm / 4;
    // Coming back from a long stall, carry on from now rather than playing everything missed.
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    const until = ctx.currentTime + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
    while (this.nextTime < until) {
      if (track === 'battle') this.battleStep(song, stepTime);
      else this.menuStep(song, stepTime);
      this.nextTime += stepTime;
      this.step++;
      if (this.step >= song.length * STEPS_PER_BAR) {
        // Straight into the next song on the beat. The fill at the end of each section leads into it.
        this.playing[track] = (this.playing[track] + 1) % PLAYLISTS[track].length;
        song = PLAYLISTS[track][this.playing[track]];
        stepTime = 60 / song.bpm / 4;
        this.step = 0;
        this.trackGain?.gain.setTargetAtTime(song.volume, this.nextTime, 0.05);
      }
    }
  }

  private battleStep(song: Song, stepTime: number): void {
    const t = this.nextTime;
    const inBar = this.step % STEPS_PER_BAR;
    const bar = Math.floor(this.step / STEPS_PER_BAR);
    const root = song.bars[bar % song.bars.length];
    // Sections of eight bars: the first time through is just the band, then the riff joins.
    const section = Math.floor(bar / song.bars.length) % 4;

    if (song.kick[inBar] === 'x') this.kick(t, 0.9);
    if (song.snare[inBar] === 'x') this.snare(t, 0.42);
    // A snare roll into the next section, or the next song.
    if (this.fillBar(song, bar) && inBar >= 12) this.snare(t, 0.22 + (inBar - 12) * 0.05);
    if (inBar % 2 === 0) this.hat(t, inBar % 4 === 2 ? 0.14 : 0.08);

    if (song.chug[inBar] === 'x' && this.drive) {
      this.voice('sawtooth', hz(root), t, stepTime * 0.85, 0.3, this.drive);
      this.voice('square', hz(root - 12), t, stepTime * 0.85, 0.16, this.drive);
    }
    // A power chord on the first beat of each bar.
    if (inBar === 0 && this.drive) {
      for (const interval of song.chord) this.voice('sawtooth', hz(root + interval), t, stepTime * 5, 0.11, this.drive);
    }
    if (section !== 0) {
      const note = song.riff[this.step % (STEPS_PER_BAR * 2)];
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
      for (const interval of song.chord) this.voice('triangle', hz(root + interval), t, barTime * 1.05, 0.2, trackGain, barTime * 0.2);
      this.voice('sawtooth', hz(root - 12), t, barTime, 0.24, trackGain, 0.05);
    }
    if (inBar % 2 === 0) {
      const note = root + 24 + song.arpeggio[(inBar / 2) % song.arpeggio.length];
      this.voice('square', hz(note), t, stepTime * 1.4, 0.1, trackGain);
    }
    // A quiet melody on top, once the song has got going.
    const melody = song.riff[this.step % (STEPS_PER_BAR * 2)];
    if (melody && bar >= song.bars.length) this.voice('triangle', hz(melody), t, stepTime * 3, 0.11, trackGain, 0.01);
    if (song.kick[inBar] === 'x') this.kick(t, 0.8);
    if (song.snare[inBar] === 'x') this.snare(t, 0.26);
    if (this.fillBar(song, bar) && inBar >= 14) this.snare(t, 0.16);
    if (inBar % 4 === 2) this.hat(t, 0.1);
  }

  /** The last bar of each section. */
  private fillBar(song: Song, bar: number): boolean {
    return (bar + 1) % song.bars.length === 0 || bar + 1 === song.length;
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
