import { describe, expect, it } from 'vitest';
import { newSave } from '../src/game/progress';
import { ARENAS } from '../src/sim/arena';
import { BATTERY_REGEN, BOOST_DRAIN, MELEE, TURRETS, type TurretId } from '../src/sim/data';
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

describe('guns', () => {
  it('fire only where the robot points, however close something is off to the side', () => {
    const [match, a, b] = fight({ turret: 'minigun' });
    b.x = a.x + 6;
    b.z = a.z;
    a.input.turret = true;
    run(match, 1);
    expect(b.hp).toBe(b.maxHp);
    expect(match.projectiles.every((p) => Math.abs(p.vx) < 1e-6 && p.vz > 0)).toBe(true);
  });

  it('hit when the robot is turned to face the target', () => {
    const [match, a, b] = fight({ turret: 'minigun' });
    b.x = a.x + 6;
    b.z = a.z;
    a.heading = Math.PI / 2;
    a.input.turret = true;
    run(match, 1);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('nothing steers itself after being fired', () => {
    for (const turret of Object.keys(TURRETS) as TurretId[]) {
      const [match, a, b] = fight({ turret });
      b.x = a.x + 8;
      a.input.turret = true;
      match.step();
      a.input.turret = false;
      const before = new Map(match.projectiles.map((p) => [p.id, [p.vx, p.vz]]));
      for (let i = 0; i < 10; i++) match.step();
      for (const p of match.projectiles) {
        // Later rounds of a burst weren't in the air yet, and grenades and discs bounce.
        if (before.has(p.id) && turret !== 'grenade' && turret !== 'discs') expect([p.vx, p.vz], turret).toEqual(before.get(p.id));
      }
    }
  });

  it('run out of shots for that life, and get them back on the next', () => {
    const [match, a] = fight({ turret: 'rockets' });
    a.input.turret = true;
    a.ammo = 1;
    for (let i = 0; i < 60 * 30; i++) {
      a.ammo = 1;
      match.step();
    }
    expect(a.shots).toBe(0);
    const fired = match.projectiles.length;
    run(match, 4);
    expect(match.projectiles.length).toBeLessThanOrEqual(fired);

    a.input.turret = false;
    a.invulnT = 0;
    match.damage(a, 9999, -1);
    run(match, 4);
    expect(a.alive).toBe(true);
    expect(a.shots).toBe(TURRETS.rockets.shots);
    expect(a.ammo).toBe(1);
  });

  it('cost battery, so a battery can run dry before the shots do', () => {
    const [match, a] = fight({ turret: 'bunkerbuster' });
    a.ammo = TURRETS.bunkerbuster.battery / 2;
    a.input.turret = true;
    match.step();
    expect(a.shots).toBe(TURRETS.bunkerbuster.shots);
    expect(match.projectiles).toHaveLength(0);
  });

  it('a stunned or airborne robot cannot fire', () => {
    const [match, a] = fight();
    a.input.turret = true;
    a.airT = 1;
    match.step();
    expect(match.projectiles).toHaveLength(0);
    a.airT = 0;
    a.stunT = 1;
    match.step();
    expect(match.projectiles).toHaveLength(0);
  });

  it('a whole life of gunfire cannot wreck a starter robot, so melee has to finish the job', () => {
    const armour = new Match([pilot('A')], { seed: 1 }).bots[0].maxHp;
    for (const [id, gun] of Object.entries(TURRETS)) {
      // The flamethrower has no shot count, so its limit is one full battery.
      const total = gun.shots > 0 ? gun.shots * (gun.burst ?? 1) * gun.damage : gun.damage / gun.battery;
      expect(total, id).toBeLessThan(armour);
    }
  });

  it('the arc coil misses what it cannot see', () => {
    const [match, a, b] = fight({ turret: 'arc' });
    b.cloakT = 5;
    a.input.turret = true;
    match.step();
    expect(b.hp).toBe(b.maxHp);
    a.xrayT = 5;
    a.turretCd = 0;
    b.cloakT = 5;
    match.step();
    expect(b.hp).toBeLessThan(b.maxHp);
  });
});

describe('chaingun bursts', () => {
  it('one press fires 10 rounds and uses one shot, even if the key is let go at once', () => {
    const [match, a] = fight({ turret: 'minigun' });
    const start = a.shots;
    a.input.turret = true;
    match.step();
    a.input.turret = false;
    expect(a.shots).toBe(start - 1);
    let fired = 0;
    for (let i = 0; i < 60; i++) {
      match.step();
      fired += match.drainEvents().filter((e) => e.type === 'shot').length;
    }
    expect(fired).toBe(10);
    expect(a.burstLeft).toBe(0);
    expect(a.shots).toBe(start - 1);
    expect(TURRETS.minigun.burst).toBe(10);
  });

  it('the next burst has to wait for the cooldown, however long the key is held', () => {
    const [match, a] = fight({ turret: 'minigun' });
    const start = a.shots;
    a.input.turret = true;
    run(match, 1);
    expect(a.shots).toBe(start - 1);
    run(match, TURRETS.minigun.cooldown);
    expect(a.shots).toBe(start - 2);
  });

  it('every round flies straight ahead and can hit', () => {
    const [match, a, b] = fight({ turret: 'minigun' });
    a.input.turret = true;
    match.step();
    a.input.turret = false;
    run(match, 1.5);
    expect(b.hp).toBeCloseTo(b.maxHp - TURRETS.minigun.damage * 10, 1);
  });

  it('a burst stops when the robot is stunned or destroyed, and a new life starts clean', () => {
    const [match, a] = fight({ turret: 'minigun' });
    a.input.turret = true;
    match.step();
    a.input.turret = false;
    expect(a.burstLeft).toBeGreaterThan(0);
    a.invulnT = 0;
    match.damage(a, 9999, -1);
    expect(a.burstLeft).toBe(0);
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
    for (const id of ['vertbar', 'vertdisc', 'horizbar', 'shell', 'hammer', 'hammersaw', 'flipper', 'crusher'] as const) {
      expect(MELEE[id].cooldown, id).toBeGreaterThanOrEqual(2.5);
    }
    for (const id of ['rockets', 'heavyrocket', 'bunkerbuster', 'mortar', 'laser'] as const) {
      expect(TURRETS[id].cooldown, id).toBeGreaterThanOrEqual(3);
    }
    expect(TURRETS.bunkerbuster.cooldown).toBeGreaterThan(TURRETS.rockets.cooldown);
    expect(MELEE.vertbar.cooldown).toBeGreaterThan(MELEE.drum.cooldown);
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

  it('a ring spinner hits from every side, and costs top speed', () => {
    const [match, a, b] = fight({ melee: 'shell' });
    b.z = a.z - 2.8;
    a.meleeCharge = 1;
    a.input.melee = true;
    match.step();
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(a.chassis.speed).toBeLessThan(b.chassis.speed);
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
    expect(grip('crusher')).toBeGreaterThan(grip('claw') * 2);
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
    expect(b.maxHp - b.hp).toBeLessThan(15);
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
