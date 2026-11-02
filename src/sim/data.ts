// All balance numbers live here. Nothing in this folder may import three.js or touch the DOM.

export type ChassisId = 'scout' | 'ghost' | 'brawler' | 'rhino' | 'juggernaut';
export type MeleeId =
  | 'chainsaw' | 'drill' | 'dagger' | 'rollingpin' | 'hammer' | 'axe' | 'ram' | 'claw' | 'magnet'
  | 'vertdisc' | 'vertbar' | 'horizbar' | 'undercutter' | 'drum' | 'hammersaw' | 'flipper' | 'crusher' | 'forks'
  | 'flamethrower' | 'tesla' | 'spear';
export type DefenseId =
  | 'shield' | 'mines' | 'oil' | 'glue' | 'nails' | 'steelram' | 'plow' | 'blades' | 'cutter'
  | 'teleport' | 'flash' | 'cloak' | 'emp' | 'minibot' | 'remote' | 'kamikaze';
export type WheelsId = 'small4' | 'large4' | 'six' | 'tracks';
export type EngineId = 'small' | 'medium' | 'large' | 'turbo';
export type PowerId = 'alkaline' | 'lithium' | 'fuelcell' | 'reactor';
export type PowerupId = 'rage' | 'megashield' | 'cloaking' | 'xray' | 'repair' | 'battery';
export type UpgradeId = 'armor' | 'engine' | 'weapons';

/** Every robot is built to this many points, so anything that fits is a fair fight with anything else that fits. */
export const POINT_BUDGET = 100;

export interface ChassisDef {
  name: string;
  blurb: string;
  price: number;
  /** What it costs out of the robot's points. */
  points: number;
  /** Health points. Only repairs bring these back. */
  hp: number;
  /** The bare chassis, in kg. */
  weight: number;
  /** The most that can be bolted onto it, in kg. Bigger weapons need a bigger chassis. */
  payload: number;
  turn: number;
  radius: number;
}

export const CHASSIS: Record<ChassisId, ChassisDef> = {
  scout: { name: 'Whippet', blurb: 'A stripped-down racer on long arms. Tiny and quick, with no strength to carry anything big.', price: 700, points: 14, hp: 140, weight: 34, payload: 50, turn: 3.2, radius: 1.15 },
  ghost: { name: 'Wraith', blurb: 'A low stealth wedge that fights from a distance, if you travel light.', price: 950, points: 19, hp: 150, weight: 44, payload: 60, turn: 2.9, radius: 1.25 },
  brawler: { name: 'Bruiser', blurb: 'The honest all-rounder, built to get in close and grind.', price: 0, points: 25, hp: 155, weight: 55, payload: 78, turn: 2.6, radius: 1.45 },
  rhino: { name: 'Rhino', blurb: 'A dozer blade and a horn, to shove robots wherever you want them.', price: 1200, points: 37, hp: 190, weight: 70, payload: 100, turn: 2.35, radius: 1.6 },
  juggernaut: { name: 'Anvil', blurb: 'A slow armored fortress that carries anything and hits like a truck.', price: 1500, points: 40, hp: 235, weight: 85, payload: 125, turn: 2.15, radius: 1.75 },
};

/** What a class does for the weapons it was built around. Anything left out stays as it was. */
export interface ClassBonus {
  /** Multiplies damage. */
  damage: number;
  /** Multiplies how long the weapon takes to reload, and a spinner to spin up. */
  reload: number;
  /** Multiplies the battery it uses. */
  battery: number;
  /** Multiplies how long a grabber can hold on. */
  grip: number;
  /** Multiplies how far it reaches. */
  reach: number;
}

export const NO_BONUS: ClassBonus = { damage: 1, reload: 1, battery: 1, grip: 1, reach: 1 };

export interface ChassisClass {
  /** What the class is called, as in a fighting game. */
  role: string;
  /** The weapons it was built around. Every weapon belongs to exactly one class. */
  weapons: MeleeId[];
  bonus: ClassBonus;
  /** The share of damage it shrugs off while moving at MOVING_TARGET_SPEED or faster, whatever weapon it carries. */
  movingTarget?: number;
  /** Armor it rebuilds each second once it's been out of combat for ARMOUR_REGEN_DELAY, whatever weapon it carries. */
  armourRegen?: number;
}

/** The share of its top speed a robot has to be doing to count as a moving target. */
export const MOVING_TARGET_SPEED = 0.7;

/** Seconds without hurting or being hurt before a chassis that can starts rebuilding armor. */
export const ARMOUR_REGEN_DELAY = 5;

export const CLASSES: Record<ChassisId, ChassisClass> = {
  scout: { role: 'Striker', weapons: ['dagger', 'axe', 'drum', 'undercutter'], bonus: { ...NO_BONUS, damage: 1.2, reload: 0.8 }, armourRegen: 8, movingTarget: 0.25 },
  ghost: { role: 'Lancer', weapons: ['flamethrower', 'tesla', 'spear'], bonus: { ...NO_BONUS, damage: 1.1, battery: 0.6, reach: 1.15 } },
  brawler: { role: 'Brawler', weapons: ['chainsaw', 'drill', 'rollingpin', 'hammersaw'], bonus: { ...NO_BONUS, damage: 1.15, battery: 0.85 } },
  rhino: { role: 'Bulldozer', weapons: ['ram', 'claw', 'forks', 'flipper', 'magnet'], bonus: { ...NO_BONUS, damage: 1.1, reload: 0.9, grip: 1.2 } },
  juggernaut: { role: 'Titan', weapons: ['hammer', 'crusher', 'vertdisc', 'vertbar', 'horizbar'], bonus: { ...NO_BONUS, damage: 1.15, reload: 0.9 } },
};

/** The bonus this weapon gets on this chassis, which is nothing unless it's one the class was built around. */
export function classBonus(chassis: ChassisId, melee: MeleeId): ClassBonus {
  return CLASSES[chassis].weapons.includes(melee) ? CLASSES[chassis].bonus : NO_BONUS;
}

/** The chassis a weapon belongs on. */
export function classFor(melee: MeleeId): ChassisId {
  return (Object.keys(CLASSES) as ChassisId[]).find((id) => CLASSES[id].weapons.includes(melee))!;
}

/** A part changes a stat by multiplying it, so anything left out stays as it was. */
export interface PartDef {
  name: string;
  blurb: string;
  price: number;
  points: number;
  weight: number;
  /** Multiplies top speed, on top of what the engine manages. */
  speed?: number;
  accel?: number;
  turn?: number;
  /** Multiplies how hard the robot is to shove. It isn't extra weight, only grip on the floor. */
  mass?: number;
}

export interface EngineDef extends PartDef {
  /** Top speed and acceleration come from this against the robot's whole weight. */
  power: number;
}

export interface PowerDef extends PartDef {
  /** How fast the battery recharges. */
  regen: number;
  /** How much the battery holds. */
  capacity: number;
  /** How far a flat battery recharges before things work again, if not BATTERY_RESTART. */
  restart?: number;
}

export const WHEELS: Record<WheelsId, PartDef> = {
  small4: { name: '4 Small Wheels', blurb: 'Light and turns on a coin, gives up some top speed.', price: 150, points: 3, weight: 5, speed: 0.9, accel: 1, turn: 1.1 },
  large4: { name: '4 Large Wheels', blurb: 'The sensible choice.', price: 0, points: 4, weight: 7, speed: 1.04 },
  six: { name: '6 Wheels', blurb: 'Better pull off the line and harder to shove.', price: 350, points: 7, weight: 12, speed: 0.98, accel: 1.15, mass: 1.2 },
  tracks: { name: 'Tank Tracks', blurb: 'Heavy and slow, and very hard to knock off a roof.', price: 600, points: 8, weight: 18, speed: 0.9, turn: 0.95, accel: 1.1, mass: 1.5 },
};

export const ENGINES: Record<EngineId, EngineDef> = {
  small: { name: 'Small Engine', blurb: 'Saves points and weight for weapons.', price: 100, points: 4, weight: 8, power: 84 },
  medium: { name: 'Medium Engine', blurb: 'Reliable.', price: 0, points: 8, weight: 12, power: 100 },
  large: { name: 'Large Engine', blurb: 'More speed, more bulk.', price: 500, points: 14, weight: 18, power: 132 },
  turbo: { name: 'Turbo V8', blurb: 'Enormous, and enormously quick.', price: 1000, points: 22, weight: 26, power: 172 },
};

export const POWER_SOURCES: Record<PowerId, PowerDef> = {
  alkaline: { name: 'Alkaline Battery', blurb: 'Holds little and recharges slowly, but restarts quickly when it runs flat. The battery runs your weapon and boost.', price: 0, points: 2, weight: 4, regen: 1, capacity: 1, restart: 0.08 },
  lithium: { name: 'Lithium Pack', blurb: 'Light, and holds a third more.', price: 300, points: 10, weight: 3, regen: 1.15, capacity: 1.35 },
  fuelcell: { name: 'Fuel Cell', blurb: 'Recharges much faster.', price: 650, points: 13, weight: 8, regen: 1.6, capacity: 1.2 },
  reactor: { name: 'Micro Reactor', blurb: 'Heavy, but rarely runs dry.', price: 1200, points: 20, weight: 16, regen: 2.1, capacity: 1.5 },
};

/**
 * Armour is a bar of its own on top of health. Each hit wears it away before reaching health, though
 * some weapons punch part of the hit straight through. It wears at `wear` per point of damage, so it's
 * tougher than the same amount of health. It's dialled up or down in the workshop.
 */
export const ARMOUR = { min: 0, max: 150, step: 25, default: 50, pointsPerStep: 4, weightPerStep: 6, wear: 0.7 };

/** Everything that decides a robot's stats. Parts left out are the ones every robot starts with. */
export interface PartsChoice {
  chassis: ChassisId;
  melee: MeleeId;
  defense: DefenseId;
  wheels?: WheelsId;
  engine?: EngineId;
  power?: PowerId;
  armour?: number;
}

export function installedParts(l: PartsChoice): { wheels: WheelsId; engine: EngineId; power: PowerId; armour: number } {
  return { wheels: l.wheels ?? 'large4', engine: l.engine ?? 'medium', power: l.power ?? 'alkaline', armour: l.armour ?? ARMOUR.default };
}

export function pointsUsed(l: PartsChoice): number {
  const p = installedParts(l);
  return CHASSIS[l.chassis].points + WHEELS[p.wheels].points + ENGINES[p.engine].points + POWER_SOURCES[p.power].points
    + MELEE[l.melee].points + DEFENSES[l.defense].points + (p.armour / ARMOUR.step) * ARMOUR.pointsPerStep;
}

/** What's bolted onto the chassis, which its payload has to carry. */
export function payloadUsed(l: PartsChoice): number {
  const p = installedParts(l);
  return WHEELS[p.wheels].weight + ENGINES[p.engine].weight + POWER_SOURCES[p.power].weight
    + MELEE[l.melee].weight + DEFENSES[l.defense].weight + (p.armour / ARMOUR.step) * ARMOUR.weightPerStep;
}

/** Why a robot can't be built like this, or null if it can. */
export function buildProblem(l: PartsChoice): 'points' | 'weight' | null {
  if (payloadUsed(l) > CHASSIS[l.chassis].payload) return 'weight';
  return pointsUsed(l) > POINT_BUDGET ? 'points' : null;
}

/** Top speed and acceleration of a robot whose engine power matches its weight in kg. */
const SPEED_PER_POWER = 14;
const ACCEL_PER_POWER = 18;
/** The weight at which a robot's main weapon hits exactly as hard as its numbers say. */
const PUNCH_WEIGHT = 125;

export function buildStats(l: PartsChoice): { hp: number; armour: number; speed: number; accel: number; turn: number; mass: number; regen: number; capacity: number; restart: number; weight: number; punch: number } {
  const c = CHASSIS[l.chassis];
  const p = installedParts(l);
  const wheels = WHEELS[p.wheels];
  const engine = ENGINES[p.engine];
  const power = POWER_SOURCES[p.power];
  const weight = c.weight + payloadUsed(l);
  // Power against weight decides how a robot moves, so everything bolted on slows it down.
  const ratio = engine.power / weight;
  return {
    hp: c.hp,
    armour: p.armour,
    speed: SPEED_PER_POWER * ratio ** 0.7 * (wheels.speed ?? 1),
    accel: ACCEL_PER_POWER * ratio * (wheels.accel ?? 1),
    turn: c.turn * (wheels.turn ?? 1),
    mass: (weight / 100) * (wheels.mass ?? 1),
    regen: power.regen,
    capacity: power.capacity,
    restart: power.restart ?? BATTERY_RESTART,
    weight,
    // There's more robot behind each hit, so the slow ones hit harder and the quick ones less.
    punch: (weight / PUNCH_WEIGHT) ** 0.6,
  };
}

/**
 * Brings a robot within its limits: armour goes first, then anything that isn't one of the free
 * parts, starting with what matters least. A free Bruiser always fits, so this always ends up legal.
 */
export function fitToLimits<T extends PartsChoice>(l: T): T {
  let next: T = { ...l };
  while (buildProblem(next) && installedParts(next).armour > ARMOUR.min) next = { ...next, armour: installedParts(next).armour - ARMOUR.step };
  const swaps: Partial<PartsChoice>[] = [{ power: 'alkaline' }, { wheels: 'large4' }, { engine: 'medium' }, { defense: 'shield' }, { melee: 'chainsaw' }, { chassis: 'brawler' }];
  for (const swap of swaps) {
    if (!buildProblem(next)) break;
    next = { ...next, ...swap };
  }
  return next;
}

/**
 * Finishes a robot nobody designed, such as a rival: moves up to a chassis that can carry the weapon,
 * picks the rest within the limits, and spends what's left on armour. A low point limit makes an easier rival.
 */
export function fillBuild(base: Pick<PartsChoice, 'chassis' | 'melee' | 'defense'>, rng: () => number, maxPrice = Infinity, pointLimit = POINT_BUDGET): PartsChoice {
  const anyOf = <T extends string>(table: Record<T, { price: number }>): T => {
    const ids = (Object.keys(table) as T[]).filter((id) => table[id].price <= maxPrice);
    return ids[Math.floor(rng() * ids.length)];
  };
  const sizes = Object.keys(CHASSIS) as ChassisId[];
  let build: PartsChoice = { ...base, wheels: 'small4', engine: 'small', power: 'alkaline', armour: 0 };
  for (let i = sizes.indexOf(base.chassis); buildProblem(build) && i < sizes.length; i++) build = { ...build, chassis: sizes[i] };
  if (buildProblem(build)) build = fitToLimits({ ...build, wheels: 'large4', engine: 'medium' });
  const tryPart = (change: Partial<PartsChoice>) => {
    const next = { ...build, ...change };
    if (!buildProblem(next) && pointsUsed(next) <= pointLimit) build = next;
  };
  // A random order, or whichever came first would always get the points.
  const choices = [() => tryPart({ engine: anyOf(ENGINES) }), () => tryPart({ wheels: anyOf(WHEELS) }), () => tryPart({ power: anyOf(POWER_SOURCES) })];
  for (let i = choices.length; i > 0; i--) choices.splice(Math.floor(rng() * i), 1)[0]();
  for (let armour = ARMOUR.step; armour <= ARMOUR.max; armour += ARMOUR.step) tryPart({ armour });
  return build;
}

export type MeleeKind = 'held' | 'strike' | 'ram' | 'claw' | 'magnet' | 'spinner';

export interface MeleeDef {
  name: string;
  /** The family of combat robot weapon it belongs to, shown in the shop. */
  type: string;
  blurb: string;
  price: number;
  kind: MeleeKind;
  range: number;
  /** Half-angle of the hit cone, in radians. */
  arc: number;
  /** Damage per second for held weapons, per strike for the rest. For a spinner, at full speed. */
  damage: number;
  /** Seconds before it can be used again. The stronger the weapon, the longer. */
  cooldown: number;
  /** Before a strike lands. For a spinner, how long it takes to reach full speed. For a grabber, how long it can hold on. */
  windup: number;
  stun: number;
  knockback: number;
  /** Always on, with no key needed. */
  passive?: boolean;
  /** Seconds of slowdown applied to anything it touches. */
  slow?: number;
  /** Seconds the target spends in the air, unable to drive. */
  launch?: number;
  /** Hits land the target upside down, helpless until it rights itself. */
  flips?: boolean;
  /** A hammer-saw's blade: damage per second to whatever is under it while the key is held. */
  saw?: number;
  /** What it costs out of the robot's points. Stronger weapons cost more. */
  points: number;
  /** In kg. Bigger weapons need a bigger chassis, and slow the robot down. */
  weight: number;
  /** The share of each hit that goes straight through armour to health. */
  pierce?: number;
  /** Multiplies the battery it uses, which otherwise goes by how hard it hits. Zero for a weapon with no motor. */
  powerUse?: number;
  /** Anything it touches keeps burning for a moment. */
  burns?: boolean;
  /** Seconds to reload after a strike that hits nothing, if that's quicker than the full reload. */
  missReload?: number;
  /** A strike also jumps to the nearest other robot within this distance, at half damage. */
  chain?: number;
  /** Seconds a held weapon can run before it has to stop and cool down. */
  runTime?: number;
  /** Gun-style, so it sits on top of the tower rather than on the nose. Every robot has a tower. */
  onTower?: boolean;
}

const melee = (d: Partial<MeleeDef> & Pick<MeleeDef, 'name' | 'type' | 'blurb' | 'price' | 'kind' | 'points' | 'weight'>): MeleeDef => ({
  range: 0, arc: 0, damage: 0, cooldown: 0, windup: 0, stun: 0, knockback: 0, ...d,
});

// Spinners store energy: hold the key to spin up, and each hit spends most of it, throwing both
// robots apart. A hit at low speed is weak. That trade-off is how the real ones behave.
export const MELEE: Record<MeleeId, MeleeDef> = {
  chainsaw: melee({ name: 'Chainsaw', type: 'Chainsaw', blurb: 'Hold to shred. Long reach, steady damage, and it chews through armor slowly.', price: 0, points: 11, weight: 12, kind: 'held', range: 3.5, arc: 0.6, damage: 28 }),
  drill: melee({ name: 'Drill', type: 'Drill', blurb: 'Hold to bore straight through armor. Short, narrow, and it overheats.', price: 400, points: 15, weight: 16, kind: 'held', range: 2.6, arc: 0.42, damage: 46, cooldown: 1.5, runTime: 3.5, pierce: 0.6 }),
  dagger: melee({ name: 'Dagger', type: 'Spike', blurb: 'Always out, no key and no battery needed. Just drive into them.', price: 150, points: 6, weight: 6, kind: 'held', range: 2.3, arc: 0.7, damage: 22, passive: true, pierce: 0.2, powerUse: 0 }),
  rollingpin: melee({ name: 'Rolling Pin', type: 'Roller', blurb: 'A spinning drum that bogs down whatever it touches.', price: 350, points: 12, weight: 20, kind: 'held', range: 2.5, arc: 0.85, damage: 22, slow: 0.5 }),
  hammer: melee({ name: 'Sledgehammer', type: 'Hammer', blurb: 'A heavy swing that smashes through armor and stuns the target.', price: 800, points: 23, weight: 42, kind: 'strike', range: 3.0, arc: 0.8, damage: 42, cooldown: 2, windup: 0.18, stun: 0.35, knockback: 12, pierce: 0.5 }),
  axe: melee({ name: 'Power Axe', type: 'Axe', blurb: 'A light, lightning-fast chop you can keep repeating.', price: 350, points: 10, weight: 10, kind: 'strike', range: 2.7, arc: 0.6, damage: 15, cooldown: 0.65, windup: 0.08, knockback: 4, pierce: 0.25 }),
  ram: melee({ name: 'Spike Ram', type: 'Ram', blurb: 'More than doubles ram damage, which grows with your weight. Press to lunge.', price: 350, points: 12, weight: 18, kind: 'ram', cooldown: 0.9, knockback: 26 }),
  claw: melee({ name: 'Claw', type: 'Grappler', blurb: 'Grab a robot and carry it, into a saw or off a ledge.', price: 450, points: 18, weight: 24, kind: 'claw', range: 3.3, arc: 0.55, damage: 24, cooldown: 3.5, windup: 2.5, pierce: 0.3 }),
  magnet: melee({ name: 'Magnet', type: 'Magnet', blurb: 'Hold to drag robots toward you from far away.', price: 400, points: 10, weight: 34, kind: 'magnet', range: 15, arc: 0.9, damage: 46, knockback: 40, powerUse: 0.6 }),
  vertdisc: melee({ name: 'Vertical Disc', type: 'Vertical spinner', blurb: 'Hold to spin up, then land one brutal hit that throws them in the air.', price: 700, points: 24, weight: 34, kind: 'spinner', range: 3.1, arc: 0.35, damage: 50, cooldown: 1.4, windup: 0.75, stun: 0.2, knockback: 15, launch: 0.45, pierce: 0.25, powerUse: 0.6 }),
  vertbar: melee({ name: 'Vertical Bar', type: 'Vertical spinner', blurb: 'The biggest single hit in the game. Takes the longest to wind up, and needs a big chassis.', price: 850, points: 28, weight: 50, kind: 'spinner', range: 3.3, arc: 0.3, damage: 72, cooldown: 2, windup: 1, stun: 0.3, knockback: 18, launch: 0.55, pierce: 0.35, powerUse: 0.55 }),
  horizbar: melee({ name: 'Horizontal Bar', type: 'Horizontal spinner', blurb: 'A wide, heavy sweep that swats robots across the roof.', price: 800, points: 30, weight: 38, kind: 'spinner', range: 3.4, arc: 0.75, damage: 48, cooldown: 1.4, windup: 0.75, knockback: 14, powerUse: 0.7 }),
  undercutter: melee({ name: 'Undercutter', type: 'Horizontal spinner', blurb: 'A low blade that goes for the wheels, leaving them crawling.', price: 450, points: 18, weight: 20, kind: 'spinner', range: 2.9, arc: 0.8, damage: 28, cooldown: 0.9, windup: 0.45, knockback: 10, slow: 0.7, powerUse: 0.8 }),
  drum: melee({ name: 'Drum', type: 'Drum', blurb: 'Spins up fast and bites often, popping robots off the ground.', price: 500, points: 18, weight: 20, kind: 'spinner', range: 2.6, arc: 0.55, damage: 24, cooldown: 0.5, windup: 0.25, knockback: 8, launch: 0.3, pierce: 0.2, powerUse: 0.7 }),
  hammersaw: melee({ name: 'Hammer Saw', type: 'Hammer saw', blurb: 'Slams a spinning blade down, then keeps cutting while you hold.', price: 750, points: 20, weight: 34, kind: 'strike', range: 3.0, arc: 0.5, damage: 24, cooldown: 1.7, windup: 0.15, stun: 0.4, knockback: 5, saw: 18, pierce: 0.3 }),
  flipper: melee({ name: 'Pneumatic Flipper', type: 'Flipper', blurb: 'Hurls robots through the air, and they land upside down until they right themselves. Little damage, but deadly near an edge. Hungry for battery, though a miss reloads quickly.', price: 600, points: 8, weight: 36, kind: 'strike', range: 2.8, arc: 0.55, damage: 14, cooldown: 3.5, windup: 0.05, stun: 0.3, knockback: 12, launch: 0.55, flips: true, powerUse: 0.7, missReload: 1 }),
  crusher: melee({ name: 'Hydraulic Crusher', type: 'Crusher', blurb: 'Bites through armor and holds on. Enormous damage if you can catch them.', price: 900, points: 35, weight: 46, kind: 'claw', range: 2.9, arc: 0.45, damage: 60, cooldown: 4, windup: 1.6, pierce: 0.6 }),
  forks: melee({ name: 'Lifting Forks', type: 'Lifter', blurb: 'Scoop a robot up and drive it wherever you like. Almost no damage.', price: 300, points: 16, weight: 20, kind: 'claw', range: 3.1, arc: 0.6, damage: 16, cooldown: 2.5, windup: 3.5 }),
  flamethrower: melee({ name: 'Flamethrower', type: 'Flame', blurb: 'Hold for a cone of fire that goes around armor and keeps them burning. Longest reach of any weapon, but it drinks the battery.', price: 650, points: 24, weight: 16, kind: 'held', range: 7, arc: 0.42, damage: 24, burns: true, onTower: true, pierce: 0.5, powerUse: 1.5 }),
  tesla: melee({ name: 'Tesla Coil', type: 'Tesla', blurb: 'A forward bolt that ignores armor and stuns, then jumps to a second robot nearby. Light, but costly in points and battery.', price: 550, points: 16, weight: 12, kind: 'strike', range: 5, arc: 0.6, damage: 17, cooldown: 1.1, windup: 0.05, stun: 0.25, chain: 7, pierce: 1, powerUse: 0.85 }),
  spear: melee({ name: 'Pneumatic Spear', type: 'Spike', blurb: 'Fires a steel spike straight out and back. Long and narrow, it punches through armor and shoves hard.', price: 450, points: 11, weight: 14, kind: 'strike', range: 4.4, arc: 0.4, damage: 28, cooldown: 1.25, windup: 0.06, knockback: 20, onTower: true, pierce: 0.5 }),
};

/** How much a hit asks of the battery: its damage, and what it takes to throw and stun a robot too. */
export function hitPower(def: MeleeDef): number {
  return def.damage + def.knockback * 0.5 + (def.launch ?? 0) * 30 + def.stun * 30;
}

/** Share of a full basic battery spent per point of hit power. */
export const BATTERY_PER_POWER = 0.008;
/** A held weapon running with nothing to cut still uses this share of its full draw, so missing costs. */
export const IDLE_DRAW = 0.35;
/** A spinner at full speed uses this share of a full spin-up each second, to keep it there. */
export const SPIN_HOLD_DRAW = 0.15;
/** A battery that runs flat cuts out, and nothing that needs it works until it has recharged this far. */
export const BATTERY_RESTART = 0.15;

/** Battery used for each strike, each full spin-up, or each second a held weapon cuts. */
export function batteryCost(def: MeleeDef): number {
  return hitPower(def) * BATTERY_PER_POWER * (def.powerUse ?? 1);
}

/** Battery refilled per second, from 0 to 1. */
export const BATTERY_REGEN = 0.05;
/** Holding the boost key uses this much battery per second, for each 100 kg it has to shove along. */
export const BOOST_DRAIN = 0.1;
export const BOOST_SPEED = 1.45;
export const BOOST_ACCEL = 1.4;
/** A spinner holds back until it reaches this speed, so parking on a robot doesn't waste it on feeble hits. */
export const SPINNER_MIN_SPEED = 0.45;
/** How much speed a spinner keeps after a hit. */
export const SPINNER_KEPT_SPEED = 0.2;
/** Seconds a flipped robot spends upside down after it lands, before it rights itself. Shorter than the flipper's cooldown, so it can't be held down forever. */
export const FLIP_TIME = 2.5;
/** How hard a hit throws the spinner's own robot back, as a share of what the target takes. */
export const SPINNER_RECOIL = 0.35;

export interface DefenseDef {
  name: string;
  blurb: string;
  price: number;
  points: number;
  weight: number;
  /** Share of a full basic battery each use takes. */
  battery?: number;
  cooldown: number;
  duration: number;
  damage: number;
  radius: number;
  /** Works all the time, with no key needed. */
  passive?: boolean;
  /** Works on one side of the robot, always the one opposite the main weapon. The rest work all around. */
  mounted?: boolean;
}

const defense = (d: Partial<DefenseDef> & Pick<DefenseDef, 'name' | 'blurb' | 'price' | 'points' | 'weight'>): DefenseDef => ({
  cooldown: 0, duration: 0, damage: 0, radius: 0, ...d,
});

export const DEFENSES: Record<DefenseId, DefenseDef> = {
  shield: defense({ name: 'Force Field', blurb: 'Blocks 75% of damage for a moment.', price: 0, points: 6, weight: 4, battery: 0.1, cooldown: 7, duration: 2.5 }),
  mines: defense({ name: 'Land Mines', blurb: 'Drops a proximity mine. Three at a time.', price: 300, points: 8, weight: 8, cooldown: 5, duration: 45, damage: 35, radius: 3.5, mounted: true }),
  oil: defense({ name: 'Oil Spreader', blurb: 'Leaves a slippery patch for whoever is chasing you.', price: 350, points: 7, weight: 7, cooldown: 9, duration: 8, radius: 4.5, mounted: true }),
  glue: defense({ name: 'Glue Spreader', blurb: 'Leaves a sticky patch that slows robots to a crawl.', price: 350, points: 8, weight: 7, cooldown: 8, duration: 8, radius: 4, mounted: true }),
  nails: defense({ name: 'Nail Spreader', blurb: 'Scatters nails that hurt anything rolling over them.', price: 300, points: 8, weight: 6, cooldown: 8, duration: 9, damage: 8, radius: 3.8, mounted: true }),
  steelram: defense({ name: 'Steel Ram', blurb: 'A heavy plate. Halves damage from the side it covers, always on.', price: 550, points: 7, weight: 14, damage: 0.5, passive: true, mounted: true }),
  plow: defense({ name: 'Plow', blurb: 'Clears mines and nails, and takes a fifth off hits from the side it covers. Always on.', price: 250, points: 4, weight: 8, damage: 0.8, passive: true, mounted: true }),
  blades: defense({ name: 'Side Blades', blurb: 'Spin up blades that cut anything alongside you.', price: 500, points: 9, weight: 10, battery: 0.12, cooldown: 10, duration: 2.5, damage: 13, radius: 1.6 }),
  cutter: defense({ name: 'Cutter', blurb: 'One sweeping cut all around you that throws robots back.', price: 500, points: 10, weight: 10, battery: 0.12, cooldown: 8, damage: 17, radius: 4.2 }),
  teleport: defense({ name: 'Teleport', blurb: 'Jump a long way forward in an instant.', price: 800, points: 6, weight: 6, battery: 0.2, cooldown: 6, radius: 14 }),
  flash: defense({ name: 'Flash Bomb', blurb: 'Dazzles and slows pilots close by.', price: 450, points: 5, weight: 4, battery: 0.15, cooldown: 11, duration: 1.6, radius: 10 }),
  cloak: defense({ name: 'Cloaking Device', blurb: 'Vanish for a few seconds. Landing a hit breaks it.', price: 800, points: 12, weight: 6, battery: 0.2, cooldown: 14, duration: 5 }),
  emp: defense({ name: 'EMP', blurb: 'Stuns every robot around you.', price: 900, points: 15, weight: 10, battery: 0.25, cooldown: 14, duration: 1.2, radius: 9 }),
  minibot: defense({ name: 'Mini-Robot', blurb: 'Releases a small robot that hunts and explodes.', price: 750, points: 11, weight: 10, cooldown: 9, duration: 8, damage: 18, radius: 3.5, mounted: true }),
  remote: defense({ name: 'Remote Charges', blurb: 'Press to plant. Press again to set them all off.', price: 600, points: 9, weight: 8, cooldown: 1, duration: 60, damage: 46, radius: 5, mounted: true }),
  kamikaze: defense({ name: 'Kamikaze Bomb', blurb: 'Destroys you and everything close by. Last resort.', price: 500, points: 4, weight: 10, cooldown: 1, duration: 1.2, damage: 95, radius: 8 }),
};

export interface PowerupDef {
  name: string;
  /** For the small buttons in a match. */
  short: string;
  blurb: string;
  price: number;
}

/** In key order: 1 to 4 match the original's powerups, then 5 and 6. */
export const POWERUP_ORDER: PowerupId[] = ['rage', 'megashield', 'cloaking', 'xray', 'repair', 'battery'];

export const POWERUPS: Record<PowerupId, PowerupDef> = {
  rage: { name: 'Rage', short: 'Rage', blurb: '+75% damage for 6 s.', price: 120 },
  megashield: { name: 'Mega Shield', short: 'Mega', blurb: 'Blocks 90% of damage for 5 s.', price: 140 },
  cloaking: { name: 'Cloaking', short: 'Cloak', blurb: 'Invisible for 6 s, or until you land a hit.', price: 110 },
  xray: { name: 'X-Ray', short: 'X-Ray', blurb: 'See every robot through walls and cloaks for 10 s.', price: 70 },
  repair: { name: 'Repair Kit', short: 'Repair', blurb: 'Restores 40% of max health. Armor stays as it is.', price: 80 },
  battery: { name: 'Battery Pack', short: 'Battery', blurb: 'Refills your battery at once.', price: 60 },
};

export const POWERUP_CAP = 3;
/** How many kinds of powerup a robot can take into a match. */
export const POWERUP_SLOTS = 3;

/**
 * The powerups a robot takes into a match, in slot order. Saves always say which, so the fallback
 * is for robots nobody chose for, such as rivals: the first it has any of.
 */
export function fittedPowerups(loadout: { powerups: Record<PowerupId, number>; powerupSlots?: PowerupId[] }): PowerupId[] {
  const chosen = loadout.powerupSlots ?? POWERUP_ORDER.filter((id) => loadout.powerups[id] > 0);
  return [...new Set(chosen)].filter((id) => POWERUP_ORDER.includes(id)).slice(0, POWERUP_SLOTS);
}

/** What the robot can actually use in a match. The rest stays in the garage. */
export function carriedPowerups(loadout: { powerups: Record<PowerupId, number>; powerupSlots?: PowerupId[] }): Record<PowerupId, number> {
  const carried: Record<PowerupId, number> = { rage: 0, megashield: 0, cloaking: 0, xray: 0, repair: 0, battery: 0 };
  for (const id of fittedPowerups(loadout)) carried[id] = loadout.powerups[id];
  return carried;
}

export const REPAIR_FRACTION = 0.4;
export const RAGE_TIME = 6;
export const RAGE_MULT = 1.75;
export const MEGA_TIME = 5;
export const MEGA_ABSORB = 0.9;
export const CLOAK_TIME = 6;
export const XRAY_TIME = 10;
export const BURN_TIME = 1.5;
export const BURN_DPS = 6;

export interface UpgradeDef {
  name: string;
  blurb: string;
  costs: number[];
  /** Added to a multiplier of 1 per level. */
  perLevel: number;
}

/** The same robot with its upgrades left in the garage. They only count in Career, so points alone decide everything else. */
export function withoutUpgrades<T extends { upgrades: Record<UpgradeId, number> }>(loadout: T): T {
  return { ...loadout, upgrades: { armor: 0, engine: 0, weapons: 0 } };
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  armor: { name: 'Reinforced Hull', blurb: '+12% health per level', costs: [200, 400, 700, 1100, 1600], perLevel: 0.12 },
  engine: { name: 'Engine Tuning', blurb: '+5% speed and accel per level', costs: [200, 400, 700, 1100, 1600], perLevel: 0.05 },
  weapons: { name: 'Weapon Calibration', blurb: '+10% damage per level', costs: [250, 500, 850, 1300, 1900], perLevel: 0.1 },
};

export const REWARD = {
  kill: 100,
  /** For hurting a robot that someone else then finished off. */
  assist: 40,
  damage: 0.4,
  scrap: 25,
  repairPickup: 0.3,
  hillPerSecond: 3,
  placement: [300, 180, 100, 50, 25, 10, 5, 0],
  /** The least anyone earns for seeing a match through to the end. */
  minimum: 100,
  duel: [300, 50],
};

export type ModeId = 'duel' | 'ffa' | 'lms' | 'koth';

export const MODES: Record<ModeId, { name: string; blurb: string; duration: number }> = {
  duel: { name: 'Duel', blurb: 'One on one, one life. Wreck them or knock them off the roof.', duration: 180 },
  ffa: { name: 'Free-for-All', blurb: 'First to 8 kills, or the most when time runs out.', duration: 150 },
  lms: { name: 'Last Robot Standing', blurb: 'One life each. Outlast everyone.', duration: 180 },
  koth: { name: 'King of the Hill', blurb: 'Hold the zone to score, and share the points with anyone in there with you.', duration: 180 },
};

export const HILL_TARGET = 45;
/** With this many robots the zone is rarely empty, so the race is shorter. */
export const HILL_CROWD = 5;
export const HILL_TARGET_CROWD = 30;
/** Long enough to watch the loser come apart, and the screen go black, before the results appear. */
export const DUEL_OUTRO = 3;
/** Giving up has nothing to watch, so the results come sooner. */
export const FORFEIT_OUTRO = 1.5;
/** What someone knocked out of a match can do while it runs on without them. */
export const SPECTATE = {
  /** Money for each second they stay and watch. */
  payPerSecond: 3,
  /** Seconds before they can leave: this share of how long they lasted, within these limits. */
  leaveShare: 0.25,
  leaveMin: 10,
  leaveMax: 30,
  /** How fast the target marker moves. */
  markerSpeed: 26,
};

export function leaveWait(lastedSeconds: number): number {
  return Math.max(SPECTATE.leaveMin, Math.min(SPECTATE.leaveMax, lastedSeconds * SPECTATE.leaveShare));
}

/** The traps a spectator can set off. Each map dresses them up differently, in sim/arena.ts. */
export const TRAP = {
  /** Lands on the marker after a warning, so robots can get out of the way. */
  strike: { cooldown: 6, warning: 0.9, radius: 3.6, damage: 30, knockback: 22 },
  /** A slippery or sticky patch under the marker. */
  slick: { cooldown: 10, radius: 5, life: 8 },
  /** Drags every robot nearby toward the marker for a moment. */
  pull: { cooldown: 8, radius: 10, life: 2, force: 34 },
};

/** Seconds of 3, 2, 1 before a match starts. */
export const COUNTDOWN = 3;
/** The face-off a duel opens with, which runs before those 3, 2, 1. */
export const DUEL_INTRO = 3.4;
/** How long a destroyed robot tumbles before it blows. The rest of the respawn time is a fade to black. */
export const RAGDOLL_TIME = 1;

export const MATCH = {
  duration: MODES.ffa.duration,
  killTarget: 8,
  respawnTime: 3,
  spawnInvuln: 2,
  repairInterval: 20,
  ramMinSpeed: 5,
  ramCapSpeed: 22,
  ramDamage: 1.1,
  spikeRamMult: 2.2,
  ramCooldown: 0.5,
  shieldAbsorb: 0.75,
  /** Hitting a robot within this long of it dying earns an assist. */
  assistWindow: 6,
};

/** Being hit by several robots at once mustn't mean never moving again, so stuns soon after a stun are shorter. */
export const STUN_GUARD = { time: 1.5, share: 0.35 };
/** Splash loses a share of its damage for each robot past the first, so a crowd can't be wiped in one blast. */
export const CROWD_SPLASH = 0.25;

// --- Cosmetics. All free, and all validated by the server before other players see them. ---

function hslColor(h: number, sat: number, light: number): number {
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (channel(0) << 16) | (channel(8) << 8) | channel(4);
}

/** Text in a robot's color has to stay readable, so dark paint is lightened for names. */
export function legibleColor(color: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const brightness = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
  if (brightness >= 0.45) return color;
  const mix = 0.65;
  const lift = (c: number) => Math.round(c + (255 - c) * mix);
  return (lift(r) << 16) | (lift(g) << 8) | lift(b);
}

const PALETTE_COLUMNS = 20;

/** A grid like the original paintshop's: everyday colours and greys first, then every hue from light to dark. */
export const PAINT_COLORS: number[] = [
  0xff8a2a, 0xe0503a, 0xf2c037, 0x9be03a, 0x4fd18b, 0x35d0e6, 0x3a7fe0, 0xa066e0, 0xf25fd0, 0x7a4a2c,
  0xc9a27a, 0xffffff, 0xf4f1e8, 0xd8d8d8, 0xaaaaaa, 0x8a9096, 0x555555, 0x33363b, 0x1c1c1c, 0x000000,
  ...[0.84, 0.68, 0.5, 0.34, 0.2].flatMap((light) =>
    Array.from({ length: PALETTE_COLUMNS }, (_, i) => hslColor((i / PALETTE_COLUMNS) * 360, 0.85, light)),
  ),
];

export type PatternId = 'solid' | 'stripes' | 'hazard' | 'flames' | 'camo' | 'checker' | 'bolt' | 'rust';
export type BodyId = 'wedge' | 'slab' | 'turtle';

export const PATTERNS: Record<PatternId, string> = {
  solid: 'Solid', stripes: 'Racing Stripes', hazard: 'Hazard', flames: 'Flames',
  camo: 'Camo', checker: 'Checker', bolt: 'Lightning', rust: 'Rust Bucket',
};

/** Only how the robot looks. The rules never read this, so no shape has an advantage. */
export const BODIES: Record<BodyId, string> = { wedge: 'Wedge', slab: 'Slab', turtle: 'Turtle' };

export interface Paint {
  primary: number;
  secondary: number;
  pattern: PatternId;
  body: BodyId;
  /** What's been painted in the paintshop. See game/skin.ts. */
  skin?: string;
}

export const DEFAULT_PAINT: Paint = { primary: 0xff8a2a, secondary: 0x33363b, pattern: 'solid', body: 'wedge' };
