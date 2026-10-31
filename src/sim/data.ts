// All balance numbers live here. Nothing in this folder may import three.js or touch the DOM.

export type ChassisId = 'scout' | 'brawler' | 'juggernaut';
export type MeleeId = 'chainsaw' | 'hammer' | 'ram';
export type TurretId = 'minigun' | 'rockets' | 'arc';
export type DefenseId = 'shield' | 'mines' | 'oil';
export type PowerupId = 'repair' | 'turbo' | 'overdrive' | 'emp';
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
}

export const CHASSIS: Record<ChassisId, ChassisDef> = {
  scout: { name: 'Whippet', blurb: 'Fast and twitchy. Folds if you stop moving.', price: 700, hp: 140, speed: 16, accel: 26, turn: 3.2, mass: 0.75, radius: 1.25 },
  brawler: { name: 'Bruiser', blurb: 'The honest all-rounder.', price: 0, hp: 175, speed: 12.5, accel: 18, turn: 2.6, mass: 1, radius: 1.45 },
  juggernaut: { name: 'Anvil', blurb: 'A slow wall that hits like a truck.', price: 1500, hp: 235, speed: 9.5, accel: 11, turn: 1.9, mass: 1.6, radius: 1.75 },
};

export interface MeleeDef {
  name: string;
  blurb: string;
  price: number;
  range: number;
  /** Half-angle of the hit cone, in radians. */
  arc: number;
  /** Damage per second for held weapons, per strike for the rest. */
  damage: number;
  cooldown: number;
  windup: number;
  stun: number;
  knockback: number;
}

export const MELEE: Record<MeleeId, MeleeDef> = {
  chainsaw: { name: 'Chainsaw', blurb: 'Hold to shred. Long reach, steady damage.', price: 0, range: 3.5, arc: 0.6, damage: 30, cooldown: 0, windup: 0, stun: 0, knockback: 0 },
  hammer: { name: 'Sledgehammer', blurb: 'Slow swing, huge hit, stuns the target.', price: 400, range: 3.0, arc: 0.8, damage: 34, cooldown: 1.5, windup: 0.35, stun: 0.6, knockback: 16 },
  ram: { name: 'Spike Ram', blurb: '+60% ram damage. Press to lunge.', price: 350, range: 0, arc: 0, damage: 0, cooldown: 3, windup: 0, stun: 0, knockback: 24 },
};

export interface TurretDef {
  name: string;
  blurb: string;
  price: number;
  damage: number;
  cooldown: number;
  range: number;
  projectileSpeed: number;
  splash: number;
  trackRate: number;
}

export const TURRETS: Record<TurretId, TurretDef> = {
  minigun: { name: 'Minigun', blurb: 'Constant chip damage at range.', price: 0, damage: 2, cooldown: 0.16, range: 24, projectileSpeed: 48, splash: 0, trackRate: 3.5 },
  rockets: { name: 'Rocket Pod', blurb: 'Slow rockets with a big splash.', price: 600, damage: 30, cooldown: 1.5, range: 30, projectileSpeed: 30, splash: 4.2, trackRate: 2.2 },
  arc: { name: 'Arc Coil', blurb: 'Never misses, and jumps to a second target.', price: 800, damage: 9, cooldown: 0.8, range: 15, projectileSpeed: 0, splash: 0, trackRate: 4.5 },
};

export interface DefenseDef {
  name: string;
  blurb: string;
  price: number;
  cooldown: number;
  duration: number;
  damage: number;
  radius: number;
}

export const DEFENSES: Record<DefenseId, DefenseDef> = {
  shield: { name: 'Energy Shield', blurb: 'Blocks 75% of damage for a moment.', price: 0, cooldown: 8, duration: 2.5, damage: 0, radius: 0 },
  mines: { name: 'Mine Layer', blurb: 'Drops a proximity mine. Three at a time.', price: 300, cooldown: 5, duration: 45, damage: 35, radius: 3.5 },
  oil: { name: 'Oil Slick', blurb: 'Leaves a slippery patch behind you.', price: 350, cooldown: 9, duration: 8, damage: 0, radius: 4.5 },
};

export interface PowerupDef {
  name: string;
  blurb: string;
  price: number;
}

export const POWERUP_ORDER: PowerupId[] = ['repair', 'turbo', 'overdrive', 'emp'];

export const POWERUPS: Record<PowerupId, PowerupDef> = {
  repair: { name: 'Repair Kit', blurb: 'Restores 40% of max HP.', price: 80 },
  turbo: { name: 'Turbo', blurb: '+60% top speed for 4 s.', price: 60 },
  overdrive: { name: 'Overdrive', blurb: '+75% damage for 6 s.', price: 120 },
  emp: { name: 'EMP Burst', blurb: 'Stuns nearby robots for 1.5 s.', price: 100 },
};

export const POWERUP_CAP = 3;
export const REPAIR_FRACTION = 0.4;
export const TURBO_TIME = 4;
export const TURBO_MULT = 1.6;
export const OVERDRIVE_TIME = 6;
export const OVERDRIVE_MULT = 1.75;
export const EMP_RADIUS = 9;
export const EMP_STUN = 1.5;

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
  placement: [300, 180, 100, 50, 25, 10],
};

export const MATCH = {
  duration: 150,
  killTarget: 12,
  respawnTime: 3,
  spawnInvuln: 2,
  repairInterval: 20,
  ramMinSpeed: 5,
  ramCapSpeed: 22,
  ramDamage: 1.1,
  spikeRamMult: 1.6,
  ramCooldown: 0.5,
  shieldAbsorb: 0.75,
};
