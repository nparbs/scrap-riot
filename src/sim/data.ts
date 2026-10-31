// All balance numbers live here. Nothing in this folder may import three.js or touch the DOM.

export type ChassisId = 'scout' | 'ghost' | 'brawler' | 'rhino' | 'juggernaut';
export type MeleeId = 'chainsaw' | 'drill' | 'dagger' | 'rollingpin' | 'hammer' | 'axe' | 'ram' | 'claw' | 'magnet';
export type TurretId =
  | 'minigun' | 'rockets' | 'guided' | 'seeker' | 'mortar' | 'grenade'
  | 'flamethrower' | 'laser' | 'discs' | 'spear' | 'arc';
export type DefenseId =
  | 'shield' | 'mines' | 'oil' | 'glue' | 'nails' | 'steelram' | 'plow' | 'blades' | 'cutter'
  | 'teleport' | 'flash' | 'regen' | 'cloak' | 'emp' | 'minibot' | 'remote' | 'kamikaze';
export type TowerId = 'small' | 'medium' | 'large';
export type WheelsId = 'small4' | 'large4' | 'six' | 'tracks';
export type EngineId = 'small' | 'medium' | 'large' | 'turbo';
export type PowerId = 'alkaline' | 'lithium' | 'fuelcell' | 'reactor';
export type PowerupId = 'rage' | 'megashield' | 'cloaking' | 'xray' | 'repair' | 'turbo';
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
  /** How fast the turret swings round. */
  track?: number;
  /** How fast the battery recharges. */
  regen?: number;
}

export const TOWERS: Record<TowerId, PartDef> = {
  small: { name: 'Small Tower', blurb: 'Light, but the turret swings round slowly.', price: 100, space: 5, track: 0.8 },
  medium: { name: 'Medium Tower', blurb: 'Does the job.', price: 0, space: 8 },
  large: { name: 'Large Tower', blurb: 'Keeps the turret on a target that is circling you.', price: 400, space: 12, track: 1.35 },
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
  alkaline: { name: 'Alkaline Battery', blurb: 'Recharges your turret slowly.', price: 0, space: 4 },
  lithium: { name: 'Lithium Pack', blurb: 'Recharges 40% faster.', price: 300, space: 7, regen: 1.4 },
  fuelcell: { name: 'Fuel Cell', blurb: 'Recharges 90% faster.', price: 650, space: 10, regen: 1.9 },
  reactor: { name: 'Micro Reactor', blurb: 'Keeps almost any turret firing.', price: 1200, space: 15, regen: 2.5 },
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
  return CHASSIS[l.chassis].space;
}

export function buildStats(l: PartsChoice): { hp: number; speed: number; accel: number; turn: number; mass: number; track: number; regen: number } {
  const c = CHASSIS[l.chassis];
  const p = installedParts(l);
  const wheels = WHEELS[p.wheels];
  const engine = ENGINES[p.engine];
  const extra = p.armour - ARMOUR.default;
  return {
    hp: c.hp * (1 + extra * ARMOUR.hpPerPoint),
    speed: c.speed * (wheels.speed ?? 1) * (engine.speed ?? 1) * (1 - extra * ARMOUR.speedPerPoint),
    accel: c.accel * (wheels.accel ?? 1) * (engine.accel ?? 1),
    turn: c.turn * (wheels.turn ?? 1),
    mass: c.mass * (wheels.mass ?? 1) * (1 + extra * ARMOUR.massPerPoint),
    track: TOWERS[p.tower].track ?? 1,
    regen: POWER_SOURCES[p.power].regen ?? 1,
  };
}

export type MeleeKind = 'held' | 'strike' | 'ram' | 'claw' | 'magnet';

export interface MeleeDef {
  name: string;
  blurb: string;
  price: number;
  kind: MeleeKind;
  range: number;
  /** Half-angle of the hit cone, in radians. */
  arc: number;
  /** Damage per second for held weapons, per strike for the rest. */
  damage: number;
  cooldown: number;
  windup: number;
  stun: number;
  knockback: number;
  /** Always on, with no key needed. */
  passive?: boolean;
  /** Seconds of slowdown applied to anything it touches. */
  slow?: number;
}

const melee = (d: Partial<MeleeDef> & Pick<MeleeDef, 'name' | 'blurb' | 'price' | 'kind'>): MeleeDef => ({
  range: 0, arc: 0, damage: 0, cooldown: 0, windup: 0, stun: 0, knockback: 0, ...d,
});

export const MELEE: Record<MeleeId, MeleeDef> = {
  chainsaw: melee({ name: 'Chainsaw', blurb: 'Hold to shred. Long reach, steady damage.', price: 0, kind: 'held', range: 3.5, arc: 0.6, damage: 30 }),
  drill: melee({ name: 'Drill', blurb: 'Hold to bore in. Hits harder than a saw, but short and narrow.', price: 300, kind: 'held', range: 2.6, arc: 0.35, damage: 42 }),
  dagger: melee({ name: 'Dagger', blurb: 'Always out, no key needed. Just drive into them.', price: 150, kind: 'held', range: 2.3, arc: 0.7, damage: 22, passive: true }),
  rollingpin: melee({ name: 'Rolling Pin', blurb: 'A spinning drum that bogs down whatever it touches.', price: 350, kind: 'held', range: 2.5, arc: 0.85, damage: 28, slow: 0.5 }),
  hammer: melee({ name: 'Sledgehammer', blurb: 'Slow swing, huge hit, stuns the target.', price: 400, kind: 'strike', range: 3.0, arc: 0.8, damage: 34, cooldown: 1.5, windup: 0.35, stun: 0.6, knockback: 16 }),
  axe: melee({ name: 'Power Axe', blurb: 'A quick overhead chop you can keep repeating.', price: 450, kind: 'strike', range: 2.7, arc: 0.6, damage: 17, cooldown: 0.75, windup: 0.16, knockback: 7 }),
  ram: melee({ name: 'Spike Ram', blurb: '+40% ram damage. Press to lunge.', price: 350, kind: 'ram', cooldown: 3, knockback: 24 }),
  claw: melee({ name: 'Claw', blurb: 'Grab a robot and carry it, into a saw or off a ledge.', price: 650, kind: 'claw', range: 3.3, arc: 0.55, damage: 14, cooldown: 5, windup: 2.5 }),
  magnet: melee({ name: 'Magnet', blurb: 'Hold to drag robots toward you from far away.', price: 600, kind: 'magnet', range: 15, arc: 0.7, damage: 6, knockback: 34 }),
};

export type TurretKind = 'shot' | 'homing' | 'lob' | 'grenade' | 'flame' | 'beam' | 'disc' | 'arc';

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
  trackRate: number;
  /** Fraction of a full magazine used per shot, or per second for the flamethrower. */
  ammo: number;
  /** How sharply missiles turn, in radians per second. */
  homing?: number;
  /** Half-angle of the flame cone. */
  cone?: number;
  knockback?: number;
  bounces?: number;
}

export const TURRETS: Record<TurretId, TurretDef> = {
  minigun: { name: 'Chaingun', blurb: 'Constant chip damage at range.', price: 0, kind: 'shot', damage: 2, cooldown: 0.16, range: 24, projectileSpeed: 48, splash: 0, trackRate: 3.5, ammo: 0.025 },
  rockets: { name: 'Missile Pod', blurb: 'Fast, straight missiles with a big splash.', price: 600, kind: 'shot', damage: 25, cooldown: 1.5, range: 30, projectileSpeed: 30, splash: 4.2, trackRate: 2.2, ammo: 0.2 },
  guided: { name: 'Guided Missile', blurb: 'Slow, but steers itself toward the target.', price: 700, kind: 'homing', damage: 32, cooldown: 1.7, range: 34, projectileSpeed: 20, splash: 3, trackRate: 2.5, ammo: 0.25, homing: 2.2 },
  seeker: { name: 'Heat Seeker', blurb: 'Tight-turning missile. Hard to shake, slow to reload.', price: 1100, kind: 'homing', damage: 42, cooldown: 2.2, range: 36, projectileSpeed: 25, splash: 3.4, trackRate: 3, ammo: 0.33, homing: 3.8 },
  mortar: { name: 'Mortar', blurb: 'Lobs shells over cover. Hits hard if they stand still.', price: 750, kind: 'lob', damage: 46, cooldown: 2, range: 30, projectileSpeed: 0, splash: 5.5, trackRate: 2, ammo: 0.3 },
  grenade: { name: 'Grenade Launcher', blurb: 'Bouncing grenades on a short fuse.', price: 550, kind: 'grenade', damage: 13, cooldown: 1.4, range: 20, projectileSpeed: 18, splash: 3.6, trackRate: 2.8, ammo: 0.15, bounces: 3 },
  flamethrower: { name: 'Flamethrower', blurb: 'Hold for a short-range cone that sets robots burning.', price: 650, kind: 'flame', damage: 24, cooldown: 0, range: 9, projectileSpeed: 0, splash: 0, trackRate: 3.2, ammo: 0.3, cone: 0.4 },
  laser: { name: 'Laser Cannon', blurb: 'Instant long-range beam. Blocked by cover.', price: 1000, kind: 'beam', damage: 25, cooldown: 1.4, range: 36, projectileSpeed: 0, splash: 0, trackRate: 3, ammo: 0.2 },
  discs: { name: 'Razor Discs', blurb: 'Ricochet off walls. Can come back and hit you.', price: 500, kind: 'disc', damage: 17, cooldown: 0.9, range: 34, projectileSpeed: 28, splash: 0, trackRate: 3, ammo: 0.12, bounces: 3 },
  spear: { name: 'Spear Gun', blurb: 'One heavy bolt that shoves the target back.', price: 550, kind: 'shot', damage: 19, cooldown: 1.7, range: 32, projectileSpeed: 46, splash: 0, trackRate: 2.8, ammo: 0.2, knockback: 20 },
  arc: { name: 'Arc Coil', blurb: 'Never misses, and jumps to a second target.', price: 800, kind: 'arc', damage: 9, cooldown: 0.8, range: 15, projectileSpeed: 0, splash: 0, trackRate: 4.5, ammo: 0.1 },
};

/** Magazine refilled per second. Ammo runs from 0 to 1. */
export const AMMO_REGEN = 0.08;

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
  flash: defense({ name: 'Flash Bomb', blurb: 'Blinds nearby robots, throwing off their aim.', price: 450, cooldown: 10, duration: 2.5, radius: 11 }),
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
export const POWERUP_ORDER: PowerupId[] = ['rage', 'megashield', 'cloaking', 'xray', 'repair', 'turbo'];

export const POWERUPS: Record<PowerupId, PowerupDef> = {
  rage: { name: 'Rage', blurb: '+75% damage for 6 s.', price: 120 },
  megashield: { name: 'Mega Shield', blurb: 'Blocks 90% of damage for 5 s.', price: 140 },
  cloaking: { name: 'Cloaking', blurb: 'Invisible for 6 s, or until you fire.', price: 110 },
  xray: { name: 'X-Ray', blurb: 'See every robot through walls and cloaks for 10 s.', price: 70 },
  repair: { name: 'Repair Kit', blurb: 'Restores 40% of max HP.', price: 80 },
  turbo: { name: 'Turbo', blurb: '+60% top speed for 4 s.', price: 60 },
};

export const POWERUP_CAP = 3;
export const REPAIR_FRACTION = 0.4;
export const TURBO_TIME = 4;
export const TURBO_MULT = 1.6;
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
/** Shorter duels pay no bonus, so two accounts can't farm money by surrendering to each other. */
export const DUEL_MIN_PAID_TIME = 30;

export const MATCH = {
  duration: MODES.ffa.duration,
  killTarget: 12,
  respawnTime: 3,
  spawnInvuln: 2,
  repairInterval: 20,
  ramMinSpeed: 5,
  ramCapSpeed: 22,
  ramDamage: 1.1,
  spikeRamMult: 1.4,
  ramCooldown: 0.5,
  shieldAbsorb: 0.75,
};

// --- Cosmetics. All free, and all validated by the server before other players see them. ---

export const PAINT_COLORS = [
  0xff8a2a, 0xe0503a, 0xf2c037, 0x9be03a, 0x4fd18b, 0x35d0e6,
  0x3a7fe0, 0xa066e0, 0xf25fd0, 0xf4f1e8, 0x8a9096, 0x33363b,
];

export type PatternId = 'solid' | 'stripes' | 'hazard' | 'flames' | 'camo' | 'checker' | 'bolt' | 'rust';
export type TopperId = 'none' | 'antenna' | 'horns' | 'siren' | 'spoiler' | 'crest' | 'crown' | 'flag';

export const PATTERNS: Record<PatternId, string> = {
  solid: 'Solid', stripes: 'Racing Stripes', hazard: 'Hazard', flames: 'Flames',
  camo: 'Camo', checker: 'Checker', bolt: 'Lightning', rust: 'Rust Bucket',
};

export const TOPPERS: Record<TopperId, string> = {
  none: 'None', antenna: 'Antenna', horns: 'Horns', siren: 'Siren',
  spoiler: 'Spoiler', crest: 'Crest', crown: 'Crown', flag: 'Flag',
};

export interface Paint {
  primary: number;
  secondary: number;
  eye: number;
  pattern: PatternId;
  topper: TopperId;
}

export const DEFAULT_PAINT: Paint = { primary: 0xff8a2a, secondary: 0x33363b, eye: 0x35d0e6, pattern: 'solid', topper: 'none' };
