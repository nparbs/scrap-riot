import type { Bindings } from './game/settings';
import { PadReader, type PadLike, type PadState } from './gamepad';
import { POWERUP_ORDER, type PowerupId } from './sim/data';
import type { BotInput } from './sim/match';

const POWER_ACTIONS = ['power1', 'power2', 'power3', 'power4', 'power5', 'power6'] as const;

/** Combines the keyboard and any connected gamepad into one set of controls. */
export class Keyboard {
  private readonly held = new Set<string>();
  private readonly pad = new PadReader();
  private padState: PadState | null = null;
  private captured = new Set<string>();
  private powerByCode = new Map<string, PowerupId>();
  private queuedPowerup: PowerupId | null = null;
  /** While set, the next key press goes here instead of the game. Esc cancels. */
  private capture: ((code: string | null) => void) | null = null;
  onFirstInput: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onMute: (() => void) | null = null;

  constructor(private bindings: Bindings) {
    this.setBindings(bindings);
    window.addEventListener('keydown', (e) => {
      this.onFirstInput?.();
      if (this.capture) {
        e.preventDefault();
        const done = this.capture;
        this.capture = null;
        done(e.code === 'Escape' ? null : e.code);
        return;
      }
      // Typing and form controls keep their keys, such as Space pressing a focused button.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement) return;
      // Ctrl+R and friends belong to the browser, even when the letter is also a game key.
      if (e.ctrlKey || e.metaKey) return;
      if (e.code === 'Escape') {
        if (!e.repeat) this.onPause?.();
        return;
      }
      if (e.code === 'KeyM') {
        if (!e.repeat) this.onMute?.();
        return;
      }
      if (!this.captured.has(e.code)) return;
      e.preventDefault();
      this.held.add(e.code);
      if (!e.repeat) this.queuedPowerup = this.powerByCode.get(e.code) ?? this.queuedPowerup;
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    // A key released while the window is unfocused never fires keyup.
    window.addEventListener('blur', () => this.held.clear());
  }

  setBindings(bindings: Bindings): void {
    this.bindings = bindings;
    this.captured = new Set(Object.values(bindings));
    this.powerByCode = new Map(POWER_ACTIONS.map((action, i) => [bindings[action], POWERUP_ORDER[i]]));
  }

  captureNextKey(done: (code: string | null) => void): void {
    this.capture = done;
  }

  cancelCapture(): void {
    this.capture = null;
  }

  private isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** Reads the first connected gamepad. Call once per input sample. */
  private pollPad(): void {
    const pads: readonly (PadLike | null)[] = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = pads.find((p) => p !== null) ?? null;
    this.padState = pad ? this.pad.read(pad) : null;
    if (this.padState?.pausePressed) this.onPause?.();
  }

  get rearView(): boolean {
    return this.isDown(this.bindings.rear) || (this.padState?.rear ?? false);
  }

  /** Current controls without consuming a queued powerup, for things like the tutorial. */
  peek(input: BotInput): void {
    const b = this.bindings;
    const axis = (plus: string, minus: string) => (this.isDown(plus) ? 1 : 0) - (this.isDown(minus) ? 1 : 0);
    const pad = this.padState;
    input.throttle = axis(b.forward, b.back) || (pad?.throttle ?? 0);
    input.steer = axis(b.left, b.right) || (pad?.steer ?? 0);
    input.melee = this.isDown(b.melee) || (pad?.melee ?? false);
    input.turret = this.isDown(b.turret) || (pad?.turret ?? false);
    input.defense = this.isDown(b.defense) || (pad?.defense ?? false);
  }

  applyTo(input: BotInput): void {
    this.pollPad();
    this.peek(input);
    if (this.padState && this.padState.powerup >= 0) this.queuedPowerup = POWERUP_ORDER[this.padState.powerup];
    if (this.queuedPowerup) {
      input.powerup = this.queuedPowerup;
      this.queuedPowerup = null;
    }
  }

  clear(): void {
    this.held.clear();
    this.queuedPowerup = null;
  }
}
