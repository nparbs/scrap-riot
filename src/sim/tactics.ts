// How bots fight. The numbers worth having come from scripts/train-bots.ts, which plays bots against each other and writes them to trained.ts.
import { MELEE, type DefenseId, type MeleeId } from './data';
import { TRAINED_HABITS, TRAINED_TACTICS } from './trained';

/** How a bot uses one main weapon. */
export interface Tactics {
  /** How far round behind its target it comes in, away from the target's weapon. At 0, straight at it. */
  flank: number;
  /** The share of full reach it tries to keep, backing off when closer. At 0, right up against the target. */
  standoff: number;
  /** It backs off while more than this share of the reload is left. At 1, never. */
  kiteReload: number;
  /** How far beyond its reach it backs off to. */
  kiteGap: number;
  /** It only backs off from a target slower than its own speed divided by this. */
  kiteSpeed: number;
  /** Throttle while turning to aim up close. Slower makes a tighter turn. */
  turnThrottle: number;
  /** Seconds ahead it judges reach, for a swing that lands as the target arrives. */
  lead: number;
  /** How far out it starts a weapon that works from a distance or needs warming up: a spin-up, a lunge, a magnet. */
  engage: number;
  /** Below this much battery, it won't warm up a weapon that can't reach yet. */
  saveBattery: number;
  /** How far away a target has to be to boost toward it, and how much battery that needs. */
  boostDist: number;
  boostAmmo: number;
  /** How close to a drop a target has to be for an all-out shove. At 0, it never tries. */
  edgeHunt: number;
  /** The share of health at which it goes for a repair pickup, and uses a Repair Kit. */
  repairAt: number;
  kitAt: number;
  /** How low the battery gets before it uses a Battery Pack. */
  batteryAt: number;
}

/** When a bot uses its defense. Which of these matter depends on the defense. */
export interface Habit {
  /** How close, or for a Teleport how far, the target has to be. */
  range: number;
  /** How worn down it has to be, from 0 to 1. */
  health: number;
  /** Battery it keeps back for the weapon. */
  reserve: number;
}

/** What a robot in a test or in training fights by, in place of what its skill would give it. */
export interface BrainOverride {
  tactics?: Tactics;
  habits?: Partial<Record<DefenseId, Habit>>;
}

export const TACTIC_BOUNDS: Record<keyof Tactics, [number, number]> = {
  flank: [0, 1],
  standoff: [0, 1],
  kiteReload: [0, 1],
  kiteGap: [0, 8],
  kiteSpeed: [0.5, 1.5],
  turnThrottle: [0.2, 1],
  lead: [0, 0.5],
  engage: [2, 16],
  saveBattery: [0, 0.6],
  boostDist: [6, 24],
  boostAmmo: [0.2, 1],
  edgeHunt: [0, 10],
  repairAt: [0.1, 0.9],
  kitAt: [0.1, 0.9],
  batteryAt: [0.05, 0.5],
};

export const HABIT_BOUNDS: Record<keyof Habit, [number, number]> = {
  range: [0, 40],
  health: [0, 1],
  reserve: [0, 0.8],
};

const ENGAGE_DISTANCE: Partial<Record<MeleeId, number>> = { ram: 10, magnet: 15, vertdisc: 12, vertbar: 12, horizbar: 12, undercutter: 12, drum: 12 };

/** The plain way to fight: straight at the target, with no thought for the reload. A weak bot is close to this. */
export function plainTactics(melee: MeleeId): Tactics {
  return {
    flank: 0, standoff: 0, kiteReload: 1, kiteGap: 0, kiteSpeed: 1, turnThrottle: 1, lead: 0,
    engage: ENGAGE_DISTANCE[melee] ?? Math.min(16, MELEE[melee].range),
    saveBattery: 0, boostDist: 12, boostAmmo: 0.6, edgeHunt: 0, repairAt: 0.35, kitAt: 0.5, batteryAt: 0.15,
  };
}

const PLAIN_HABITS: Record<DefenseId, Habit> = {
  shield: { range: 40, health: 0.7, reserve: 0 },
  mines: { range: 9, health: 1, reserve: 0 },
  oil: { range: 9, health: 1, reserve: 0 },
  glue: { range: 9, health: 1, reserve: 0 },
  spikes: { range: 9, health: 1, reserve: 0 },
  steelram: { range: 0, health: 0, reserve: 0 },
  plow: { range: 0, health: 0, reserve: 0 },
  teleport: { range: 18, health: 0.4, reserve: 0 },
  flash: { range: 7, health: 1, reserve: 0 },
  cloak: { range: 40, health: 0.45, reserve: 0 },
  emp: { range: 6.3, health: 1, reserve: 0 },
  minibot: { range: 24, health: 1, reserve: 0 },
  remote: { range: 12, health: 1, reserve: 0 },
  kamikaze: { range: 4.8, health: 0.2, reserve: 0 },
};

export function plainHabit(defense: DefenseId): Habit {
  return PLAIN_HABITS[defense];
}

/** How much of its training a bot of this skill uses. Early rivals fight plainly, and the best use all of it. */
export function trainedShare(skill: number): number {
  return Math.max(0, Math.min(1, (skill - 0.45) / 0.5));
}

function blend<T extends object>(plain: T, trained: T | undefined, share: number): T {
  if (!trained) return plain;
  if (share >= 1) return trained;
  const out = { ...plain } as Record<string, number>;
  for (const key of Object.keys(plain)) out[key] += (((trained as Record<string, number>)[key]) - out[key]) * share;
  return out as T;
}

export function tacticsFor(melee: MeleeId, skill: number): Tactics {
  return blend(plainTactics(melee), TRAINED_TACTICS[melee], trainedShare(skill));
}

export function habitFor(defense: DefenseId, skill: number): Habit {
  return blend(plainHabit(defense), TRAINED_HABITS[defense], trainedShare(skill));
}
