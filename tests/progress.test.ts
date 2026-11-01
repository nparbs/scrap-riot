import { describe, expect, it } from 'vitest';
import { applyResult, buyOrEquip, buyPowerup, buyUpgrade, loadSave, makeRivals, newSave, previewLoadout, STARTING_MONEY, upgradeCost, writeSave } from '../src/game/progress';
import { buildStats, CHASSIS, MELEE, POWERUP_CAP, TOWERS, TURRETS } from '../src/sim/data';

describe('trying out parts', () => {
  it('shows the part without buying or fitting it, even with no money', () => {
    const save = newSave();
    save.money = 0;
    const before = JSON.stringify(save);
    const shown = previewLoadout(save.loadout, { slot: 'chassis', id: 'juggernaut' });
    expect(shown.chassis).toBe('juggernaut');
    expect(buildStats(shown).hp).toBeGreaterThan(buildStats(save.loadout).hp);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('leaves the robot alone with nothing being tried', () => {
    const save = newSave();
    expect(previewLoadout(save.loadout, null)).toBe(save.loadout);
  });
});

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
    expect(buyPowerup(save, 'xray')).toBe(false);
  });

  it('caps powerups and upgrade levels', () => {
    const save = newSave();
    save.money = 1e6;
    for (let i = 0; i < 10; i++) buyPowerup(save, 'xray');
    expect(save.loadout.powerups.xray).toBe(POWERUP_CAP);
    for (let i = 0; i < 10; i++) buyUpgrade(save, 'armor');
    expect(save.loadout.upgrades.armor).toBe(5);
    expect(upgradeCost(save, 'armor')).toBeNull();
  });

  it('banks results and spends used powerups', () => {
    const save = newSave();
    applyResult(save, 500, 1, { rage: 0, megashield: 0, cloaking: 0, xray: 0, repair: 0, battery: 1 });
    expect(save.money).toBe(STARTING_MONEY + 500);
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

describe('a new player', () => {
  it('can afford a couple of parts straight away', () => {
    const { money } = newSave();
    expect(money).toBeGreaterThanOrEqual(MELEE.vertdisc.price + TOWERS.small.price);
    expect(money).toBeGreaterThanOrEqual(MELEE.drum.price + TURRETS.grenade.price);
    expect(money).toBeLessThan(CHASSIS.juggernaut.price);
  });
});
