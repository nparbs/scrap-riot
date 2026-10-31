import { POWERUP_ORDER, type PowerupId } from './sim/data';
import type { BotInput } from './sim/match';

const CAPTURED = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyX', 'KeyC', 'KeyV',
  'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'ControlLeft', 'ControlRight',
]);

export class Keyboard {
  private readonly held = new Set<string>();
  private queuedPowerup: PowerupId | null = null;
  onFirstInput: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onMute: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.onFirstInput?.();
      if (e.code === 'Escape') {
        if (!e.repeat) this.onPause?.();
        return;
      }
      if (e.code === 'KeyM') {
        if (!e.repeat) this.onMute?.();
        return;
      }
      if (!CAPTURED.has(e.code)) return;
      e.preventDefault();
      this.held.add(e.code);
      if (!e.repeat && e.code.startsWith('Digit')) {
        this.queuedPowerup = POWERUP_ORDER[Number(e.code.slice(5)) - 1];
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    // A key released while the window is unfocused never fires keyup.
    window.addEventListener('blur', () => this.held.clear());
  }

  get rearView(): boolean {
    return this.held.has('ControlLeft') || this.held.has('ControlRight');
  }

  applyTo(input: BotInput): void {
    const axis = (plus: string, minus: string) => (this.held.has(plus) ? 1 : 0) - (this.held.has(minus) ? 1 : 0);
    input.throttle = axis('ArrowUp', 'ArrowDown');
    input.steer = axis('ArrowLeft', 'ArrowRight');
    input.melee = this.held.has('KeyX');
    input.turret = this.held.has('KeyC');
    input.defense = this.held.has('KeyV');
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
