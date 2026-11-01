import { keyLabel, type Bindings } from './settings';

export interface TutorialInput {
  throttle: number;
  steer: number;
  melee: boolean;
  defense: boolean;
  boost: boolean;
}

interface Step {
  prompt: (keys: Bindings) => string;
  /** The same lesson for the on-screen controls. */
  touch: string;
  /** Seconds the player must do this for, so a stray tap doesn't skip the lesson. */
  hold: number;
  done: (input: TutorialInput) => boolean;
}

const k = keyLabel;

const STEPS: Step[] = [
  {
    prompt: (b) => `Hold ${k(b.forward)} to drive, ${k(b.back)} to reverse`,
    touch: 'Push the stick up to drive, down to reverse',
    hold: 1,
    done: (input) => input.throttle !== 0,
  },
  {
    prompt: (b) => `Hold ${k(b.forward)} or ${k(b.back)} and use ${k(b.left)} and ${k(b.right)} to turn. You can only turn while moving.`,
    touch: 'Push the stick sideways while moving to turn. You can only turn while rolling.',
    hold: 0.6,
    done: (input) => input.steer !== 0 && input.throttle !== 0,
  },
  {
    prompt: (b) => `Get close and press ${k(b.melee)} or the left mouse button for your main weapon`,
    touch: 'Get close and hold Weapon',
    hold: 0.5,
    done: (input) => input.melee,
  },
  {
    prompt: (b) => `Press ${k(b.defense)} or the right mouse button for your defense`,
    touch: 'Tap Defense',
    hold: 0,
    done: (input) => input.defense,
  },
  {
    prompt: (b) => `Hold ${k(b.boost)} for a burst of speed. It runs on your battery.`,
    touch: 'Hold Boost for a burst of speed. It runs on your battery.',
    hold: 0.4,
    done: (input) => input.boost,
  },
  {
    // Just information, since a Repair Kit or Battery Pack does nothing while topped up.
    prompt: (b) => `Keys ${k(b.power1)} to ${k(b.power3)} use the powerups you selected. They're limited, so choose your moment.`,
    touch: "Tap a powerup above your weapon buttons to use it. They're limited, so choose your moment.",
    hold: 5,
    done: () => true,
  },
];

/** Walks a new player through the controls while they play. */
export class Tutorial {
  private index = 0;
  private held = 0;

  constructor(private readonly keys: Bindings, private readonly touch = false) {}

  get finished(): boolean {
    return this.index >= STEPS.length;
  }

  get prompt(): string {
    if (this.finished) return '';
    const step = STEPS[this.index];
    return this.touch ? step.touch : step.prompt(this.keys);
  }

  update(dt: number, input: TutorialInput): void {
    if (this.finished) return;
    const step = STEPS[this.index];
    if (!step.done(input)) return;
    this.held += dt;
    if (this.held >= step.hold) {
      this.index++;
      this.held = 0;
    }
  }
}
