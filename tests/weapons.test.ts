import { describe, expect, it } from 'vitest';
import { newSave } from '../src/game/progress';
import { ARENA_ORDER, ARENAS, TRAP_NAMES } from '../src/sim/arena';
import { BATTERY_REGEN, BOOST_DRAIN, BURN_TIME, FLIP_TIME, leaveWait, MELEE, REWARD, SPECTATE, TRAP } from '../src/sim/data';
import type { SnapshotMessage } from '../src/net/protocol';
import { applyBotState, applyWorldState, encodeSnapshot } from '../src/net/snapshot';
import { Match, type Bot, type BotSetup, type Loadout } from '../src/sim/match';

const pilot = (name: string, over: Partial<Loadout> = {}): BotSetup => ({ name, color: 0, isAI: false, loadout: { ...newSave().loadout, ...over } });

function fight(a: Partial<Loadout> = {}, b: Partial<Loadout> = {}, arena: 'foundry' | 'skyscraper' = 'foundry'): [Match, Bot, Bot] {
  const match = new Match([pilot('A', a), pilot('B', b)], { seed: 1, arena, mode: 'ffa' });
  const [x, y] = match.bots;
  x.invulnT = y.invulnT = 0;
  // A clear stretch of the foundry, with A facing B.
  x.x = y.x = -20;
  x.z = -5;
  x.heading = 0;
  y.z = 0;
  y.heading = Math.PI;
  return [match, x, y];
}

const run = (match: Match, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) match.step();
};

describe('weapons that used to be guns', () => {
  it('a flamethrower reaches further than anything else, sets robots burning and drains the battery', () => {
    const [match, a, b] = fight({ melee: 'flamethrower' });
    b.z = a.z + 6;
    a.input.melee = true;
    const battery = a.ammo;
    run(match, 0.5);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(b.burnT).toBeGreaterThan(0);
    expect(b.burnT).toBeLessThanOrEqual(BURN_TIME);
    expect(a.ammo).toBeLessThan(battery);
    expect(MELEE.flamethrower.range).toBeGreaterThan(MELEE.chainsaw.range);
  });

  it('a flamethrower with an empty battery does nothing', () => {
    const [match, a, b] = fight({ melee: 'flamethrower' });
    b.z = a.z + 6;
    a.ammo = 0;
    a.input.melee = true;
    match.step();
    expect(b.hp).toBe(b.maxHp);
    expect(a.meleeActive).toBe(false);
  });

  it('a Tesla Coil stuns its target and jumps to one more robot nearby, for half', () => {
    const match = new Match([pilot('A', { melee: 'tesla' }), pilot('B'), pilot('C')], { seed: 1, arena: 'foundry', mode: 'ffa' });
    const [a, b, c] = match.bots;
    a.invulnT = b.invulnT = c.invulnT = 0;
    a.x = b.x = -20;
    a.z = -5;
    a.heading = 0;
    b.z = -1;
    c.x = -15;
    c.z = 2;
    a.input.melee = true;
    run(match, 0.2);
    const bHit = b.maxHp - b.hp;
    const cHit = c.maxHp - c.hp;
    expect(bHit).toBeGreaterThan(0);
    expect(cHit).toBeCloseTo(bHit / 2, 1);
    expect(b.stunT).toBeGreaterThan(0);
    expect(match.drainEvents().some((e) => e.type === 'arc' && e.points.length === 3)).toBe(true);
  });

  it('a spear reaches far but only in a narrow line', () => {
    const [match, a, b] = fight({ melee: 'spear' });
    b.z = a.z + 4.5;
    a.input.melee = true;
    run(match, 0.2);
    expect(b.hp).toBeLessThan(b.maxHp);
    const [miss, c, d] = fight({ melee: 'spear' });
    d.x = c.x + 3;
    d.z = c.z + 2;
    c.input.melee = true;
    run(miss, 0.2);
    expect(d.hp).toBe(d.maxHp);
  });
});

describe('big matches', () => {
  const crowd = (over: Partial<Loadout> = {}) => {
    const match = new Match(Array.from({ length: 8 }, (_, i) => pilot(`P${i}`, i === 0 ? over : {})), { seed: 1, arena: 'foundry', mode: 'ffa' });
    match.bots.forEach((bot) => (bot.invulnT = 0));
    return match;
  };

  it('pays an assist to whoever helped with a kill, and not to whoever finished it', () => {
    const match = crowd();
    const [a, b, c] = match.bots;
    match.damage(c, 10, a.id);
    match.damage(c, 9999, b.id);
    expect(b.kills).toBe(1);
    expect(b.assists).toBe(0);
    expect(a.assists).toBe(1);
    expect(a.earned).toBeGreaterThanOrEqual(REWARD.assist);
  });

  it('forgets old damage, so an assist has to be recent', () => {
    const match = crowd();
    const [a, b, c] = match.bots;
    match.damage(c, 10, a.id);
    run(match, 7);
    c.invulnT = 0;
    match.damage(c, 9999, b.id);
    expect(a.assists).toBe(0);
  });

  it('a blast is shared out across a crowd', () => {
    const alone = crowd();
    alone.bots.forEach((bot, i) => {
      bot.x = 20 + i * 5;
      bot.z = 25;
    });
    const [ownerA, oneA] = alone.bots;
    oneA.x = oneA.z = 0;
    alone.explode(0, 0, 40, 6, ownerA.id, false);
    const single = oneA.maxHp - oneA.hp;

    const packed = crowd();
    const [owner, ...rest] = packed.bots;
    owner.x = 25;
    owner.z = 25;
    rest.forEach((bot) => {
      bot.x = 0;
      bot.z = 0;
    });
    packed.explode(0, 0, 40, 6, owner.id, false);
    expect(rest[0].maxHp - rest[0].hp).toBeLessThan(single * 0.5);
  });

  it('chained stuns get shorter, so nobody can be held still by a crowd', () => {
    const match = crowd({ defense: 'emp' });
    const [a, b] = match.bots;
    b.x = a.x + 3;
    b.z = a.z;
    a.input.defense = true;
    match.step();
    const first = b.stunT;
    expect(first).toBeGreaterThan(1);
    b.stunT = 0;
    a.defenseCd = 0;
    match.step();
    expect(b.stunT).toBeLessThan(first / 2);
  });

  it('landing a hit ends your spawn protection and your cloak', () => {
    const match = crowd();
    const [a, b] = match.bots;
    a.invulnT = 2;
    a.cloakT = 3;
    match.damage(b, 5, a.id);
    expect(a.invulnT).toBe(0);
    expect(a.cloakT).toBe(0);
  });

  it('repairs turn up more often with more robots', () => {
    const count = (players: number) => {
      const match = new Match(Array.from({ length: players }, (_, i) => pilot(`P${i}`)), { seed: 1, arena: 'pit', mode: 'ffa' });
      let seen = 0;
      for (let i = 0; i < 60 * 40; i++) {
        match.bots.forEach((bot) => {
          bot.hp = bot.maxHp;
          bot.x = 30;
          bot.z = 30;
        });
        match.step();
        seen = Math.max(seen, match.pickups.filter((p) => p.kind === 'repair').length);
      }
      return seen;
    };
    expect(count(8)).toBeGreaterThan(count(2));
  });

  it('a crowded hill still moves toward a winner, by sharing the points', () => {
    const match = new Match(Array.from({ length: 8 }, (_, i) => pilot(`P${i}`)), { seed: 1, arena: 'foundry', mode: 'koth' });
    expect(match.hillTarget).toBeLessThan(45);
    const [a, b] = match.bots;
    match.bots.forEach((bot) => {
      bot.invulnT = 99;
      bot.x = 25;
      bot.z = 25;
    });
    a.x = b.x = match.arena.hill.x;
    a.z = b.z = match.arena.hill.z;
    run(match, 1);
    expect(a.hillScore).toBeGreaterThan(0.3);
    expect(a.hillScore).toBeLessThan(0.7);
  });

  it('bots spread out rather than all chasing one robot', () => {
    const match = new Match(Array.from({ length: 8 }, (_, i) => ({ ...pilot(`P${i}`), isAI: true })), { seed: 3, arena: 'pit', mode: 'ffa' });
    run(match, 4);
    const chased = match.bots.map((bot) => match.chasersOf(bot.id, -1));
    expect(Math.max(...chased)).toBeLessThan(7);
    expect(chased.filter((n) => n > 0).length).toBeGreaterThan(1);
  });
});

describe('spectating', () => {
  /** A's robot is wrecked, with two rivals still fighting. */
  const knockedOut = (arena: 'foundry' | 'skyscraper' = 'foundry') => {
    const match = new Match([pilot('A', {}), pilot('B', {}), pilot('C', {})], { seed: 1, arena, mode: 'lms' });
    const [a, b, c] = match.bots;
    a.invulnT = b.invulnT = c.invulnT = 0;
    b.x = -20;
    b.z = 0;
    c.x = 20;
    c.z = 20;
    match.damage(a, 9999, -1);
    expect(a.out).toBe(true);
    a.trapX = b.x;
    a.trapZ = b.z;
    return { match, a, b, c };
  };

  it('pays for every second, and only to someone still there', () => {
    const { match, a } = knockedOut();
    const before = a.earned;
    run(match, 10);
    expect(a.earned - before).toBeCloseTo(SPECTATE.payPerSecond * 10, 0);
    expect(match.standings().find((row) => row.bot === a)!.total).toBeGreaterThanOrEqual(REWARD.minimum);
  });

  it('makes the leave timer scale with how long you lasted, within limits', () => {
    expect(leaveWait(0)).toBe(10);
    expect(leaveWait(39)).toBe(10);
    expect(leaveWait(80)).toBe(20);
    expect(leaveWait(170)).toBe(30);
  });

  it('steers the marker with the driving keys, and keeps it on the map', () => {
    const { match, a } = knockedOut();
    a.trapX = a.trapZ = 0;
    a.input.throttle = 1;
    a.input.steer = -1;
    run(match, 0.5);
    expect(a.trapZ).toBeCloseTo(SPECTATE.markerSpeed * 0.5, 0);
    expect(a.trapX).toBeCloseTo(-SPECTATE.markerSpeed * 0.5, 0);
    run(match, 10);
    expect(a.trapZ).toBe(match.arena.half);
    expect(a.trapX).toBe(-match.arena.half);
  });

  it('warns before a strike lands, which credits the spectator and throws robots clear', () => {
    const { match, a, b } = knockedOut();
    a.input.melee = true;
    match.step();
    a.input.melee = false;
    expect(match.traps).toHaveLength(1);
    run(match, TRAP.strike.warning - 0.2);
    expect(b.hp).toBe(b.maxHp);
    const earned = a.earned;
    run(match, 0.3);
    expect(match.traps).toHaveLength(0);
    expect(b.hp).toBe(b.maxHp - TRAP.strike.damage);
    expect(a.damageDealt).toBe(TRAP.strike.damage);
    expect(a.earned).toBeGreaterThan(earned);
    expect(a.strikeCd).toBeGreaterThan(0);
  });

  it('can move out of the way of a strike', () => {
    const { match, a, b } = knockedOut();
    a.input.melee = true;
    match.step();
    a.input.melee = false;
    b.x += TRAP.strike.radius * 3;
    run(match, TRAP.strike.warning + 0.2);
    expect(b.hp).toBe(b.maxHp);
  });

  it('waits out the cooldown, however long the key is held', () => {
    const { match, a } = knockedOut();
    a.input.melee = true;
    let strikes = 0;
    for (let i = 0; i < 60 * (TRAP.strike.cooldown - 1); i++) {
      const before = match.traps.length;
      match.step();
      if (match.traps.length > before) strikes++;
    }
    expect(strikes).toBe(1);
  });

  it('spills the map\'s patch, and pulls robots toward the marker', () => {
    const { match, a, b } = knockedOut('skyscraper');
    a.input.boost = true;
    match.step();
    a.input.boost = false;
    const patch = match.oil.find((p) => p.owner === a.id)!;
    expect(patch.kind).toBe(TRAP_NAMES.skyscraper.patch);

    const near = knockedOut();
    near.a.trapX = near.b.x + 5;
    near.a.input.defense = true;
    near.match.step();
    near.a.input.defense = false;
    near.b.vx = near.b.vz = 0;
    run(near.match, 0.5);
    expect(near.b.vx).toBeGreaterThan(0);
    expect(b).toBeDefined();
  });

  it('is only for humans, and not for anyone who walked away', () => {
    const { match, a } = knockedOut();
    a.isAI = true;
    a.input.melee = true;
    const earned = a.earned;
    run(match, 1);
    expect(match.traps).toHaveLength(0);
    expect(a.earned).toBe(earned);
  });

  it('gives every map its own traps', () => {
    for (const id of ARENA_ORDER) expect(TRAP_NAMES[id].strike, id).toBeTruthy();
    expect(new Set(ARENA_ORDER.map((id) => TRAP_NAMES[id].strike)).size).toBe(ARENA_ORDER.length);
  });

  it('sends the marker and traps to clients', () => {
    const { match, a } = knockedOut();
    a.trapX = 4;
    a.input.melee = true;
    match.step();
    const snap = { t: 'snap', ack: 0, ...encodeSnapshot(match, []) } as SnapshotMessage;
    const copy = new Match([pilot('A', {}), pilot('B', {}), pilot('C', {})], { seed: 1, arena: 'foundry', mode: 'lms' });
    applyBotState(copy.bots[0], snap.bots[0]);
    applyWorldState(copy, snap, 0);
    expect(copy.bots[0].trapX).toBe(4);
    expect(copy.bots[0].strikeCd).toBeGreaterThan(0);
    expect(copy.traps[0]).toMatchObject({ kind: 'strike', x: 4, owner: a.id });
  });
});

describe('cooldowns', () => {
  it('a spinner cannot spin back up until its cooldown is over', () => {
    const [match, a, b] = fight({ melee: 'vertbar' });
    b.z = a.z + 2.8;
    a.meleeCharge = 1;
    a.input.melee = true;
    match.step();
    expect(a.meleeCd).toBeCloseTo(MELEE.vertbar.cooldown, 1);
    const charge = a.meleeCharge;
    b.z = 25;
    run(match, 1);
    expect(a.meleeCharge).toBeLessThan(charge);
    expect(a.meleeActive).toBe(false);
    run(match, MELEE.vertbar.cooldown);
    expect(a.meleeActive).toBe(true);
    expect(a.meleeCharge).toBeGreaterThan(0);
  });

  it('every strong weapon has a real cooldown', () => {
    for (const id of ['hammer', 'vertbar', 'flipper', 'crusher', 'claw'] as const) {
      expect(MELEE[id].cooldown, id).toBeGreaterThanOrEqual(1);
    }
  });

  it('the drill overheats if held too long, then recovers', () => {
    const [match, a, b] = fight({ melee: 'drill' });
    b.z = 25;
    a.input.melee = true;
    run(match, (MELEE.drill.runTime ?? 0) - 0.1);
    expect(a.meleeActive).toBe(true);
    run(match, 0.3);
    expect(a.meleeActive).toBe(false);
    expect(a.meleeCd).toBeGreaterThan(0);
    run(match, MELEE.drill.cooldown);
    expect(a.meleeActive).toBe(true);
  });

  it('letting go of the drill resets how hot it is', () => {
    const [match, a, b] = fight({ melee: 'drill' });
    b.z = 25;
    a.input.melee = true;
    run(match, 2);
    a.input.melee = false;
    match.step();
    a.input.melee = true;
    run(match, 2);
    expect(a.meleeCd).toBe(0);
    expect(a.meleeActive).toBe(true);
  });
});

describe('flash bomb', () => {
  it('is brief, short range and slow to come back', () => {
    const [match, a, b] = fight({ defense: 'flash' });
    b.z = a.z + 6;
    a.input.defense = true;
    match.step();
    a.input.defense = false;
    expect(b.blindT).toBeGreaterThan(0);
    expect(b.blindT).toBeLessThanOrEqual(1.6);
    run(match, 1.7);
    expect(b.blindT).toBe(0);
    expect(a.defenseCd).toBeGreaterThan(8);
  });

  it('does not reach far', () => {
    const [match, a, b] = fight({ defense: 'flash' });
    b.z = a.z + 14;
    a.input.defense = true;
    match.step();
    expect(b.blindT).toBe(0);
  });
});

describe('speed boost', () => {
  const topSpeed = (boost: boolean) => {
    const [match, a, b] = fight();
    b.x = 20;
    a.x = -24;
    a.z = -28;
    a.input.throttle = 1;
    a.input.boost = boost;
    // Long enough to reach top speed on the clear lane along the wall.
    run(match, 1.2);
    return { speed: Math.hypot(a.vx, a.vz), battery: a.ammo, boostT: a.boostT };
  };

  it('goes faster while held, paid for from the battery', () => {
    const plain = topSpeed(false);
    const boosted = topSpeed(true);
    expect(boosted.speed).toBeGreaterThan(plain.speed * 1.2);
    expect(boosted.battery).toBeCloseTo(1 - BOOST_DRAIN * 1.2, 1);
    expect(plain.battery).toBe(1);
    expect(boosted.boostT).toBeGreaterThan(0);
  });

  it('stops when the battery is empty, and the battery recovers when released', () => {
    const [match, a] = fight();
    a.ammo = 0;
    a.input.boost = true;
    a.input.throttle = 1;
    run(match, 0.5);
    expect(a.boostT).toBe(0);
    a.input.boost = false;
    run(match, 1);
    expect(a.ammo).toBeCloseTo(BATTERY_REGEN * 1.5, 1);
  });

  it('a better power source recovers faster', () => {
    const [match, a, b] = fight({ power: 'reactor' });
    a.ammo = b.ammo = 0.1;
    run(match, 1);
    expect(a.ammo).toBeGreaterThan(b.ammo);
  });

  it('the Battery Pack refills it at once, and is not wasted when full', () => {
    const [match, a] = fight();
    const held = a.powerups.battery;
    a.input.powerup = 'battery';
    match.step();
    expect(a.powerups.battery).toBe(held);
    a.ammo = 0.1;
    a.input.powerup = 'battery';
    match.step();
    expect(a.ammo).toBeCloseTo(1, 1);
    expect(a.powerups.battery).toBe(held - 1);
  });
});

describe('spinners', () => {
  const hitAt = (melee: Loadout['melee'], spin: number) => {
    const [match, a, b] = fight({ melee }, {}, 'foundry');
    b.z = a.z + 2.8;
    a.meleeCharge = spin;
    a.input.melee = true;
    match.step();
    return { damage: b.maxHp - b.hp, a, b, match };
  };

  it('hit in proportion to how fast they are turning', () => {
    const slow = hitAt('vertdisc', 0.3).damage;
    const fast = hitAt('vertdisc', 1).damage;
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow * 2.5);
    expect(fast).toBeCloseTo(MELEE.vertdisc.damage, 0);
  });

  it('do nothing until spun up past a minimum', () => {
    expect(hitAt('vertdisc', 0).damage).toBe(0);
  });

  it('take time to wind up, and wind down when released', () => {
    const [match, a, b] = fight({ melee: 'vertbar' });
    b.z = 20;
    a.input.melee = true;
    run(match, MELEE.vertbar.windup / 2);
    expect(a.meleeCharge).toBeCloseTo(0.5, 1);
    run(match, MELEE.vertbar.windup);
    expect(a.meleeCharge).toBe(1);
    a.input.melee = false;
    run(match, 1);
    expect(a.meleeCharge).toBeLessThan(1);
  });

  it('spend their energy in a hit, and throw both robots apart', () => {
    const { a, b } = hitAt('vertdisc', 1);
    expect(a.meleeCharge).toBeLessThan(0.3);
    expect(b.vz).toBeGreaterThan(0);
    expect(a.vz).toBeLessThan(0);
  });

  it('a hard hit from a vertical spinner or drum gets a robot off the ground, and a weak one does not', () => {
    expect(hitAt('vertdisc', 1).b.airT).toBeGreaterThan(0);
    expect(hitAt('drum', 1).b.airT).toBeGreaterThan(0);
    expect(hitAt('vertdisc', 0.3).b.airT).toBe(0);
    expect(hitAt('horizbar', 1).b.airT).toBe(0);
  });

  it('an undercutter goes for the wheels', () => {
    expect(hitAt('undercutter', 1).b.slowT).toBeGreaterThan(0);
  });

  it('a ring spinner hits from nearly every side, and costs top speed', () => {
    const [match, a, b] = fight({ melee: 'shell' });
    b.x = a.x + 2;
    b.z = a.z - 2;
    a.meleeCharge = 1;
    a.input.melee = true;
    match.step();
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(a.chassis.speed).toBeLessThan(b.chassis.speed);
    // Dead astern is the way to get at one.
    const [blind, c, d] = fight({ melee: 'shell' });
    d.z = c.z - 2.8;
    c.meleeCharge = 1;
    c.input.melee = true;
    blind.step();
    expect(d.hp).toBe(d.maxHp);
  });

  it('a horizontal bar reaches wider than a vertical disc', () => {
    const offCentre = (melee: Loadout['melee']) => {
      const [match, a, b] = fight({ melee });
      b.x = a.x + 2;
      b.z = a.z + 2.4;
      a.meleeCharge = 1;
      a.input.melee = true;
      match.step();
      return b.hp < b.maxHp;
    };
    expect(offCentre('horizbar')).toBe(true);
    expect(offCentre('vertdisc')).toBe(false);
  });
});

describe('thrown robots', () => {
  it('cannot steer in the air, and carry on when they land', () => {
    const [match, a, b] = fight();
    b.z = 20;
    a.airT = 0.5;
    a.vx = 0;
    a.vz = 5;
    a.input.throttle = -1;
    a.input.steer = 1;
    const heading = a.heading;
    run(match, 0.3);
    expect(a.heading).toBe(heading);
    expect(a.vz).toBe(5);
    run(match, 0.5);
    expect(a.heading).not.toBe(heading);
  });

  it('do not bump into anything while airborne', () => {
    const [match, a, b] = fight();
    b.z = a.z + 0.5;
    a.airT = 1;
    const before = b.z;
    match.step();
    expect(b.z).toBe(before);
  });

  it('a flipper near the edge throws them off the roof', () => {
    const [match, a, b] = fight({ melee: 'flipper' }, {}, 'skyscraper');
    const half = ARENAS.skyscraper.half;
    a.x = half - 6;
    a.z = -8;
    a.heading = Math.PI / 2;
    b.x = half - 3.5;
    b.z = -8;
    a.input.melee = true;
    const battery = a.ammo;
    match.step();
    run(match, 0.2);
    a.input.melee = false;
    expect(a.ammo).toBeLessThan(battery);
    expect(b.airT).toBeGreaterThan(0);
    // It stays up while over the drop, and only falls when it comes down.
    expect(b.alive).toBe(true);
    run(match, 1.6);
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
  });

  it('a flipped robot lands helpless, then rights itself after a few seconds', () => {
    const [match, a, b] = fight({ melee: 'flipper' });
    b.z = a.z + 3;
    a.input.melee = true;
    run(match, 0.2);
    a.input.melee = false;
    expect(b.flipT).toBeGreaterThan(0);
    const landsAt = b.airT;
    run(match, landsAt + 1);
    expect(b.airT).toBe(0);
    expect(b.flipT).toBeGreaterThan(0);

    // Back on the ground but still on its back, so the wheels do nothing and nor do the weapons.
    const { x, z, heading } = b;
    b.vx = b.vz = 0;
    b.input.throttle = 1;
    b.input.steer = 1;
    run(match, 1);
    expect(Math.hypot(b.x - x, b.z - z)).toBeLessThan(0.01);
    expect(b.heading).toBe(heading);

    run(match, FLIP_TIME);
    expect(b.flipT).toBe(0);
    expect(b.stunT).toBe(0);
    const before = { x: b.x, z: b.z };
    run(match, 0.5);
    expect(Math.hypot(b.x - before.x, b.z - before.z)).toBeGreaterThan(0.5);
  });

  it('a flipper can never keep a robot on its back forever', () => {
    expect(MELEE.flipper.cooldown).toBeGreaterThan((MELEE.flipper.launch ?? 0) + FLIP_TIME);
  });

  it('only the flipper leaves robots upside down', () => {
    const [match, a, b] = fight({ melee: 'vertbar' });
    b.z = a.z + 3;
    a.input.melee = true;
    run(match, 3);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(b.flipT).toBe(0);
  });

  it('a flipper with an empty battery does nothing', () => {
    const [match, a, b] = fight({ melee: 'flipper' });
    b.z = a.z + 2.8;
    a.ammo = 0;
    a.input.melee = true;
    run(match, 0.3);
    expect(b.airT).toBe(0);
  });
});

describe('other new weapons', () => {
  it('a hammer saw lands a hit, then keeps cutting while held', () => {
    const [match, a, b] = fight({ melee: 'hammersaw' });
    b.z = a.z + 2.8;
    a.input.melee = true;
    run(match, 0.5);
    const afterHit = b.hp;
    expect(afterHit).toBeLessThan(b.maxHp - MELEE.hammersaw.damage + 1);
    run(match, 0.5);
    expect(b.hp).toBeLessThan(afterHit);
    expect(a.meleeActive).toBe(true);
  });

  it('a crusher holds on and does far more damage than the claw, for less time', () => {
    const grip = (melee: 'crusher' | 'claw') => {
      const [match, a, b] = fight({ melee });
      b.z = a.z + 2.8;
      a.input.melee = true;
      run(match, 1);
      expect(a.clawTarget).toBe(b.id);
      return b.maxHp - b.hp;
    };
    expect(grip('crusher')).toBeGreaterThan(grip('claw') * 1.5);
    expect(MELEE.crusher.windup).toBeLessThan(MELEE.claw.windup);
  });

  it('lifting forks carry a robot where you drive, doing almost no damage', () => {
    const [match, a, b] = fight({ melee: 'forks' });
    b.z = a.z + 2.8;
    a.input.melee = true;
    a.input.throttle = 1;
    const start = b.z;
    run(match, 1.5);
    expect(a.clawTarget).toBe(b.id);
    expect(b.z).toBeGreaterThan(start + 3);
    expect(b.maxHp - b.hp).toBeLessThan(25);
  });

  it('every melee weapon can be fought with by the AI without breaking the match', () => {
    for (const melee of Object.keys(MELEE) as Loadout['melee'][]) {
      const ai = (name: string): BotSetup => ({ ...pilot(name, { melee }), isAI: true, skill: 0.8 });
      const match = new Match([ai('A'), ai('B')], { seed: 3, arena: 'pit', mode: 'duel', duration: 40 });
      for (let i = 0; i < 60 * 45 && !match.over; i++) match.step();
      expect(match.over, melee).toBe(true);
      for (const bot of match.bots) expect(Number.isFinite(bot.x + bot.z + bot.hp), melee).toBe(true);
    }
  });
});
