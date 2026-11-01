import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyResult, buyPowerup, loadSave, makeRivals, newSave, togglePowerupSlot } from '../src/game/progress';
import { DEFAULT_BINDINGS, loadSettings } from '../src/game/settings';
import { PadReader, type PadLike } from '../src/gamepad';
import { onlineLoadout } from '../src/net/protocol';
import { buildRobot } from '../src/render/robots';
import { fittedPowerups, MELEE, POWERUP_SLOTS, type MeleeId } from '../src/sim/data';
import { Match, type Loadout } from '../src/sim/match';

const ALL = { rage: 2, megashield: 2, cloaking: 2, xray: 2, repair: 2, battery: 2 };

function loadout(over: Partial<Loadout> = {}): Loadout {
  return { chassis: 'brawler', melee: 'chainsaw', defense: 'shield', powerups: ALL, upgrades: { armor: 0, engine: 0, weapons: 0 }, ...over };
}

function duel(a: Partial<Loadout>): Match {
  const setups = [loadout(a), loadout()].map((l, i) => ({ name: `Bot ${i}`, color: 0xff8a2a, isAI: false, loadout: l }));
  return new Match(setups, { seed: 1, arena: 'pit', mode: 'duel', countdown: 0 });
}

describe('powerup counts', () => {
  it('gives a save from before the Battery Pack a real count, so it can never show or save as null', () => {
    const save = newSave();
    save.loadout.powerups = { rage: 1, megashield: 0, cloaking: 0, xray: 0, repair: 2, turbo: 1 } as unknown as Loadout['powerups'];
    const storage = { getItem: () => JSON.stringify(save) };
    const loaded = loadSave(storage);
    expect(loaded.loadout.powerups.battery).toBe(0);
    expect(buyPowerup(loaded, 'battery')).toBe(true);
    expect(JSON.parse(JSON.stringify(loaded)).loadout.powerups.battery).toBe(1);
  });

  it('mends a count already saved as null', () => {
    const save = newSave();
    (save.loadout.powerups as Record<string, unknown>).battery = null;
    const loaded = loadSave({ getItem: () => JSON.stringify(save) });
    expect(loaded.loadout.powerups.battery).toBe(0);
    expect(new Match([{ name: 'A', color: 1, isAI: false, loadout: loaded.loadout }, { name: 'B', color: 2, isAI: false, loadout: newSave().loadout }], { seed: 1, arena: 'pit', mode: 'duel', countdown: 0 }).bots[0].powerups.battery).toBe(0);
  });
});

describe('powerup slots', () => {
  it('lets a robot select no more than three', () => {
    const save = newSave();
    save.loadout.powerupSlots = [];
    for (const id of ['rage', 'xray', 'repair'] as const) expect(togglePowerupSlot(save, id)).toBe(true);
    expect(togglePowerupSlot(save, 'battery')).toBe(false);
    expect(save.loadout.powerupSlots).toEqual(['rage', 'xray', 'repair']);
    expect(POWERUP_SLOTS).toBe(3);
  });

  it('frees a slot when one is dropped, and fills it in the order they were chosen', () => {
    const save = newSave();
    save.loadout.powerupSlots = ['rage', 'xray', 'repair'];
    expect(togglePowerupSlot(save, 'xray')).toBe(true);
    expect(togglePowerupSlot(save, 'battery')).toBe(true);
    expect(save.loadout.powerupSlots).toEqual(['rage', 'repair', 'battery']);
  });

  it('only lets a robot use what it selected, whatever else is in its garage', () => {
    const match = duel({ powerupSlots: ['rage', 'repair'] });
    const bot = match.bots[0];
    expect(bot.powerups).toEqual({ rage: 2, megashield: 0, cloaking: 0, xray: 0, repair: 2, battery: 0 });
    bot.input.powerup = 'xray';
    match.step();
    expect(bot.xrayT).toBe(0);
    bot.input.powerup = 'rage';
    match.step();
    expect(bot.rageT).toBeGreaterThan(0);
  });

  it('holds to three even for a robot that claims more, or nobody chose for', () => {
    const cheat = duel({ powerupSlots: ['rage', 'megashield', 'cloaking', 'xray', 'repair', 'battery'] });
    expect(Object.values(cheat.bots[0].powerups).filter((n) => n > 0)).toHaveLength(3);
    expect(Object.values(cheat.bots[1].powerups).filter((n) => n > 0)).toHaveLength(3);
    for (const rival of makeRivals({ wins: 9, loadout: { upgrades: { armor: 5, engine: 5, weapons: 5 } } }, 6, 3)) {
      expect(fittedPowerups(rival.loadout).length).toBeLessThanOrEqual(POWERUP_SLOTS);
    }
  });

  it('leaves unselected powerups in the garage after a match', () => {
    const save = newSave();
    save.loadout.powerups = { ...ALL };
    save.loadout.powerupSlots = ['rage'];
    applyResult(save, 0, 2, { rage: 1, megashield: 0, cloaking: 0, xray: 0, repair: 0, battery: 0 });
    expect(save.loadout.powerups).toEqual({ ...ALL, rage: 1 });
  });

  it('selects a powerup when buying it, if there is a free slot', () => {
    const save = newSave();
    save.money = 1000;
    buyPowerup(save, 'rage');
    expect(save.loadout.powerupSlots).toEqual(['repair', 'battery', 'rage']);
    buyPowerup(save, 'xray');
    expect(save.loadout.powerups.xray).toBe(1);
    expect(save.loadout.powerupSlots).toEqual(['repair', 'battery', 'rage']);
  });

  it('gives a save from before slots the first powerups it has, and keeps that choice', () => {
    const old = newSave();
    old.loadout.powerups = { ...ALL, rage: 0 };
    delete old.loadout.powerupSlots;
    const save = loadSave({ getItem: () => JSON.stringify(old) });
    expect(save.loadout.powerupSlots).toEqual(['megashield', 'cloaking', 'xray']);
  });

  it('online, respects the selection but not a list that cheats', () => {
    expect(fittedPowerups(onlineLoadout({ powerupSlots: ['xray', 'battery'] }))).toEqual(['xray', 'battery']);
    expect(fittedPowerups(onlineLoadout({ powerupSlots: ['xray', 'xray', '__proto__', 'nope', 'rage', 'repair', 'battery'] }))).toEqual(['xray', 'rage', 'repair']);
    expect(fittedPowerups(onlineLoadout({ powerupSlots: 'rage' }))).toHaveLength(3);
    expect(fittedPowerups(onlineLoadout({ powerupSlots: [] }))).toEqual([]);
  });
});

describe('powerup controls', () => {
  it('has a key for each slot, and forgets old keys for 4 to 6', () => {
    expect([DEFAULT_BINDINGS.power1, DEFAULT_BINDINGS.power2, DEFAULT_BINDINGS.power3]).toEqual(['Digit1', 'Digit2', 'Digit3']);
    const settings = loadSettings({ getItem: () => JSON.stringify({ bindings: { power2: 'KeyZ', power5: 'KeyX' } }) });
    expect(settings.bindings.power2).toBe('KeyZ');
    expect(Object.values(settings.bindings)).not.toContain('KeyX');
  });

  it('gives a gamepad three slots, on the D-pad', () => {
    const pad = (button: number): PadLike => ({ axes: [], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === button, value: i === button ? 1 : 0 })) });
    const press = (button: number) => new PadReader().read(pad(button)).powerup;
    expect([press(12), press(15), press(13)]).toEqual([0, 1, 2]);
    expect(press(14)).toBe(-1);
    expect(press(4)).toBe(-1);
  });
});

describe('gun-style weapons', () => {
  const GUNS = (Object.keys(MELEE) as MeleeId[]).filter((id) => MELEE[id].onTower);
  const build = (melee: MeleeId, rearMelee = false, tower: 'small' | 'medium' | 'large' = 'medium') =>
    buildRobot({ chassis: 'brawler', melee, defense: 'shield', color: 0xff8a2a, rearMelee, tower });

  it('are the flamethrower, the tesla coil and the spear', () => {
    expect(GUNS.sort()).toEqual(['flamethrower', 'spear', 'tesla']);
  });

  it('bolt onto the tower, while everything else stays on the hull', () => {
    for (const id of GUNS) expect(build(id).meleePivot.parent).not.toBe(build(id).root);
    const saw = build('chainsaw');
    expect(saw.meleePivot.parent).toBe(saw.root);
    const gun = build('flamethrower');
    expect(gun.meleePivot.parent?.parent).toBe(gun.root);
  });

  it('turn to face backward with the weapon set to the rear', () => {
    const point = (rear: boolean) => {
      const model = build('flamethrower', rear);
      model.root.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(model.meleePivot);
    };
    expect(point(false).max.z).toBeGreaterThan(1);
    expect(point(true).min.z).toBeLessThan(-1);
  });

  it('flame from the end of the barrel, whichever tower it is on', () => {
    for (const tower of ['small', 'medium', 'large'] as const) {
      const model = build('flamethrower', false, tower);
      model.root.updateMatrixWorld(true);
      const barrel = new THREE.Box3().setFromObject(model.meleePivot);
      expect(model.muzzle.reach).toBeCloseTo(barrel.max.z, 1);
      expect(model.muzzle.height).toBeGreaterThan(barrel.min.y);
      expect(model.muzzle.height).toBeLessThan(barrel.max.y);
    }
  });

  it('closes the flamethrower barrel, so it can not be seen through', () => {
    const model = build('flamethrower');
    const open: number[] = [];
    model.meleePivot.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !(node.geometry instanceof THREE.LatheGeometry)) return;
      const { points } = node.geometry.parameters;
      if (points[0].x > 0.001 && points[points.length - 1].x > 0.001) open.push(points[0].x);
    });
    expect(open).toEqual([]);
  });
});
