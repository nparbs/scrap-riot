import type { TurretId } from './sim/data';

/** Everything is synthesized, so the game ships with no audio files. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private sawGain: GainNode | null = null;

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
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

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
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    const sawSource = ctx.createBufferSource();
    sawSource.buffer = buffer;
    sawSource.loop = true;
    const sawFilter = ctx.createBiquadFilter();
    sawFilter.type = 'bandpass';
    sawFilter.frequency.value = 2400;
    sawFilter.Q.value = 3;
    this.sawGain = ctx.createGain();
    this.sawGain.gain.value = 0;
    sawSource.connect(sawFilter).connect(this.sawGain).connect(this.master);
    sawSource.start();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  private burst(volume: number, duration: number, freq: number, type: BiquadFilterType): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise || this.muted) return;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(0, Math.random() * 0.5, duration);
  }

  private tone(volume: number, duration: number, from: number, to: number, type: OscillatorType = 'square'): void {
    const { ctx, master } = this;
    if (!ctx || !master || this.muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  shot(kind: TurretId, volume: number): void {
    switch (kind) {
      case 'rockets':
      case 'guided':
      case 'seeker':
        this.burst(0.5 * volume, 0.35, 900, 'lowpass');
        break;
      case 'mortar':
      case 'grenade':
        this.burst(0.4 * volume, 0.14, 420, 'lowpass');
        this.tone(0.2 * volume, 0.12, 220, 90, 'triangle');
        break;
      case 'spear':
        this.tone(0.18 * volume, 0.1, 900, 220, 'sawtooth');
        break;
      case 'discs':
        this.tone(0.12 * volume, 0.12, 1400, 2200, 'triangle');
        break;
      default:
        this.burst(0.28 * volume, 0.06, 2600, 'highpass');
    }
  }

  arc(volume: number): void {
    this.tone(0.14 * volume, 0.14, 1800, 300, 'sawtooth');
    this.burst(0.2 * volume, 0.12, 4000, 'highpass');
  }

  hit(volume: number): void {
    this.tone(0.1 * volume, 0.05, 700, 300);
  }

  strike(volume: number): void {
    this.burst(0.6 * volume, 0.18, 500, 'lowpass');
    this.tone(0.3 * volume, 0.15, 180, 60, 'triangle');
  }

  explosion(volume: number): void {
    this.burst(1 * volume, 0.8, 500, 'lowpass');
    this.tone(0.5 * volume, 0.5, 110, 30, 'triangle');
  }

  pickup(): void {
    this.tone(0.14, 0.09, 660, 990, 'triangle');
    window.setTimeout(() => this.tone(0.14, 0.12, 990, 1480, 'triangle'), 70);
  }

  powerup(): void {
    this.tone(0.16, 0.25, 300, 1200, 'sawtooth');
  }

  click(): void {
    this.tone(0.08, 0.04, 800, 500, 'triangle');
  }

  deny(): void {
    this.tone(0.12, 0.12, 180, 120);
  }

  setLoops(engineLevel: number, sawing: boolean): void {
    const { ctx, engineGain, engineOsc, sawGain } = this;
    if (!ctx || !engineGain || !engineOsc || !sawGain) return;
    engineOsc.frequency.setTargetAtTime(44 + engineLevel * 70, ctx.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(engineLevel < 0 ? 0 : 0.07 + engineLevel * 0.1, ctx.currentTime, 0.08);
    sawGain.gain.setTargetAtTime(sawing ? 0.28 : 0, ctx.currentTime, 0.03);
  }
}
