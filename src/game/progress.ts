import { ARENA_ORDER, isArenaId, type ArenaId } from '../sim/arena';
import {
  CHASSIS,
  DEFAULT_PAINT,
  ARMOUR,
  DEFENSES,
  ENGINES,
  MELEE,
  PAINT_COLORS,
  BODIES,
  PATTERNS,
  POWER_SOURCES,
  POWERUPS,
  POWERUP_CAP,
  POWERUP_ORDER,
  POWERUP_SLOTS,
  buildProblem,
  fillBuild,
  fittedPowerups,
  fitToLimits,
  POINT_BUDGET,
  UPGRADES,
  WHEELS,
  type ChassisId,
  type DefenseId,
  type EngineId,
  type MeleeId,
  type ModeId,
  type Paint,
  type PatternId,
  type PowerId,
  type PowerupId,
  type BodyId,
  type UpgradeId,
  type WheelsId,
  installedParts,
  type PartsChoice,
} from '../sim/data';
import type { BotSetup, Loadout } from '../sim/match';
import { makeRng } from '../sim/rng';

// Bumped when the shape of a save changes. Old saves are not carried over, so everyone starts fresh.
const SAVE_KEY = 'scrap-riot.save.v3';

export type Slot = 'chassis' | 'wheels' | 'engine' | 'power' | 'melee' | 'defense';

export interface Save {
  name: string;
  money: number;
  matches: number;
  wins: number;
  owned: {
    chassis: ChassisId[];
    wheels: WheelsId[];
    engine: EngineId[];
    power: PowerId[];
    melee: MeleeId[];
    defense: DefenseId[];
  };
  loadout: Loadout;
  practice: { arena: ArenaId; mode: ModeId };
}

export const CATALOG = { chassis: CHASSIS, wheels: WHEELS, engine: ENGINES, power: POWER_SOURCES, melee: MELEE, defense: DEFENSES };

const SELL_RATE = 0.5;
/** Enough to buy a couple of parts straight away. */
export const STARTING_MONEY = 1000;

export function newSave(): Save {
  return {
    name: 'Pilot',
    money: STARTING_MONEY,
    matches: 0,
    wins: 0,
    owned: { chassis: ['brawler'], wheels: ['large4'], engine: ['medium'], power: ['alkaline'], melee: ['chainsaw'], defense: ['shield'] },
    loadout: {
      chassis: 'brawler',
      wheels: 'large4',
      engine: 'medium',
      power: 'alkaline',
      armour: ARMOUR.default,
      melee: 'chainsaw',
      defense: 'shield',
      powerups: { rage: 0, megashield: 0, cloaking: 0, xray: 0, repair: 1, battery: 1 },
      powerupSlots: ['repair', 'battery'],
      upgrades: { armor: 0, engine: 0, weapons: 0 },
      paint: { ...DEFAULT_PAINT },
    },
    practice: { arena: 'skyscraper', mode: 'duel' },
  };
}

/** What each gun cost, for paying back saves from before guns were removed. Three of them live on as main weapons. */
const OLD_GUN_PRICES: Record<string, number> = {
  minigun: 0, rockets: 600, heavyrocket: 700, bunkerbuster: 1100, mortar: 750, grenade: 550, laser: 1000, discs: 500,
};
const OLD_GUN_WEAPONS: Record<string, MeleeId> = { flamethrower: 'flamethrower', arc: 'tesla', spear: 'spear' };

/** Guns came out of the game, so anyone who bought one gets the money back, or the weapon it became. */
export function retireGuns<T extends { money: number; owned: Save['owned']; loadout: Loadout }>(save: T): T {
  const owned = save.owned as Save['owned'] & { turret?: string[] };
  for (const id of owned.turret ?? []) {
    const weapon = OLD_GUN_WEAPONS[id];
    if (!weapon) save.money += OLD_GUN_PRICES[id] ?? 0;
    else if (!owned.melee.includes(weapon)) owned.melee.push(weapon);
  }
  delete owned.turret;
  delete (save.loadout as Loadout & { turret?: string }).turret;
  return save;
}

/** What was paid for parts that have since gone from the game. */
const OLD_PART_PRICES: Record<string, Record<string, number>> = {
  tower: { small: 100, medium: 0, large: 400 },
  melee: { shell: 1000, eggbeater: 500 },
};

/**
 * Towers became part of the chassis, and the Ring Spinner and Eggbeater went, so anyone who bought
 * one gets the money back. Points replaced room, so a robot that doesn't fit any more is cut down to fit.
 */
export function retireParts<T extends { money: number; owned: Save['owned']; loadout: Loadout }>(save: T): T {
  const owned = save.owned as unknown as Record<string, string[] | undefined>;
  for (const id of owned.tower ?? []) save.money += OLD_PART_PRICES.tower[id] ?? 0;
  delete owned.tower;
  delete (save.loadout as Loadout & { tower?: string }).tower;
  for (const id of save.owned.melee.filter((part) => part in OLD_PART_PRICES.melee)) {
    save.money += OLD_PART_PRICES.melee[id];
    save.owned.melee.splice(save.owned.melee.indexOf(id), 1);
  }
  if ((save.loadout.melee as string) in OLD_PART_PRICES.melee) save.loadout.melee = 'chainsaw';
  Object.assign(save.loadout, fitToLimits(save.loadout));
  return save;
}

/**
 * Every powerup gets a real count. Old saves can lack one that was added or renamed later, as the
 * Battery Pack was, and a count that's missing turns into NaN and then null once it's saved.
 * Saves from before there were slots start with the first powerups they have, and pick from there.
 */
export function tidyPowerups<T extends { loadout: Loadout; practice?: Save['practice'] }>(save: T): T {
  // The last map chosen may since have been replaced.
  if (save.practice && !isArenaId(save.practice.arena)) save.practice.arena = 'skyscraper';
  const counts = save.loadout.powerups as Partial<Record<PowerupId, unknown>>;
  for (const id of POWERUP_ORDER) {
    const count = counts[id];
    counts[id] = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.min(POWERUP_CAP, count)) : 0;
  }
  save.loadout.powerupSlots = fittedPowerups(save.loadout);
  return save;
}

export function loadSave(storage: Pick<Storage, 'getItem'> | null): Save {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (raw) return tidyPowerups(retireParts(retireGuns({ ...newSave(), ...(JSON.parse(raw) as Partial<Save>) })));
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

const priceOf = (slot: Slot, id: string) => (CATALOG[slot] as Record<string, { price: number }>)[id].price;

export interface PartPreview {
  slot: Slot;
  id: string;
}

/** The robot with this part changed. It gives up armour to stay within its limits, if that's enough. */
function withPart<T extends PartsChoice>(loadout: T, slot: Slot, id: string): T {
  const swapped: T = { ...loadout, [slot]: id };
  let next = swapped;
  let { armour } = installedParts(next);
  while (buildProblem(next) && armour > ARMOUR.min) {
    armour -= ARMOUR.step;
    next = { ...next, armour };
  }
  return buildProblem(next) ? swapped : next;
}

/** Why this part can't be fitted, or null if it can. */
export function partProblem(save: Save, slot: Slot, id: string): 'points' | 'weight' | null {
  return buildProblem(withPart(save.loadout, slot, id));
}

export function partFits(save: Save, slot: Slot, id: string): boolean {
  return partProblem(save, slot, id) === null;
}

/** The robot as it would be with this part, for trying one out without buying or fitting it. */
export function previewLoadout<T extends PartsChoice>(loadout: T, part: PartPreview | null): T {
  return part ? withPart(loadout, part.slot, part.id) : loadout;
}

const CHEAT_MONEY = 5000;
export const CHEAT_MAX = 16;

/** What each cheat code does, and what to tell the player. Null if there's no such code. */
export function applyCheat(save: Save, code: string): string | null {
  switch (code.trim().toLowerCase()) {
    case 'money':
      save.money += CHEAT_MONEY;
      return `+$${CHEAT_MONEY}`;
    case 'unlock':
      for (const slot of Object.keys(CATALOG) as Slot[]) (save.owned[slot] as string[]) = Object.keys(CATALOG[slot]);
      return 'Every part unlocked';
    default:
      return null;
  }
}

/** Buys the part if needed, then fits it. A part that's over the limits goes on the shelf until it isn't. */
export function buyOrEquip(save: Save, slot: Slot, id: string): boolean {
  const owned = save.owned[slot] as string[];
  const buying = !owned.includes(id);
  if (buying) {
    const price = priceOf(slot, id);
    if (save.money < price) return false;
    save.money -= price;
    owned.push(id);
  }
  if (!partFits(save, slot, id)) return buying;
  Object.assign(save.loadout, withPart(save.loadout, slot, id));
  return true;
}

export function sellPrice(slot: Slot, id: string): number {
  return Math.floor(priceOf(slot, id) * SELL_RATE);
}

/** Parts in use and the free ones every robot starts with can't be sold. */
export function canSell(save: Save, slot: Slot, id: string): boolean {
  return (save.owned[slot] as string[]).includes(id) && (save.loadout as unknown as Record<Slot, string>)[slot] !== id && priceOf(slot, id) > 0;
}

export function sellPart(save: Save, slot: Slot, id: string): boolean {
  if (!canSell(save, slot, id)) return false;
  save.money += sellPrice(slot, id);
  (save.owned[slot] as string[]).splice((save.owned[slot] as string[]).indexOf(id), 1);
  return true;
}

export function setArmour(save: Save, armour: number): boolean {
  if (!Number.isFinite(armour) || armour < ARMOUR.min || armour > ARMOUR.max || armour % ARMOUR.step !== 0) return false;
  if (buildProblem({ ...save.loadout, armour })) return false;
  save.loadout.armour = armour;
  return true;
}

export function buyPowerup(save: Save, id: PowerupId): boolean {
  const price = POWERUPS[id].price;
  if (save.money < price || save.loadout.powerups[id] >= POWERUP_CAP) return false;
  // Worked out first, because a robot with no choice saved goes by what it has.
  const slots = fittedPowerups(save.loadout);
  save.money -= price;
  save.loadout.powerups[id]++;
  // Buying one for a robot with a free slot means wanting to use it.
  if (!slots.includes(id) && slots.length < POWERUP_SLOTS) slots.push(id);
  save.loadout.powerupSlots = slots;
  return true;
}

/** Selects or drops a powerup for the next match. False if every slot is taken. */
export function togglePowerupSlot(save: Save, id: PowerupId): boolean {
  const slots = fittedPowerups(save.loadout);
  const at = slots.indexOf(id);
  if (at >= 0) slots.splice(at, 1);
  else if (slots.length >= POWERUP_SLOTS) return false;
  else slots.push(id);
  save.loadout.powerupSlots = slots;
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
  // Only what went into the match can have been used. The rest stays in the garage.
  for (const id of fittedPowerups(save.loadout)) save.loadout.powerups[id] = remaining[id];
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
    pattern: pick(Object.keys(PATTERNS) as PatternId[], rng),
    body: pick(Object.keys(BODIES) as BodyId[], rng),
  };
}

const keysOf = <T extends object>(table: T) => Object.keys(table) as (keyof T)[];

const WINS_PER_RIVAL_LEVEL = 6;

/** A starter robot uses about 64 points, so the first rivals aren't far past that, and later ones use all they have. */
export function rivalPoints(level: number): number {
  return Math.min(POINT_BUDGET, 64 + level * 9);
}

/** Rivals get better with the player's wins, and in Career with the upgrades they're given to match the fight. */
export function makeRivals(
  save: { wins: number; loadout: { upgrades: Record<UpgradeId, number> } } | null,
  count: number,
  seed: number,
): BotSetup[] {
  const rng = makeRng(seed);
  const up = save?.loadout.upgrades ?? { armor: 0, engine: 0, weapons: 0 };
  const invested = up.armor + up.engine + up.weapons;
  const upgraded = Math.min(5, Math.floor(invested / 3));
  const level = Math.max(upgraded, Math.min(5, Math.floor((save?.wins ?? 0) / WINS_PER_RIVAL_LEVEL)));
  const veteran = (save?.wins ?? 0) >= 2 || level >= 1;
  // New players meet the simpler gear first, and the whole arsenal once they've found their feet.
  const affordable = <T extends object>(table: T) =>
    keysOf(table).filter((id) => veteran || (table[id] as { price: number }).price <= 600);
  return RIVALS.slice(0, count).map((rival) => {
    const loadout: Loadout = {
      ...fillBuild({
        chassis: pick(affordable(CHASSIS).length > 1 ? affordable(CHASSIS) : (['brawler', 'scout'] as ChassisId[]), rng),
        melee: pick(affordable(MELEE), rng),
        defense: pick(affordable(DEFENSES), rng),
      }, rng, veteran ? Infinity : 600, rivalPoints(level)),
      powerups: { rage: level >= 2 ? 1 : 0, megashield: level >= 3 ? 1 : 0, cloaking: 0, xray: 0, repair: 1, battery: 1 },
      upgrades: { armor: upgraded, engine: upgraded, weapons: upgraded },
      paint: rivalPaint(rival.color, rng),
    };
    return { ...rival, loadout, isAI: true, skill: Math.min(0.95, 0.45 + level * 0.1 + rng() * 0.1) };
  });
}

export function randomArena(rng: () => number): ArenaId {
  return pick(ARENA_ORDER, rng);
}
