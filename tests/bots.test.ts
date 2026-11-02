import { describe, expect, it } from 'vitest';
import { newSave } from '../src/game/progress';
import { ARENAS } from '../src/sim/arena';
import { DEFENSES, MELEE, type DefenseId, type MeleeId } from '../src/sim/data';
import { Match, relativeBearing, type Bot, type BotSetup, type Loadout } from '../src/sim/match';
import { habitFor, HABIT_BOUNDS, plainHabit, plainTactics, TACTIC_BOUNDS, tacticsFor, trainedShare, type Habit, type Tactics } from '../src/sim/tactics';
import { TRAINED_HABITS, TRAINED_TACTICS } from '../src/sim/trained';

const MELEE_IDS = Object.keys(MELEE) as MeleeId[];

/** A bot and a robot that stands still, face to face on a clear stretch of the foundry. */
function faceOff(tactics: Partial<Tactics>, over: Partial<Loadout> = {}, gap = 3): { match: Match; bot: Bot; other: Bot } {
  const melee = over.melee ?? 'hammer';
  const hunter: BotSetup = { name: 'Bot', color: 0, isAI: true, skill: 1, loadout: { ...newSave().loadout, armour: 0, melee, ...over }, brain: { tactics: { ...plainTactics(melee), ...tactics } } };
  const still: BotSetup = { name: 'Still', color: 0, isAI: false, loadout: { ...newSave().loadout, armour: 0 } };
  const match = new Match([hunter, still], { seed: 1, arena: 'foundry', mode: 'ffa' });
  const [bot, other] = match.bots;
  bot.invulnT = other.invulnT = 0;
  bot.x = other.x = -20;
  bot.z = -5;
  bot.heading = 0;
  other.z = -5 + gap;
  other.heading = Math.PI;
  return { match, bot, other };
}

const run = (match: Match, frames: number) => {
  for (let i = 0; i < frames; i++) match.step();
};
const apart = (a: Bot, b: Bot) => Math.hypot(a.x - b.x, a.z - b.z);

describe('how a bot fights', () => {
  it('backs off with its weapon still facing the target while it reloads', () => {
    const { match, bot, other } = faceOff({ kiteReload: 0, kiteGap: 6, kiteSpeed: 0.5 });
    bot.meleeCd = MELEE.hammer.cooldown;
    run(match, 30);
    expect(bot.input.throttle).toBe(-1);
    expect(apart(bot, other)).toBeGreaterThan(3);
    expect(Math.abs(relativeBearing(bot.x, bot.z, bot.heading, other.x, other.z))).toBeLessThan(0.5);
  });

  it('comes back in once its weapon is ready', () => {
    const { match, bot, other } = faceOff({ kiteReload: 0.5, kiteGap: 6, kiteSpeed: 0.5 });
    bot.meleeCd = MELEE.hammer.cooldown;
    other.invulnT = 99;
    run(match, 30);
    const away = apart(bot, other);
    bot.input.melee = false;
    run(match, 150);
    expect(apart(bot, other)).toBeLessThan(away);
  });

  it('does not back off from something faster than it', () => {
    const { match, bot, other } = faceOff({ kiteReload: 0, kiteGap: 6, kiteSpeed: 1.5 });
    bot.meleeCd = MELEE.hammer.cooldown;
    run(match, 20);
    expect(bot.input.throttle).toBeGreaterThanOrEqual(0);
    expect(apart(bot, other)).toBeLessThanOrEqual(3.1);
  });

  it('gets away on a flat battery, whatever its tactics', () => {
    const { match, bot, other } = faceOff({}, { melee: 'chainsaw' });
    bot.batteryFlat = true;
    bot.ammo = 0;
    bot.batteryRegen = 0;
    run(match, 30);
    expect(apart(bot, other)).toBeGreaterThan(3.5);
  });

  it('keeps its distance with a long weapon when told to', () => {
    const { match, bot, other } = faceOff({ standoff: 0.8 }, { melee: 'flamethrower' }, 4);
    other.invulnT = 99;
    run(match, 40);
    expect(apart(bot, other)).toBeGreaterThan(4.5);
  });

  it('comes round the side away from the target\'s weapon when flanking', () => {
    const plain = faceOff({}, {}, 16);
    const flanking = faceOff({ flank: 1 }, {}, 16);
    plain.other.heading = flanking.other.heading = Math.PI / 2;
    run(plain.match, 40);
    run(flanking.match, 40);
    expect(flanking.bot.x).toBeLessThan(plain.bot.x - 0.5);
  });

  it('holds back a spin-up when the battery is better saved', () => {
    const saving = faceOff({ saveBattery: 0.5, engage: 12 }, { melee: 'vertdisc' }, 9);
    saving.bot.ammo = 0.3;
    run(saving.match, 2);
    expect(saving.bot.input.melee).toBe(false);
    const spending = faceOff({ saveBattery: 0, engage: 12 }, { melee: 'vertdisc' }, 9);
    spending.bot.ammo = 0.3;
    run(spending.match, 2);
    expect(spending.bot.input.melee).toBe(true);
  });

  it('goes all out to shove a target that is next to a drop', () => {
    const setUp = (edgeHunt: number) => {
      const { half } = ARENAS.skyscraper;
      const melee: MeleeId = 'hammer';
      const hunter: BotSetup = { name: 'Bot', color: 0, isAI: true, skill: 1, loadout: { ...newSave().loadout, melee }, brain: { tactics: { ...plainTactics(melee), edgeHunt } } };
      const still: BotSetup = { name: 'Still', color: 0, isAI: false, loadout: newSave().loadout };
      const match = new Match([hunter, still], { seed: 1, arena: 'skyscraper', mode: 'duel' });
      const [bot, other] = match.bots;
      Object.assign(bot, { x: half - 12, z: -10, heading: Math.PI / 2 });
      Object.assign(other, { x: half - 5, z: -10 });
      run(match, 2);
      return bot;
    };
    expect(setUp(8).input.boost).toBe(true);
    expect(setUp(0).input.boost).toBe(false);
  });

  it('keeps battery back for the weapon when it should', () => {
    const fight = (reserve: number) => {
      const melee: MeleeId = 'chainsaw';
      const habit: Habit = { ...plainHabit('emp'), reserve };
      const hunter: BotSetup = { name: 'Bot', color: 0, isAI: true, skill: 1, loadout: { ...newSave().loadout, melee, defense: 'emp' }, brain: { tactics: plainTactics(melee), habits: { emp: habit } } };
      const still: BotSetup = { name: 'Still', color: 0, isAI: false, loadout: newSave().loadout };
      const match = new Match([hunter, still], { seed: 1, arena: 'foundry', mode: 'ffa' });
      const [bot, other] = match.bots;
      bot.x = other.x = -20;
      bot.z = -5;
      bot.heading = 0;
      other.z = 0;
      bot.ammo = 0.4;
      run(match, 2);
      return bot.defenseCd;
    };
    expect(fight(0.6)).toBe(0);
    expect(fight(0)).toBeGreaterThan(0);
  });

  it('plays out the same every time from the same seed', () => {
    const fight = () => {
      const setups = ['A', 'B', 'C', 'D'].map((name, i): BotSetup => ({ name, color: 0, isAI: true, skill: 0.5 + i * 0.15, loadout: { ...newSave().loadout, melee: MELEE_IDS[i * 5] } }));
      const match = new Match(setups, { seed: 9, arena: 'skyscraper', mode: 'ffa', duration: 30 });
      while (!match.over) match.step();
      return match.bots.map((bot) => [bot.x, bot.z, bot.hp, bot.kills]);
    };
    expect(fight()).toEqual(fight());
  });
});

describe('what a bot knows', () => {
  it('fights plainly at low skill and with all its training at the top', () => {
    expect(trainedShare(0.3)).toBe(0);
    expect(trainedShare(0.95)).toBeCloseTo(1);
    expect(trainedShare(0.7)).toBeGreaterThan(0);
    for (const id of MELEE_IDS) {
      expect(tacticsFor(id, 0.3)).toEqual(plainTactics(id));
      expect(tacticsFor(id, 1)).toEqual(TRAINED_TACTICS[id] ?? plainTactics(id));
    }
    for (const id of Object.keys(DEFENSES) as DefenseId[]) expect(habitFor(id, 0.3)).toEqual(plainHabit(id));
  });

  it('keeps every trained number inside its limits', () => {
    for (const tactics of Object.values(TRAINED_TACTICS)) {
      for (const [key, [low, high]] of Object.entries(TACTIC_BOUNDS)) {
        const value = tactics[key as keyof Tactics];
        expect(value, key).toBeGreaterThanOrEqual(low);
        expect(value, key).toBeLessThanOrEqual(high);
      }
    }
    for (const habit of Object.values(TRAINED_HABITS)) {
      for (const [key, [low, high]] of Object.entries(HABIT_BOUNDS)) {
        const value = habit[key as keyof Habit];
        expect(value, key).toBeGreaterThanOrEqual(low);
        expect(value, key).toBeLessThanOrEqual(high);
      }
    }
  });
});
