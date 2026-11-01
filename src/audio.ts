import { Music, type Track } from './music';
import type { MeleeId, TurretId } from './sim/data';

const MASTER_VOLUME = 0.6;
const MUSIC_VOLUME = 0.6;
/** Fast weapons can land hits every frame, and a sound for each would be a buzz. */
const HIT_GAP = 0.05;

/** What the continuous sounds should be doing right now. */
// Each sound is built differently, so the same volume number comes out at very different loudness.
// These levels were set by rendering every sound and measuring it with A-weighting, which follows
// how sensitive hearing is at each pitch. Peak level alone misses that a whine at 1 kHz sounds far
// louder than a thud with the same peak. Re-measure after changing how a sound is made.
const MELEE_LEVEL: Record<MeleeId, number> = {
  vertbar: 1.23, vertdisc: 1.26, shell: 1.26, horizbar: 1.29, flipper: 1.07, axe: 1.66, hammer: 1.7, undercutter: 1.7, crusher: 1.7,
  hammersaw: 1.74, drum: 1.78, eggbeater: 1.78, ram: 2.16, chainsaw: 2.66, drill: 2.66, rollingpin: 2.66, dagger: 2.69, magnet: 2.72, claw: 3, forks: 3,
};
const GUN_LEVEL: Record<TurretId, number> = {
  bunkerbuster: 0.65, heavyrocket: 0.91, rockets: 1.05, minigun: 0.72, laser: 1, discs: 1.86, spear: 2.54, mortar: 2.57, grenade: 3.1, arc: 2, flamethrower: 1,
};

/** Each from 0 to 100, as set in Settings. */
export interface Volumes {
  master: number;
  music: number;
  effects: number;
}

/** Hearing is roughly logarithmic, so a squared slider feels even all the way along. */
const sliderGain = (value: number) => (value / 100) ** 2;

export interface LoopState {
  /** How hard the engine is working, from 0 to 1. Below zero is off. */
  engine: number;
  boosting: boolean;
  /** A saw or drill running, from 0 for silent to 1 for right here. */
  saw: number;
  /** A spinner's whine: how fast it's turning, and how close it is. */
  spinSpeed: number;
  spinLevel: number;
  flame: boolean;
}

const SILENT: LoopState = { engine: -1, boosting: false, saw: 0, spinSpeed: 0, spinLevel: 0, flame: false };

/** Everything is synthesized, so the game ships with no audio files. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private music: Music | null = null;
  private wantedTrack: Track | null = null;
  private volumes: Volumes = { master: 100, music: 70, effects: 100 };
  private noise: AudioBuffer | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private sawGain: GainNode | null = null;
  private boostGain: GainNode | null = null;
  private boostFilter: BiquadFilterNode | null = null;
  private flameGain: GainNode | null = null;
  private spinGain: GainNode | null = null;
  private spinOsc: OscillatorNode | null = null;
  private lastHit = -1;

  /** Browsers only allow audio after a user gesture, so call this from input handlers. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AudioCtor = window.AudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    // Keeps a big pile-up of explosions and music from clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 12;
    this.master.connect(limiter).connect(ctx.destination);
    this.effects = ctx.createGain();
    this.effects.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.applyVolumes();

    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.effects);
    this.engineOsc.start();

    this.sawGain = this.noiseLoop(buffer, 'bandpass', 1700, 2);
    this.flameGain = this.noiseLoop(buffer, 'lowpass', 900, 1);
    const boost = this.noiseLoop(buffer, 'bandpass', 700, 1.5);
    this.boostGain = boost;
    this.boostFilter = this.loopFilter;

    // A spinner is a whine that climbs as it winds up, with a rough edge to it.
    this.spinOsc = ctx.createOscillator();
    this.spinOsc.type = 'sawtooth';
    this.spinOsc.frequency.value = 80;
    const spinFilter = ctx.createBiquadFilter();
    spinFilter.type = 'bandpass';
    spinFilter.frequency.value = 850;
    spinFilter.Q.value = 0.8;
    this.spinGain = ctx.createGain();
    this.spinGain.gain.value = 0;
    this.spinOsc.connect(spinFilter).connect(this.spinGain).connect(this.effects);
    this.spinOsc.start();

    this.music = new Music(ctx, this.musicBus, buffer);
    this.music.play(this.volumes.music > 0 ? this.wantedTrack : null);
  }

  /** The filter of the loop made most recently, for the one loop that sweeps. */
  private loopFilter: BiquadFilterNode | null = null;

  private noiseLoop(buffer: AudioBuffer, type: BiquadFilterType, frequency: number, q: number): GainNode {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    this.loopFilter = filter;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.effects!);
    source.start();
    return gain;
  }

  private applyVolumes(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER_VOLUME * sliderGain(this.volumes.master);
    if (this.effects) this.effects.gain.value = sliderGain(this.volumes.effects);
    if (this.musicBus) this.musicBus.gain.value = MUSIC_VOLUME * sliderGain(this.volumes.music);
  }

  setVolumes(volumes: Volumes): void {
    this.volumes = { ...volumes };
    this.applyVolumes();
    // With the music all the way down, there's no point playing it at all.
    this.music?.play(volumes.music > 0 ? this.wantedTrack : null);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  /** Chooses what plays. It waits for the first click or key press if the browser requires one. */
  setTrack(track: Track | null): void {
    this.wantedTrack = track;
    if (this.volumes.music > 0) this.music?.play(track);
  }

  private burst(volume: number, duration: number, freq: number, type: BiquadFilterType, sweepTo?: number): void {
    const { ctx, effects, noise } = this;
    if (!ctx || !effects || !noise || this.muted) return;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(effects);
    source.start(0, Math.random() * 0.5, duration);
  }

  private tone(volume: number, duration: number, from: number, to: number, type: OscillatorType = 'square', delay = 0): void {
    const { ctx, effects } = this;
    if (!ctx || !effects || this.muted) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain).connect(effects);
    osc.start(start);
    osc.stop(start + duration);
  }

  /** Struck metal: a sharp click, then a few out-of-tune ringing partials that die away. */
  private clang(volume: number, pitch: number, ring: number): void {
    this.burst(volume * 0.7, 0.05, 2400, 'bandpass');
    for (const [ratio, level] of [[1, 1], [2.76, 0.6], [5.4, 0.35]] as const) {
      this.tone(volume * 0.22 * level, ring / ratio ** 0.5, pitch * ratio, pitch * ratio * 0.985, 'triangle');
    }
  }

  private thud(volume: number, duration = 0.2, from = 150): void {
    this.tone(volume, duration, from, 42, 'sine');
    this.burst(volume * 0.6, duration * 0.7, 420, 'lowpass');
  }

  shot(kind: TurretId, distanceVolume: number): void {
    const volume = distanceVolume * GUN_LEVEL[kind];
    switch (kind) {
      case 'rockets':
      case 'heavyrocket':
      case 'bunkerbuster': {
        const size = kind === 'rockets' ? 1 : kind === 'heavyrocket' ? 1.25 : 1.6;
        this.burst(0.5 * volume * size, 0.45 * size, 2200, 'bandpass', 300);
        this.thud(0.3 * volume * size, 0.14);
        break;
      }
      case 'mortar':
        this.thud(0.55 * volume, 0.22, 110);
        this.burst(0.25 * volume, 0.3, 700, 'lowpass');
        break;
      case 'grenade':
        this.thud(0.3 * volume, 0.1, 220);
        this.tone(0.08 * volume, 0.14, 500, 900, 'triangle');
        break;
      case 'spear':
        this.tone(0.18 * volume, 0.1, 900, 220, 'sawtooth');
        this.clang(0.2 * volume, 520, 0.12);
        break;
      case 'discs':
        this.tone(0.14 * volume, 0.16, 1400, 2600, 'triangle');
        this.burst(0.1 * volume, 0.08, 3000, 'bandpass');
        break;
      case 'laser':
        this.tone(0.2 * volume, 0.22, 2400, 180, 'sawtooth');
        this.tone(0.12 * volume, 0.22, 3200, 240, 'square');
        break;
      default:
        // A crack with a little body, short enough to stay clean through a fast burst.
        this.burst(0.3 * volume, 0.045, 1900, 'bandpass');
        this.tone(0.14 * volume, 0.04, 320, 110, 'square');
    }
  }

  arc(distanceVolume: number): void {
    const volume = distanceVolume * GUN_LEVEL.arc;
    this.tone(0.14 * volume, 0.14, 1800, 300, 'sawtooth');
    this.burst(0.22 * volume, 0.16, 2600, 'bandpass');
  }

  /** Damage landing. Small hits are pings, and big ones ring out. */
  hit(volume: number, amount: number): void {
    const now = this.ctx?.currentTime ?? 0;
    if (now - this.lastHit < HIT_GAP) return;
    this.lastHit = now;
    if (amount >= 15) this.clang(0.7 * volume, 300 + Math.random() * 80, 0.4);
    else this.tone(0.16 * volume, 0.05, 700 + Math.random() * 300, 300);
  }

  /** The sound of a main weapon connecting. Each family hits differently. */
  meleeHit(id: MeleeId, distanceVolume: number): void {
    const volume = distanceVolume * MELEE_LEVEL[id];
    switch (id) {
      case 'vertdisc':
      case 'vertbar':
      case 'horizbar':
      case 'shell':
        this.clang(0.9 * volume, 180, 0.7);
        this.thud(0.5 * volume, 0.28);
        this.burst(0.35 * volume, 0.35, 4200, 'bandpass', 1200);
        break;
      case 'drum':
      case 'eggbeater':
      case 'undercutter':
        this.clang(0.6 * volume, 340, 0.3);
        this.burst(0.3 * volume, 0.14, 3600, 'bandpass');
        break;
      case 'hammer':
      case 'axe':
      case 'hammersaw':
        this.thud(0.7 * volume, 0.24);
        this.clang(0.45 * volume, 240, 0.35);
        break;
      case 'flipper':
        // A blast of air, then a clang as the plate slams up.
        this.burst(0.55 * volume, 0.35, 2600, 'bandpass', 700);
        this.clang(0.45 * volume, 200, 0.3);
        break;
      case 'crusher':
        this.tone(0.3 * volume, 0.45, 90, 240, 'sawtooth');
        this.clang(0.4 * volume, 260, 0.3);
        break;
      case 'claw':
      case 'forks':
        this.clang(0.35 * volume, 420, 0.22);
        this.tone(0.14 * volume, 0.2, 140, 260, 'sawtooth');
        break;
      case 'ram':
        this.thud(0.6 * volume, 0.2);
        this.burst(0.3 * volume, 0.25, 900, 'lowpass');
        break;
      default:
        this.thud(0.5 * volume, 0.16, 180);
        this.burst(0.4 * volume, 0.14, 500, 'lowpass');
    }
  }

  explosion(volume: number): void {
    this.burst(0.8 * volume, 0.9, 1800, 'lowpass', 120);
    this.tone(0.5 * volume, 0.6, 120, 28, 'sine');
    this.clang(0.2 * volume, 150, 0.8);
  }

  /** A falling whistle, for a robot going over the edge. */
  fall(volume: number): void {
    this.tone(0.2 * volume, 1.1, 1100, 110, 'sine');
  }

  /** The gun clicking on an empty magazine or a cooldown. */
  dryFire(): void {
    this.tone(0.1, 0.03, 1200, 700, 'square');
  }

  pickup(): void {
    this.tone(0.14, 0.09, 660, 990, 'triangle');
    this.tone(0.14, 0.12, 990, 1480, 'triangle', 0.07);
  }

  powerup(): void {
    this.tone(0.16, 0.25, 300, 1200, 'sawtooth');
    this.tone(0.1, 0.25, 600, 2400, 'triangle', 0.04);
  }

  win(): void {
    [440, 554, 659, 880].forEach((freq, i) => this.tone(0.075, 0.32, freq, freq, 'square', i * 0.13));
  }

  lose(): void {
    [392, 349, 311, 220].forEach((freq, i) => this.tone(0.07, 0.4, freq, freq * 0.98, 'sawtooth', i * 0.18));
  }

  click(): void {
    this.tone(0.08, 0.04, 800, 500, 'triangle');
    this.burst(0.05, 0.02, 4000, 'highpass');
  }

  deny(): void {
    this.tone(0.12, 0.12, 180, 120);
  }

  setLoops(state: LoopState): void {
    const { ctx, engineGain, engineOsc, sawGain, boostGain, boostFilter, flameGain, spinGain, spinOsc } = this;
    if (!ctx || !engineGain || !engineOsc || !sawGain || !boostGain || !flameGain || !spinGain || !spinOsc) return;
    const now = ctx.currentTime;
    const revs = state.engine + (state.boosting ? 0.5 : 0);
    engineOsc.frequency.setTargetAtTime(44 + revs * 70, now, 0.08);
    engineGain.gain.setTargetAtTime(state.engine < 0 ? 0 : 0.07 + state.engine * 0.1, now, 0.08);
    sawGain.gain.setTargetAtTime(0.15 * state.saw, now, 0.03);
    boostGain.gain.setTargetAtTime(state.boosting ? 0.11 : 0, now, 0.06);
    boostFilter?.frequency.setTargetAtTime(state.boosting ? 1500 : 600, now, 0.2);
    flameGain.gain.setTargetAtTime(state.flame ? 0.17 : 0, now, 0.05);
    spinOsc.frequency.setTargetAtTime(70 + state.spinSpeed * 520, now, 0.1);
    spinGain.gain.setTargetAtTime(0.09 * state.spinLevel * Math.min(1, state.spinSpeed * 2.5), now, 0.08);
  }

  /** Stops every continuous sound, for leaving a match. */
  silence(): void {
    this.setLoops(SILENT);
  }
}
