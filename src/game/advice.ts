import {
  batteryCost,
  buildProblem,
  CLASSES,
  classFor,
  DEFENSES,
  MELEE,
  type ChassisId,
  type DefenseId,
  type EngineId,
  type PartsChoice,
  type PowerId,
  type WheelsId,
} from '../sim/data';
import { previewLoadout, type Slot } from './progress';

/** A part the workshop suggests for the weapons on a robot, and why. */
export interface Suggestion {
  id: string;
  reason: string;
}

type Choice<T extends string> = [T, string];

/** What each class wants around its weapons, best first. Later choices are for when the first won't fit. */
interface ClassAdvice {
  wheels: Choice<WheelsId>[];
  engine: Choice<EngineId>[];
  defense: Choice<DefenseId>[];
}

const ADVICE: Record<ChassisId, ClassAdvice> = {
  scout: {
    wheels: [['small4', 'They turn on a coin, so you can dart in at their side and back out again.']],
    engine: [['large', 'Hit and run is all speed, to get in and out before they turn.'], ['medium', 'Hit and run needs speed, and this is what fits.']],
    defense: [
      ['mines', 'It drops behind you, so whoever chases you between hits drives over it.'],
      ['oil', 'It drops behind you, so whoever chases you between hits slides off.'],
      ['flash', 'It slows the pilots around you, so you get away clean after a hit.'],
    ],
  },
  ghost: {
    wheels: [['large4', 'They keep the most top speed, to hold your distance.']],
    engine: [['large', 'Staying out of their reach while they stay in yours takes speed.'], ['medium', 'Staying out of reach takes speed, and this is what fits.']],
    defense: [
      ['glue', 'It lands behind you, so whoever chases you crawls while you keep hitting them.'],
      ['oil', 'It lands behind you, so whoever chases you slides about while you keep hitting them.'],
      ['teleport', 'It jumps you away when they get close, back to where your reach wins.'],
    ],
  },
  brawler: {
    wheels: [['six', 'Better pull and harder to shove, so you stay on them while you cut.'], ['large4', 'The sensible choice when 6 Wheels won\'t fit.']],
    engine: [['medium', 'Fast enough to catch them, and leaves points for the rest.']],
    defense: [
      ['flash', 'It slows the pilots close by, so they can\'t back away from your blade.'],
      ['shield', 'It takes the edge off the hits you trade while you grind.'],
    ],
  },
  rhino: {
    wheels: [['tracks', 'The hardest to shove, so you win the pushing match.'], ['six', 'Harder to shove, so you win the pushing match.']],
    engine: [['large', 'More power to push them where you want them.'], ['medium', 'Power to push with, and this is what fits.']],
    defense: [
      ['steelram', 'You spend the fight nose to nose, so a plate halves the hits from anyone on your other side.'],
      ['plow', 'You spend the fight nose to nose, and it covers your other side and clears mines.'],
      ['shield', 'It takes the edge off the hits while you hold them.'],
    ],
  },
  juggernaut: {
    wheels: [['six', 'Harder to shove, so they can\'t knock you off line before your hit lands.'], ['large4', 'The sensible choice when 6 Wheels won\'t fit.']],
    engine: [['medium', 'A big weapon leaves few points, and this is enough to line up a hit.'], ['small', 'A big weapon leaves few points, so save them here.']],
    defense: [
      ['emp', 'It stuns every robot around you, which gives your slow hit time to land.'],
      ['flash', 'It slows the pilots close by, which gives your slow hit time to land.'],
      ['shield', 'It covers you while your weapon gets ready.'],
    ],
  },
};

/** Weapons that need different advice from the rest of their class. */
const WEAPON_ADVICE: Partial<Record<keyof typeof MELEE, Partial<ClassAdvice>>> = {
  ram: {
    wheels: [['tracks', 'Ram damage grows with how heavy you are on the floor, and tracks make you hardest to shove.'], ['six', 'Ram damage grows with how heavy you are on the floor, and these make you harder to shove.']],
    engine: [['turbo', 'Ram damage grows with how fast you hit.'], ['large', 'Ram damage grows with how fast you hit.'], ['medium', 'Ram damage grows with speed, and this is what fits.']],
  },
};

/** Battery per second of reload below which a weapon barely touches it. A basic battery recharges 0.05 a second. */
const LIGHT_DRAW = 0.13;
/** A hit that costs at least this much of the battery needs room to store a few. */
const BIG_HIT = 0.3;
/** A secondary weapon that takes this much on each use needs a bigger battery behind it. */
const HUNGRY_SECONDARY = 0.2;

function powerChoices(build: PartsChoice): Choice<PowerId>[] {
  const weapon = MELEE[build.melee];
  const held = weapon.kind === 'held' || weapon.kind === 'magnet';
  const cost = batteryCost(weapon);
  if (cost > 0 && !held && cost >= BIG_HIT) {
    return [['lithium', 'Each hit takes a big bite out of the battery, and this holds a third more, so you can store more of them.'], ['alkaline', 'Each hit takes a big bite out of the battery, and this is what fits.']];
  }
  if (cost > 0 && (held || cost / Math.max(weapon.cooldown, weapon.windup, 0.3) >= LIGHT_DRAW)) {
    const why = held ? 'It draws battery every second it runs' : 'It hits often, and each hit uses battery';
    return [['fuelcell', `${why}, and this recharges much faster.`], ['lithium', `${why}, and this holds a third more.`], ['alkaline', `${why}, and this is what fits.`]];
  }
  const secondary = DEFENSES[build.defense];
  const cheap: Choice<PowerId> = ['alkaline', `Your ${weapon.name} barely uses the battery, so spend the points elsewhere.`];
  if ((secondary.battery ?? 0) >= HUNGRY_SECONDARY) {
    return [['lithium', `Your ${weapon.name} barely uses the battery, but your ${secondary.name} takes a lot each time, and this holds a third more.`], cheap];
  }
  return [cheap];
}

/** Secondary weapons left behind on the floor. They come out opposite the main weapon, so a weapon on the back throws them ahead. */
const DROPPED: DefenseId[] = ['mines', 'oil', 'glue', 'spikes', 'minibot', 'remote'];

type Build = PartsChoice & { rearMelee?: boolean };

function choicesFor(slot: Slot, build: Build): Choice<string>[] {
  const home = classFor(build.melee);
  const advice = { ...ADVICE[home], ...WEAPON_ADVICE[build.melee] };
  const job = CLASSES[home];
  switch (slot) {
    case 'chassis':
      return [[home, `It's the ${job.role} class, built around this weapon, so it gets the class bonus.`]];
    case 'wheels':
      return advice.wheels;
    case 'engine':
      return advice.engine;
    case 'power':
      return powerChoices(build);
    case 'defense':
      return build.rearMelee ? advice.defense.filter(([id]) => !DROPPED.includes(id)) : advice.defense;
    default:
      return [];
  }
}

/**
 * The part for this slot that suits the robot's weapons, picked from what the class wants, or null for slots
 * with no advice, such as the main weapon itself. Other parts only count if the robot can carry them, with less
 * armor if need be. The chassis is suggested even when it can't, since it decides what the rest can be.
 */
export function suggestPart(slot: Slot, build: Build): Suggestion | null {
  const choice = choicesFor(slot, build).find(([id]) => slot === 'chassis' || !buildProblem(previewLoadout(build, { slot, id })));
  return choice ? { id: choice[0], reason: choice[1] } : null;
}
