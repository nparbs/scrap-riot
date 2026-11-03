import { describe, expect, it } from 'vitest';
import { suggestPart } from '../src/game/advice';
import { previewLoadout, type Slot } from '../src/game/progress';
import { ARMOUR, buildProblem, classFor, DEFENSES, MELEE, type DefenseId, type MeleeId, type PartsChoice } from '../src/sim/data';

const SLOTS: Slot[] = ['chassis', 'wheels', 'engine', 'power', 'defense'];
const weapons = Object.keys(MELEE) as MeleeId[];

/** A robot built the way a player would start, on the chassis its weapon belongs on. */
const robot = (melee: MeleeId, over: Partial<PartsChoice> = {}): PartsChoice => ({ chassis: classFor(melee), melee, defense: 'shield', ...over });

describe('build suggestions', () => {
  it('has advice for every slot but the main weapon, for every weapon', () => {
    for (const melee of weapons) {
      for (const slot of SLOTS) expect(suggestPart(slot, robot(melee)), `${melee} ${slot}`).not.toBeNull();
      expect(suggestPart('melee', robot(melee))).toBeNull();
    }
  });

  it('suggests the chassis a weapon belongs on, whatever it is on now', () => {
    for (const melee of weapons) expect(suggestPart('chassis', robot(melee, { chassis: 'brawler' }))!.id).toBe(classFor(melee));
  });

  it('only suggests parts that can be fitted, with less armor if need be', () => {
    for (const melee of weapons) {
      for (const armour of [0, ARMOUR.max]) {
        const build = robot(melee, { armour });
        for (const slot of SLOTS.slice(1)) {
          const { id } = suggestPart(slot, build)!;
          expect(buildProblem(previewLoadout(build, { slot, id })), `${melee} ${slot} ${id}`).toBeNull();
        }
      }
    }
  });

  it('matches the battery to what the weapon draws', () => {
    expect(suggestPart('power', robot('dagger'))!.id).toBe('alkaline');
    expect(suggestPart('power', robot('forks'))!.id).toBe('alkaline');
    expect(suggestPart('power', robot('chainsaw'))!.id).toBe('fuelcell');
    expect(suggestPart('power', robot('flamethrower'))!.id).toBe('fuelcell');
    expect(suggestPart('power', robot('vertbar'))!.id).toBe('lithium');
    expect(suggestPart('power', robot('crusher', { engine: 'small' }))!.id).toBe('lithium');
    // A stock Anvil with a Crusher has no points left for a better battery, even with no armor.
    expect(suggestPart('power', robot('crusher'))).toMatchObject({ id: 'alkaline', reason: expect.stringContaining('what fits') });
  });

  it('counts a hungry secondary weapon when the main one barely uses the battery', () => {
    const power = suggestPart('power', robot('dagger', { defense: 'emp' }))!;
    expect(power.id).toBe('lithium');
    expect(power.reason).toContain(DEFENSES.emp.name);
  });

  it('gives a ram speed and weight, and a grabber grip', () => {
    expect(suggestPart('engine', robot('ram', { armour: 0 }))!.id).toBe('turbo');
    expect(suggestPart('wheels', robot('ram'))!.id).toBe('tracks');
    expect(suggestPart('wheels', robot('claw'))!.id).toBe('tracks');
  });

  it('keeps dropped secondary weapons for robots that drive away from them', () => {
    const dropped: DefenseId[] = ['mines', 'oil', 'glue', 'spikes', 'minibot', 'remote'];
    expect(dropped).toContain(suggestPart('defense', robot('spear'))!.id);
    for (const melee of weapons) expect(dropped, melee).not.toContain(suggestPart('defense', { ...robot(melee), rearMelee: true } as PartsChoice)!.id);
  });
});
