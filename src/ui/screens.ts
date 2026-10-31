import { CATALOG, upgradeCost, type Save, type Slot } from '../game/progress';
import { NAME_MAX } from '../net/protocol';
import { POWERUPS, POWERUP_CAP, POWERUP_ORDER, UPGRADES, type PowerupId, type UpgradeId } from '../sim/data';
import type { Standing } from '../sim/match';
import { escapeText, UPGRADE_ORDER } from './hud';

export const PLAYER_COLOR = 0xff8a2a;
const CONTROLS = `
  <table class="controls">
    <tr><td><kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&larr;</kbd><kbd>&rarr;</kbd></td><td>Drive</td></tr>
    <tr><td><kbd>X</kbd></td><td>Front weapon</td></tr>
    <tr><td><kbd>C</kbd></td><td>Turret (aims itself)</td></tr>
    <tr><td><kbd>V</kbd></td><td>Defense</td></tr>
    <tr><td><kbd>1</kbd>&ndash;<kbd>4</kbd></td><td>Powerups</td></tr>
    <tr><td><kbd>Ctrl</kbd></td><td>Look behind</td></tr>
    <tr><td><kbd>M</kbd> / <kbd>Esc</kbd></td><td>Mute / Pause</td></tr>
  </table>`;

export function menuScreen(onStart: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-menu';
  el.innerHTML = `
    <div class="menu-card">
      <h1>SCRAP<span>RIOT</span></h1>
      <p class="tagline">Bolt on a chainsaw. Enter the pit. Sell whatever is left.</p>
      <button class="btn btn-primary" data-start>Enter the garage</button>
      ${CONTROLS}
    </div>`;
  el.querySelector('[data-start]')!.addEventListener('click', onStart);
  return el;
}

export function pauseScreen(online: boolean, onResume: () => void, onQuit: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-pause';
  el.innerHTML = `
    <div class="menu-card">
      <h2>${online ? 'Menu' : 'Paused'}</h2>
      ${online ? '<p class="tagline">The match keeps running. A bot takes over your robot if you leave.</p>' : ''}
      <button class="btn btn-primary" data-resume>Resume</button>
      <button class="btn" data-quit>${online ? 'Leave match (no payout)' : 'Forfeit match'}</button>
      ${CONTROLS}
    </div>`;
  el.querySelector('[data-resume]')!.addEventListener('click', onResume);
  el.querySelector('[data-quit]')!.addEventListener('click', onQuit);
  return el;
}

export function lobbyScreen(onCancel: () => void): { el: HTMLElement; update: (players: number, capacity: number, startsIn: number) => void } {
  const el = document.createElement('div');
  el.className = 'screen screen-pause';
  el.innerHTML = `
    <div class="menu-card">
      <h2>Finding a match</h2>
      <p class="tagline" data-status>Connecting to the server&hellip;</p>
      <p class="tagline">Online, everyone fights with equal stats and one of each powerup. Your garage upgrades apply in practice matches. Bots fill any empty slots.</p>
      <button class="btn" data-cancel>Cancel</button>
    </div>`;
  el.querySelector('[data-cancel]')!.addEventListener('click', onCancel);
  const status = el.querySelector('[data-status]')!;
  return {
    el,
    update: (players, capacity, startsIn) => {
      status.textContent = `${players} of ${capacity} players. Starting in ${startsIn}s.`;
    },
  };
}

export interface GarageActions {
  onEquip: (slot: Slot, id: string) => void;
  onPowerup: (id: PowerupId) => void;
  onUpgrade: (id: UpgradeId) => void;
  onFight: () => void;
  onOnline: () => void;
  onName: (name: string) => void;
}

export interface GarageOptions {
  onlineAvailable: boolean;
  /** One-off message, such as why the last online attempt failed. */
  notice: string;
}

const SLOT_TITLES: Record<Slot, string> = {
  chassis: 'Chassis',
  melee: 'Front weapon [X]',
  turret: 'Turret [C]',
  defense: 'Defense [V]',
};

function statLine(slot: Slot, id: string): string {
  if (slot !== 'chassis') return '';
  const c = CATALOG.chassis[id as keyof typeof CATALOG.chassis];
  return `<small>${c.hp} HP · speed ${c.speed}</small>`;
}

export function garageScreen(save: Save, actions: GarageActions, options: GarageOptions): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-garage';

  const section = (slot: Slot) => {
    const items = CATALOG[slot] as Record<string, { name: string; blurb: string; price: number }>;
    const equipped = (save.loadout as unknown as Record<Slot, string>)[slot];
    const owned = save.owned[slot] as string[];
    const cards = Object.entries(items)
      .map(([id, item]) => {
        const has = owned.includes(id);
        const on = equipped === id;
        const label = on ? 'Equipped' : has ? 'Equip' : `$${item.price}`;
        const broke = !has && save.money < item.price;
        return `<button class="card${on ? ' card-on' : ''}${broke ? ' card-broke' : ''}" data-slot="${slot}" data-id="${id}">
          <strong>${item.name}</strong><span>${item.blurb}</span>${statLine(slot, id)}<em>${label}</em></button>`;
      })
      .join('');
    return `<section><h3>${SLOT_TITLES[slot]}</h3><div class="cards">${cards}</div></section>`;
  };

  const powerups = POWERUP_ORDER.map((id, i) => {
    const def = POWERUPS[id];
    const n = save.loadout.powerups[id];
    const full = n >= POWERUP_CAP;
    const broke = !full && save.money < def.price;
    return `<button class="card${broke ? ' card-broke' : ''}" data-power="${id}">
      <strong>[${i + 1}] ${def.name}</strong><span>${def.blurb}</span><small>Carrying ${n}/${POWERUP_CAP}</small><em>${full ? 'Full' : `$${def.price}`}</em></button>`;
  }).join('');

  const upgrades = UPGRADE_ORDER.map((id) => {
    const def = UPGRADES[id];
    const level = save.loadout.upgrades[id];
    const cost = upgradeCost(save, id);
    const broke = cost !== null && save.money < cost;
    const pips = def.costs.map((_, i) => `<i class="${i < level ? 'pip pip-on' : 'pip'}"></i>`).join('');
    return `<button class="card${broke ? ' card-broke' : ''}" data-upgrade="${id}">
      <strong>${def.name}</strong><span>${def.blurb}</span><div class="pips">${pips}</div><em>${cost === null ? 'Maxed' : `$${cost}`}</em></button>`;
  }).join('');

  el.innerHTML = `
    <div class="garage-top">
      <h2>Garage</h2>
      <label class="garage-name">Name <input data-name maxlength="${NAME_MAX}" value="${escapeText(save.name)}" autocomplete="off" spellcheck="false" /></label>
      <div class="garage-record">${save.wins} wins / ${save.matches} matches</div>
      <div class="garage-money">$${save.money}</div>
    </div>
    ${options.notice ? `<div class="garage-notice" role="alert">${escapeText(options.notice)}</div>` : ''}
    <div class="garage-panel">
      ${section('chassis')}
      ${section('melee')}
      ${section('turret')}
      ${section('defense')}
      <section><h3>Powerups (used up in battle)</h3><div class="cards cards-4">${powerups}</div></section>
      <section><h3>Upgrades</h3><div class="cards">${upgrades}</div></section>
    </div>
    <div class="garage-actions">
      ${options.onlineAvailable ? '<button class="btn btn-primary" data-online>Fight online</button>' : ''}
      <button class="btn${options.onlineAvailable ? '' : ' btn-primary'}" data-fight>${options.onlineAvailable ? 'Practice vs bots' : 'Fight!'}</button>
    </div>`;

  el.querySelector<HTMLInputElement>('[data-name]')!.addEventListener('change', (e) => {
    actions.onName((e.target as HTMLInputElement).value);
  });

  el.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!target) return;
    const { slot, id, power, upgrade } = target.dataset;
    if (slot && id) actions.onEquip(slot as Slot, id);
    else if (power) actions.onPowerup(power as PowerupId);
    else if (upgrade) actions.onUpgrade(upgrade as UpgradeId);
    else if ('fight' in target.dataset) actions.onFight();
    else if ('online' in target.dataset) actions.onOnline();
  });
  return el;
}

export function resultsScreen(standings: Standing[], playerId: number, onContinue: () => void): HTMLElement {
  const mine = standings.find((s) => s.bot.id === playerId)!;
  const el = document.createElement('div');
  el.className = 'screen screen-results';
  const headline = mine.place === 1 ? 'Last bot rolling!' : mine.place <= 3 ? 'Still in one piece.' : 'Back to the scrapyard.';
  const rows = standings
    .map(
      (s) => `<tr class="${s.bot.id === playerId ? 'row-me' : ''}"><td>${s.place}</td><td>${escapeText(s.bot.name)}</td><td>${s.bot.kills}</td><td>${s.bot.deaths}</td><td>${Math.round(s.bot.damageDealt)}</td><td>$${s.total}</td></tr>`,
    )
    .join('');
  el.innerHTML = `
    <div class="menu-card results-card">
      <h2>${headline}</h2>
      <p class="payout">You earned <b>$${mine.total}</b> <small>($${Math.round(mine.bot.earned)} in battle + $${mine.bonus} for place ${mine.place})</small></p>
      <table class="results">
        <thead><tr><th>#</th><th>Robot</th><th>Kills</th><th>Deaths</th><th>Damage</th><th>Payout</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button class="btn btn-primary" data-continue>Back to the garage</button>
    </div>`;
  el.querySelector('[data-continue]')!.addEventListener('click', onContinue);
  return el;
}
