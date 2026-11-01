// All balance numbers live here. Nothing in this folder may import three.js or touch the DOM.

export type ChassisId = 'scout' | 'ghost' | 'brawler' | 'rhino' | 'juggernaut';
export type MeleeId =
  | 'chainsaw' | 'drill' | 'dagger' | 'rollingpin' | 'hammer' | 'axe' | 'ram' | 'claw' | 'magnet'
  | 'vertdisc' | 'vertbar' | 'horizbar' | 'undercutter' | 'drum' | 'eggbeater' | 'shell' | 'hammersaw' | 'flipper' | 'crusher' | 'forks';
export type TurretId =
  | 'minigun' | 'rockets' | 'heavyrocket' | 'bunkerbuster' | 'mortar' | 'grenade'
  | 'flamethrower' | 'laser' | 'discs' | 'spear' | 'arc';
export type DefenseId =
  | 'shield' | 'mines' | 'oil' | 'glue' | 'nails' | 'steelram' | 'plow' | 'blades' | 'cutter'
  | 'teleport' | 'flash' | 'regen' | 'cloak' | 'emp' | 'minibot' | 'remote' | 'kamikaze';
export type TowerId = 'small' | 'medium' | 'large';
export type WheelsId = 'small4' | 'large4' | 'six' | 'tracks';
export type EngineId = 'small' | 'medium' | 'large' | 'turbo';
export type PowerId = 'alkaline' | 'lithium' | 'fuelcell' | 'reactor';
export type PowerupId = 'rage' | 'megashield' | 'cloaking' | 'xray' | 'repair' | 'battery';
export type UpgradeId = 'armor' | 'engine' | 'weapons';

export interface ChassisDef {
  name: string;
  blurb: string;
  price: number;
  hp: number;
  speed: number;
  accel: number;
  turn: number;
  mass: number;
  radius: number;
  /** How much the parts bolted to this chassis can take up. */
  space: number;
}

export const CHASSIS: Record<ChassisId, ChassisDef> = {
  scout: { name: 'Whippet', blurb: 'Fast and twitchy. Folds if you stop moving.', price: 700, hp: 140, speed: 16, accel: 26, turn: 3.2, mass: 0.75, radius: 1.25, space: 70 },
  ghost: { name: 'Wraith', blurb: 'Quick, with more armor than it looks.', price: 950, hp: 155, speed: 14.5, accel: 22, turn: 2.9, mass: 0.9, radius: 1.3, space: 80 },
  brawler: { name: 'Bruiser', blurb: 'The honest all-rounder.', price: 0, hp: 175, speed: 12.5, accel: 18, turn: 2.6, mass: 1, radius: 1.45, space: 100 },
  rhino: { name: 'Rhino', blurb: 'Heavy nose, big shove. Hard to knock off a ledge.', price: 1200, hp: 205, speed: 11, accel: 14, turn: 2.2, mass: 1.3, radius: 1.6, space: 115 },
  juggernaut: { name: 'Anvil', blurb: 'A slow wall that hits like a truck.', price: 1500, hp: 235, speed: 9.5, accel: 11, turn: 1.9, mass: 1.6, radius: 1.75, space: 130 },
};

/** A part changes a stat by multiplying it, so anything left out stays as it was. */
export interface PartDef {
  name: string;
  blurb: string;
  price: number;
  space: number;
  speed?: number;
  accel?: number;
  turn?: number;
  mass?: number;
  /** Towers, as in the original, add armour. */
  hp?: number;
  /** Towers also add to the room the chassis provides. */
  room?: number;
  /** How fast the battery recharges. */
  regen?: number;
}

export const TOWERS: Record<TowerId, PartDef> = {
  small: { name: 'Small Tower', blurb: 'Light and low, with a little less armour.', price: 100, space: 5, hp: 0.92 },
  medium: { name: 'Medium Tower', blurb: 'Does the job.', price: 0, space: 8 },
  large: { name: 'Large Tower', blurb: 'More armour and more room for parts, but heavier.', price: 400, space: 12, hp: 1.15, room: 16, mass: 1.08 },
};

export const WHEELS: Record<WheelsId, PartDef> = {
  small4: { name: '4 Small Wheels', blurb: 'Turns on a coin, gives up some top speed.', price: 150, space: 5, speed: 0.92, accel: 1.05, turn: 1.15 },
  large4: { name: '4 Large Wheels', blurb: 'The sensible choice.', price: 0, space: 8 },
  six: { name: '6 Wheels', blurb: 'Better pull off the line and harder to shove.', price: 350, space: 11, speed: 0.97, accel: 1.12, mass: 1.1 },
  tracks: { name: 'Tank Tracks', blurb: 'Slow, and very hard to knock off a roof.', price: 600, space: 14, speed: 0.85, turn: 0.9, mass: 1.35 },
};

export const ENGINES: Record<EngineId, PartDef> = {
  small: { name: 'Small Engine', blurb: 'Saves room for weapons.', price: 100, space: 6, speed: 0.9, accel: 0.9 },
  medium: { name: 'Medium Engine', blurb: 'Reliable.', price: 0, space: 10 },
  large: { name: 'Large Engine', blurb: 'More speed, more bulk.', price: 500, space: 16, speed: 1.12, accel: 1.12 },
  turbo: { name: 'Turbo V8', blurb: 'Enormous, and enormously quick.', price: 1000, space: 22, speed: 1.22, accel: 1.3 },
};

export const POWER_SOURCES: Record<PowerId, PartDef> = {
  alkaline: { name: 'Alkaline Battery', blurb: 'Recharges slowly. The battery runs your gun and your boost.', price: 0, space: 4 },
  lithium: { name: 'Lithium Pack', blurb: 'Recharges 40% faster.', price: 300, space: 7, regen: 1.4 },
  fuelcell: { name: 'Fuel Cell', blurb: 'Recharges 90% faster.', price: 650, space: 10, regen: 1.9 },
  reactor: { name: 'Micro Reactor', blurb: 'Boost almost whenever you like.', price: 1200, space: 15, regen: 2.5 },
};

/** Armour is dialled up or down in the workshop. More of it is tougher, heavier and slower. */
export const ARMOUR = { min: 25, max: 150, step: 25, default: 75, spacePerPoint: 0.16, hpPerPoint: 0.006, speedPerPoint: 0.0008, massPerPoint: 0.002 };

/** Everything that decides a robot's stats. Parts left out are the ones every robot starts with. */
export interface PartsChoice {
  chassis: ChassisId;
  melee: MeleeId;
  turret: TurretId;
  defense: DefenseId;
  tower?: TowerId;
  wheels?: WheelsId;
  engine?: EngineId;
  power?: PowerId;
  armour?: number;
}

export function installedParts(l: PartsChoice): { tower: TowerId; wheels: WheelsId; engine: EngineId; power: PowerId; armour: number } {
  return { tower: l.tower ?? 'medium', wheels: l.wheels ?? 'large4', engine: l.engine ?? 'medium', power: l.power ?? 'alkaline', armour: l.armour ?? ARMOUR.default };
}

/** The better a weapon, the more room it takes. */
export function weaponSpace(price: number): number {
  return Math.round(6 + price / 75);
}

export function spaceUsed(l: PartsChoice): number {
  const p = installedParts(l);
  const parts = TOWERS[p.tower].space + WHEELS[p.wheels].space + ENGINES[p.engine].space + POWER_SOURCES[p.power].space;
  const weapons = weaponSpace(MELEE[l.melee].price) + weaponSpace(TURRETS[l.turret].price) + weaponSpace(DEFENSES[l.defense].price);
  return Math.round(parts + weapons + p.armour * ARMOUR.spacePerPoint);
}

export function spaceCapacity(l: PartsChoice): number {
  return CHASSIS[l.chassis].space + (TOWERS[installedParts(l).tower].room ?? 0);
}

export function buildStats(l: PartsChoice): { hp: number; speed: number; accel: number; turn: number; mass: number; regen: number } {
  const c = CHASSIS[l.chassis];
  const p = installedParts(l);
  const wheels = WHEELS[p.wheels];
  const engine = ENGINES[p.engine];
  const tower = TOWERS[p.tower];
  const weapon = MELEE[l.melee];
  const extra = p.armour - ARMOUR.default;
  return {
    hp: c.hp * (tower.hp ?? 1) * (1 + extra * ARMOUR.hpPerPoint),
    speed: c.speed * (wheels.speed ?? 1) * (engine.speed ?? 1) * (weapon.drive ?? 1) * (1 - extra * ARMOUR.speedPerPoint),
    accel: c.accel * (wheels.accel ?? 1) * (engine.accel ?? 1),
    turn: c.turn * (wheels.turn ?? 1),
    mass: c.mass * (wheels.mass ?? 1) * (tower.mass ?? 1) * (1 + extra * ARMOUR.massPerPoint),
    regen: POWER_SOURCES[p.power].regen ?? 1,
  };
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
  /** Fraction of the battery each strike uses. */
  battery?: number;
  /** Seconds a held weapon can run before it has to stop and cool down. */
  runTime?: number;
  /** Multiplies top speed. Spinning the whole body is hard on the drive. */
  drive?: number;
}

const melee = (d: Partial<MeleeDef> & Pick<MeleeDef, 'name' | 'type' | 'blurb' | 'price' | 'kind'>): MeleeDef => ({
  range: 0, arc: 0, damage: 0, cooldown: 0, windup: 0, stun: 0, knockback: 0, ...d,
});

// Spinners store energy: hold the key to spin up, and each hit spends most of it, throwing both
// robots apart. A hit at low speed is weak. That trade-off is how the real ones behave.
export const MELEE: Record<MeleeId, MeleeDef> = {
  chainsaw: melee({ name: 'Chainsaw', type: 'Chainsaw', blurb: 'Hold to shred. Long reach, steady damage.', price: 0, kind: 'held', range: 3.5, arc: 0.6, damage: 36 }),
  drill: melee({ name: 'Drill', type: 'Drill', blurb: 'Hold to bore in. Hits harder than a saw, but short, narrow, and it overheats.', price: 300, kind: 'held', range: 2.6, arc: 0.35, damage: 54, cooldown: 1.5, runTime: 3 }),
  dagger: melee({ name: 'Dagger', type: 'Spike', blurb: 'Always out, no key needed. Just drive into them.', price: 150, kind: 'held', range: 2.3, arc: 0.7, damage: 30, passive: true }),
  rollingpin: melee({ name: 'Rolling Pin', type: 'Roller', blurb: 'A spinning drum that bogs down whatever it touches.', price: 350, kind: 'held', range: 2.5, arc: 0.85, damage: 30, slow: 0.5 }),
  hammer: melee({ name: 'Sledgehammer', type: 'Hammer', blurb: 'A heavy swing that lands a huge hit on the top armour. Stuns the target.', price: 400, kind: 'strike', range: 3.0, arc: 0.8, damage: 40, cooldown: 1.6, windup: 0.18, stun: 0.6, knockback: 16 }),
  axe: melee({ name: 'Power Axe', type: 'Axe', blurb: 'A lightning-fast overhead chop you can keep repeating.', price: 450, kind: 'strike', range: 2.7, arc: 0.6, damage: 20, cooldown: 0.55, windup: 0.08, knockback: 7 }),
  ram: melee({ name: 'Spike Ram', type: 'Ram', blurb: 'More than doubles ram damage. Press to lunge.', price: 350, kind: 'ram', cooldown: 1.1, knockback: 26 }),
  claw: melee({ name: 'Claw', type: 'Grappler', blurb: 'Grab a robot and carry it, into a saw or off a ledge.', price: 650, kind: 'claw', range: 3.3, arc: 0.55, damage: 15, cooldown: 4, windup: 2.5 }),
  magnet: melee({ name: 'Magnet', type: 'Magnet', blurb: 'Hold to drag robots toward you from far away.', price: 600, kind: 'magnet', range: 15, arc: 0.7, damage: 34, knockback: 40 }),
  vertdisc: melee({ name: 'Vertical Disc', type: 'Vertical spinner', blurb: 'Hold to spin up, then land one brutal hit that throws them in the air.', price: 700, kind: 'spinner', range: 3.1, arc: 0.35, damage: 46, cooldown: 1.4, windup: 0.75, stun: 0.2, knockback: 15, launch: 0.45 }),
  vertbar: melee({ name: 'Vertical Bar', type: 'Vertical spinner', blurb: 'The biggest single hit in the game. Takes the longest to wind up.', price: 850, kind: 'spinner', range: 3.3, arc: 0.3, damage: 58, cooldown: 2, windup: 1, stun: 0.3, knockback: 18, launch: 0.55 }),
  horizbar: melee({ name: 'Horizontal Bar', type: 'Horizontal spinner', blurb: 'A wide sweep that swats robots across the roof.', price: 800, kind: 'spinner', range: 3.4, arc: 0.75, damage: 44, cooldown: 1.4, windup: 0.75, knockback: 20 }),
  undercutter: melee({ name: 'Undercutter', type: 'Horizontal spinner', blurb: 'A low blade that goes for the wheels, leaving them crawling.', price: 550, kind: 'spinner', range: 2.9, arc: 0.8, damage: 27, cooldown: 0.9, windup: 0.45, knockback: 14, slow: 1.5 }),
  drum: melee({ name: 'Drum', type: 'Drum', blurb: 'Spins up fast and bites often, popping robots off the ground.', price: 450, kind: 'spinner', range: 2.6, arc: 0.55, damage: 20, cooldown: 0.5, windup: 0.25, knockback: 8, launch: 0.3 }),
  eggbeater: melee({ name: 'Eggbeater', type: 'Eggbeater', blurb: 'A lighter, toothier drum. More hit, less spin.', price: 500, kind: 'spinner', range: 2.8, arc: 0.45, damage: 28, cooldown: 0.7, windup: 0.35, knockback: 10, launch: 0.35 }),
  shell: melee({ name: 'Ring Spinner', type: 'Full body spinner', blurb: 'Hits from every side, but it is slow to wind up and slows you down.', price: 1000, kind: 'spinner', range: 2.7, arc: Math.PI, damage: 36, cooldown: 2.2, windup: 1.2, knockback: 22, drive: 0.85 }),
  hammersaw: melee({ name: 'Hammer Saw', type: 'Hammer saw', blurb: 'Slams a spinning blade down, then keeps cutting while you hold.', price: 750, kind: 'strike', range: 3.0, arc: 0.5, damage: 20, cooldown: 2, windup: 0.15, stun: 0.4, knockback: 5, saw: 22 }),
  flipper: melee({ name: 'Pneumatic Flipper', type: 'Flipper', blurb: 'Hurls robots through the air, and they land upside down until they right themselves. Little damage, but deadly near an edge. Uses battery.', price: 800, kind: 'strike', range: 2.8, arc: 0.55, damage: 8, cooldown: 3.2, windup: 0.05, stun: 0.3, knockback: 15, launch: 0.55, flips: true, battery: 0.14 }),
  crusher: melee({ name: 'Hydraulic Crusher', type: 'Crusher', blurb: 'Bites down and holds on. Enormous damage if you can catch them.', price: 900, kind: 'claw', range: 2.9, arc: 0.45, damage: 58, cooldown: 4, windup: 1.6 }),
  forks: melee({ name: 'Lifting Forks', type: 'Lifter', blurb: 'Scoop a robot up and drive it wherever you like. Almost no damage.', price: 400, kind: 'claw', range: 3.1, arc: 0.6, damage: 6, cooldown: 2.5, windup: 3.5 }),
};

export type TurretKind = 'shot' | 'lob' | 'grenade' | 'flame' | 'beam' | 'disc' | 'arc';

export interface TurretDef {
  name: string;
  blurb: string;
  price: number;
  kind: TurretKind;
  /** Per shot, or per second for the flamethrower. */
  damage: number;
  cooldown: number;
  range: number;
  projectileSpeed: number;
  splash: number;
  /** Shots for each life, where a burst counts as one. Melee is meant to be the main event, so these are few. */
  shots: number;
  /** How many rounds one press fires, one after another. */
  burst?: number;
  /** Fraction of the battery used per shot, or per second for the flamethrower. */
  battery: number;
  /** Half-angle of the flame or arc. */
  cone?: number;
  knockback?: number;
  bounces?: number;
}

// Guns point straight ahead with the robot, as they did in the original. To aim, turn the robot.
export const TURRETS: Record<TurretId, TurretDef> = {
  minigun: { name: 'Chaingun', blurb: 'Each press fires a burst of 10 light rounds.', price: 0, kind: 'shot', damage: 2.5, cooldown: 1.4, range: 24, projectileSpeed: 64, splash: 0, shots: 6, battery: 0.08, burst: 10 },
  rockets: { name: 'Missile Pod', blurb: 'Fast, straight missiles with a big splash.', price: 600, kind: 'shot', damage: 25, cooldown: 1.7, range: 30, projectileSpeed: 42, splash: 4.2, shots: 4, battery: 0.14 },
  heavyrocket: { name: 'Heavy Rocket', blurb: 'A big, heavy round with a blast that is hard to dodge.', price: 700, kind: 'shot', damage: 32, cooldown: 2.2, range: 34, projectileSpeed: 30, splash: 5, shots: 3, battery: 0.18 },
  bunkerbuster: { name: 'Bunker Buster', blurb: 'A huge warhead. You only get two.', price: 1100, kind: 'shot', damage: 46, cooldown: 4, range: 36, projectileSpeed: 36, splash: 4.4, shots: 2, battery: 0.28 },
  mortar: { name: 'Mortar', blurb: 'Lobs a shell a fixed distance ahead, over any cover.', price: 750, kind: 'lob', damage: 46, cooldown: 2.2, range: 26, projectileSpeed: 0, splash: 5.5, shots: 3, battery: 0.2 },
  grenade: { name: 'Grenade Launcher', blurb: 'Bouncing grenades on a short fuse.', price: 550, kind: 'grenade', damage: 13, cooldown: 1.4, range: 20, projectileSpeed: 24, splash: 3.6, shots: 6, battery: 0.1 },
  flamethrower: { name: 'Flamethrower', blurb: 'Hold for a short-range cone that sets robots burning. Thirsty.', price: 650, kind: 'flame', damage: 24, cooldown: 0, range: 9, projectileSpeed: 0, splash: 0, shots: 0, battery: 0.22, cone: 0.4 },
  laser: { name: 'Laser Cannon', blurb: 'Instant long-range beam. Blocked by cover.', price: 1000, kind: 'beam', damage: 25, cooldown: 2, range: 36, projectileSpeed: 0, splash: 0, shots: 4, battery: 0.2 },
  discs: { name: 'Razor Discs', blurb: 'Ricochet off walls. Can come back and hit you.', price: 500, kind: 'disc', damage: 17, cooldown: 1.2, range: 34, projectileSpeed: 38, splash: 0, shots: 6, battery: 0.1, bounces: 3 },
  spear: { name: 'Spear Gun', blurb: 'One heavy bolt that shoves the target back.', price: 550, kind: 'shot', damage: 19, cooldown: 1.7, range: 32, projectileSpeed: 60, splash: 0, shots: 4, battery: 0.12, knockback: 20 },
  arc: { name: 'Arc Coil', blurb: 'Zaps whatever is close in front, jumping to a second robot.', price: 800, kind: 'arc', damage: 9, cooldown: 0.9, range: 15, projectileSpeed: 0, splash: 0, shots: 8, battery: 0.1, cone: 0.25 },
};

/** Battery refilled per second, from 0 to 1. */
export const BATTERY_REGEN = 0.03;
/** Holding the boost key uses this much battery per second. */
export const BOOST_DRAIN = 0.1;
export const BOOST_SPEED = 1.45;
export const BOOST_ACCEL = 1.4;
/** Seconds between rounds in a burst. */
export const BURST_GAP = 0.05;
/** A spinner below this speed glances off without doing anything. */
export const SPINNER_MIN_SPEED = 0.2;
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
  cooldown: number;
  duration: number;
  damage: number;
  radius: number;
  /** Works all the time, with no key needed. */
  passive?: boolean;
}

const defense = (d: Partial<DefenseDef> & Pick<DefenseDef, 'name' | 'blurb' | 'price'>): DefenseDef => ({
  cooldown: 0, duration: 0, damage: 0, radius: 0, ...d,
});

export const DEFENSES: Record<DefenseId, DefenseDef> = {
  shield: defense({ name: 'Force Field', blurb: 'Blocks 75% of damage for a moment.', price: 0, cooldown: 8, duration: 2.5 }),
  mines: defense({ name: 'Land Mines', blurb: 'Drops a proximity mine. Three at a time.', price: 300, cooldown: 5, duration: 45, damage: 35, radius: 3.5 }),
  oil: defense({ name: 'Oil Spreader', blurb: 'Leaves a slippery patch behind you.', price: 350, cooldown: 9, duration: 8, radius: 4.5 }),
  glue: defense({ name: 'Glue Spreader', blurb: 'Leaves a sticky patch that slows robots to a crawl.', price: 350, cooldown: 8, duration: 8, radius: 4 }),
  nails: defense({ name: 'Nail Spreader', blurb: 'Scatters nails that hurt anything rolling over them.', price: 300, cooldown: 8, duration: 9, damage: 12, radius: 3.8 }),
  steelram: defense({ name: 'Steel Ram', blurb: 'A front plate. Halves damage from ahead, always on.', price: 550, damage: 0.5, passive: true }),
  plow: defense({ name: 'Plow', blurb: 'Clears mines and nails, and throws discs back. Always on.', price: 250, passive: true }),
  blades: defense({ name: 'Side Blades', blurb: 'Spin up blades that cut anything alongside you.', price: 500, cooldown: 8, duration: 3, damage: 24, radius: 1.6 }),
  cutter: defense({ name: 'Cutter', blurb: 'One sweeping cut all around you that throws robots back.', price: 500, cooldown: 6, damage: 28, radius: 5 }),
  teleport: defense({ name: 'Teleport', blurb: 'Jump a long way forward in an instant.', price: 800, cooldown: 8, radius: 14 }),
  flash: defense({ name: 'Flash Bomb', blurb: 'Briefly dazzles pilots close by.', price: 450, cooldown: 14, duration: 1.2, radius: 8 }),
  regen: defense({ name: 'Armor Regenerator', blurb: 'Rebuilds armor over five seconds.', price: 700, cooldown: 12, duration: 5, damage: 11 }),
  cloak: defense({ name: 'Cloaking Device', blurb: 'Vanish for a few seconds. Firing breaks it.', price: 800, cooldown: 14, duration: 5 }),
  emp: defense({ name: 'EMP', blurb: 'Stuns every robot around you.', price: 900, cooldown: 14, duration: 1.5, radius: 9 }),
  minibot: defense({ name: 'Mini-Robot', blurb: 'Releases a small robot that hunts and explodes.', price: 750, cooldown: 9, duration: 8, damage: 22, radius: 3.5 }),
  remote: defense({ name: 'Remote Charges', blurb: 'Press to plant. Press again to set them all off.', price: 600, cooldown: 1, duration: 60, damage: 40, radius: 5 }),
  kamikaze: defense({ name: 'Kamikaze Bomb', blurb: 'Destroys you and everything close by. Last resort.', price: 500, cooldown: 1, duration: 1.2, damage: 95, radius: 8 }),
};

export interface PowerupDef {
  name: string;
  blurb: string;
  price: number;
}

/** In key order: 1 to 4 match the original's powerups, then 5 and 6. */
export const POWERUP_ORDER: PowerupId[] = ['rage', 'megashield', 'cloaking', 'xray', 'repair', 'battery'];

export const POWERUPS: Record<PowerupId, PowerupDef> = {
  rage: { name: 'Rage', blurb: '+75% damage for 6 s.', price: 120 },
  megashield: { name: 'Mega Shield', blurb: 'Blocks 90% of damage for 5 s.', price: 140 },
  cloaking: { name: 'Cloaking', blurb: 'Invisible for 6 s, or until you fire.', price: 110 },
  xray: { name: 'X-Ray', blurb: 'See every robot through walls and cloaks for 10 s.', price: 70 },
  repair: { name: 'Repair Kit', blurb: 'Restores 40% of max HP.', price: 80 },
  battery: { name: 'Battery Pack', blurb: 'Refills your battery at once.', price: 60 },
};

export const POWERUP_CAP = 3;
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

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  armor: { name: 'Armor Plating', blurb: '+12% max HP per level', costs: [200, 400, 700, 1100, 1600], perLevel: 0.12 },
  engine: { name: 'Engine Tuning', blurb: '+5% speed and accel per level', costs: [200, 400, 700, 1100, 1600], perLevel: 0.05 },
  weapons: { name: 'Weapon Calibration', blurb: '+10% damage per level', costs: [250, 500, 850, 1300, 1900], perLevel: 0.1 },
};

export const REWARD = {
  kill: 100,
  damage: 0.4,
  scrap: 25,
  repairPickup: 0.3,
  hillPerSecond: 3,
  placement: [300, 180, 100, 50, 25, 10],
  /** The least anyone earns for seeing a match through to the end. */
  minimum: 100,
  duel: [300, 50],
};

export type ModeId = 'duel' | 'ffa' | 'lms' | 'koth';

export const MODES: Record<ModeId, { name: string; blurb: string; duration: number }> = {
  duel: { name: 'Duel', blurb: 'One on one, one life. Wreck them or knock them off the roof.', duration: 180 },
  ffa: { name: 'Free-for-All', blurb: 'First to 12 kills, or the most when time runs out.', duration: 150 },
  lms: { name: 'Last Robot Standing', blurb: 'One life each. Outlast everyone.', duration: 180 },
  koth: { name: 'King of the Hill', blurb: 'Hold the zone alone to score. First to 45 seconds wins.', duration: 180 },
};

export const HILL_TARGET = 45;
/** Long enough to watch the loser fall before the results appear. */
export const DUEL_OUTRO = 1.5;
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

export const MATCH = {
  duration: MODES.ffa.duration,
  killTarget: 12,
  respawnTime: 3,
  spawnInvuln: 2,
  repairInterval: 20,
  ramMinSpeed: 5,
  ramCapSpeed: 22,
  ramDamage: 1.1,
  spikeRamMult: 2.4,
  ramCooldown: 0.5,
  shieldAbsorb: 0.75,
};

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
