import { CATALOG, upgradeCost, type Save, type Slot } from '../game/progress';
import { ACTIONS, keyLabel, QUALITY, type Action, type Bindings, type Quality, type Settings } from '../game/settings';
import { NAME_MAX, type HistoryEntry, type LeaderboardEntry, type Profile } from '../net/protocol';
import { ARENA_ORDER, ARENAS, type ArenaId } from '../sim/arena';
import {
  DEFAULT_PAINT,
  MODES,
  PAINT_COLORS,
  PATTERNS,
  POWERUPS,
  POWERUP_CAP,
  POWERUP_ORDER,
  TOPPERS,
  UPGRADES,
  type ModeId,
  type Paint,
  type PowerupId,
  type UpgradeId,
} from '../sim/data';
import type { Standing } from '../sim/match';
import { escapeText, UPGRADE_ORDER } from './hud';

const POWER_ACTIONS: Action[] = ['power1', 'power2', 'power3', 'power4', 'power5', 'power6'];
function controlsTable(keys: Bindings): string {
  const key = (action: Action) => `<kbd>${keyLabel(keys[action])}</kbd>`;
  return `
  <table class="controls">
    <tr><td>${key('forward')}${key('back')}${key('left')}${key('right')}</td><td>Drive</td></tr>
    <tr><td>${key('melee')}</td><td>Front weapon</td></tr>
    <tr><td>${key('turret')}</td><td>Turret (aims itself)</td></tr>
    <tr><td>${key('defense')}</td><td>Defense</td></tr>
    <tr><td>${key('power1')}${key('power2')}${key('power3')}${key('power4')}${key('power5')}${key('power6')}</td><td>Powerups</td></tr>
    <tr><td>${key('rear')}</td><td>Look behind</td></tr>
    <tr><td><kbd>M</kbd> / <kbd>Esc</kbd></td><td>Mute / Pause</td></tr>
  </table>`;
}

export function menuScreen(onStart: () => void, onSettings: () => void, keys: Bindings): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-menu';
  el.innerHTML = `
    <div class="menu-card">
      <h1>SCRAP<span>RIOT</span></h1>
      <p class="tagline">Bolt on a chainsaw. Enter the pit. Sell whatever is left.</p>
      <button class="btn btn-primary" data-start>Enter the garage</button>
      <button class="btn" data-settings>Settings</button>
      ${controlsTable(keys)}
    </div>`;
  el.querySelector('[data-start]')!.addEventListener('click', onStart);
  el.querySelector('[data-settings]')!.addEventListener('click', onSettings);
  return el;
}

export function pauseScreen(online: boolean, onResume: () => void, onQuit: () => void, keys: Bindings): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-pause';
  el.innerHTML = `
    <div class="menu-card">
      <h2>${online ? 'Menu' : 'Paused'}</h2>
      ${online ? '<p class="tagline">The match keeps running. A bot takes over your robot if you leave.</p>' : ''}
      <button class="btn btn-primary" data-resume>Resume</button>
      <button class="btn" data-quit>${online ? 'Leave match (no payout)' : 'Forfeit match'}</button>
      ${controlsTable(keys)}
    </div>`;
  el.querySelector('[data-resume]')!.addEventListener('click', onResume);
  el.querySelector('[data-quit]')!.addEventListener('click', onQuit);
  return el;
}

export function lobbyScreen(onCancel: () => void, hasAccount: boolean): { el: HTMLElement; update: (players: number, capacity: number, startsIn: number, arena: ArenaId, mode: ModeId) => void } {
  const el = document.createElement('div');
  el.className = 'screen screen-pause';
  el.innerHTML = `
    <div class="menu-card">
      <h2>Finding a match</h2>
      <p class="tagline" data-status>Connecting to the server&hellip;</p>
      <p class="tagline">${hasAccount ? 'Your gear and upgrades count here, and you keep what you earn. Bots fill any empty slots and match your level.' : 'Online, everyone fights with equal stats and one of each powerup. Your garage upgrades apply in practice matches. Bots fill any empty slots.'}</p>
      <button class="btn" data-cancel>Cancel</button>
    </div>`;
  el.querySelector('[data-cancel]')!.addEventListener('click', onCancel);
  const status = el.querySelector('[data-status]')!;
  return {
    el,
    update: (players, capacity, startsIn, arena, mode) => {
      status.textContent = `${ARENAS[arena].name}, ${MODES[mode].name}. ${players} of ${capacity} players. Starting in ${startsIn}s.`;
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
  onSettings: () => void;
  onTab: (tab: GarageTab) => void;
  onPaint: (change: Partial<Paint>) => void;
  onPractice: (change: { arena?: ArenaId; mode?: ModeId }) => void;
  onSignOut: () => void;
  onDelete: () => void;
}

export type GarageTab = 'chassis' | 'melee' | 'turret' | 'defense' | 'powerups' | 'upgrades' | 'paint' | 'maps' | 'profile';

const TAB_LABELS: Record<GarageTab, string> = {
  chassis: 'Chassis', melee: 'Front', turret: 'Turret', defense: 'Defense',
  powerups: 'Powerups', upgrades: 'Upgrades', paint: 'Paint', maps: 'Maps', profile: 'Profile',
};

export interface GarageOptions {
  onlineAvailable: boolean;
  /** One-off message, such as why the last online attempt failed. */
  notice: string;
  keys: Bindings;
  tab: GarageTab;
  /** Absent when progress is only saved on this device. */
  account: {
    profile: Profile;
    history: HistoryEntry[];
    leaderboard: LeaderboardEntry[];
    googleAvailable: boolean;
    confirmDelete: boolean;
  } | null;
}

function ordinal(place: number): string {
  return ['1st', '2nd', '3rd'][place - 1] ?? `${place}th`;
}

function profilePanel(account: GarageOptions['account']): string {
  if (!account) {
    return `<section><h3>Profile</h3><p class="settings-hint">Your progress is saved on this device. Connect to a game server to keep a profile, match history and rating.</p></section>`;
  }
  const { profile, history, leaderboard, googleAvailable, confirmDelete } = account;
  const { save, rating, kills, deaths, signedIn } = profile;
  const signIn = signedIn
    ? '<p class="settings-hint">Signed in with Google. Your progress follows you to any browser.</p><button class="mini-btn" data-signout>Sign out</button>'
    : `<p class="settings-hint">Playing as a guest, so your progress lives in this browser and is removed after 60 days without play. Sign in to keep it and play anywhere.</p>${googleAvailable ? '<div class="google-slot" data-google></div>' : ''}`;
  const historyRows = history
    .map((h) => {
      const change = `${h.ratingChange > 0 ? '+' : ''}${h.ratingChange}`;
      return `<tr><td>${new Date(h.endedAt).toLocaleDateString()}</td><td>${escapeText(ARENAS[h.arena]?.name ?? h.arena)}</td><td>${escapeText(MODES[h.mode]?.name ?? h.mode)}</td><td>${ordinal(h.place)}</td><td>${h.kills}/${h.deaths}</td><td>$${h.payout}</td><td>${change}</td></tr>`;
    })
    .join('');
  const boardRows = leaderboard
    .map((row, i) => `<tr><td>${i + 1}</td><td>${escapeText(row.name)}</td><td>${row.rating}</td><td>${row.wins}</td><td>${row.matches}</td><td>${row.kills}</td></tr>`)
    .join('');
  return `
    <section><h3>Account</h3>${signIn}</section>
    <section><h3>Career</h3>
      <div class="stat-row">
        <div><b>${rating}</b><span>Rating</span></div>
        <div><b>${save.matches}</b><span>Matches</span></div>
        <div><b>${save.wins}</b><span>Wins</span></div>
        <div><b>${kills}</b><span>Kills</span></div>
        <div><b>${deaths}</b><span>Deaths</span></div>
      </div>
    </section>
    <section><h3>Recent online matches</h3>${
      historyRows
        ? `<table class="results"><thead><tr><th>Date</th><th>Map</th><th>Mode</th><th>Place</th><th>K/D</th><th>Payout</th><th>Rating</th></tr></thead><tbody>${historyRows}</tbody></table>`
        : '<p class="settings-hint">No online matches yet.</p>'
    }</section>
    <section><h3>Leaderboard</h3>${
      boardRows
        ? `<table class="results board-table"><thead><tr><th>#</th><th>Pilot</th><th>Rating</th><th>Wins</th><th>Matches</th><th>Kills</th></tr></thead><tbody>${boardRows}</tbody></table>`
        : '<p class="settings-hint">Nobody has played an online match yet.</p>'
    }</section>
    <section><h3>Your data</h3>
      <p class="settings-hint">We store your chosen name, progress and match history. If you sign in with Google, we also store an ID from Google, but not your email or real name. Other players can see your name, paint, rating and stats.</p>
      <button class="mini-btn${confirmDelete ? ' mini-danger' : ''}" data-delete>${confirmDelete ? 'Click again to permanently delete' : 'Delete my account'}</button>
    </section>`;
}

function slotTitle(slot: Slot, keys: Bindings): string {
  if (slot === 'chassis') return 'Chassis';
  if (slot === 'melee') return `Front weapon [${keyLabel(keys.melee)}]`;
  if (slot === 'turret') return `Turret [${keyLabel(keys.turret)}]`;
  return `Defense [${keyLabel(keys.defense)}]`;
}

function statLine(slot: Slot, id: string): string {
  if (slot === 'melee' && CATALOG.melee[id as keyof typeof CATALOG.melee].passive) return '<small>Always active</small>';
  if (slot === 'defense' && CATALOG.defense[id as keyof typeof CATALOG.defense].passive) return '<small>Always active</small>';
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
    return `<section><h3>${slotTitle(slot, options.keys)}</h3><div class="cards">${cards}</div></section>`;
  };

  const powerups = POWERUP_ORDER.map((id, i) => {
    const def = POWERUPS[id];
    const n = save.loadout.powerups[id];
    const full = n >= POWERUP_CAP;
    const broke = !full && save.money < def.price;
    return `<button class="card${broke ? ' card-broke' : ''}" data-power="${id}">
      <strong>[${keyLabel(options.keys[POWER_ACTIONS[i]])}] ${def.name}</strong><span>${def.blurb}</span><small>Carrying ${n}/${POWERUP_CAP}</small><em>${full ? 'Full' : `$${def.price}`}</em></button>`;
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

  const paint = save.loadout.paint ?? DEFAULT_PAINT;
  const swatches = (part: 'primary' | 'secondary' | 'eye') =>
    PAINT_COLORS.map(
      (color) =>
        `<button class="swatch${paint[part] === color ? ' swatch-on' : ''}" style="background:#${color.toString(16).padStart(6, '0')}" data-paint="${part}" data-value="${color}" aria-label="${part} color"></button>`,
    ).join('');
  const choice = (part: 'pattern' | 'topper', table: Record<string, string>) =>
    Object.entries(table)
      .map(([id, label]) => `<button class="mini-btn${paint[part] === id ? ' mini-on' : ''}" data-paint="${part}" data-value="${id}">${label}</button>`)
      .join('');
  const paintShop = `
    <section><h3>Main color</h3><div class="swatches">${swatches('primary')}</div></section>
    <section><h3>Trim color</h3><div class="swatches">${swatches('secondary')}</div></section>
    <section><h3>Eye color</h3><div class="swatches">${swatches('eye')}</div></section>
    <section><h3>Pattern</h3><div class="choices">${choice('pattern', PATTERNS)}</div></section>
    <section><h3>Topper</h3><div class="choices">${choice('topper', TOPPERS)}</div></section>
    <p class="settings-hint">Paint is free, and other players see it online.</p>`;

  const maps = ARENA_ORDER.map((id) => {
    const def = ARENAS[id];
    const on = save.practice.arena === id;
    return `<button class="card${on ? ' card-on' : ''}" data-arena="${id}"><strong>${def.name}</strong><span>${def.blurb}</span><small>${def.walled ? 'Walled' : 'Open edges'}${def.grip < 0.5 ? ' · Icy' : ''}</small><em>${on ? 'Selected' : 'Select'}</em></button>`;
  }).join('');
  const modes = (Object.keys(MODES) as ModeId[])
    .map((id) => {
      const on = save.practice.mode === id;
      return `<button class="card${on ? ' card-on' : ''}" data-mode="${id}"><strong>${MODES[id].name}</strong><span>${MODES[id].blurb}</span><em>${on ? 'Selected' : 'Select'}</em></button>`;
    })
    .join('');

  const body = () => {
    switch (options.tab) {
      case 'powerups':
        return `<section><h3>Powerups (used up in battle)</h3><div class="cards">${powerups}</div></section>`;
      case 'upgrades':
        return `<section><h3>Upgrades</h3><div class="cards">${upgrades}</div></section>`;
      case 'paint':
        return paintShop;
      case 'maps':
        return `<section><h3>Practice map</h3><div class="cards">${maps}</div></section><section><h3>Practice mode</h3><div class="cards">${modes}</div></section><p class="settings-hint">Online matches pick their own map and mode.</p>`;
      case 'profile':
        return profilePanel(options.account);
      default:
        return section(options.tab);
    }
  };
  const tabs = (Object.keys(TAB_LABELS) as GarageTab[])
    .map((id) => `<button class="tab${options.tab === id ? ' tab-on' : ''}" role="tab" aria-selected="${options.tab === id}" data-tab="${id}">${TAB_LABELS[id]}</button>`)
    .join('');

  el.innerHTML = `
    <div class="garage-top">
      <h2>Garage</h2>
      <label class="garage-name">Name <input data-name maxlength="${NAME_MAX}" value="${escapeText(save.name)}" autocomplete="off" spellcheck="false" /></label>
      <div class="garage-record">${save.wins} wins / ${save.matches} matches</div>
      <div class="garage-money">$${save.money}</div>
    </div>
    ${options.notice ? `<div class="garage-notice" role="alert">${escapeText(options.notice)}</div>` : ''}
    <div class="garage-tabs" role="tablist">${tabs}</div>
    <div class="garage-panel">
      ${body()}
    </div>
    <div class="garage-actions">
      ${options.onlineAvailable ? '<button class="btn btn-primary" data-online>Fight online</button>' : ''}
      <button class="btn${options.onlineAvailable ? '' : ' btn-primary'}" data-fight>${options.onlineAvailable ? 'Practice vs bots' : 'Fight!'}</button>
      <button class="btn btn-settings" data-settings>Settings</button>
    </div>`;

  el.querySelector<HTMLInputElement>('[data-name]')!.addEventListener('change', (e) => {
    actions.onName((e.target as HTMLInputElement).value);
  });

  el.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!target) return;
    const { slot, id, power, upgrade, tab, paint: part, value, arena, mode } = target.dataset;
    if (tab) actions.onTab(tab as GarageTab);
    else if (part && value) actions.onPaint({ [part]: part === 'pattern' || part === 'topper' ? value : Number(value) } as Partial<Paint>);
    else if (arena) actions.onPractice({ arena: arena as ArenaId });
    else if (mode) actions.onPractice({ mode: mode as ModeId });
    else if (slot && id) actions.onEquip(slot as Slot, id);
    else if (power) actions.onPowerup(power as PowerupId);
    else if (upgrade) actions.onUpgrade(upgrade as UpgradeId);
    else if ('fight' in target.dataset) actions.onFight();
    else if ('online' in target.dataset) actions.onOnline();
    else if ('settings' in target.dataset) actions.onSettings();
    else if ('signout' in target.dataset) actions.onSignOut();
    else if ('delete' in target.dataset) actions.onDelete();
  });
  return el;
}

export function resultsScreen(standings: Standing[], playerId: number, onContinue: () => void, note = ''): HTMLElement {
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
      ${note ? `<p class="payout"><small>${escapeText(note)}</small></p>` : `<p class="payout">You earned <b>$${mine.total}</b> <small>($${Math.round(mine.bot.earned)} in battle + $${mine.bonus} for place ${mine.place})</small></p>`}
      <table class="results">
        <thead><tr><th>#</th><th>Robot</th><th>Kills</th><th>Deaths</th><th>Damage</th><th>Payout</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button class="btn btn-primary" data-continue>Back to the garage</button>
    </div>`;
  el.querySelector('[data-continue]')!.addEventListener('click', onContinue);
  return el;
}

export interface SettingsActions {
  onQuality: (quality: Quality) => void;
  onFps: () => void;
  onBind: (action: Action) => void;
  onReset: () => void;
  onBack: () => void;
}

export function settingsScreen(settings: Settings, waitingFor: Action | null, actions: SettingsActions): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-pause';
  const qualities = (Object.keys(QUALITY) as Quality[])
    .map((q) => `<button class="mini-btn${settings.quality === q ? ' mini-on' : ''}" data-quality="${q}">${QUALITY[q].label}</button>`)
    .join('');
  const bindings = ACTIONS.map(({ id, label }) => {
    const waiting = waitingFor === id;
    return `<div class="settings-row"><span>${label}</span>
      <button class="mini-btn${waiting ? ' mini-wait' : ''}" data-bind="${id}">${waiting ? 'Press a key' : escapeText(keyLabel(settings.bindings[id]))}</button></div>`;
  }).join('');
  el.innerHTML = `
    <div class="menu-card settings-card">
      <h2>Settings</h2>
      <h3>Graphics</h3>
      <div class="settings-row"><span>Quality</span><div class="segmented">${qualities}</div></div>
      <div class="settings-row"><span>Show frame rate</span>
        <button class="mini-btn${settings.showFps ? ' mini-on' : ''}" data-fps>${settings.showFps ? 'On' : 'Off'}</button></div>
      <h3>Keyboard</h3>
      ${bindings}
      <p class="settings-hint">Esc cancels a rebind. Using a key that's taken swaps the two actions. Esc and M stay reserved for pause and mute.</p>
      <h3>Gamepad</h3>
      <p class="settings-hint">Right and left triggers drive, the left stick steers. A: front weapon, RB: turret, B: defense, D-pad: first four powerups, LB: Repair Kit, X: Turbo, Y: look behind, Start: menu.</p>
      <button class="btn" data-reset>Reset keys</button>
      <button class="btn btn-primary" data-back>Done</button>
    </div>`;
  el.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!target) return;
    const { quality, bind } = target.dataset;
    if (quality) actions.onQuality(quality as Quality);
    else if (bind) actions.onBind(bind as Action);
    else if ('fps' in target.dataset) actions.onFps();
    else if ('reset' in target.dataset) actions.onReset();
    else if ('back' in target.dataset) actions.onBack();
  });
  return el;
}
