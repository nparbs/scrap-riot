import type { Bindings } from './game/settings';
import { PadReader, type PadLike, type PadState } from './gamepad';
import { POWERUP_ORDER, type PowerupId } from './sim/data';
import type { BotInput } from './sim/match';

const POWER_ACTIONS = ['power1', 'power2', 'power3', 'power4', 'power5', 'power6'] as const;

/** Left and right mouse buttons, which sit alongside whatever keys are bound. */
const MOUSE_MELEE = 'Mouse0';
const MOUSE_DEFENSE = 'Mouse2';
/** Clicks on these are for the page, not the robot. */
const PAGE_CONTROLS = 'button, input, select, a, label, form, .duel-intro, .settings-layer, .chat-menu, .hud-dock, .hud-spectate, .touch-controls';

/** What the on-screen controls are doing, on phones and tablets. */
export interface TouchState {
  throttle: number;
  steer: number;
  melee: boolean;
  defense: boolean;
  boost: boolean;
  rear: boolean;
}

/** Combines the keyboard, the mouse, any connected gamepad and touch controls into one set of controls. */
export class Keyboard {
  private readonly held = new Set<string>();
  /** Keys pressed since the game last read the controls, so a very quick tap still counts. */
  private readonly tapped = new Set<string>();
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
  /** Only in a match, so the mouse is left alone for the page everywhere else. */
  mouseEnabled = false;
  readonly touch: TouchState = { throttle: 0, steer: 0, melee: false, defense: false, boost: false, rear: false };

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
      this.tapped.add(e.code);
      if (!e.repeat) this.queuedPowerup = this.powerByCode.get(e.code) ?? this.queuedPowerup;
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('mousedown', (e) => {
      if (!this.mouseEnabled || (e.target instanceof Element && e.target.closest(PAGE_CONTROLS))) return;
      const code = e.button === 0 ? MOUSE_MELEE : e.button === 2 ? MOUSE_DEFENSE : '';
      if (!code) return;
      e.preventDefault();
      this.held.add(code);
      this.tapped.add(code);
    });
    window.addEventListener('mouseup', (e) => {
      this.held.delete(e.button === 0 ? MOUSE_MELEE : e.button === 2 ? MOUSE_DEFENSE : '');
    });
    // The right button is a weapon during a match, so its menu stays shut.
    window.addEventListener('contextmenu', (e) => {
      if (this.mouseEnabled) e.preventDefault();
    });
    // A key released while the window is unfocused never fires keyup.
    window.addEventListener('blur', () => {
      this.held.clear();
      this.tapped.clear();
    });
  }

  setBindings(bindings: Bindings): void {
    this.bindings = bindings;
    this.captured = new Set(Object.values(bindings));
    // Holding either Shift key counts, and browsers report them separately.
    if (bindings.boost === 'ShiftLeft') this.captured.add('ShiftRight');
    this.powerByCode = new Map(POWER_ACTIONS.map((action, i) => [bindings[action], POWERUP_ORDER[i]]));
  }

  captureNextKey(done: (code: string | null) => void): void {
    this.capture = done;
  }

  cancelCapture(): void {
    this.capture = null;
  }

  private isDown(code: string): boolean {
    return this.held.has(code) || this.tapped.has(code);
  }

  /** Reads the first connected gamepad. Call once per input sample. */
  private pollPad(): void {
    const pads: readonly (PadLike | null)[] = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = pads.find((p) => p !== null) ?? null;
    this.padState = pad ? this.pad.read(pad) : null;
    if (this.padState?.pausePressed) this.onPause?.();
  }

  get rearView(): boolean {
    return this.isDown(this.bindings.rear) || (this.padState?.rear ?? false) || this.touch.rear;
  }

  /** Current controls without consuming a queued powerup, for things like the tutorial. */
  peek(input: BotInput): void {
    const b = this.bindings;
    const axis = (plus: string, minus: string) => (this.isDown(plus) ? 1 : 0) - (this.isDown(minus) ? 1 : 0);
    const pad = this.padState;
    const { touch } = this;
    input.throttle = axis(b.forward, b.back) || (pad?.throttle ?? 0) || touch.throttle;
    input.steer = axis(b.left, b.right) || (pad?.steer ?? 0) || touch.steer;
    input.melee = this.isDown(b.melee) || this.isDown(MOUSE_MELEE) || (pad?.melee ?? false) || touch.melee;
    input.defense = this.isDown(b.defense) || this.isDown(MOUSE_DEFENSE) || (pad?.defense ?? false) || touch.defense;
    input.boost = this.isDown(b.boost) || (b.boost === 'ShiftLeft' && this.isDown('ShiftRight')) || (pad?.boost ?? false) || touch.boost;
  }

  applyTo(input: BotInput): void {
    this.pollPad();
    this.peek(input);
    this.tapped.clear();
    if (this.padState && this.padState.powerup >= 0) this.queuedPowerup = POWERUP_ORDER[this.padState.powerup];
    if (this.queuedPowerup) {
      input.powerup = this.queuedPowerup;
      this.queuedPowerup = null;
    }
  }

  /** For the on-screen powerup buttons. */
  queuePowerup(index: number): void {
    this.queuedPowerup = POWERUP_ORDER[index] ?? null;
  }

  clear(): void {
    this.held.clear();
    this.tapped.clear();
    this.queuedPowerup = null;
    Object.assign(this.touch, { throttle: 0, steer: 0, melee: false, defense: false, boost: false, rear: false });
  }
}
