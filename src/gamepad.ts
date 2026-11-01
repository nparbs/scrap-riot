/** The parts of the browser's Gamepad object this reads, using the "standard" layout. */
export interface PadLike {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export interface PadState {
  throttle: number;
  steer: number;
  melee: boolean;
  defense: boolean;
  boost: boolean;
  rear: boolean;
  /** Index of a powerup pressed this read, or -1. */
  powerup: number;
  pausePressed: boolean;
}

const BUTTON = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, start: 9, up: 12, down: 13, left: 14, right: 15 };
const POWERUP_BUTTONS = [BUTTON.up, BUTTON.right, BUTTON.down, BUTTON.left, BUTTON.lb];
const DEADZONE = 0.18;

export function deadzone(value: number, zone = DEADZONE): number {
  const size = Math.abs(value);
  if (size < zone) return 0;
  return (Math.sign(value) * (size - zone)) / (1 - zone);
}

/** Tracks button state between reads, so one press fires a powerup exactly once. */
export class PadReader {
  private wasDown = new Set<number>();

  read(pad: PadLike): PadState {
    const down = (i: number) => pad.buttons[i]?.pressed ?? false;
    const value = (i: number) => pad.buttons[i]?.value ?? 0;
    const pressedNow = (i: number) => down(i) && !this.wasDown.has(i);

    const powerup = POWERUP_BUTTONS.findIndex(pressedNow);
    const pausePressed = pressedNow(BUTTON.start);

    this.wasDown.clear();
    pad.buttons.forEach((button, i) => {
      if (button.pressed) this.wasDown.add(i);
    });

    return {
      throttle: value(BUTTON.rt) - value(BUTTON.lt),
      // Stick right is positive, while the sim's steering treats left as positive.
      steer: -deadzone(pad.axes[0] ?? 0),
      melee: down(BUTTON.a) || down(BUTTON.rb),
      defense: down(BUTTON.b),
      boost: down(BUTTON.x),
      rear: down(BUTTON.y),
      powerup,
      pausePressed,
    };
  }
}
