import { describe, expect, it } from 'vitest';
import { ARENA } from '../src/sim/arena';
import { MATCH } from '../src/sim/data';
import { Match, type BotSetup, type Loadout } from '../src/sim/match';
import { makeRivals, newSave } from '../src/game/progress';

function loadout(over: Partial<Loadout> = {}): Loadout {
  return {
    chassis: 'brawler',
    melee: 'chainsaw',
    turret: 'minigun',
    defense: 'shield',
    powerups: { repair: 1, turbo: 1, overdrive: 1, emp: 1 },
    upgrades: { armor: 0, engine: 0, weapons: 0 },
    ...over,
  };
}

function duel(a: Partial<Loadout> = {}, b: Partial<Loadout> = {}): Match {
  const setups: BotSetup[] = [
    { name: 'A', color: 0, loadout: loadout(a), isAI: false },
    { name: 'B', color: 0, loadout: loadout(b), isAI: false },
  ];
  const match = new Match(setups, { seed: 1 });
  match.bots.forEach((bot) => (bot.invulnT = 0));
  return match;
}

function run(match: Match, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) match.step();
}

describe('driving', () => {
  it('moves along the heading and reaches top speed', () => {
    const match = duel();
    const bot = match.bots[0];
    bot.x = 0;
    bot.z = 0;
    bot.heading = 0;
    bot.input.throttle = 1;
    run(match, 1);
    expect(bot.z).toBeGreaterThan(4);
    expect(Math.abs(bot.x)).toBeLessThan(0.01);
    expect(Math.hypot(bot.vx, bot.vz)).toBeCloseTo(bot.chassis.speed, 1);
  });

  it('steer +1 turns toward +x, which is screen-left for the chase camera', () => {
    const match = duel();
    const bot = match.bots[0];
    bot.heading = 0;
    bot.input.steer = 1;
    match.step();
    expect(bot.heading).toBeGreaterThan(0);
  });

  it('cannot leave the arena or sit inside a pillar', () => {
    const match = duel();
    const bot = match.bots[0];
    bot.x = 0;
    bot.z = 0;
    bot.heading = Math.PI / 2;
    bot.input.throttle = 1;
    run(match, 6);
    expect(bot.x).toBeLessThanOrEqual(ARENA.half - bot.radius + 1e-6);

    const pillar = ARENA.pillars[0];
    bot.x = pillar.x;
    bot.z = pillar.z - 6;
    bot.vx = bot.vz = 0;
    bot.heading = 0;
    run(match, 2);
    expect(Math.hypot(bot.x - pillar.x, bot.z - pillar.z)).toBeGreaterThanOrEqual(pillar.r + bot.radius - 1e-6);
  });
});

describe('combat', () => {
  it('credits kills and pays the attacker', () => {
    const match = duel();
    const [a, b] = match.bots;
    b.hp = 5;
    match.damage(b, 10, a.id);
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    expect(b.deaths).toBe(1);
    expect(a.earned).toBeGreaterThanOrEqual(100);
  });

  it('respawns with full health after the delay', () => {
    const match = duel();
    const [a, b] = match.bots;
    match.damage(b, 9999, a.id);
    run(match, MATCH.respawnTime + 0.1);
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(b.maxHp);
    expect(b.invulnT).toBeGreaterThan(0);
  });

  it('shield absorbs 75% and invulnerability blocks everything', () => {
    const match = duel();
    const [a, b] = match.bots;
    b.shieldT = 1;
    match.damage(b, 100, a.id);
    expect(b.maxHp - b.hp).toBeCloseTo(25);
    b.shieldT = 0;
    b.invulnT = 1;
    const before = b.hp;
    match.damage(b, 50, a.id);
    expect(b.hp).toBe(before);
  });

  it('chainsaw only cuts what is in front of it', () => {
    const match = duel();
    const [a, b] = match.bots;
    a.x = 0;
    a.z = 0;
    a.heading = 0;
    b.x = 0;
    b.z = 3.5;
    a.input.melee = true;
    run(match, 0.5);
    expect(b.hp).toBeLessThan(b.maxHp);

    const damaged = b.hp;
    b.x = 0;
    b.z = -3.5;
    run(match, 0.5);
    expect(b.hp).toBe(damaged);
  });

  it('hammer strikes after its windup and stuns', () => {
    const match = duel({ melee: 'hammer' });
    const [a, b] = match.bots;
    a.x = 0;
    a.z = 0;
    a.heading = 0;
    b.x = 0;
    b.z = 3.5;
    a.input.melee = true;
    match.step();
    expect(b.hp).toBe(b.maxHp);
    run(match, 0.4);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(b.stunT).toBeGreaterThan(0);
  });

  it('rocket splash spares the shooter', () => {
    const match = duel();
    const [a, b] = match.bots;
    a.x = 0;
    a.z = 0;
    b.x = 1;
    b.z = 0;
    match.explode(0, 0, 30, 4, a.id, false);
    expect(a.hp).toBe(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('turret leads a moving target', () => {
    const match = duel({ turret: 'rockets' });
    const [a, b] = match.bots;
    a.x = 0;
    a.z = 0;
    a.turretAngle = 0;
    b.x = 0;
    b.z = 17;
    b.heading = Math.PI / 2;
    b.input.throttle = 1;
    b.vx = b.chassis.speed;
    run(match, 0.5);
    const direct = Math.atan2(b.x - a.x, b.z - a.z);
    expect(a.turretAngle).toBeGreaterThan(direct);
  });

  it('a stunned robot ignores all input', () => {
    const match = duel();
    const bot = match.bots[0];
    bot.stunT = 1;
    bot.input.throttle = 1;
    bot.input.turret = true;
    const heading = bot.heading;
    bot.input.steer = 1;
    run(match, 0.5);
    expect(Math.hypot(bot.vx, bot.vz)).toBeLessThan(0.01);
    expect(bot.heading).toBe(heading);
    expect(match.projectiles).toHaveLength(0);
  });
});

describe('powerups', () => {
  it('spends a charge and applies the effect', () => {
    const match = duel();
    const bot = match.bots[0];
    bot.hp = 10;
    bot.input.powerup = 'repair';
    match.step();
    expect(bot.hp).toBeCloseTo(10 + bot.maxHp * 0.4);
    expect(bot.powerups.repair).toBe(0);
    bot.input.powerup = 'repair';
    match.step();
    expect(bot.hp).toBeCloseTo(10 + bot.maxHp * 0.4);
  });

  it('does not waste a repair at full health', () => {
    const match = duel();
    const bot = match.bots[0];
    bot.input.powerup = 'repair';
    match.step();
    expect(bot.powerups.repair).toBe(1);
  });
});

describe('full matches', () => {
  const rivals = (seed: number) => makeRivals(newSave(), 6, seed);

  it('AI-only matches produce kills and finish', () => {
    const match = new Match(rivals(7), { seed: 7 });
    while (!match.over) match.step();
    const total = match.bots.reduce((sum, b) => sum + b.kills, 0);
    expect(total).toBeGreaterThan(5);
    const standings = match.standings();
    expect(standings[0].place).toBe(1);
    expect(standings[0].bonus).toBeGreaterThan(standings[1].bonus);
  });

  it('is deterministic for a given seed', () => {
    const play = () => {
      const match = new Match(rivals(42), { seed: 42 });
      for (let i = 0; i < 3600; i++) match.step();
      return match.bots.map((b) => [b.x, b.z, b.hp, b.kills]);
    };
    expect(play()).toEqual(play());
  });

  it('never leaves a bot out of bounds or stuck in NaN', () => {
    const match = new Match(rivals(3), { seed: 3 });
    for (let i = 0; i < 3600; i++) {
      match.step();
      for (const bot of match.bots) {
        expect(Number.isFinite(bot.x) && Number.isFinite(bot.z)).toBe(true);
        expect(Math.abs(bot.x)).toBeLessThanOrEqual(ARENA.half);
        expect(Math.abs(bot.z)).toBeLessThanOrEqual(ARENA.half);
      }
    }
  });

  it('keeps bots moving rather than wedged', () => {
    const match = new Match(rivals(11), { seed: 11 });
    const travelled = new Map<number, number>();
    for (let i = 0; i < 3600; i++) {
      match.step();
      for (const bot of match.bots) {
        travelled.set(bot.id, (travelled.get(bot.id) ?? 0) + Math.hypot(bot.x - bot.prevX, bot.z - bot.prevZ));
      }
    }
    for (const distance of travelled.values()) expect(distance).toBeGreaterThan(100);
  });
});
