import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  awardMedal,
  CAREER,
  fightSetups,
  isUnlocked,
  loadCareer,
  medalFor,
  writeCareer,
  type CareerProgress,
} from '../src/game/career';
import { newSave } from '../src/game/progress';
import { Match, type BotSetup } from '../src/sim/match';

describe('career', () => {
  it('unlocks one fight at a time', () => {
    const progress: CareerProgress = {};
    expect(isUnlocked(progress, 0)).toBe(true);
    expect(isUnlocked(progress, 1)).toBe(false);
    progress.c1 = 'bronze';
    expect(isUnlocked(progress, 1)).toBe(true);
    expect(isUnlocked(progress, 2)).toBe(false);
  });

  it('gives medals by placement and how clean the win was', () => {
    expect(medalFor(1, 0, 5)).toBe('gold');
    expect(medalFor(1, 1, 5)).toBe('gold');
    expect(medalFor(1, 2, 5)).toBe('silver');
    expect(medalFor(3, 0, 5)).toBe('bronze');
    expect(medalFor(4, 0, 5)).toBeNull();
    expect(medalFor(2, 0, 1)).toBeNull();
  });

  it('pays only for the first medal, and keeps the best one', () => {
    const progress: CareerProgress = {};
    const fight = CAREER[0];
    expect(awardMedal(progress, fight, null)).toBe(0);
    expect(awardMedal(progress, fight, 'bronze')).toBe(fight.reward);
    expect(awardMedal(progress, fight, 'gold')).toBe(0);
    expect(progress.c1).toBe('gold');
    awardMedal(progress, fight, 'silver');
    expect(progress.c1).toBe('gold');
  });

  it('survives corrupt or blocked storage', () => {
    expect(loadCareer({ getItem: () => '{nope' })).toEqual({});
    expect(loadCareer({ getItem: () => 'null' })).toEqual({});
    expect(loadCareer(null)).toEqual({});
    expect(() => writeCareer(null, {})).not.toThrow();
  });

  it('every fight plays to completion', () => {
    for (const fight of CAREER) {
      const me: BotSetup = { name: 'Me', color: 0, loadout: newSave().loadout, isAI: true };
      const match = new Match([me, ...fightSetups(fight, 3)], { seed: 3, arena: fight.arena, mode: fight.mode, killTarget: fight.killTarget });
      expect(match.bots).toHaveLength(fight.rivals + 1);
      let steps = 0;
      while (!match.over && steps++ < 60 * 200) match.step();
      expect(match.over, fight.id).toBe(true);
    }
  });

  it('bosses are bigger and tougher', () => {
    const fight = CAREER.find((f) => f.boss)!;
    const [boss] = fightSetups(fight, 1);
    const match = new Match([boss, { ...boss, boss: undefined, name: 'Plain' }], { seed: 1, arena: fight.arena });
    const [big, plain] = match.bots;
    expect(big.maxHp).toBeCloseTo(plain.maxHp * fight.boss!.hpMult);
    expect(big.radius).toBeCloseTo(plain.radius * fight.boss!.size);
    expect(big.mass).toBeGreaterThan(plain.mass);
    expect(big.name).toBe(fight.boss!.name);
  });
});

describe('achievements', () => {
  const none = { matches: 0, wins: 0, kills: 0, rating: 1000, career: {} };

  it('starts with none, and earns them from real stats', () => {
    expect(ACHIEVEMENTS.filter((a) => a.earned(none))).toHaveLength(0);
    const earned = (s: Partial<typeof none> & { career?: CareerProgress }) => ACHIEVEMENTS.filter((a) => a.earned({ ...none, ...s })).map((a) => a.name);
    expect(earned({ kills: 1 })).toEqual(['First Blood']);
    expect(earned({ wins: 1 })).toEqual(['Top of the Heap']);
    expect(earned({ rating: 1100 })).toEqual(['Contender']);
    expect(earned({ career: { c5: 'bronze' } })).toEqual(['Ironjaw Broken']);
  });

  it('solid gold needs every fight', () => {
    const solid = ACHIEVEMENTS.find((a) => a.name === 'Solid Gold')!;
    const almost = Object.fromEntries(CAREER.slice(1).map((f) => [f.id, 'gold'])) as CareerProgress;
    expect(solid.earned({ ...none, career: almost })).toBe(false);
    expect(solid.earned({ ...none, career: { ...almost, c1: 'gold' } })).toBe(true);
  });
});

describe('rear-mounted weapons', () => {
  const setup = (rearMelee: boolean): BotSetup => ({
    name: 'A',
    color: 0,
    isAI: false,
    loadout: { ...newSave().loadout, rearMelee },
  });

  function duelAt(z: number, rearMelee: boolean) {
    const match = new Match([setup(rearMelee), { ...setup(false), name: 'B' }], { seed: 1, arena: 'foundry' });
    const [a, b] = match.bots;
    a.invulnT = b.invulnT = 0;
    a.x = b.x = -20;
    a.z = 0;
    a.heading = 0;
    b.z = z;
    a.input.melee = true;
    for (let i = 0; i < 20; i++) match.step();
    return b;
  }

  it('cuts behind, and not in front', () => {
    expect(duelAt(-3.3, true).hp).toBeLessThan(duelAt(-3.3, true).maxHp);
    const ahead = duelAt(3.3, true);
    expect(ahead.hp).toBe(ahead.maxHp);
  });

  it('front mounts are unchanged', () => {
    const behind = duelAt(-3.3, false);
    expect(behind.hp).toBe(behind.maxHp);
    expect(duelAt(3.3, false).hp).toBeLessThan(duelAt(3.3, false).maxHp);
  });
});
