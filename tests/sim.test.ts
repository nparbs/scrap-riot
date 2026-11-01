import { describe, expect, it } from 'vitest';
import { ARENA_ORDER, ARENAS } from '../src/sim/arena';
import { DEFENSES, MATCH, MELEE, type DefenseId, type MeleeId } from '../src/sim/data';
import { Match, STEP, type Bot, type BotSetup, type Loadout } from '../src/sim/match';
import { makeRivals, newSave } from '../src/game/progress';

const ARENA = ARENAS.pit;

function loadout(over: Partial<Loadout> = {}): Loadout {
  return {
    chassis: 'brawler',
    melee: 'chainsaw',
    defense: 'shield',
    powerups: { rage: 1, megashield: 1, cloaking: 1, xray: 1, repair: 1, battery: 1 },
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
    bot.input.throttle = 1;
    bot.input.steer = 1;
    run(match, 0.3);
    expect(bot.heading).toBeGreaterThan(0);
  });

  it('cannot turn while stopped, whatever the steering says', () => {
    const match = duel();
    const bot = match.bots[0];
    bot.heading = 0;
    bot.input.steer = 1;
    run(match, 1);
    expect(bot.heading).toBe(0);
  });

  it('turns slowly at a crawl and at the full rate once rolling', () => {
    const match = duel();
    const bot = match.bots[0];
    bot.heading = 0;
    bot.vz = 1;
    bot.input.throttle = 0.08;
    bot.input.steer = 1;
    match.step();
    const crawl = bot.heading;
    bot.heading = 0;
    bot.vx = 0;
    bot.vz = 10;
    bot.input.throttle = 1;
    match.step();
    expect(crawl).toBeGreaterThan(0);
    expect(crawl).toBeLessThan(bot.heading / 2);
    expect(bot.heading).toBeCloseTo(bot.chassis.turn * STEP, 5);
  });

  it('steers the other way in reverse, as a car does', () => {
    const match = duel();
    const bot = match.bots[0];
    bot.heading = 0;
    bot.input.throttle = -1;
    bot.input.steer = 1;
    run(match, 0.3);
    expect(bot.heading).toBeLessThan(0);
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

  it('a stunned robot ignores all input', () => {
    const match = duel();
    const bot = match.bots[0];
    bot.stunT = 1;
    bot.input.throttle = 1;
    bot.input.melee = true;
    const heading = bot.heading;
    bot.input.steer = 1;
    run(match, 0.5);
    expect(Math.hypot(bot.vx, bot.vz)).toBeLessThan(0.01);
    expect(bot.heading).toBe(heading);
    expect(bot.meleeActive).toBe(false);
  });
});

describe('powerups', () => {
  it('spends a charge and applies the effect', () => {
    const match = duel({ powerupSlots: ['repair'] });
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
    const match = duel({ powerupSlots: ['repair'] });
    const bot = match.bots[0];
    bot.input.powerup = 'repair';
    match.step();
    expect(bot.powerups.repair).toBe(1);
  });
});

describe('full matches', () => {
  const rivals = (seed: number) => makeRivals(newSave(), 6, seed);

  it('AI-only matches produce kills and finish', () => {
    const match = new Match(rivals(7), { seed: 7, killTarget: 999 });
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

function fight(arena: keyof typeof ARENAS, a: Partial<Loadout> = {}, b: Partial<Loadout> = {}, mode: 'ffa' | 'lms' | 'koth' = 'ffa'): Match {
  const setups: BotSetup[] = [
    { name: 'A', color: 0, loadout: loadout(a), isAI: false },
    { name: 'B', color: 0, loadout: loadout(b), isAI: false },
  ];
  const match = new Match(setups, { seed: 1, arena, mode });
  match.bots.forEach((bot) => (bot.invulnT = 0));
  return match;
}

/** Puts A at the origin facing +z with B straight ahead, on a map with nothing in the way. */
function faceOff(match: Match, gap: number): [Bot, Bot] {
  const [a, b] = match.bots;
  a.x = 0;
  a.z = 0;
  a.heading = 0;
  b.x = 0;
  b.z = gap;
  b.heading = Math.PI;
  return [a, b];
}

describe('arsenal', () => {
  it('every front weapon damages or moves a robot in reach', () => {
    for (const melee of Object.keys(MELEE) as MeleeId[]) {
      const match = fight('foundry', { melee });
      const [a, b] = faceOff(match, melee === 'magnet' ? 8 : 3.2);
      a.x = b.x = -20;
      a.input.melee = true;
      if (melee === 'ram' || melee === 'forks') a.input.throttle = 1;
      const start = b.z;
      run(match, 1.2);
      const changed = b.hp < b.maxHp || Math.abs(b.z - start) > 0.5;
      expect(changed, melee).toBe(true);
    }
  });

  it('every defense can be used without breaking the match', () => {
    for (const defense of Object.keys(DEFENSES) as DefenseId[]) {
      const match = fight('pit', { defense });
      const [a] = faceOff(match, 20);
      a.input.defense = true;
      for (let i = 0; i < 300; i++) {
        match.step();
        for (const bot of match.bots) expect(Number.isFinite(bot.x) && Number.isFinite(bot.hp), defense).toBe(true);
      }
    }
  });

  it('flamethrower only reaches short range, and sets robots burning', () => {
    const near = fight('foundry', { melee: 'flamethrower' });
    const [a, b] = faceOff(near, 6);
    a.x = b.x = -20;
    a.input.melee = true;
    near.step();
    expect(b.burnT).toBeGreaterThan(0);
    const far = fight('foundry', { melee: 'flamethrower' });
    const [c, d] = faceOff(far, 16);
    c.x = d.x = -20;
    c.input.melee = true;
    run(far, 0.5);
    expect(d.hp).toBe(d.maxHp);
  });

  it('a plow clears mines', () => {
    const match = fight('foundry', {}, { defense: 'plow', rearMelee: true });
    const [a, b] = faceOff(match, 6);
    a.x = b.x = -20;
    match.mines.push({ id: 99, owner: a.id, kind: 'mine', x: -20, z: 4, armT: 0, life: 20, damage: 50, radius: 3 });
    match.step();
    expect(match.mines).toHaveLength(0);
    expect(b.hp).toBe(b.maxHp);
  });

  it('a plow only works opposite the main weapon, which is behind by default', () => {
    /** A mine next to a robot goes off, unless a plow gets to it first. */
    const blownUp = (rearMelee: boolean, offset: number) => {
      const match = fight('foundry', {}, { defense: 'plow', rearMelee });
      const [a, b] = faceOff(match, 6);
      a.x = b.x = -20;
      // B faces A, down the z axis, so ahead of B is a lower z.
      match.mines.push({ id: 99, owner: a.id, kind: 'mine', x: -20, z: b.z + offset, armT: 0, life: 20, damage: 50, radius: 3 });
      match.step();
      return b.hp < b.maxHp;
    };
    expect(blownUp(false, 2)).toBe(false);
    expect(blownUp(false, -2)).toBe(true);
    expect(blownUp(true, -2)).toBe(false);
    expect(blownUp(true, 2)).toBe(true);
  });

  it('steel ram halves damage on the side opposite the main weapon', () => {
    const taken = (rearMelee: boolean, heading: number) => {
      const match = fight('foundry', {}, { defense: 'steelram', rearMelee });
      const [a, b] = faceOff(match, 6);
      // With this heading, A is straight ahead of B or straight behind it.
      b.heading = heading;
      match.damage(b, 20, a.id);
      return b.maxHp - b.hp;
    };
    expect(taken(false, Math.PI)).toBeCloseTo(20);
    expect(taken(false, 0)).toBeCloseTo(10);
    expect(taken(true, Math.PI)).toBeCloseTo(10);
    expect(taken(true, 0)).toBeCloseTo(20);
  });

  it('steel ram only adds to ramming when it is on the nose', () => {
    const rammed = (rearMelee: boolean) => {
      const match = fight('foundry', { defense: 'steelram', rearMelee });
      const [a, b] = faceOff(match, 6);
      a.x = b.x = -20;
      b.z = a.radius + b.radius - 0.05;
      a.vz = 20;
      a.heading = 0;
      match.step();
      return b.maxHp - b.hp;
    };
    expect(rammed(false)).toBeGreaterThan(0);
    expect(rammed(true)).toBeCloseTo(rammed(false) * 1.3, 1);
  });

  it.each(['mines', 'oil', 'glue', 'nails', 'minibot', 'remote'] as const)('%s comes out opposite the main weapon', (defense) => {
    const dropped = (rearMelee: boolean) => {
      const match = fight('foundry', { defense, rearMelee });
      const [a] = faceOff(match, 30);
      a.x = -20;
      a.input.defense = true;
      match.step();
      const [item] = [...match.mines, ...match.oil, ...match.drones];
      return item.z - a.z;
    };
    expect(dropped(false)).toBeLessThan(0);
    expect(dropped(true)).toBeGreaterThan(0);
  });

  it('landing a hit breaks your own cloak', () => {
    const match = fight('foundry', { melee: 'chainsaw' });
    const [a, b] = faceOff(match, 3);
    a.x = b.x = -20;
    a.cloakT = 5;
    a.input.melee = true;
    match.step();
    expect(a.cloakT).toBe(0);
  });

  it('kamikaze destroys the user and credits nearby kills', () => {
    const match = fight('foundry', { defense: 'kamikaze' });
    const [a, b] = faceOff(match, 4);
    a.x = b.x = -20;
    b.hp = 20;
    a.input.defense = true;
    run(match, 1.4);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
  });

  it('remote charges plant on one press and go off on the next', () => {
    const match = fight('foundry', { defense: 'remote' });
    const [a, b] = faceOff(match, 20);
    a.x = b.x = -20;
    a.input.defense = true;
    match.step();
    expect(match.mines.filter((m) => m.kind === 'charge')).toHaveLength(1);
    run(match, 0.2);
    expect(match.mines.filter((m) => m.kind === 'charge')).toHaveLength(1);
    a.input.defense = false;
    run(match, 1.2);
    b.x = match.mines[0].x;
    b.z = match.mines[0].z + 3;
    a.input.defense = true;
    match.step();
    expect(match.mines).toHaveLength(0);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('teleport moves forward and refuses to jump off a ledge', () => {
    const safe = fight('rooftop', { defense: 'teleport' });
    const [a] = faceOff(safe, 25);
    a.x = -6;
    a.z = -20;
    a.heading = 0;
    a.input.defense = true;
    safe.step();
    expect(a.z).toBeGreaterThan(-20);
    const edge = fight('rooftop', { defense: 'teleport' });
    const [c] = faceOff(edge, 25);
    c.x = 0;
    c.z = 26.4;
    c.heading = 0;
    c.input.defense = true;
    edge.step();
    expect(c.alive).toBe(true);
    expect(Math.abs(c.z)).toBeLessThan(ARENAS.rooftop.half);
    expect(c.defenseCd).toBe(0);
  });

  it('a claw carries its victim and lets go when released', () => {
    const match = fight('foundry', { melee: 'claw' });
    const [a, b] = faceOff(match, 3.2);
    a.x = b.x = -20;
    a.input.melee = true;
    a.input.throttle = 1;
    run(match, 0.6);
    expect(a.clawTarget).toBe(b.id);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(a.radius + b.radius + 1);
    expect(b.hp).toBeLessThan(b.maxHp);
    a.input.melee = false;
    match.step();
    expect(a.clawTarget).toBe(-1);
    expect(a.meleeCd).toBeGreaterThan(0);
  });

  it('mini-robot chases and explodes', () => {
    const match = fight('foundry', { defense: 'minibot' });
    const [a, b] = faceOff(match, 12);
    a.x = b.x = -20;
    a.input.defense = true;
    match.step();
    a.input.defense = false;
    expect(match.drones).toHaveLength(1);
    run(match, 3);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(match.drones).toHaveLength(0);
  });
});

describe('powerups: original four', () => {
  it('rage boosts damage, mega shield blocks it, x-ray and cloaking run on timers', () => {
    const match = duel({ powerupSlots: ['rage', 'xray'] }, { powerupSlots: ['megashield', 'cloaking'] });
    const [a, b] = match.bots;
    a.input.powerup = 'rage';
    b.input.powerup = 'megashield';
    match.step();
    expect(a.rageT).toBeGreaterThan(0);
    expect(a.powerups.rage).toBe(0);
    match.damage(b, 100, a.id);
    expect(b.maxHp - b.hp).toBeCloseTo(10);
    a.input.powerup = 'xray';
    b.input.powerup = 'cloaking';
    match.step();
    expect(a.xrayT).toBeGreaterThan(0);
    expect(b.cloakT).toBeGreaterThan(0);
  });
});

describe('arenas', () => {
  it('driving off an open edge destroys the robot and credits whoever hit it last', () => {
    const match = fight('rooftop');
    const [a, b] = faceOff(match, 10);
    b.x = 0;
    b.z = ARENAS.rooftop.half + 0.5;
    b.lastAttacker = a.id;
    match.step();
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    const kill = match.drainEvents().find((e) => e.type === 'kill');
    expect(kill).toMatchObject({ fell: true });
  });

  it('pits destroy robots, and walled maps hold them in', () => {
    const match = fight('rooftop');
    const [, b] = faceOff(match, 10);
    b.x = 0;
    b.z = 0;
    match.step();
    expect(b.alive).toBe(false);

    const walled = fight('foundry');
    const [c] = faceOff(walled, 10);
    c.x = 12;
    c.z = 29;
    c.heading = 0;
    c.input.throttle = 1;
    run(walled, 1);
    expect(c.alive).toBe(true);
    expect(c.z).toBeLessThanOrEqual(ARENAS.foundry.half);
  });

  it('fire pits burn, shock coils stun while charged, pistons fling', () => {
    const hot = fight('furnace');
    const [a] = faceOff(hot, 25);
    const fire = ARENAS.furnace.firePits[0];
    a.x = fire.x;
    a.z = fire.z;
    run(hot, 0.5);
    expect(a.hp).toBeLessThan(a.maxHp);

    const shock = fight('furnace');
    const [s, t] = faceOff(shock, 25);
    t.x = 25;
    t.z = 8;
    s.x = 0;
    s.z = 0;
    shock.step();
    expect(s.stunT).toBeGreaterThan(0);

    const piston = ARENAS.foundry.pistons[0];
    const fling = fight('foundry');
    const [p, q] = faceOff(fling, 25);
    q.x = -25;
    q.z = -8;
    p.x = piston.x - 5;
    p.z = piston.z;
    let moved = 0;
    for (let i = 0; i < 300 && moved === 0; i++) {
      p.x = piston.x - 5;
      p.z = piston.z;
      p.vx = p.vz = 0;
      fling.step();
      if (p.vx < -5) moved = p.vx;
    }
    expect(moved).toBeLessThan(-5);
  });

  it('low grip lets robots slide', () => {
    const slide = (id: keyof typeof ARENAS) => {
      const match = fight(id);
      const [a, b] = faceOff(match, 20);
      b.x = -6;
      b.z = 22;
      a.x = -6;
      a.z = 0;
      a.heading = Math.PI / 2;
      a.vx = 0;
      a.vz = 10;
      run(match, 0.3);
      return Math.abs(a.vz);
    };
    expect(slide('glacier')).toBeGreaterThan(slide('foundry'));
  });

  it('every map plays out with AI: spawns on safe ground, nothing breaks', () => {
    for (const id of ARENA_ORDER) {
      const def = ARENAS[id];
      const match = new Match(makeRivals(newSave(), 6, 5), { seed: 5, arena: id });
      for (const spawn of def.spawns) {
        expect(match.isSafeGround(spawn.x, spawn.z, 1.8), `${id} spawn ${spawn.x},${spawn.z}`).toBe(true);
      }
      let steps = 0;
      while (!match.over && steps++ < 60 * 200) {
        match.step();
        for (const bot of match.bots) expect(Number.isFinite(bot.x) && Number.isFinite(bot.z), id).toBe(true);
      }
      expect(match.over, id).toBe(true);
      expect(match.bots.reduce((sum, b) => sum + b.kills + b.deaths, 0), id).toBeGreaterThan(0);
    }
    // A full AI match on every map takes a while on a slow CI machine.
  }, 30_000);

  it('repair spots and the hill sit on reachable ground', () => {
    for (const id of ARENA_ORDER) {
      const def = ARENAS[id];
      const match = new Match(makeRivals(newSave(), 2, 1), { seed: 1, arena: id });
      for (const spot of def.repairSpots) {
        expect(def.pits.some((p) => Math.hypot(p.x - spot.x, p.z - spot.z) < p.r + 1), `${id} repair`).toBe(false);
      }
      expect(match.isSafeGround(def.hill.x, def.hill.z, 0) || def.pits.length === 0, `${id} hill`).toBe(true);
    }
  });
});

describe('modes', () => {
  it('last robot standing removes the dead for good, and ends with one left', () => {
    const match = new Match(makeRivals(newSave(), 3, 2), { seed: 2, mode: 'lms' });
    match.bots.forEach((b) => (b.invulnT = 0));
    const [a, b, c] = match.bots;
    match.damage(a, 9999, c.id);
    expect(a.out).toBe(true);
    run(match, MATCH.respawnTime + 1);
    expect(a.alive).toBe(false);
    b.invulnT = 0;
    match.damage(b, 9999, c.id);
    match.step();
    expect(match.over).toBe(true);
    const order = match.standings().map((s) => s.bot);
    expect(order[0]).toBe(c);
    expect(order[1]).toBe(b);
    expect(order[2]).toBe(a);
  });

  it('king of the hill pays in full to a robot alone in the zone, and splits it when shared', () => {
    const match = fight('pit', {}, {}, 'koth');
    const [a, b] = match.bots;
    const { hill } = match.arena;
    a.x = hill.x;
    a.z = hill.z;
    b.x = 26;
    b.z = 26;
    run(match, 1);
    expect(a.hillScore).toBeGreaterThan(0.9);
    const held = a.hillScore;
    b.x = hill.x + 3;
    b.z = hill.z;
    a.x = hill.x - 3;
    a.z = hill.z;
    a.vx = a.vz = b.vx = b.vz = 0;
    run(match, 0.5);
    expect(a.hillScore).toBeCloseTo(held + 0.25, 1);
    expect(b.hillScore).toBeCloseTo(0.25, 1);
    a.hillScore = match.hillTarget;
    match.step();
    expect(match.over).toBe(true);
    expect(match.standings()[0].bot).toBe(a);
  });
});
