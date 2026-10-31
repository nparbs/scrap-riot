import { describe, expect, it } from 'vitest';
import { applyResult, buyOrEquip, buyPowerup, buyUpgrade, loadSave, makeRivals, newSave, upgradeCost, writeSave } from '../src/game/progress';
import { MELEE, POWERUP_CAP } from '../src/sim/data';

describe('garage', () => {
  it('buys once, then equips for free', () => {
    const save = newSave();
    save.money = MELEE.hammer.price;
    expect(buyOrEquip(save, 'melee', 'hammer')).toBe(true);
    expect(save.money).toBe(0);
    expect(save.loadout.melee).toBe('hammer');
    expect(buyOrEquip(save, 'melee', 'chainsaw')).toBe(true);
    expect(buyOrEquip(save, 'melee', 'hammer')).toBe(true);
    expect(save.money).toBe(0);
  });

  it('refuses what you cannot afford', () => {
    const save = newSave();
    save.money = 1;
    expect(buyOrEquip(save, 'turret', 'arc')).toBe(false);
    expect(save.loadout.turret).toBe('minigun');
    expect(buyUpgrade(save, 'armor')).toBe(false);
    expect(buyPowerup(save, 'emp')).toBe(false);
  });

  it('caps powerups and upgrade levels', () => {
    const save = newSave();
    save.money = 1e6;
    for (let i = 0; i < 10; i++) buyPowerup(save, 'emp');
    expect(save.loadout.powerups.emp).toBe(POWERUP_CAP);
    for (let i = 0; i < 10; i++) buyUpgrade(save, 'armor');
    expect(save.loadout.upgrades.armor).toBe(5);
    expect(upgradeCost(save, 'armor')).toBeNull();
  });

  it('banks results and spends used powerups', () => {
    const save = newSave();
    applyResult(save, 500, 1, { repair: 0, turbo: 1, overdrive: 0, emp: 0 });
    expect(save.money).toBe(750);
    expect(save.wins).toBe(1);
    expect(save.loadout.powerups.repair).toBe(0);
  });
});

describe('save data', () => {
  it('round-trips and survives corruption or blocked storage', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const save = newSave();
    save.money = 1234;
    writeSave(storage, save);
    expect(loadSave(storage).money).toBe(1234);

    for (const key of store.keys()) store.set(key, '{nope');
    expect(loadSave(storage).money).toBe(newSave().money);
    expect(loadSave(null).money).toBe(newSave().money);
    expect(() => writeSave(null, save)).not.toThrow();
  });
});

describe('rivals', () => {
  it('get tougher as the player invests in upgrades', () => {
    const rookie = newSave();
    const vet = newSave();
    vet.loadout.upgrades = { armor: 5, engine: 5, weapons: 5 };
    expect(makeRivals(rookie, 3, 1)[0].loadout.upgrades.armor).toBe(0);
    expect(makeRivals(vet, 3, 1)[0].loadout.upgrades.armor).toBe(5);
  });
});
