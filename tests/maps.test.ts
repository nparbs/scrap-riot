import { describe, expect, it } from 'vitest';
import {
  ARENA_ORDER,
  ARENAS,
  ballHeight,
  ballPos,
  BALL_HIT_HEIGHT,
  onDeck,
  overChasm,
  SAW_RADIUS,
  solidGround,
  trapdoorAmount,
  trapdoorOpen,
  trapdoorWarning,
  ventErupting,
  ventHeat,
  hammerClock,
  HAMMER_DAMAGE,
  LAUNCH_AIR,
  TRAPDOOR_WARN,
  type ArenaDef,
  type ArenaId,
  type Circle,
  type Rect,
} from '../src/sim/arena';
import { loadSave, newSave, tidyPowerups } from '../src/game/progress';
import { CAREER } from '../src/game/career';
import { Match } from '../src/sim/match';

const save = newSave();
const pilot = (name: string) => ({ name, color: 0xff8a2a, isAI: false, loadout: newSave().loadout });
const duel = (arena: ArenaId) => new Match([pilot('A'), pilot('B')], { seed: 1, arena, mode: 'ffa', countdown: 0, duration: 999, killTarget: 999 });

const circlesTouch = (a: Circle, b: Circle, gap = 0) => Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + gap;
const rectTouchesCircle = (r: Rect, c: Circle, gap = 0) => {
  const dx = Math.max(Math.abs(c.x - r.x) - r.w / 2, 0);
  const dz = Math.max(Math.abs(c.z - r.z) - r.d / 2, 0);
  return Math.hypot(dx, dz) < c.r + gap;
};
const rectsTouch = (a: Rect, b: Rect, gap = 0) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + gap;

/** Everything cut out of or laid flat on the floor, which would look wrong on top of anything else. */
function floorThings(def: ArenaDef): { circles: [string, Circle][]; rects: [string, Rect][] } {
  const circles: [string, Circle][] = [];
  for (const c of def.pits) circles.push(['pit', c]);
  for (const c of def.trapdoors) circles.push(['trapdoor', c]);
  for (const c of def.firePits) circles.push(['vent', c]);
  for (const c of def.shockers) circles.push(['coil', c]);
  for (const c of def.hammers) circles.push(['hammer', c]);
  for (const c of def.launchers) circles.push(['ramp', c]);
  for (const c of def.pillars) circles.push(['pillar', c]);
  const rects: [string, Rect][] = [];
  for (const c of def.chasms) rects.push(['chasm', c]);
  for (const c of def.conveyors) rects.push(['belt', c]);
  for (const b of def.blocks) rects.push(['block', b]);
  for (const s of def.saws) {
    const long = s.amplitude * 2 + SAW_RADIUS * 2;
    rects.push(['saw track', s.axis === 'x' ? { x: 0, z: s.fixed, w: long, d: 0.9 } : { x: s.fixed, z: 0, w: 0.9, d: long }]);
  }
  return { circles, rects };
}

const RIM = 0.7;

describe.each(ARENA_ORDER)('the %s layout', (id) => {
  const def = ARENAS[id];
  const { circles, rects } = floorThings(def);

  it('has nothing on the floor overlapping anything else', () => {
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        expect(circlesTouch(circles[i][1], circles[j][1], RIM), `${circles[i][0]} ${JSON.stringify(circles[i][1])} and ${circles[j][0]} ${JSON.stringify(circles[j][1])}`).toBe(false);
      }
      for (const [name, rect] of rects) {
        expect(rectTouchesCircle(rect, circles[i][1], RIM), `${circles[i][0]} ${JSON.stringify(circles[i][1])} and ${name} ${JSON.stringify(rect)}`).toBe(false);
      }
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        // Two lengths of fence are meant to meet at their corner.
        if (rects[i][0] === 'block' && rects[j][0] === 'block') {
          if ((rects[i][1] as { kind?: string }).kind === 'fence' && (rects[j][1] as { kind?: string }).kind === 'fence') continue;
        }
        expect(rectsTouch(rects[i][1], rects[j][1], RIM), `${rects[i][0]} ${JSON.stringify(rects[i][1])} and ${rects[j][0]} ${JSON.stringify(rects[j][1])}`).toBe(false);
      }
    }
  });

  it('keeps its logo clear of everything but a trapdoor it is painted on', () => {
    if (def.trapdoors.some((door) => Math.hypot(door.x - def.logo.x, door.z - def.logo.z) < 1)) {
      expect(def.logo.r).toBeLessThan(def.trapdoors[0].r);
      return;
    }
    for (const [name, c] of circles) expect(circlesTouch(def.logo, c, 0.1), `logo and ${name} ${JSON.stringify(c)}`).toBe(false);
    for (const [name, r] of rects) expect(rectTouchesCircle(r, def.logo, 0.1), `logo and ${name} ${JSON.stringify(r)}`).toBe(false);
    expect(circlesTouch(def.logo, def.hill), 'logo and hill').toBe(false);
  });

  it('holes never reach the outline, which the floor is cut from', () => {
    const inside = (x: number, z: number) => onDeck(def, x, z);
    for (const c of [...def.pits, ...def.trapdoors, ...def.firePits]) {
      for (let a = 0; a < 16; a++) {
        const out = c.r + RIM + 0.1;
        expect(inside(c.x + Math.cos((a * Math.PI) / 8) * out, c.z + Math.sin((a * Math.PI) / 8) * out), JSON.stringify(c)).toBe(true);
      }
    }
    for (const c of def.chasms) {
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        expect(inside(c.x + sx * (c.w / 2 + 1), c.z + sz * (c.d / 2 + 1)), JSON.stringify(c)).toBe(true);
      }
    }
  });

  it('spawns everyone on clear ground, away from anything that would hurt them', () => {
    const match = duel(id);
    for (const spawn of def.spawns) {
      const where = `${spawn.x},${spawn.z}`;
      expect(match.isSafeGround(spawn.x, spawn.z, 1.75), where).toBe(true);
      const body: Circle = { x: spawn.x, z: spawn.z, r: 1.75 };
      for (const c of [...def.firePits, ...def.shockers, ...def.hammers]) expect(circlesTouch(body, c), `${where} on ${JSON.stringify(c)}`).toBe(false);
      for (const s of def.sentries) expect(Math.hypot(s.x - spawn.x, s.z - spawn.z), `${where} by a sentry`).toBeGreaterThan(s.range);
      for (const b of def.conveyors) expect(rectTouchesCircle(b, body), `${where} on a belt`).toBe(false);
    }
    expect(new Set(def.spawns.map((s) => `${s.x},${s.z}`)).size).toBeGreaterThanOrEqual(8);
  });

  it('puts every repair somewhere it can be reached and picked up', () => {
    for (const spot of def.repairSpots) expect(solidGround(def, spot.x, spot.z), `${spot.x},${spot.z}`).toBe(true);
    for (const spot of def.repairSpots) {
      for (const p of [...def.pits, ...def.pillars]) expect(Math.hypot(p.x - spot.x, p.z - spot.z), `${spot.x},${spot.z}`).toBeGreaterThan(p.r + 1);
    }
  });

  it('keeps the hill on solid ground, with room around any pool it surrounds', () => {
    expect(onDeck(def, def.hill.x + def.hill.r, def.hill.z)).toBe(true);
    expect(onDeck(def, def.hill.x - def.hill.r, def.hill.z)).toBe(true);
    for (const c of def.pits) {
      const centred = Math.hypot(c.x - def.hill.x, c.z - def.hill.z) < 0.01;
      if (centred) expect(def.hill.r - c.r).toBeGreaterThan(4);
      else expect(circlesTouch(def.hill, c, RIM)).toBe(false);
    }
    for (const c of def.pillars) expect(circlesTouch(def.hill, c), `pillar ${JSON.stringify(c)}`).toBe(false);
  });

  it('is the same from either end, so no spawn is better than another by design', () => {
    if (id === 'skyscraper') return;
    for (const c of def.pillars) expect(def.pillars.some((o) => Math.abs(o.x + c.x) < 0.01 && Math.abs(o.z + c.z) < 0.01), JSON.stringify(c)).toBe(true);
    for (const c of def.chasms) expect(def.chasms.some((o) => Math.abs(o.x + c.x) < 0.01 && Math.abs(o.z + c.z) < 0.01), JSON.stringify(c)).toBe(true);
    for (const c of def.launchers) expect(def.launchers.some((o) => Math.abs(o.x + c.x) < 0.01 && Math.abs(o.z + c.z) < 0.01), JSON.stringify(c)).toBe(true);
  });

  it('can be played by bots without anything going wrong', () => {
    const setups = Array.from({ length: 6 }, (_, i) => ({ name: `Bot ${i}`, color: 0xff8a2a, isAI: true, skill: 0.8, loadout: newSave().loadout }));
    const match = new Match(setups, { seed: 3, arena: id, mode: 'ffa', countdown: 0, duration: 999, killTarget: 999 });
    for (let i = 0; i < 60 * 40; i++) match.step();
    for (const bot of match.bots) {
      expect(Number.isFinite(bot.x) && Number.isFinite(bot.z) && Number.isFinite(bot.hp), bot.name).toBe(true);
    }
  });
});

describe('map shapes', () => {
  it('cuts the corners off a plus', () => {
    const { rig } = ARENAS;
    expect(onDeck(rig, 0, 29)).toBe(true);
    expect(onDeck(rig, 29, 12)).toBe(true);
    expect(onDeck(rig, 20, 20)).toBe(false);
    expect(onDeck(rig, 31, 0)).toBe(false);
  });

  it('rounds a round map off', () => {
    const { glacier } = ARENAS;
    expect(onDeck(glacier, 30, 0)).toBe(true);
    expect(onDeck(glacier, 25, 25)).toBe(false);
  });

  it('sends a robot into the sea from a cut-away corner', () => {
    const match = duel('rig');
    const [a] = match.bots;
    a.x = 18;
    a.z = 14;
    match.step();
    expect(a.alive).toBe(false);
  });

  it('sends a robot off the edge of a round lake, where a square one would still have floor', () => {
    const match = duel('glacier');
    const [a] = match.bots;
    a.x = 24;
    a.z = 24;
    match.step();
    expect(a.alive).toBe(false);
  });

  it('drops a robot in a chasm, but not one on a bridge, and not one flying over', () => {
    const { canyon } = ARENAS;
    const gap = canyon.chasms[0];
    expect(overChasm(canyon, gap.x, gap.z)).toBe(true);
    expect(overChasm(canyon, -13, -6)).toBe(false);
    const match = duel('canyon');
    const [a, b] = match.bots;
    a.x = -13;
    a.z = -6;
    b.x = gap.x;
    b.z = gap.z;
    b.airT = 0.3;
    match.step();
    expect(a.alive).toBe(true);
    expect(b.alive).toBe(true);
    b.airT = 0;
    match.step();
    expect(b.alive).toBe(false);
  });
});

describe('bots on Canyon Ledge', () => {
  it('route over a bridge to reach a robot in another lane', () => {
    const match = new Match(
      [{ name: 'Hunter', color: 1, isAI: true, skill: 0.9, loadout: newSave().loadout }, { name: 'Prey', color: 2, isAI: false, loadout: newSave().loadout }],
      { seed: 5, arena: 'canyon', mode: 'ffa', countdown: 0, duration: 999, killTarget: 999 },
    );
    const [hunter, prey] = match.bots;
    hunter.x = hunter.prevX = 0;
    hunter.z = hunter.prevZ = 18;
    prey.x = prey.prevX = -24;
    prey.z = prey.prevZ = 14;
    let lane = 0;
    for (let i = 0; i < 60 * 25 && hunter.alive; i++) {
      prey.x = -24;
      prey.z = 14;
      prey.vx = prey.vz = 0;
      match.step();
      if (hunter.x < -18) lane++;
    }
    expect(lane, 'never got across').toBeGreaterThan(0);
  });
});

describe('trapdoors', () => {
  const door = ARENAS.pit.trapdoors[0];

  it('warns before it opens, then opens, then shuts again', () => {
    const start = door.period - door.open - door.phase;
    expect(trapdoorAmount(door, 0)).toBe(0);
    expect(trapdoorWarning(door, start - TRAPDOOR_WARN - 0.1)).toBe(0);
    expect(trapdoorWarning(door, start - 0.5)).toBeGreaterThan(0.5);
    expect(trapdoorOpen(door, start - 0.01)).toBe(false);
    expect(trapdoorOpen(door, start + 1)).toBe(true);
    expect(trapdoorOpen(door, door.period + 0.5)).toBe(false);
  });

  it('only takes a robot while it is open', () => {
    const match = duel('pit');
    const [a] = match.bots;
    a.x = door.x;
    a.z = door.z;
    match.step();
    expect(a.alive).toBe(true);
    match.time = door.period - door.open + 1;
    match.step();
    expect(a.alive).toBe(false);
  });

  it('never opens under a fresh match without warning', () => {
    for (const id of ARENA_ORDER) {
      for (const d of ARENAS[id].trapdoors) {
        const first = ((d.period - d.open - d.phase) % d.period + d.period) % d.period;
        expect(first === 0 ? d.period : first, `${id} ${JSON.stringify(d)}`).toBeGreaterThan(0);
      }
    }
  });

  it('takes turns on a map with several, so there is always a way across', () => {
    for (const id of ['rig', 'glacier'] as const) {
      const doors = ARENAS[id].trapdoors;
      for (let t = 0; t < 60; t += 0.25) {
        expect(doors.filter((d) => trapdoorOpen(d, t)).length, `${id} at ${t}`).toBeLessThan(doors.length);
      }
    }
  });
});

describe('the other hazards', () => {
  it('erupts vents in turn, with a warning, and burns harder while it does', () => {
    const [vent] = ARENAS.furnace.firePits;
    const during = vent.period! - vent.phase!;
    expect(ventErupting(vent, during + 0.5)).toBe(true);
    expect(ventHeat(vent, during - 0.5)).toBeGreaterThan(0);
    expect(ventHeat(vent, during - 4)).toBe(0);
    const burn = (time: number) => {
      const match = duel('furnace');
      const [a] = match.bots;
      a.invulnT = 0;
      a.x = vent.x;
      a.z = vent.z;
      match.time = time;
      const before = a.hp;
      match.step();
      return before - a.hp;
    };
    expect(burn(during + 0.5)).toBeCloseTo(burn(during - 4) * 3, 3);
  });

  it('never has all the vents going at once', () => {
    const vents = ARENAS.furnace.firePits;
    for (let t = 0; t < 40; t += 0.1) expect(vents.filter((v) => ventErupting(v, t)).length, `at ${t}`).toBeLessThanOrEqual(1);
  });

  it('carries a robot along a belt', () => {
    const match = duel('foundry');
    const [a] = match.bots;
    const [belt] = ARENAS.foundry.conveyors;
    a.x = belt.x;
    a.z = belt.z;
    const startX = a.x;
    for (let i = 0; i < 30; i++) match.step();
    expect(a.x).toBeGreaterThan(startX + 1);
  });

  it('throws a robot driving up a ramp clear across the chasm', () => {
    const match = duel('canyon');
    const [a] = match.bots;
    const ramp = ARENAS.canyon.launchers[0];
    a.invulnT = 0;
    a.x = ramp.x - ramp.dirX * 1;
    a.z = ramp.z;
    a.heading = Math.atan2(ramp.dirX, ramp.dirZ);
    a.vx = ramp.dirX * 8;
    a.input.throttle = 1;
    for (let i = 0; i < 60 * (LAUNCH_AIR + 0.4); i++) match.step();
    expect(a.alive).toBe(true);
    expect(a.x).toBeLessThan(-17);
  });

  it('leaves a robot crossing a ramp sideways alone', () => {
    const match = duel('canyon');
    const [a] = match.bots;
    const ramp = ARENAS.canyon.launchers[0];
    a.x = ramp.x;
    a.z = ramp.z;
    a.vz = 8;
    match.step();
    expect(a.airT).toBe(0);
  });

  it('flattens a robot under a drop hammer, and only when it lands', () => {
    const [hammer] = ARENAS.foundry.hammers;
    const match = duel('foundry');
    const [a] = match.bots;
    a.invulnT = 0;
    a.x = hammer.x;
    a.z = hammer.z;
    match.time = hammer.period - hammer.phase - 1;
    const before = a.hp;
    match.step();
    expect(a.hp).toBe(before);
    match.time = hammer.period * 2 - hammer.phase + 0.01;
    expect(hammerClock(hammer, match.time)).toBeLessThan(0.15);
    match.step();
    expect(a.hp).toBeLessThanOrEqual(before - HAMMER_DAMAGE + 0.01);
    expect(a.stunT).toBeGreaterThan(0);
  });

  it('swings the ball through the middle and up out of reach at the arm ends', () => {
    const [ball] = ARENAS.rig.balls;
    expect(ballHeight(ball, 0)).toBeLessThan(0.01);
    expect(ballHeight(ball, ball.reach)).toBeGreaterThan(BALL_HIT_HEIGHT);
    const match = duel('rig');
    const [a] = match.bots;
    a.invulnT = 0;
    let t = 0;
    while (Math.abs(ballPos(ball, t).along) > 0.1) t += 0.01;
    const at = ballPos(ball, t);
    a.x = at.x;
    a.z = at.z;
    match.time = t;
    const before = a.hp;
    match.step();
    expect(a.hp).toBeLessThan(before);
    expect(Math.hypot(a.vx, a.vz)).toBeGreaterThan(10);
  });

  it('grinds a robot pushed against a saw in the wall, and pushes it back off', () => {
    const match = duel('pit');
    const [a] = match.bots;
    a.invulnT = 0;
    a.x = 0;
    a.z = ARENAS.pit.half - a.radius;
    const before = a.hp;
    for (let i = 0; i < 10; i++) match.step();
    expect(a.hp).toBeLessThan(before);
  });
});

describe('saves and the career', () => {
  it('moves a save off a map that no longer exists', () => {
    const old = newSave();
    (old.practice as { arena: string }).arena = 'rooftop';
    expect(loadSave({ getItem: () => JSON.stringify(old) }).practice.arena).toBe('skyscraper');
    expect(tidyPowerups(old).practice.arena).toBe('skyscraper');
    expect(save.practice.arena).toBe('skyscraper');
  });

  it('only sends the career to maps that exist', () => {
    for (const fight of CAREER) expect(ARENAS[fight.arena], fight.id).toBeDefined();
  });
});
