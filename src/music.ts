// An original soundtrack, played live by synthesizers so the game ships with no audio files.

export type Track = 'menu' | 'battle';

/**
 * How a song is arranged, which changes the drums, the bass, the chords and the sounds, not just the
 * notes. Battle songs are rock (the default), synthwave, breakbeat, industrial or chiptune. Menu songs
 * are pads (the default), lofi or chiptune.
 */
export type SongStyle = 'rock' | 'synthwave' | 'breakbeat' | 'industrial' | 'chiptune' | 'pads' | 'lofi';

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
  /** A menu song's broken chord, above the root. Chiptune songs run through it every step. */
  arpeggio: number[];
  style?: SongStyle;
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
      // Synthwave: four on the floor, an octave-bouncing bass, wide pads and an echoing lead.
      name: 'Neon Grinder', bpm: 116, bars: [37, 37, 33, 33, 40, 40, 35, 35], volume: 1.2, length: 32, style: 'synthwave',
      kick: 'x...x...x...x...', snare: '....x.......x...', chug: 'x.x.x.x.x.x.x.x.',
      // C# minor pentatonic.
      riff: [73, 0, 0, 76, 0, 0, 80, 0, 78, 0, 76, 0, 73, 0, 0, 0, 71, 0, 0, 73, 0, 0, 76, 0, 80, 0, 83, 0, 80, 78, 76, 0],
      chord: [7, 12, 19, 24], arpeggio: [],
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
      // Breakbeat: broken drums at full tilt, a sub bass you feel, and chord stabs.
      name: 'Breakneck', bpm: 172, bars: [29, 29, 25, 25, 32, 32, 27, 27], volume: 1.1, length: 48, style: 'breakbeat',
      kick: 'x.........x.....', snare: '....x.......x...', chug: 'x.........x.....',
      // F minor pentatonic.
      riff: [77, 0, 0, 0, 0, 0, 80, 0, 0, 0, 77, 0, 75, 0, 72, 0, 77, 0, 0, 0, 0, 0, 82, 0, 84, 0, 0, 82, 80, 0, 77, 0],
      chord: [7, 12, 19], arpeggio: [],
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
      // Industrial: a stomping kick, clanking metal for percussion, and a grinding bass.
      name: 'Foundry Floor', bpm: 126, bars: [35, 35, 35, 38, 35, 35, 31, 33], volume: 0.74, length: 32, style: 'industrial',
      kick: 'x...x...x...x.x.', snare: '....x.......x...', chug: 'x.x.xx.xx.x.xx.x',
      // B minor.
      riff: [71, 0, 71, 0, 74, 0, 71, 0, 76, 0, 74, 0, 71, 0, 69, 0, 71, 0, 71, 0, 74, 0, 78, 0, 76, 0, 74, 0, 71, 0, 0, 0],
      chord: [12, 19, 24], arpeggio: [],
    },
    {
      // A galloping rhythm under a busy lead.
      name: 'Short Fuse', bpm: 148, bars: [31, 31, 34, 29, 31, 27, 29, 26], volume: 0.76, length: 40,
      kick: 'x..x..x.x..x..x.', snare: '....x.......x..x', chug: 'x.xxx.xxx.xxx.xx',
      // G minor.
      riff: [67, 70, 72, 70, 67, 0, 74, 0, 72, 70, 67, 0, 65, 0, 67, 0, 67, 70, 72, 74, 77, 0, 74, 72, 74, 0, 72, 70, 72, 0, 67, 0],
      chord: [12, 19, 24], arpeggio: [],
    },
    {
      // Chiptune: an arcade cabinet having the time of its life.
      name: 'Coin-Op Carnage', bpm: 150, bars: [39, 39, 35, 35, 42, 42, 37, 37], volume: 1.2, length: 40, style: 'chiptune',
      kick: 'x.......x.x.....', snare: '....x.......x...', chug: 'x.x.x.x.x.x.x.x.',
      // E-flat minor pentatonic.
      riff: [75, 0, 78, 0, 80, 0, 82, 80, 78, 0, 75, 0, 70, 0, 75, 0, 75, 0, 78, 0, 82, 0, 85, 0, 82, 80, 78, 0, 80, 0, 75, 0],
      chord: [12, 19], arpeggio: [0, 7, 12, 19, 24, 19, 12, 7],
    },
  ],
  menu: [
    {
      name: 'Workshop', bpm: 92, bars: [45, 45, 41, 43, 45, 48, 43, 40], volume: 0.75, length: 32,
      kick: 'x.......x.......', snare: '............x...', chug: '',
      riff: NO_RIFF, chord: [0, 7, 12, 15], arpeggio: [0, 7, 12, 15, 19, 15, 12, 7],
    },
    {
      // Lofi: a lazy swung beat, soft keys and a little vinyl crackle, in F major.
      name: 'Oil Change', bpm: 82, bars: [41, 41, 38, 38, 46, 46, 36, 36], volume: 1.1, length: 24, style: 'lofi',
      kick: 'x......x..x.....', snare: '....x.......x...', chug: '',
      riff: [81, 0, 0, 79, 0, 0, 77, 0, 0, 0, 74, 0, 72, 0, 0, 0, 77, 0, 0, 79, 0, 0, 81, 0, 84, 0, 81, 0, 79, 0, 0, 0],
      chord: [7, 12, 14, 19], arpeggio: [0, 7, 12, 14, 19, 14, 12, 7],
    },
    {
      // Slower and darker, with a broken chord that jumps around.
      name: 'Night Shift', bpm: 78, bars: [42, 42, 38, 45, 42, 40, 38, 37], volume: 0.8, length: 24,
      kick: 'x.........x.....', snare: '............x...', chug: '',
      riff: [66, 0, 0, 0, 69, 0, 0, 71, 0, 0, 69, 0, 66, 0, 0, 0, 64, 0, 0, 0, 66, 0, 0, 69, 0, 0, 0, 0, 61, 0, 0, 0],
      chord: [0, 7, 12, 15], arpeggio: [0, 12, 7, 15, 12, 19, 15, 7],
    },
    {
      // A cheerful little chiptune in B-flat major, for browsing the shop.
      name: 'Pit Stop', bpm: 114, bars: [34, 34, 39, 41, 34, 34, 41, 39], volume: 1.2, length: 32, style: 'chiptune',
      kick: 'x.......x.......', snare: '....x.......x...', chug: '',
      riff: [82, 0, 84, 0, 86, 0, 84, 82, 79, 0, 77, 0, 0, 0, 79, 0, 82, 0, 84, 0, 86, 0, 89, 0, 86, 84, 82, 0, 84, 0, 0, 0],
      chord: [0, 4, 7, 12], arpeggio: [0, 4, 7, 12, 16, 12, 7, 4],
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
  /** A gentle low-pass for clean synths that would be harsh straight. */
  private soft: BiquadFilterNode | null = null;
  /** An echo on the beat, for leads that want space around them. */
  private echo: DelayNode | null = null;
  private step = 0;
  private nextTime = 0;
  /** Which song each track is on, so each match starts the next one. */
  private readonly playing: Record<Track, number> = {
    menu: Math.floor(Math.random() * PLAYLISTS.menu.length) - 1,
    battle: Math.floor(Math.random() * PLAYLISTS.battle.length) - 1,
  };
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
    this.soft = null;
    this.echo = null;
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
    const soft = this.ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 2400;
    soft.Q.value = 0.8;
    soft.connect(gain);
    this.soft = soft;
    // A dotted-eighth echo that feeds back on itself, quieter each time.
    const echo = this.ctx.createDelay(2);
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.32;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.4;
    echo.connect(feedback).connect(echo);
    echo.connect(wet).connect(gain);
    this.echo = echo;
    this.setEcho(PLAYLISTS[track][this.playing[track]]);
    this.step = 0;
    this.nextTime = now + 0.08;
  }

  private setEcho(song: Song): void {
    this.echo?.delayTime.setValueAtTime((60 / song.bpm / 4) * 3, this.ctx.currentTime);
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
        this.setEcho(song);
      }
    }
  }

  private battleStep(song: Song, stepTime: number): void {
    switch (song.style ?? 'rock') {
      case 'synthwave':
        return this.synthwaveStep(song, stepTime);
      case 'breakbeat':
        return this.breakbeatStep(song, stepTime);
      case 'industrial':
        return this.industrialStep(song, stepTime);
      case 'chiptune':
        return this.chipStep(song, stepTime, false);
      default:
        return this.rockStep(song, stepTime);
    }
  }

  /** Where the song is: the time, the step in the bar, the bar, its bass note, and which section. */
  private where(song: Song): { t: number; inBar: number; bar: number; root: number; section: number } {
    const inBar = this.step % STEPS_PER_BAR;
    const bar = Math.floor(this.step / STEPS_PER_BAR);
    return { t: this.nextTime, inBar, bar, root: song.bars[bar % song.bars.length], section: Math.floor(bar / song.bars.length) % 4 };
  }

  private synthwaveStep(song: Song, stepTime: number): void {
    const { trackGain, soft, echo } = this;
    if (!trackGain || !soft || !echo) return;
    const { t, inBar, bar, root, section } = this.where(song);
    if (song.kick[inBar] === 'x') this.kick(t, 0.85);
    if (song.snare[inBar] === 'x') {
      this.snare(t, 0.26);
      this.clap(t, 0.2);
    }
    if (this.fillBar(song, bar) && inBar >= 12) this.clap(t, 0.12 + (inBar - 12) * 0.04);
    if (inBar % 4 === 2) this.openHat(t, 0.09);
    else if (inBar % 2 === 1) this.hat(t, 0.035);
    // An eighth-note bass that bounces between the root and the octave.
    if (song.chug[inBar] === 'x') this.voice('sawtooth', hz(root + ((inBar / 2) % 2 ? 12 : 0)), t, stepTime * 1.7, 0.17, soft);
    // A wide pad: each note twice, pulled slightly apart.
    if (inBar === 0) {
      const barTime = stepTime * STEPS_PER_BAR;
      for (const interval of song.chord) {
        for (const spread of [0.996, 1.004]) this.voice('sawtooth', hz(root + 12 + interval) * spread, t, barTime * 1.02, 0.03, soft, barTime * 0.3);
      }
    }
    if (section !== 0) {
      const note = song.riff[this.step % (STEPS_PER_BAR * 2)];
      if (note) {
        this.voice('square', hz(note), t, stepTime * 2, 0.055, soft);
        this.voice('square', hz(note), t, stepTime * 2, 0.05, echo);
      }
    }
  }

  private breakbeatStep(song: Song, stepTime: number): void {
    const { trackGain, drive, echo } = this;
    if (!trackGain || !drive || !echo) return;
    const { t, inBar, bar, root, section } = this.where(song);
    if (song.kick[inBar] === 'x') this.kick(t, 0.95);
    if (song.snare[inBar] === 'x') this.snare(t, 0.5);
    // Ghost notes on the snare give the break its shuffle.
    if (inBar === 7 || inBar === 9 || (inBar === 15 && bar % 2 === 1)) this.snare(t, 0.1);
    if (this.fillBar(song, bar) && inBar >= 8 && inBar % 2 === 0) this.snare(t, 0.18 + (inBar - 8) * 0.04);
    this.hat(t, inBar % 4 === 2 ? 0.09 : 0.04);
    if (inBar === 14) this.openHat(t, 0.07);
    // A sub bass under each kick, held until the next.
    if (song.chug[inBar] === 'x') {
      const until = song.chug.indexOf('x', inBar + 1);
      const steps = (until < 0 ? STEPS_PER_BAR : until) - inBar;
      this.voice('sine', hz(root), t, stepTime * steps * 0.95, 0.42, trackGain, 0.01);
    }
    // A growling detuned bass over the top, once the band is in.
    if (inBar === 0 && section !== 0) {
      for (const spread of [0.994, 1.006]) this.voice('sawtooth', hz(root + 12) * spread, t, stepTime * 7, 0.05, drive, 0.02);
    }
    if ((inBar === 6 || inBar === 14) && section % 2 === 1) {
      for (const interval of song.chord) this.voice('square', hz(root + 24 + interval), t, stepTime * 0.8, 0.04, echo);
    }
    if (section >= 2) {
      const note = song.riff[this.step % (STEPS_PER_BAR * 2)];
      if (note) {
        this.voice('triangle', hz(note), t, stepTime * 2.5, 0.09, trackGain);
        this.voice('square', hz(note), t, stepTime * 1.5, 0.035, echo);
      }
    }
  }

  private industrialStep(song: Song, stepTime: number): void {
    const { trackGain, drive } = this;
    if (!trackGain || !drive) return;
    const { t, inBar, bar, root, section } = this.where(song);
    if (song.kick[inBar] === 'x') this.kick(t, inBar % 4 === 0 ? 1 : 0.55);
    if (song.snare[inBar] === 'x') {
      this.snare(t, 0.45);
      this.clank(t, 0.3, 880);
    }
    if (this.fillBar(song, bar) && inBar >= 12) this.clank(t, 0.12 + (inBar - 12) * 0.05, 620 + (inBar - 12) * 90);
    if (inBar % 2 === 0) this.hat(t, 0.05);
    // Metal struck in the gaps, on the bass's offbeats.
    if (song.chug[inBar] !== 'x' && inBar % 2 === 1 && (inBar * 7 + bar) % 3 === 0) this.clank(t, 0.12, inBar % 4 === 1 ? 523 : 698);
    if (song.chug[inBar] === 'x') {
      this.voice('sawtooth', hz(root), t, stepTime * 0.9, 0.28, drive);
      this.voice('square', hz(root - 12), t, stepTime * 0.9, 0.16, drive);
    }
    if (inBar === 0) for (const interval of song.chord) this.voice('sawtooth', hz(root + interval), t, stepTime * 6, 0.1, drive);
    if (section !== 0) {
      // The lead an octave down, for menace.
      const note = song.riff[this.step % (STEPS_PER_BAR * 2)];
      if (note) this.voice('square', hz(note - 12), t, stepTime * 1.2, 0.08, trackGain);
    }
  }

  /** All square waves and noise, like an old games console. The menu version keeps the drums down. */
  private chipStep(song: Song, stepTime: number, menu: boolean): void {
    const { trackGain } = this;
    if (!trackGain) return;
    const { t, inBar, bar, root, section } = this.where(song);
    const drums = menu ? 0.55 : 1;
    if (song.kick[inBar] === 'x') this.blip('square', 170, 48, t, 0.09, 0.5 * drums);
    if (song.snare[inBar] === 'x') this.noiseHit(t, 0.09, 0.55 * drums, 'highpass', 2200);
    if (this.fillBar(song, bar) && inBar >= 12) this.noiseHit(t, 0.05, (0.25 + (inBar - 12) * 0.08) * drums, 'highpass', 2600);
    if (inBar % 2 === 0) this.noiseHit(t, 0.02, 0.11 * drums, 'highpass', 9000);
    // A pulse bass hopping between the root and the fifth.
    if (inBar % 2 === 0) this.voice('square', hz(root + 12 + ((inBar / 2) % 2 ? 7 : 0)), t, stepTime * 1.6, menu ? 0.15 : 0.2, trackGain);
    // The arpeggio that makes it chiptune, a note every step.
    if (song.arpeggio.length) this.voice('square', hz(root + 24 + song.arpeggio[inBar % song.arpeggio.length]), t, stepTime * 0.9, menu ? 0.06 : 0.08, trackGain);
    if (menu ? bar >= song.bars.length : section !== 0) {
      const note = song.riff[this.step % (STEPS_PER_BAR * 2)];
      if (note) {
        this.voice('square', hz(note), t, stepTime * 1.4, menu ? 0.12 : 0.16, trackGain);
        this.voice('triangle', hz(note + 12), t, stepTime * 1.4, 0.05, trackGain);
      }
    }
  }

  private rockStep(song: Song, stepTime: number): void {
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
    if (song.style === 'lofi') return this.lofiStep(song, stepTime);
    if (song.style === 'chiptune') return this.chipStep(song, stepTime, true);
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

  /** A lazy, swung beat with soft keys over it, and the crackle of an old record. */
  private lofiStep(song: Song, stepTime: number): void {
    const { trackGain, soft, echo } = this;
    if (!trackGain || !soft || !echo) return;
    const { t: onBeat, inBar, bar, root } = this.where(song);
    // Every other sixteenth comes in late, which is what swing is.
    const t = onBeat + (inBar % 2 ? stepTime * 0.32 : 0);
    if (song.kick[inBar] === 'x') this.kick(t, 0.5);
    if (song.snare[inBar] === 'x') {
      this.snare(t, 0.14);
      this.noiseHit(t, 0.05, 0.08, 'bandpass', 3400);
    }
    if (inBar % 2 === 0) this.hat(t, inBar % 4 === 2 ? 0.06 : 0.035);
    // Keys: a full chord on the bar, and another pushed ahead of beat three.
    if (inBar === 0 || inBar === 7) {
      const length = stepTime * (inBar === 0 ? 7 : 9);
      for (const interval of song.chord) {
        this.voice('triangle', hz(root + 12 + interval), t, length, 0.055, soft, 0.015);
        this.voice('sine', hz(root + 24 + interval), t, length * 0.6, 0.015, soft, 0.01);
      }
    }
    if (inBar === 0) this.voice('triangle', hz(root), t, stepTime * 6, 0.24, trackGain, 0.01);
    if (inBar === 6) this.voice('triangle', hz(root + 7), t, stepTime * 3, 0.15, trackGain, 0.01);
    if (inBar === 10) this.voice('triangle', hz(root + 12), t, stepTime * 4, 0.14, trackGain, 0.01);
    const melody = song.riff[this.step % (STEPS_PER_BAR * 2)];
    if (melody && bar >= song.bars.length) {
      this.voice('triangle', hz(melody), t, stepTime * 3, 0.09, soft, 0.02);
      this.voice('triangle', hz(melody), t, stepTime * 2, 0.04, echo, 0.02);
    }
    // Dust on the record.
    if (Math.random() < 0.3) this.noiseHit(onBeat + Math.random() * stepTime, 0.005, 0.03, 'highpass', 2500);
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

  private openHat(t: number, volume: number): void {
    this.noiseHit(t, 0.16, volume, 'highpass', 6200);
  }

  /** Three quick slaps close together, as a room full of hands sounds. */
  private clap(t: number, volume: number): void {
    for (const delay of [0, 0.011, 0.023]) this.noiseHit(t + delay, 0.08, volume, 'bandpass', 1250);
  }

  /** A length of steel struck with a hammer: inharmonic, short and bright. */
  private clank(t: number, volume: number, pitch: number): void {
    const { trackGain } = this;
    if (!trackGain) return;
    this.voice('square', pitch, t, 0.06, volume * 0.35, trackGain);
    this.voice('triangle', pitch * 2.76, t, 0.1, volume * 0.3, trackGain);
    this.noiseHit(t, 0.04, volume * 0.6, 'bandpass', 3600);
  }

  /** A tone that falls in pitch, for a chiptune drum. */
  private blip(type: OscillatorType, from: number, to: number, t: number, duration: number, volume: number): void {
    const { ctx, trackGain } = this;
    if (!trackGain) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(trackGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }
}
