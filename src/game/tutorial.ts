import { keyLabel, type Bindings } from './settings';

export interface TutorialInput {
  throttle: number;
  steer: number;
  melee: boolean;
  turret: boolean;
  defense: boolean;
  /** Total powerups the player has left. */
  powerups: number;
}

interface Step {
  prompt: (keys: Bindings) => string;
  /** Seconds the player must do this for, so a stray tap doesn't skip the lesson. */
  hold: number;
  done: (input: TutorialInput, used: boolean) => boolean;
}

const k = keyLabel;

const STEPS: Step[] = [
  {
    prompt: (b) => `Hold ${k(b.forward)} to drive, ${k(b.back)} to reverse`,
    hold: 1,
    done: (input) => input.throttle !== 0,
  },
  {
    prompt: (b) => `Use ${k(b.left)} and ${k(b.right)} to turn`,
    hold: 0.6,
    done: (input) => input.steer !== 0,
  },
  {
    prompt: (b) => `Hold ${k(b.turret)} to fire your turret. It aims itself.`,
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
    prompt: (b) => `Press ${k(b.power6)} for Turbo. Powerups are limited, so choose your moment.`,
    hold: 0,
    done: (_, used) => used,
  },
];

/** Walks a new player through the controls while they play. */
export class Tutorial {
  private index = 0;
  private held = 0;
  private lastPowerups: number | null = null;

  constructor(private readonly keys: Bindings) {}

  get finished(): boolean {
    return this.index >= STEPS.length;
  }

  get prompt(): string {
    return this.finished ? '' : STEPS[this.index].prompt(this.keys);
  }

  update(dt: number, input: TutorialInput): void {
    if (this.finished) return;
    const used = this.lastPowerups !== null && input.powerups < this.lastPowerups;
    this.lastPowerups = input.powerups;
    const step = STEPS[this.index];
    if (!step.done(input, used)) return;
    this.held += dt;
    if (this.held >= step.hold) {
      this.index++;
      this.held = 0;
    }
  }
}
