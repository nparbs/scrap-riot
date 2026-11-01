import { keyLabel, type Bindings } from './settings';

export interface TutorialInput {
  throttle: number;
  steer: number;
  melee: boolean;
  turret: boolean;
  defense: boolean;
  boost: boolean;
}

interface Step {
  prompt: (keys: Bindings) => string;
  /** Seconds the player must do this for, so a stray tap doesn't skip the lesson. */
  hold: number;
  done: (input: TutorialInput) => boolean;
}

const k = keyLabel;

const STEPS: Step[] = [
  {
    prompt: (b) => `Hold ${k(b.forward)} to drive, ${k(b.back)} to reverse`,
    hold: 1,
    done: (input) => input.throttle !== 0,
  },
  {
    prompt: (b) => `Hold ${k(b.forward)} or ${k(b.back)} and use ${k(b.left)} and ${k(b.right)} to turn. You can only turn while moving.`,
    hold: 0.6,
    done: (input) => input.steer !== 0 && input.throttle !== 0,
  },
  {
    prompt: (b) => `Press ${k(b.turret)} to fire your gun. It shoots straight ahead, and shots are limited.`,
    hold: 1,
    done: (input) => input.turret,
  },
  {
    prompt: (b) => `Get close and press ${k(b.melee)} for your main weapon`,
    hold: 0.5,
    done: (input) => input.melee,
  },
  {
    prompt: (b) => `Press ${k(b.defense)} for your defense`,
    hold: 0,
    done: (input) => input.defense,
  },
  {
    prompt: (b) => `Hold ${k(b.boost)} for a burst of speed. It runs on your battery, like your gun.`,
    hold: 0.4,
    done: (input) => input.boost,
  },
  {
    // Just information, since a Repair Kit or Battery Pack does nothing while topped up.
    prompt: (b) => `Keys ${k(b.power1)} to ${k(b.power6)} use powerups. They're limited, so choose your moment.`,
    hold: 5,
    done: () => true,
  },
];

/** Walks a new player through the controls while they play. */
export class Tutorial {
  private index = 0;
  private held = 0;

  constructor(private readonly keys: Bindings) {}

  get finished(): boolean {
    return this.index >= STEPS.length;
  }

  get prompt(): string {
    return this.finished ? '' : STEPS[this.index].prompt(this.keys);
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
