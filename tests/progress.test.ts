import { describe, expect, it } from 'vitest';
import { applyCheat, applyResult, buyOrEquip, buyPowerup, buyUpgrade, CATALOG, loadSave, makeRivals, newSave, partFits, previewLoadout, STARTING_MONEY, upgradeCost, writeSave, retireGuns } from '../src/game/progress';
import { ARMOUR, buildStats, CHASSIS, MELEE, POWERUP_CAP, spaceCapacity, spaceUsed, TOWERS } from '../src/sim/data';

describe('cheat codes', () => {
  it('money adds $5000 every time, in any case', () => {
    const save = newSave();
    const start = save.money;
    expect(applyCheat(save, 'money')).toBeTruthy();
    expect(applyCheat(save, '  MoNeY ')).toBeTruthy();
    expect(save.money).toBe(start + 10_000);
  });

  it('unlock owns every part and fits nothing new', () => {
    const save = newSave();
    const before = JSON.stringify(save.loadout);
    expect(applyCheat(save, 'unlock')).toBeTruthy();
    for (const slot of Object.keys(CATALOG) as (keyof typeof CATALOG)[]) {
      expect((save.owned[slot] as string[]).slice().sort()).toEqual(Object.keys(CATALOG[slot]).sort());
    }
    expect(JSON.stringify(save.loadout)).toBe(before);
    save.money = 0;
    expect(buyOrEquip(save, 'chassis', 'juggernaut')).toBe(true);
    expect(save.loadout.chassis).toBe('juggernaut');
  });

  it('ignores anything else', () => {
    const save = newSave();
    const before = JSON.stringify(save);
    for (const code of ['', 'moneyy', 'unlock all', 'constructor']) expect(applyCheat(save, code)).toBeNull();
    expect(JSON.stringify(save)).toBe(before);
  });
});

describe('armour making room', () => {
  const heavy = () => {
    const save = newSave();
    save.money = 100_000;
    save.loadout.armour = 150;
    save.loadout.melee = 'vertbar';
    return save;
  };

  it('drops only as far as it must when moving to a smaller chassis', () => {
    const save = heavy();
    expect(spaceUsed(save.loadout)).toBeGreaterThan(CHASSIS.scout.space);
    expect(buyOrEquip(save, 'chassis', 'scout')).toBe(true);
    expect(save.loadout.chassis).toBe('scout');
    expect(spaceUsed(save.loadout)).toBeLessThanOrEqual(spaceCapacity(save.loadout));
    expect(spaceUsed({ ...save.loadout, armour: save.loadout.armour! + ARMOUR.step })).toBeGreaterThan(spaceCapacity(save.loadout));
  });

  it('leaves armour alone when there is already room', () => {
    const save = newSave();
    save.money = 100_000;
    save.loadout.armour = 100;
    buyOrEquip(save, 'chassis', 'juggernaut');
    expect(save.loadout.armour).toBe(100);
  });

  it('shows the same drop in a preview, without changing the robot', () => {
    const save = heavy();
    const shown = previewLoadout(save.loadout, { slot: 'chassis', id: 'scout' });
    expect(shown.armour).toBeLessThan(150);
    expect(save.loadout.armour).toBe(150);
    expect(save.loadout.chassis).toBe('brawler');
  });

  it('still says no room, and keeps the armour, when even the minimum is too much', () => {
    const save = heavy();
    save.loadout.engine = 'turbo';
    save.loadout.defense = 'emp';
    expect(partFits(save, 'chassis', 'scout')).toBe(false);
    buyOrEquip(save, 'chassis', 'scout');
    expect(save.loadout.chassis).toBe('brawler');
    expect(save.loadout.armour).toBe(150);
  });

  it('never touches armour for a part that only takes room', () => {
    const save = heavy();
    save.loadout.armour = 100;
    save.loadout.melee = 'dagger';
    buyOrEquip(save, 'melee', 'vertbar');
    expect(save.loadout.armour).toBe(100);
  });
});

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
    expect(buyOrEquip(save, 'melee', 'tesla')).toBe(false);
    expect(save.loadout.melee).toBe('chainsaw');
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

describe('saves from when there were guns', () => {
  const oldSave = () => {
    const save = newSave() as ReturnType<typeof newSave> & { owned: { turret?: string[] } };
    save.owned.turret = ['minigun', 'laser', 'rockets', 'flamethrower', 'arc'];
    (save.loadout as unknown as { turret: string }).turret = 'laser';
    return save;
  };

  it('pays back what was spent on guns, and hands over the weapons they became', () => {
    const save = oldSave();
    const before = save.money;
    retireGuns(save);
    expect(save.money).toBe(before + 1000 + 600);
    expect(save.owned.melee).toContain('flamethrower');
    expect(save.owned.melee).toContain('tesla');
    expect(save.owned).not.toHaveProperty('turret');
    expect(save.loadout).not.toHaveProperty('turret');
  });

  it('only pays once, and leaves new saves alone', () => {
    const save = oldSave();
    retireGuns(save);
    const paid = save.money;
    retireGuns(save);
    expect(save.money).toBe(paid);
    const fresh = newSave();
    const start = fresh.money;
    retireGuns(fresh);
    expect(fresh.money).toBe(start);
  });

  it('still loads from storage', () => {
    const save = oldSave();
    const loaded = loadSave({ getItem: () => JSON.stringify(save) });
    expect(loaded.owned).not.toHaveProperty('turret');
    expect(spaceUsed(loaded.loadout)).toBeGreaterThan(0);
  });
});

describe('a new player', () => {
  it('can afford a couple of parts straight away', () => {
    const { money } = newSave();
    expect(money).toBeGreaterThanOrEqual(MELEE.vertdisc.price + TOWERS.small.price);
    expect(money).toBeGreaterThanOrEqual(MELEE.drum.price + MELEE.spear.price);
    expect(money).toBeLessThan(CHASSIS.juggernaut.price);
  });
});
