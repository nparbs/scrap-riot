import { describe, expect, it } from 'vitest';
import { buyOrEquip, loadSave, makeRivals, newSave, partFits, partProblem, retireParts, sellPart, setArmour } from '../src/game/progress';
import { ARENAS } from '../src/sim/arena';
import { ARMOUR, ARMOUR_REGEN_DELAY, MOVING_TARGET_SPEED, batteryCost, BATTERY_RESTART, buildProblem, buildStats, CHASSIS, classBonus, CLASSES, classFor, DEFENSES, ENGINES, fillBuild, fitToLimits, MELEE, payloadUsed, POINT_BUDGET, pointsUsed, NO_BONUS, POWER_SOURCES, REWARD, WHEELS, withoutUpgrades, type ChassisId, type MeleeId } from '../src/sim/data';
import { onlineLoadout } from '../src/net/protocol';
import { makeRng } from '../src/sim/rng';
import { Match, type BotSetup, type Loadout } from '../src/sim/match';

const pilot = (name: string, over: Partial<Loadout> = {}): BotSetup => ({ name, color: 0, isAI: false, loadout: { ...newSave().loadout, ...over } });

function duel(a: Partial<Loadout> = {}, b: Partial<Loadout> = {}): Match {
  return new Match([pilot('A', a), pilot('B', b)], { seed: 1, arena: 'skyscraper', mode: 'duel' });
}

/** Two robots face to face on an open bit of floor, with nothing protecting them. */
function open(a: Partial<Loadout> = {}, b: Partial<Loadout> = {}): Match {
  const match = new Match([pilot('A', a), pilot('B', b)], { seed: 1, arena: 'foundry', mode: 'ffa' });
  const [x, y] = match.bots;
  x.invulnT = y.invulnT = 0;
  x.x = y.x = -20;
  x.z = -5;
  x.heading = 0;
  y.z = -2;
  y.heading = Math.PI;
  return match;
}

describe('robot parts', () => {
  it('a starter robot takes its health from its chassis, and moves by power against weight', () => {
    const stats = buildStats(newSave().loadout);
    expect(stats.hp).toBe(CHASSIS.brawler.hp);
    expect(stats.armour).toBe(ARMOUR.default);
    expect(stats.weight).toBe(CHASSIS.brawler.weight + payloadUsed(newSave().loadout));
    expect(stats.regen).toBe(1);
  });

  it('armour trades speed, points and weight for protection, and leaves health alone', () => {
    const base = newSave().loadout;
    const heavy = { ...base, armour: ARMOUR.max };
    expect(buildStats(heavy).armour).toBeGreaterThan(buildStats(base).armour);
    expect(buildStats(heavy).hp).toBe(buildStats(base).hp);
    expect(buildStats(heavy).mass).toBeGreaterThan(buildStats(base).mass);
    expect(buildStats(heavy).speed).toBeLessThan(buildStats(base).speed);
    expect(pointsUsed(heavy)).toBeGreaterThan(pointsUsed(base));
    expect(payloadUsed(heavy)).toBeGreaterThan(payloadUsed(base));
  });

  it('parts reach the robot in a match', () => {
    const match = duel({ engine: 'turbo', wheels: 'tracks', power: 'reactor', armour: 100 });
    const [tuned, plain] = match.bots;
    expect(tuned.chassis.mass).toBeGreaterThan(plain.chassis.mass);
    expect(tuned.armour).toBe(100);
    expect(tuned.maxHp).toBe(plain.maxHp);
    expect(tuned.batteryRegen).toBeGreaterThan(plain.batteryRegen);
    tuned.ammo = 0;
    plain.ammo = 0;
    match.step();
    expect(tuned.ammo).toBeGreaterThan(plain.ammo);
  });

  it('a new robot has points and weight to spare', () => {
    const { loadout } = newSave();
    expect(pointsUsed(loadout)).toBeLessThan(POINT_BUDGET);
    expect(payloadUsed(loadout)).toBeLessThan(CHASSIS.brawler.payload);
  });

  it('a bought part that does not fit goes on the shelf', () => {
    const save = newSave();
    save.money = 99999;
    expect(buyOrEquip(save, 'chassis', 'juggernaut')).toBe(true);
    expect(buyOrEquip(save, 'defense', 'emp')).toBe(true);
    expect(buyOrEquip(save, 'melee', 'vertbar')).toBe(true);
    expect(save.loadout.melee).toBe('vertbar');
    expect(buildProblem(save.loadout)).toBeNull();
    // A reactor is too much on top of that, even with no armour, so it's bought but not fitted.
    expect(partFits(save, 'power', 'reactor')).toBe(false);
    expect(buyOrEquip(save, 'power', 'reactor')).toBe(true);
    expect(save.owned.power).toContain('reactor');
    expect(save.loadout.power).toBe('alkaline');
    // Fitting it again now is refused, as it's already owned.
    expect(buyOrEquip(save, 'power', 'reactor')).toBe(false);
    // Spending less on the weapon leaves enough.
    save.loadout.melee = 'chainsaw';
    expect(buyOrEquip(save, 'power', 'reactor')).toBe(true);
    expect(save.loadout.power).toBe('reactor');
  });

  it('says whether a part is too heavy or too many points', () => {
    const save = newSave();
    save.owned.chassis.push('scout');
    save.loadout.chassis = 'scout';
    save.loadout.armour = 0;
    expect(partProblem(save, 'melee', 'vertbar')).toBe('weight');
    const big = newSave();
    big.loadout.chassis = 'juggernaut';
    big.loadout.melee = 'vertbar';
    big.loadout.armour = 0;
    big.loadout.defense = 'emp';
    expect(partProblem(big, 'power', 'reactor')).toBe('points');
  });

  it('a smaller chassis lowers armour if that makes the parts fit', () => {
    const save = newSave();
    save.money = 10000;
    save.owned.chassis.push('scout');
    expect(buyOrEquip(save, 'chassis', 'scout')).toBe(true);
    expect(save.loadout.chassis).toBe('scout');
    expect(save.loadout.armour).toBeLessThan(ARMOUR.default);
    expect(buildProblem(save.loadout)).toBeNull();
  });

  it('sells unused parts for half, and nothing else', () => {
    const save = newSave();
    save.money = 1000;
    buyOrEquip(save, 'defense', 'emp');
    const after = save.money;
    expect(sellPart(save, 'defense', 'emp')).toBe(false);
    expect(sellPart(save, 'defense', 'shield')).toBe(false);
    buyOrEquip(save, 'defense', 'shield');
    expect(sellPart(save, 'defense', 'shield')).toBe(false);
    expect(sellPart(save, 'defense', 'emp')).toBe(true);
    expect(save.money).toBe(after + DEFENSES.emp.price / 2);
    expect(save.owned.defense).toEqual(['shield']);
    expect(sellPart(save, 'defense', 'emp')).toBe(false);
  });

  it('armour stays in its steps and within the limits', () => {
    const save = newSave();
    expect(setArmour(save, 100)).toBe(true);
    expect(save.loadout.armour).toBe(100);
    for (const bad of [10, 90, 175, NaN, Infinity]) expect(setArmour(save, bad)).toBe(false);
    expect(save.loadout.armour).toBe(100);
  });
});

describe('points and weight', () => {
  const chassisIds = Object.keys(CHASSIS) as ChassisId[];
  const meleeIds = Object.keys(MELEE) as MeleeId[];
  const canCarry = (chassis: ChassisId, melee: MeleeId) => !buildProblem({ chassis, melee, defense: 'shield', engine: 'small', wheels: 'small4', power: 'alkaline', armour: 0 });

  it('gives every part a cost in both, for free parts too', () => {
    for (const table of [CHASSIS, WHEELS, ENGINES, POWER_SOURCES, MELEE, DEFENSES]) {
      for (const part of Object.values(table)) {
        expect(part.points, part.name).toBeGreaterThan(0);
        expect(part.weight, part.name).toBeGreaterThan(0);
      }
    }
  });

  it('lets every chassis fight, and every weapon find a chassis', () => {
    for (const chassis of chassisIds) expect(meleeIds.some((melee) => canCarry(chassis, melee)), chassis).toBe(true);
    for (const melee of meleeIds) expect(canCarry('juggernaut', melee), melee).toBe(true);
  });

  it('keeps the biggest weapons off the small chassis', () => {
    expect(canCarry('scout', 'vertbar')).toBe(false);
    expect(canCarry('scout', 'hammer')).toBe(false);
    expect(canCarry('ghost', 'vertbar')).toBe(false);
    expect(canCarry('brawler', 'vertbar')).toBe(true);
  });

  it('charges more points for the stronger weapons', () => {
    expect(MELEE.vertbar.points).toBeGreaterThan(MELEE.chainsaw.points);
    expect(MELEE.vertbar.damage).toBeGreaterThan(MELEE.vertdisc.damage);
    expect(MELEE.vertbar.weight).toBeGreaterThan(MELEE.vertdisc.weight);
  });

  it('makes heavy robots slower and their hits harder', () => {
    const build = (chassis: ChassisId) => buildStats({ chassis, melee: 'chainsaw', defense: 'shield' });
    for (let i = 1; i < chassisIds.length; i++) {
      expect(build(chassisIds[i]).speed, chassisIds[i]).toBeLessThan(build(chassisIds[i - 1]).speed);
      expect(build(chassisIds[i]).punch, chassisIds[i]).toBeGreaterThan(build(chassisIds[i - 1]).punch);
      expect(build(chassisIds[i]).hp, chassisIds[i]).toBeGreaterThan(build(chassisIds[i - 1]).hp);
    }
    expect(buildStats({ chassis: 'brawler', melee: 'dagger', defense: 'shield' }).speed).toBeGreaterThan(buildStats({ chassis: 'brawler', melee: 'hammer', defense: 'shield' }).speed);
  });

  it('a heavier weapon on the same chassis hits harder for its own weight, not just its numbers', () => {
    const match = open({ melee: 'hammer', armour: 0 }, { armour: 0 });
    const [a, b] = match.bots;
    a.input.melee = true;
    for (let i = 0; i < 20; i++) match.step();
    expect(b.maxHp - b.hp).toBeCloseTo(MELEE.hammer.damage * a.punch, 3);
  });

  it('builds a legal robot for anything a rival might be given', () => {
    const rng = makeRng(5);
    for (const chassis of chassisIds) {
      for (const melee of meleeIds) {
        for (const defense of Object.keys(DEFENSES) as (keyof typeof DEFENSES)[]) {
          const build = fillBuild({ chassis, melee, defense }, rng);
          expect(buildProblem(build), `${chassis} ${melee} ${defense}`).toBeNull();
          expect(build.melee).toBe(melee);
        }
      }
    }
    for (let seed = 1; seed < 30; seed++) {
      for (const rival of makeRivals(null, 6, seed)) expect(buildProblem(rival.loadout)).toBeNull();
    }
  });

  it('cuts down a robot that is over the limits, whatever is on it', () => {
    const loaded = fitToLimits({ chassis: 'scout' as const, melee: 'vertbar' as const, defense: 'emp' as const, engine: 'turbo' as const, wheels: 'tracks' as const, power: 'reactor' as const, armour: 150 });
    expect(buildProblem(loaded)).toBeNull();
    const fair = { chassis: 'brawler' as const, melee: 'axe' as const, defense: 'shield' as const, armour: 75 };
    expect(fitToLimits(fair)).toEqual(fair);
  });

  it('holds online robots to the same limits, even if a browser asks for more', () => {
    const cheat = onlineLoadout({ chassis: 'juggernaut', melee: 'vertbar', defense: 'emp', engine: 'turbo', wheels: 'tracks', power: 'reactor', armour: 150 });
    expect(buildProblem(cheat)).toBeNull();
    expect(onlineLoadout({ armour: 10 }).armour).toBe(ARMOUR.default);
  });
});

describe('armour', () => {
  const ready = (a: Partial<Loadout> = {}, b: Partial<Loadout> = {}) => {
    const match = duel(a, b);
    for (const bot of match.bots) bot.invulnT = 0;
    return { match, a: match.bots[0], b: match.bots[1] };
  };

  it('is a bar of its own that wears away before health', () => {
    const { match, a, b } = ready({}, { armour: 100 });
    expect(b.maxArmour).toBe(100);
    match.damage(b, 70, a.id);
    expect(b.hp).toBe(b.maxHp);
    expect(b.armour).toBeCloseTo(100 - 70 * ARMOUR.wear);
    match.damage(b, 200, a.id);
    expect(b.armour).toBe(0);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('runs out mid-hit, and the rest of the hit reaches health', () => {
    const { match, a, b } = ready({}, { armour: 25 });
    const soaks = 25 / ARMOUR.wear;
    match.damage(b, soaks + 30, a.id);
    expect(b.armour).toBe(0);
    expect(b.hp).toBeCloseTo(b.maxHp - 30);
  });

  it('lets a piercing hit through by its share', () => {
    const { match, a, b } = ready({}, { armour: 100 });
    match.damage(b, 40, a.id, 0.5);
    expect(b.hp).toBeCloseTo(b.maxHp - 20);
    expect(b.armour).toBeCloseTo(100 - 20 * ARMOUR.wear);
  });

  it('does nothing against a Tesla bolt', () => {
    expect(MELEE.tesla.pierce).toBe(1);
  });

  it('is not mended by a repair', () => {
    const { match, a, b } = ready({}, { armour: 100, powerups: { ...newSave().loadout.powerups, repair: 1 }, powerupSlots: ['repair'] });
    match.damage(b, 200, a.id);
    const armourBefore = b.armour;
    const healthBefore = b.hp;
    b.input.powerup = 'repair';
    match.step();
    expect(b.armour).toBe(armourBefore);
    expect(b.hp).toBeGreaterThan(healthBefore);
  });

  it('comes back with a respawn', () => {
    const match = open({}, { armour: 100 });
    const [a, b] = match.bots;
    match.damage(b, 9999, a.id);
    expect(b.armour).toBe(0);
    for (let i = 0; i < 300 && !b.alive; i++) match.step();
    expect(b.alive).toBe(true);
    expect(b.armour).toBe(100);
  });

  it('counts toward who wins a duel that runs out of time', () => {
    const match = new Match([pilot('A', { armour: 100 }), pilot('B', { armour: 0 })], { seed: 1, arena: 'skyscraper', mode: 'duel', duration: 1 });
    const [a, b] = match.bots;
    a.invulnT = b.invulnT = 0;
    // A has lost more armour than B has lost health, but B has less left of what it started with.
    match.damage(a, 60, b.id);
    match.damage(b, 60, a.id);
    while (!match.over) match.step();
    expect(match.standings()[0].bot).toBe(a);
  });
});

describe('the battery', () => {
  const ready = (a: Partial<Loadout>, b: Partial<Loadout> = {}) => {
    const match = open({ armour: 0, ...a }, { armour: 0, ...b });
    return { match, a: match.bots[0], b: match.bots[1] };
  };

  it('costs more for a harder hit', () => {
    expect(batteryCost(MELEE.vertbar)).toBeGreaterThan(batteryCost(MELEE.vertdisc));
    expect(batteryCost(MELEE.hammer)).toBeGreaterThan(batteryCost(MELEE.axe));
    expect(batteryCost(MELEE.dagger)).toBe(0);
  });

  it('pays for each strike, and a bigger battery feels it less', () => {
    const swing = (power: 'alkaline' | 'lithium') => {
      const { match, a } = ready({ melee: 'hammer', power });
      a.input.melee = true;
      match.step();
      return 1 - a.ammo;
    };
    expect(swing('alkaline')).toBeGreaterThan(0);
    expect(swing('lithium')).toBeLessThan(swing('alkaline'));
    expect(swing('lithium')).toBeCloseTo(swing('alkaline') / POWER_SOURCES.lithium.capacity, 2);
  });

  it('will not swing with too little left', () => {
    const { match, a, b } = ready({ melee: 'hammer' });
    a.ammo = 0;
    a.input.melee = true;
    for (let i = 0; i < 30; i++) match.step();
    expect(b.hp).toBe(b.maxHp);
  });

  it('runs a held weapon faster when it is cutting than when it is idle', () => {
    const idle = ready({ melee: 'chainsaw' });
    idle.b.z += 20;
    idle.a.input.melee = true;
    for (let i = 0; i < 60; i++) idle.match.step();
    const cutting = ready({ melee: 'chainsaw' });
    cutting.a.input.melee = true;
    for (let i = 0; i < 60; i++) cutting.match.step();
    expect(cutting.a.ammo).toBeLessThan(idle.a.ammo);
    expect(idle.a.ammo).toBeLessThan(1);
  });

  it('takes far less to hold a spinner at speed than to get it there', () => {
    const { match, a, b } = ready({ melee: 'vertdisc' });
    b.z += 20;
    a.input.melee = true;
    for (let i = 0; i < 60; i++) match.step();
    expect(a.meleeCharge).toBe(1);
    const spinUp = 1 - a.ammo;
    const paid = a.ammo;
    for (let i = 0; i < 60; i++) match.step();
    expect(paid - a.ammo).toBeLessThan(spinUp / 3);
  });

  it('a heavier robot burns more to boost', () => {
    const boost = (chassis: ChassisId) => {
      const { match, a, b } = ready({ chassis });
      b.z += 20;
      a.input.boost = true;
      for (let i = 0; i < 30; i++) match.step();
      return 1 - a.ammo;
    };
    expect(boost('juggernaut')).toBeGreaterThan(boost('scout'));
  });

  it('never spends a defense it can not pay for', () => {
    const { match, a } = ready({ defense: 'emp' });
    a.ammo = 0;
    a.input.defense = true;
    match.step();
    expect(a.defenseCd).toBe(0);
    a.ammo = 1;
    match.step();
    expect(a.defenseCd).toBeGreaterThan(0);
    expect(a.ammo).toBeLessThan(1);
  });
});

describe('passives', () => {
  it('lets a Whippet at speed shrug off some of a hit, and only at speed', () => {
    const hurt = (chassis: ChassisId, speed: number) => {
      const match = open({ chassis, armour: 0 }, { armour: 0 });
      const [a, b] = match.bots;
      const top = a.chassis.speed * a.speedMult;
      a.vz = top * speed;
      match.damage(a, 40, b.id);
      return a.maxHp - a.hp;
    };
    expect(hurt('scout', 1)).toBeCloseTo(40 * (1 - CLASSES.scout.movingTarget!));
    expect(hurt('scout', MOVING_TARGET_SPEED + 0.05)).toBeLessThan(40);
    expect(hurt('scout', MOVING_TARGET_SPEED - 0.05)).toBeCloseTo(40);
    expect(hurt('scout', 0)).toBeCloseTo(40);
    expect(hurt('brawler', 1)).toBeCloseTo(40);
  });

  it('gives nothing to a Whippet thrown through the air', () => {
    const match = open({ chassis: 'scout', armour: 0 }, { armour: 0 });
    const [a, b] = match.bots;
    a.vz = a.chassis.speed;
    a.airT = 1;
    match.damage(a, 40, b.id);
    expect(a.maxHp - a.hp).toBeCloseTo(40);
  });

  it('lets a Wraith reach further with its own weapons, and not with others', () => {
    const lands = (chassis: ChassisId, melee: MeleeId) => {
      const match = open({ chassis, melee, armour: 0 }, { armour: 0 });
      const [a, b] = match.bots;
      // Just past where a hull this size normally reaches.
      b.z = a.z + MELEE[melee].range + a.radius - CHASSIS.brawler.radius + b.radius + 0.3;
      a.input.melee = true;
      for (let i = 0; i < 10; i++) match.step();
      return b.hp < b.maxHp;
    };
    expect(lands('ghost', 'tesla')).toBe(true);
    expect(lands('ghost', 'chainsaw')).toBe(false);
    expect(lands('brawler', 'tesla')).toBe(false);
  });

  it('brings a flat Alkaline back sooner than anything else', () => {
    const backAt = (power: 'alkaline' | 'lithium') => {
      const match = open({ power, melee: 'dagger', armour: 0 });
      const [a] = match.bots;
      a.batteryFlat = true;
      a.ammo = 0;
      a.batteryRegen = 1;
      let frames = 0;
      while (a.batteryFlat && frames < 2000) {
        match.step();
        frames++;
      }
      return frames;
    };
    expect(POWER_SOURCES.alkaline.restart).toBeLessThan(BATTERY_RESTART);
    expect(backAt('alkaline')).toBeLessThan(backAt('lithium'));
  });

  it('reloads a Flipper quickly after a miss, and fully after a hit', () => {
    const reload = (gap: number) => {
      const match = open({ melee: 'flipper', armour: 0 }, { armour: 0 });
      const [a, b] = match.bots;
      b.z = a.z + gap;
      a.input.melee = true;
      for (let i = 0; i < 6; i++) match.step();
      return a.meleeCd;
    };
    expect(reload(25)).toBeLessThanOrEqual(MELEE.flipper.missReload!);
    expect(reload(3)).toBeGreaterThan(MELEE.flipper.missReload!);
  });
});

describe('a Whippet rebuilding its armor', () => {
  const worn = (chassis: ChassisId) => {
    const match = open({ chassis, melee: 'dagger', armour: 25 }, { armour: 0 });
    const [a, b] = match.bots;
    b.x = a.x + 30;
    match.damage(a, 20, b.id);
    return { match, a, b, left: a.armour };
  };
  const seconds = (match: Match, s: number) => {
    for (let i = 0; i < s * 60; i++) match.step();
  };

  it('waits until it has been out of combat long enough, then fills back up and stops', () => {
    const { match, a, left } = worn('scout');
    expect(left).toBeLessThan(a.maxArmour);
    seconds(match, ARMOUR_REGEN_DELAY - 0.2);
    expect(a.armour).toBe(left);
    expect(a.rebuilding).toBe(false);
    seconds(match, 0.5);
    expect(a.armour).toBeGreaterThan(left);
    expect(a.rebuilding).toBe(true);
    seconds(match, 10);
    expect(a.armour).toBe(a.maxArmour);
    expect(a.rebuilding).toBe(false);
  });

  it('starts the wait again on being hit, or on hitting something', () => {
    const hit = worn('scout');
    seconds(hit.match, ARMOUR_REGEN_DELAY - 0.5);
    hit.match.damage(hit.a, 1, hit.b.id);
    const after = hit.a.armour;
    seconds(hit.match, 1);
    expect(hit.a.armour).toBe(after);

    const hitting = worn('scout');
    seconds(hitting.match, ARMOUR_REGEN_DELAY - 0.5);
    hitting.match.damage(hitting.b, 1, hitting.a.id);
    seconds(hitting.match, 1);
    expect(hitting.a.armour).toBe(hitting.left);
  });

  it('never mends health, and no other chassis does it', () => {
    const { match, a, b } = worn('scout');
    match.damage(a, 60, b.id);
    const health = a.hp;
    expect(health).toBeLessThan(a.maxHp);
    seconds(match, ARMOUR_REGEN_DELAY + 5);
    expect(a.hp).toBe(health);
    for (const chassis of ['ghost', 'brawler', 'rhino', 'juggernaut'] as const) {
      const other = worn(chassis);
      seconds(other.match, ARMOUR_REGEN_DELAY + 2);
      expect(other.a.armour, chassis).toBe(other.left);
    }
  });
});

describe('a flat battery', () => {
  const flat = (over: Partial<Loadout> = {}) => {
    const match = open({ armour: 0, ...over }, { armour: 0 });
    const [a, b] = match.bots;
    a.input.melee = true;
    return { match, a, b };
  };

  it('cuts the weapon out when it runs dry, until it has recharged a little', () => {
    const { match, a, b } = flat({ melee: 'chainsaw' });
    a.ammo = 0.02;
    while (!a.batteryFlat) match.step();
    const hurt = b.hp;
    for (let i = 0; i < 60; i++) match.step();
    expect(a.batteryFlat).toBe(true);
    expect(b.hp).toBe(hurt);
    let frames = 0;
    while (a.batteryFlat && frames++ < 600) match.step();
    expect(a.ammo).toBeGreaterThanOrEqual(a.batteryRestart - 0.01);
    expect(frames).toBeLessThan(600);
  });

  it('stops the boost as well, and recharges with the key still held', () => {
    const { match, a } = flat({ melee: 'dagger' });
    a.input.boost = true;
    a.ammo = 0.001;
    match.step();
    expect(a.batteryFlat).toBe(true);
    match.step();
    expect(a.boostT).toBeLessThanOrEqual(0.12);
    const low = a.ammo;
    for (let i = 0; i < 30; i++) match.step();
    expect(a.ammo).toBeGreaterThan(low);
  });

  it('never stops a weapon that needs no battery', () => {
    const { match, a, b } = flat({ melee: 'dagger' });
    a.ammo = 0;
    a.batteryFlat = true;
    for (let i = 0; i < 30; i++) match.step();
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('does not cut out over a defense it can not afford', () => {
    const { match, a } = flat({ melee: 'dagger', defense: 'emp' });
    a.ammo = 0.05;
    a.input.defense = true;
    match.step();
    expect(a.batteryFlat).toBe(false);
    expect(a.defenseCd).toBe(0);
  });

  it('charges a swing that misses the same as one that lands', () => {
    const swing = (reach: number) => {
      const { match, a, b } = flat({ melee: 'hammer' });
      b.z = a.z + reach;
      match.step();
      return a.ammo;
    };
    expect(swing(20)).toBeCloseTo(swing(3), 3);
    expect(swing(20)).toBeLessThan(1);
  });

  it('charges a spinner to wait at full speed', () => {
    const { match, a, b } = flat({ melee: 'vertdisc' });
    b.z = a.z + 25;
    a.meleeCharge = 1;
    a.ammo = 0.5;
    a.batteryRegen = 0;
    match.step();
    expect(a.ammo).toBeLessThan(0.5);
  });

  it('comes back after a respawn', () => {
    const { match, a } = flat();
    a.batteryFlat = true;
    a.ammo = 0;
    match.damage(a, 9999, 1);
    for (let i = 0; i < 300; i++) match.step();
    expect(a.alive).toBe(true);
    expect(a.batteryFlat).toBe(false);
  });
});

describe('upgrades', () => {
  it('can be left out of a robot without touching the rest of it', () => {
    const { loadout } = newSave();
    loadout.upgrades = { armor: 3, engine: 2, weapons: 1 };
    const plain = withoutUpgrades(loadout);
    expect(plain.upgrades).toEqual({ armor: 0, engine: 0, weapons: 0 });
    expect(loadout.upgrades.armor).toBe(3);
    expect(plain.chassis).toBe(loadout.chassis);
  });

  it('count on a robot that keeps them, and not on one without', () => {
    const { loadout } = newSave();
    loadout.upgrades = { armor: 5, engine: 5, weapons: 5 };
    const match = new Match([pilot('A', { upgrades: loadout.upgrades }), pilot('B', withoutUpgrades(loadout))], { seed: 1, arena: 'foundry', mode: 'ffa' });
    const [a, b] = match.bots;
    expect(a.maxHp).toBeGreaterThan(b.maxHp);
    expect(a.damageMult).toBeGreaterThan(b.damageMult);
    expect(a.speedMult).toBeGreaterThan(b.speedMult);
  });

  it('make rivals tougher only when they are given some, so rivals outside Career use none', () => {
    const veteran = { wins: 30, loadout: withoutUpgrades(newSave().loadout) };
    for (const rival of makeRivals(veteran, 4, 1)) expect(rival.loadout.upgrades).toEqual({ armor: 0, engine: 0, weapons: 0 });
    const fresh = makeRivals({ wins: 0, loadout: withoutUpgrades(newSave().loadout) }, 1, 1)[0];
    expect(makeRivals(veteran, 1, 1)[0].skill).toBeGreaterThan(fresh.skill!);
  });
});

describe('a bigger robot', () => {
  it('reaches further with the same weapon, and is easier to hit', () => {
    const reach = (attacker: ChassisId, target: ChassisId, z: number, x = 0) => {
      const match = duel({ chassis: attacker, melee: 'chainsaw' }, { chassis: target });
      const [a, b] = match.bots;
      a.x = 0;
      a.z = 0;
      a.heading = 0;
      b.x = x;
      b.z = z;
      return match.inCone(a, b, 0, MELEE.chainsaw.range, MELEE.chainsaw.arc);
    };
    const edge = MELEE.chainsaw.range + 1.4;
    expect(reach('juggernaut', 'scout', edge)).toBe(true);
    expect(reach('scout', 'scout', edge)).toBe(false);
    // Just outside the arc for a small target, but a big one sticks out into it.
    expect(reach('brawler', 'juggernaut', 3, 2.97)).toBe(true);
    expect(reach('brawler', 'scout', 3, 2.97)).toBe(false);
  });
});

describe('classes', () => {
  const chassisIds = Object.keys(CHASSIS) as ChassisId[];
  const weaponIds = Object.keys(MELEE) as MeleeId[];
  const inClass = (chassis: ChassisId, melee: MeleeId, over: Partial<Loadout> = {}) => open({ chassis, melee, armour: 0, ...over }, { armour: 0 });

  it('give every weapon exactly one home, on a chassis that can carry it', () => {
    for (const melee of weaponIds) {
      const homes = chassisIds.filter((id) => CLASSES[id].weapons.includes(melee));
      expect(homes, melee).toHaveLength(1);
      expect(classFor(melee)).toBe(homes[0]);
      expect(buildProblem({ chassis: homes[0], melee, defense: 'shield', engine: 'small', wheels: 'small4', power: 'alkaline', armour: 0 }), melee).toBeNull();
    }
  });

  it('only help the weapons the class was built around', () => {
    expect(classBonus('brawler', 'chainsaw').damage).toBeGreaterThan(1);
    expect(classBonus('juggernaut', 'chainsaw')).toEqual(NO_BONUS);
    expect(classBonus('scout', 'vertbar')).toEqual(NO_BONUS);
  });

  it('hit harder on their own chassis, for the same weight', () => {
    const hit = (chassis: ChassisId) => {
      const match = inClass(chassis, 'chainsaw');
      const [a, b] = match.bots;
      a.input.melee = true;
      match.step();
      return (b.maxHp - b.hp) / a.punch;
    };
    expect(hit('brawler') / hit('rhino')).toBeCloseTo(CLASSES.brawler.bonus.damage);
  });

  it('reload faster, for those that do', () => {
    const swing = (chassis: ChassisId) => {
      const match = inClass(chassis, 'axe');
      const [a] = match.bots;
      a.input.melee = true;
      match.step();
      return a.meleeCd;
    };
    expect(swing('scout')).toBeLessThan(swing('brawler'));
  });

  it('spin up faster on the Titan', () => {
    const charge = (chassis: ChassisId) => {
      const match = inClass(chassis, 'vertdisc');
      const [a, b] = match.bots;
      b.z = a.z + 25;
      a.input.melee = true;
      for (let i = 0; i < 12; i++) match.step();
      return a.meleeCharge;
    };
    expect(charge('juggernaut')).toBeGreaterThan(charge('brawler'));
  });

  it('use less battery on the Lancer', () => {
    const shot = (chassis: ChassisId) => {
      const match = inClass(chassis, 'tesla');
      const [a] = match.bots;
      a.input.melee = true;
      match.step();
      return 1 - a.ammo;
    };
    expect(shot('ghost')).toBeCloseTo(shot('brawler') * CLASSES.ghost.bonus.battery, 3);
  });

  it('hold on longer on the Bulldozer', () => {
    const grip = (chassis: ChassisId) => {
      const match = inClass(chassis, 'claw');
      const [a] = match.bots;
      a.input.melee = true;
      match.step();
      return a.clawT;
    };
    expect(grip('rhino')).toBeCloseTo(grip('brawler') * CLASSES.rhino.bonus.grip, 2);
  });

  it('mostly pick the right chassis for rivals', () => {
    let right = 0;
    let total = 0;
    for (let seed = 1; seed < 60; seed++) {
      for (const rival of makeRivals({ wins: 12, loadout: { upgrades: { armor: 0, engine: 0, weapons: 0 } } }, 6, seed)) {
        total++;
        if (classFor(rival.loadout.melee) === rival.loadout.chassis) right++;
      }
    }
    expect(right / total).toBeGreaterThan(0.5);
  });
});

describe('saves from before points', () => {
  const old = () => {
    const save = newSave();
    return { ...save, money: 0, owned: { ...save.owned, tower: ['medium', 'small', 'large'], melee: ['chainsaw', 'shell', 'eggbeater', 'axe'], defense: ['shield', 'regen'] } } as typeof save;
  };

  it('pays back towers, the Ring Spinner, the Eggbeater and the Armor Regenerator, once', () => {
    const save = retireParts(old());
    expect(save.money).toBe(100 + 400 + 1000 + 500 + 700);
    expect(save.owned.defense).toEqual(['shield']);
    expect(save.owned).not.toHaveProperty('tower');
    expect(save.owned.melee).toEqual(['chainsaw', 'axe']);
    retireParts(save);
    expect(save.money).toBe(100 + 400 + 1000 + 500 + 700);
  });

  it('takes a removed weapon off the robot', () => {
    const save = old();
    (save.loadout as { melee: string }).melee = 'shell';
    (save.loadout as { defense: string }).defense = 'regen';
    (save.loadout as { tower?: string }).tower = 'large';
    retireParts(save);
    expect(save.loadout.melee).toBe('chainsaw');
    expect(save.loadout.defense).toBe('shield');
    expect(save.loadout).not.toHaveProperty('tower');
  });

  it('cuts a robot down to the limits when it loads', () => {
    const save = old();
    Object.assign(save.loadout, { chassis: 'juggernaut', melee: 'vertbar', engine: 'turbo', power: 'reactor', wheels: 'tracks', defense: 'emp', armour: 150 });
    const loaded = loadSave({ getItem: () => JSON.stringify(save) });
    expect(buildProblem(loaded.loadout)).toBeNull();
    expect(loaded.loadout.melee).toBe('vertbar');
  });
});

describe('the duel', () => {
  const run = (match: Match, seconds: number) => {
    for (let i = 0; i < seconds * 60 && !match.over; i++) match.step();
  };

  it('the first robot destroyed loses, after a moment to see it happen', () => {
    const match = duel();
    const [a, b] = match.bots;
    a.invulnT = b.invulnT = 0;
    match.damage(a, 9999, b.id);
    expect(a.out).toBe(true);
    match.step();
    expect(match.over).toBe(false);
    run(match, 3.2);
    expect(match.over).toBe(true);
    expect(a.alive).toBe(false);
    expect(match.standings()[0].bot).toBe(b);
  });

  it('being knocked off the roof loses, with no respawn', () => {
    const match = duel();
    const [a, b] = match.bots;
    a.x = ARENAS.skyscraper.half + 1;
    a.z = -5;
    run(match, 6);
    expect(match.over).toBe(true);
    expect(a.alive).toBe(false);
    expect(match.standings()[0].bot).toBe(b);
  });

  it('when time runs out, whoever has the most left wins', () => {
    const match = new Match([pilot('A'), pilot('B')], { seed: 1, arena: 'skyscraper', mode: 'duel', duration: 1 });
    const [a, b] = match.bots;
    a.invulnT = b.invulnT = 0;
    match.damage(b, 10, a.id);
    run(match, 2);
    expect(match.over).toBe(true);
    expect(match.standings()[0].bot).toBe(a);
  });

  it('pays the winner more, even for a duel over at once', () => {
    const quick = duel();
    quick.forfeit(0);
    run(quick, 3);
    expect(quick.standings().map((row) => row.bonus)).toEqual(REWARD.duel);
  });

  it('someone who walks out of a brawl comes last with no bonus, whatever their score', () => {
    const { loadout } = newSave();
    const setup = (name: string) => ({ name, color: 0, loadout, isAI: false });
    const match = new Match([setup('A'), setup('B')], { seed: 1, arena: 'skyscraper', mode: 'ffa' });
    match.bots[0].kills = 5;
    match.forfeit(0);
    run(match, 4);
    expect(match.bots[0].alive).toBe(false);
    const [first, last] = match.standings();
    expect(first.bot.name).toBe('B');
    expect(first.bonus).toBe(REWARD.placement[0]);
    expect(last.bonus).toBe(0);
  });

  it('every finished match pays at least the minimum, but not to anyone who walked out', () => {
    const beaten = duel();
    beaten.time = 1;
    beaten.bots[0].out = true;
    beaten.bots[0].alive = false;
    beaten.over = true;
    expect(beaten.standings().map((row) => row.total)).toEqual([REWARD.duel[0], REWARD.minimum]);

    const walkout = duel();
    walkout.forfeit(0);
    run(walkout, 3);
    const rows = walkout.standings();
    expect(rows.find((row) => row.bot.name === 'A')!.total).toBe(REWARD.duel[1]);
    expect(rows.find((row) => row.bot.name === 'B')!.total).toBe(REWARD.duel[0]);

    const rich = duel();
    rich.bots[0].earned = REWARD.minimum * 3;
    rich.over = true;
    const richRow = rich.standings().find((row) => row.bot.name === 'A')!;
    expect(richRow.total).toBe(REWARD.minimum * 3 + richRow.bonus);
  });

  it('holds everything on the start line through the countdown', () => {
    const match = new Match([pilot('A'), pilot('B')], { seed: 1, arena: 'skyscraper', mode: 'duel', countdown: 3 });
    const [a] = match.bots;
    const start = { x: a.x, z: a.z };
    a.input.throttle = 1;
    a.input.melee = true;
    run(match, 2.9);
    expect(match.countdown).toBeGreaterThan(0);
    expect(match.time).toBe(0);
    expect({ x: a.x, z: a.z }).toEqual(start);
    match.predict(a, 1, 0, false, 1 / 60);
    expect({ x: a.x, z: a.z }).toEqual(start);
    run(match, 0.5);
    expect(match.countdown).toBe(0);
    expect(match.time).toBeGreaterThan(0);
    expect(Math.hypot(a.x - start.x, a.z - start.z)).toBeGreaterThan(0);
  });

  it('a draw is a draw: first for both, and no bonus', () => {
    const match = duel();
    match.drawn = true;
    match.over = true;
    expect(match.standings().map((row) => row.place)).toEqual([1, 1]);
    expect(match.standings().map((row) => row.bonus)).toEqual([0, 0]);
  });

  it('bots fight on the roof, and a duel always finishes', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const ai = (name: string): BotSetup => ({ ...pilot(name), isAI: true, skill: 0.8 });
      const match = new Match([ai('A'), ai('B')], { seed, arena: 'skyscraper', mode: 'duel' });
      run(match, 200);
      expect(match.over).toBe(true);
    }
  });
});

describe('the skyscraper', () => {
  const roof = ARENAS.skyscraper;

  it('keeps robots out of solid blocks', () => {
    const match = duel();
    const [a] = match.bots;
    const block = roof.blocks.find((b) => b.kind === 'shed')!;
    a.x = block.x;
    a.z = block.z - block.d / 2 - 3;
    a.heading = 0;
    a.input.throttle = 1;
    for (let i = 0; i < 120; i++) match.step();
    expect(a.z).toBeLessThan(block.z - block.d / 2 - a.radius + 0.01);
  });

  it('stops at the fence', () => {
    const match = duel();
    const [a] = match.bots;
    a.x = -13;
    a.z = roof.half - 3;
    a.heading = 0;
    a.input.throttle = 1;
    for (let i = 0; i < 120; i++) match.step();
    expect(a.alive).toBe(true);
    expect(a.z).toBeLessThan(roof.half);
    expect(roof.blocks.filter((b) => b.kind === 'fence').length).toBeGreaterThan(0);
  });

  it('drives straight off an unfenced side', () => {
    const match = duel();
    const [a] = match.bots;
    a.x = roof.half - 3;
    a.z = -10;
    a.heading = Math.PI / 2;
    a.input.throttle = 1;
    for (let i = 0; i < 120; i++) match.step();
    expect(a.alive).toBe(false);
  });

  it('spawns everyone on clear ground', () => {
    const match = duel();
    for (const spawn of roof.spawns) expect(match.isSafeGround(spawn.x, spawn.z, 1.75), `${spawn.x},${spawn.z}`).toBe(true);
    for (const spot of roof.repairSpots) expect(match.isSafeGround(spot.x, spot.z, 0.5), `${spot.x},${spot.z}`).toBe(true);
  });
});
