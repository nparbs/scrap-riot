import { ARENA_ORDER, type ArenaId } from '../sim/arena';
import {
  CHASSIS,
  DEFAULT_PAINT,
  DEFENSES,
  MELEE,
  PAINT_COLORS,
  PATTERNS,
  POWERUPS,
  POWERUP_CAP,
  TOPPERS,
  TURRETS,
  UPGRADES,
  type ChassisId,
  type DefenseId,
  type MeleeId,
  type ModeId,
  type Paint,
  type PatternId,
  type PowerupId,
  type TopperId,
  type TurretId,
  type UpgradeId,
} from '../sim/data';
import type { BotSetup, Loadout } from '../sim/match';
import { makeRng } from '../sim/rng';

// Bumped for the new arsenal. Old saves are not carried over, so everyone starts fresh.
const SAVE_KEY = 'scrap-riot.save.v2';

export type Slot = 'chassis' | 'melee' | 'turret' | 'defense';

export interface Save {
  name: string;
  money: number;
  matches: number;
  wins: number;
  owned: {
    chassis: ChassisId[];
    melee: MeleeId[];
    turret: TurretId[];
    defense: DefenseId[];
  };
  loadout: Loadout;
  practice: { arena: ArenaId; mode: ModeId };
}

export const CATALOG = { chassis: CHASSIS, melee: MELEE, turret: TURRETS, defense: DEFENSES };

export function newSave(): Save {
  return {
    name: 'Pilot',
    money: 250,
    matches: 0,
    wins: 0,
    owned: { chassis: ['brawler'], melee: ['chainsaw'], turret: ['minigun'], defense: ['shield'] },
    loadout: {
      chassis: 'brawler',
      melee: 'chainsaw',
      turret: 'minigun',
      defense: 'shield',
      powerups: { rage: 0, megashield: 0, cloaking: 0, xray: 0, repair: 1, turbo: 1 },
      upgrades: { armor: 0, engine: 0, weapons: 0 },
      paint: { ...DEFAULT_PAINT },
    },
    practice: { arena: 'pit', mode: 'ffa' },
  };
}

export function loadSave(storage: Pick<Storage, 'getItem'> | null): Save {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (raw) return { ...newSave(), ...(JSON.parse(raw) as Partial<Save>) };
  } catch {
    // Blocked storage or a corrupt save both just start a new game.
  }
  return newSave();
}

export function writeSave(storage: Pick<Storage, 'setItem'> | null, save: Save): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // The game stays playable without persistence.
  }
}

export function buyOrEquip(save: Save, slot: Slot, id: string): boolean {
  const owned = save.owned[slot] as string[];
  if (!owned.includes(id)) {
    const price = (CATALOG[slot] as Record<string, { price: number }>)[id].price;
    if (save.money < price) return false;
    save.money -= price;
    owned.push(id);
  }
  (save.loadout as unknown as Record<Slot, string>)[slot] = id;
  return true;
}

export function buyPowerup(save: Save, id: PowerupId): boolean {
  const price = POWERUPS[id].price;
  if (save.money < price || save.loadout.powerups[id] >= POWERUP_CAP) return false;
  save.money -= price;
  save.loadout.powerups[id]++;
  return true;
}

export function upgradeCost(save: Save, id: UpgradeId): number | null {
  return UPGRADES[id].costs[save.loadout.upgrades[id]] ?? null;
}

export function buyUpgrade(save: Save, id: UpgradeId): boolean {
  const cost = upgradeCost(save, id);
  if (cost === null || save.money < cost) return false;
  save.money -= cost;
  save.loadout.upgrades[id]++;
  return true;
}

/** Banks a finished match: pay out, and spend whatever powerups were used. */
export function applyResult(save: Save, payout: number, place: number, remaining: Record<PowerupId, number>): void {
  save.money += payout;
  save.matches++;
  if (place === 1) save.wins++;
  save.loadout.powerups = { ...remaining };
}

const RIVALS = [
  { name: 'Rustjaw', color: 0xe0503a },
  { name: 'Tin Tyrant', color: 0x3aa7e0 },
  { name: 'Grinder', color: 0xa066e0 },
  { name: 'Mama Volt', color: 0x4fd18b },
  { name: 'Sprocket', color: 0xe0c13a },
  { name: 'Dozer', color: 0xe07ab8 },
];

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)];
}

function rivalPaint(color: number, rng: () => number): Paint {
  return {
    primary: color,
    secondary: pick(PAINT_COLORS, rng),
    eye: pick(PAINT_COLORS, rng),
    pattern: pick(Object.keys(PATTERNS) as PatternId[], rng),
    topper: pick(Object.keys(TOPPERS) as TopperId[], rng),
  };
}

const keysOf = <T extends object>(table: T) => Object.keys(table) as (keyof T)[];

/** Rivals scale with how far the player has upgraded, so the money never trivialises the game. */
export function makeRivals(save: Save | null, count: number, seed: number): BotSetup[] {
  const rng = makeRng(seed);
  const up = save?.loadout.upgrades ?? { armor: 0, engine: 0, weapons: 0 };
  const invested = up.armor + up.engine + up.weapons;
  const level = Math.min(5, Math.floor(invested / 3));
  const veteran = (save?.wins ?? 0) >= 2 || level >= 1;
  // New players meet the simpler gear first, and the whole arsenal once they've found their feet.
  const affordable = <T extends object>(table: T) =>
    keysOf(table).filter((id) => veteran || (table[id] as { price: number }).price <= 600);
  return RIVALS.slice(0, count).map((rival) => {
    const loadout: Loadout = {
      chassis: pick(affordable(CHASSIS).length > 1 ? affordable(CHASSIS) : (['brawler', 'scout'] as ChassisId[]), rng),
      melee: pick(affordable(MELEE), rng),
      turret: pick(affordable(TURRETS), rng),
      defense: pick(affordable(DEFENSES), rng),
      powerups: { rage: level >= 2 ? 1 : 0, megashield: level >= 3 ? 1 : 0, cloaking: 0, xray: 0, repair: 1, turbo: 1 },
      upgrades: { armor: level, engine: level, weapons: level },
      paint: rivalPaint(rival.color, rng),
    };
    return { ...rival, loadout, isAI: true, skill: Math.min(0.95, 0.45 + level * 0.1 + rng() * 0.1) };
  });
}

export function randomArena(rng: () => number): ArenaId {
  return pick(ARENA_ORDER, rng);
}
