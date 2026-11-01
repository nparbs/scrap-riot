import { describe, expect, it } from 'vitest';
import { buyOrEquip, newSave, partFits, sellPart, setArmour } from '../src/game/progress';
import { ARENAS } from '../src/sim/arena';
import { ARMOUR, buildStats, CHASSIS, MIN_PAID_TIME, REWARD, spaceCapacity, spaceUsed, TOWERS, TURRETS } from '../src/sim/data';
import { Match, type BotSetup, type Loadout } from '../src/sim/match';

const pilot = (name: string, over: Partial<Loadout> = {}): BotSetup => ({ name, color: 0, isAI: false, loadout: { ...newSave().loadout, ...over } });

function duel(a: Partial<Loadout> = {}, b: Partial<Loadout> = {}): Match {
  return new Match([pilot('A', a), pilot('B', b)], { seed: 1, arena: 'skyscraper', mode: 'duel' });
}

describe('robot parts', () => {
  it('a starter robot has the plain stats of its chassis', () => {
    const stats = buildStats(newSave().loadout);
    const { hp, speed, accel, turn, mass } = CHASSIS.brawler;
    expect(stats).toMatchObject({ hp, speed, accel, turn, mass, regen: 1 });
  });

  it('armour trades speed and room for toughness', () => {
    const base = newSave().loadout;
    const heavy = { ...base, armour: ARMOUR.max };
    expect(buildStats(heavy).hp).toBeGreaterThan(buildStats(base).hp);
    expect(buildStats(heavy).mass).toBeGreaterThan(buildStats(base).mass);
    expect(buildStats(heavy).speed).toBeLessThan(buildStats(base).speed);
    expect(spaceUsed(heavy)).toBeGreaterThan(spaceUsed(base));
  });

  it('parts reach the robot in a match', () => {
    const match = duel({ engine: 'turbo', wheels: 'tracks', tower: 'large', power: 'reactor' });
    const [tuned, plain] = match.bots;
    expect(tuned.chassis.mass).toBeGreaterThan(plain.chassis.mass);
    expect(tuned.chassis.accel).toBeGreaterThan(plain.chassis.accel);
    expect(tuned.maxHp).toBeCloseTo(plain.maxHp * TOWERS.large.hp!);
    expect(tuned.batteryRegen).toBeGreaterThan(plain.batteryRegen);
    tuned.ammo = 0;
    plain.ammo = 0;
    match.step();
    expect(tuned.ammo).toBeGreaterThan(plain.ammo);
  });

  it('a large tower adds armour and room, as it did in the original', () => {
    const { loadout } = newSave();
    const large = { ...loadout, tower: 'large' as const };
    expect(spaceCapacity(large)).toBeGreaterThan(spaceCapacity(loadout));
    expect(buildStats(large).hp).toBeGreaterThan(buildStats(loadout).hp);
    expect(buildStats({ ...loadout, tower: 'small' }).hp).toBeLessThan(buildStats(loadout).hp);
  });

  it('a new robot has room to spare', () => {
    const { loadout } = newSave();
    expect(spaceUsed(loadout)).toBeLessThan(spaceCapacity(loadout));
  });

  it('a bought part that does not fit goes on the shelf', () => {
    const save = newSave();
    save.money = 99999;
    expect(buyOrEquip(save, 'turret', 'bunkerbuster')).toBe(true);
    expect(buyOrEquip(save, 'defense', 'emp')).toBe(true);
    expect(buyOrEquip(save, 'melee', 'claw')).toBe(true);
    expect(buyOrEquip(save, 'engine', 'turbo')).toBe(true);
    expect(spaceUsed(save.loadout)).toBeLessThanOrEqual(spaceCapacity(save.loadout));
    // There's no room left for a reactor, so it's bought but not fitted.
    expect(partFits(save, 'power', 'reactor')).toBe(false);
    expect(buyOrEquip(save, 'power', 'reactor')).toBe(true);
    expect(save.owned.power).toContain('reactor');
    expect(save.loadout.power).toBe('alkaline');
    // Fitting it again now is refused, as it's already owned.
    expect(buyOrEquip(save, 'power', 'reactor')).toBe(false);
    // A bigger chassis makes room.
    expect(buyOrEquip(save, 'chassis', 'juggernaut')).toBe(true);
    expect(buyOrEquip(save, 'power', 'reactor')).toBe(true);
    expect(save.loadout.power).toBe('reactor');
  });

  it('a smaller chassis is refused if the parts would not fit', () => {
    const save = newSave();
    save.money = 99999;
    save.owned.chassis.push('scout');
    buyOrEquip(save, 'turret', 'bunkerbuster');
    expect(buyOrEquip(save, 'chassis', 'scout')).toBe(false);
    expect(save.loadout.chassis).toBe('brawler');
  });

  it('sells unused parts for half, and nothing else', () => {
    const save = newSave();
    save.money = 1000;
    buyOrEquip(save, 'turret', 'laser');
    const after = save.money;
    expect(sellPart(save, 'turret', 'laser')).toBe(false);
    expect(sellPart(save, 'turret', 'minigun')).toBe(false);
    buyOrEquip(save, 'turret', 'minigun');
    expect(sellPart(save, 'turret', 'minigun')).toBe(false);
    expect(sellPart(save, 'turret', 'laser')).toBe(true);
    expect(save.money).toBe(after + TURRETS.laser.price / 2);
    expect(save.owned.turret).toEqual(['minigun']);
    expect(sellPart(save, 'turret', 'laser')).toBe(false);
  });

  it('armour stays in its steps and within the room available', () => {
    const save = newSave();
    expect(setArmour(save, 100)).toBe(true);
    expect(save.loadout.armour).toBe(100);
    for (const bad of [10, 90, 175, NaN, Infinity]) expect(setArmour(save, bad)).toBe(false);
    expect(save.loadout.armour).toBe(100);
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
    run(match, 3);
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

  it('when time runs out, the most armour left wins', () => {
    const match = new Match([pilot('A'), pilot('B')], { seed: 1, arena: 'skyscraper', mode: 'duel', duration: 1 });
    const [a, b] = match.bots;
    a.invulnT = b.invulnT = 0;
    match.damage(b, 10, a.id);
    run(match, 2);
    expect(match.over).toBe(true);
    expect(match.standings()[0].bot).toBe(a);
  });

  it('pays the winner more, but nothing extra for a duel over at once', () => {
    const quick = duel();
    quick.forfeit(0);
    run(quick, 3);
    expect(quick.standings().map((row) => row.bonus)).toEqual([0, 0]);

    const long = duel();
    long.time = MIN_PAID_TIME + 1;
    long.forfeit(0);
    run(long, 3);
    expect(long.standings().map((row) => row.bonus)).toEqual(REWARD.duel);
  });

  it('someone who walks out of a brawl comes last with no bonus, whatever their score', () => {
    const { loadout } = newSave();
    const setup = (name: string) => ({ name, color: 0, loadout, isAI: false });
    const match = new Match([setup('A'), setup('B')], { seed: 1, arena: 'skyscraper', mode: 'ffa' });
    match.time = MIN_PAID_TIME + 1;
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
    expect(beaten.standings().map((row) => row.total)).toEqual([REWARD.minimum, REWARD.minimum]);

    const walkout = duel();
    walkout.forfeit(0);
    run(walkout, 3);
    const rows = walkout.standings();
    expect(rows.find((row) => row.bot.name === 'A')!.total).toBe(0);
    expect(rows.find((row) => row.bot.name === 'B')!.total).toBe(REWARD.minimum);

    const rich = duel();
    rich.bots[0].earned = REWARD.minimum * 3;
    rich.over = true;
    expect(rich.standings().find((row) => row.bot.name === 'A')!.total).toBe(REWARD.minimum * 3);
  });

  it('a draw is a draw: first for both, and no bonus', () => {
    const match = duel();
    match.time = MIN_PAID_TIME + 1;
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

  it('stops at the fence, which shots still pass through', () => {
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
