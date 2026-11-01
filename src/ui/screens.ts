import { ACHIEVEMENTS, CAREER, isUnlocked, type AchievementStats, type CareerProgress, type Fight, type Medal } from '../game/career';
import { canSell, CATALOG, CHEAT_MAX, partFits, previewLoadout, sellPrice, upgradeCost, type PartPreview, type Save, type Slot } from '../game/progress';
import { ACTIONS, activeLevel, keyLabel, LEVELS, QUALITY, VOLUME_KINDS, type Action, type Bindings, type Quality, type Settings, type VolumeKind } from '../game/settings';
import { DEFAULT_NAME, NAME_MAX, sanitizeName, type HistoryEntry, type LeaderboardEntry, type OnlineQueue, type OnlineStatus, type Profile } from '../net/protocol';
import { logoUrl } from '../render/logo';
import { ARENA_ORDER, ARENAS, type ArenaId } from '../sim/arena';
import {
  ARMOUR,
  buildStats,
  MELEE,
  REWARD,
  TURRETS,
  DEFAULT_PAINT,
  installedParts,
  MODES,
  BODIES,
  PATTERNS,
  POWERUPS,
  POWERUP_CAP,
  POWERUP_ORDER,
  spaceCapacity,
  spaceUsed,
  UPGRADES,
  weaponSpace,
  type MeleeId,
  type ModeId,
  type Paint,
  type TurretId,
  type PowerupId,
  type UpgradeId,
} from '../sim/data';
import type { Standing } from '../sim/match';
import { escapeText, UPGRADE_ORDER } from './hud';
import { timeAgo } from './timeAgo';

const INTRO_MS = 1000;
const INTRO_SPARKS = 18;
const NAME_MIN = 2;

const POWER_ACTIONS: Action[] = ['power1', 'power2', 'power3', 'power4', 'power5', 'power6'];

function logoHtml(): string {
  return `<img class="logo" src="${logoUrl()}" alt="Scrap Riot" />`;
}

function controlsTable(keys: Bindings): string {
  const key = (action: Action) => `<kbd>${keyLabel(keys[action])}</kbd>`;
  return `
  <table class="controls">
    <tr><td>${key('forward')}${key('back')}${key('left')}${key('right')}</td><td>Drive</td></tr>
    <tr><td>${key('melee')}</td><td>Main weapon</td></tr>
    <tr><td>${key('boost')}</td><td>Speed boost (uses battery)</td></tr>
    <tr><td>${key('turret')}</td><td>Gun (fires straight ahead)</td></tr>
    <tr><td>${key('defense')}</td><td>Defense</td></tr>
    <tr><td>${key('power1')}${key('power2')}${key('power3')}${key('power4')}${key('power5')}${key('power6')}</td><td>Powerups</td></tr>
    <tr><td>${key('rear')}</td><td>Look behind</td></tr>
    <tr><td><kbd>M</kbd> / <kbd>Esc</kbd></td><td>Mute / Pause</td></tr>
  </table>`;
}

/** A few seconds of logo when the game opens. Any click or key skips it. */
export function introScreen(onDone: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-intro';
  // Uneven lengths, or the sparks would burst out in a tidy circle.
  const sparks = Array.from({ length: INTRO_SPARKS }, (_, i) =>
    `<i style="--angle:${Math.round((i / INTRO_SPARKS) * 360)}deg;--reach:${30 + ((i * 7) % 11) * 3}vh"></i>`,
  ).join('');
  el.innerHTML = `
    <div class="intro-band intro-band-top"></div>
    <div class="intro-band intro-band-bottom"></div>
    <div class="intro-stage">
      <div class="intro-ring"></div>
      <div class="intro-sparks">${sparks}</div>
      <img class="intro-logo" src="${logoUrl()}" alt="Scrap Riot" />
      <p class="intro-line">Build it. Bolt it. Break it.</p>
    </div>
    <div class="intro-flash"></div>`;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    window.removeEventListener('keydown', finish);
    onDone();
  };
  const timer = window.setTimeout(finish, INTRO_MS);
  window.addEventListener('keydown', finish);
  el.addEventListener('pointerdown', finish);
  return el;
}

/** Asked once, before anything else, until sign-in can take care of it. */
export function nameScreen(onSubmit: (name: string) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-lobby';
  el.innerHTML = `
    <form class="menu-card name-card">
      ${logoHtml()}
      <h2>Who's driving?</h2>
      <p class="tagline">Pick a name, pilot. Other players will see it, so don't use your real name.</p>
      <input data-pilot-name maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="Your pilot name" aria-label="Pilot name" />
      <p class="name-error" role="alert"></p>
      <button class="btn btn-primary" type="submit">Let's go</button>
    </form>`;
  const input = el.querySelector<HTMLInputElement>('[data-pilot-name]')!;
  const error = el.querySelector<HTMLElement>('.name-error')!;
  el.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = sanitizeName(input.value);
    if (input.value.trim().length < NAME_MIN || name === DEFAULT_NAME) {
      error.textContent = `Please enter a name of at least ${NAME_MIN} characters, other than "${DEFAULT_NAME}".`;
      input.focus();
      return;
    }
    onSubmit(name);
  });
  return el;
}

export function menuScreen(onStart: () => void, onSettings: () => void, keys: Bindings): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-menu';
  el.innerHTML = `
    <div class="menu-card">
      ${logoHtml()}
      <p class="tagline">Build a robot. Climb to the roof. Knock the other one off.</p>
      <button class="btn btn-primary" data-start>Enter the workshop</button>
      <button class="btn" data-settings>Settings</button>
      ${controlsTable(keys)}
    </div>`;
  el.querySelector('[data-start]')!.addEventListener('click', onStart);
  el.querySelector('[data-settings]')!.addEventListener('click', onSettings);
  return el;
}

export function pauseScreen(online: boolean, onResume: () => void, onQuit: () => void, keys: Bindings, quitLabel = online ? 'Leave match' : 'Forfeit match'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-pause';
  el.innerHTML = `
    <div class="menu-card">
      <h2>${online ? 'Menu' : 'Paused'}</h2>
      ${online ? '<p class="tagline">The match keeps running. Leaving counts as a loss.</p>' : ''}
      <button class="btn btn-primary" data-resume>Resume</button>
      <button class="btn" data-quit>${quitLabel}</button>
      ${controlsTable(keys)}
    </div>`;
  el.querySelector('[data-resume]')!.addEventListener('click', onResume);
  el.querySelector('[data-quit]')!.addEventListener('click', onQuit);
  return el;
}

export function lobbyScreen(queue: OnlineQueue, onCancel: () => void, hasAccount: boolean): { el: HTMLElement; update: (players: number, capacity: number, startsIn: number, arena: ArenaId, mode: ModeId) => void } {
  const brawl = queue === 'brawl';
  const el = document.createElement('div');
  el.className = 'screen screen-lobby';
  el.innerHTML = `
    <div class="menu-card">
      ${logoHtml()}
      <h2>${brawl ? 'Online Brawl' : 'Online Duel'}</h2>
      <p class="lobby-status" data-status>Connecting to the server&hellip;</p>
      <p class="tagline" data-where></p>
      <p class="tagline">${brawl ? "Up to eight pilots on a random map. It starts 10 seconds after a second pilot joins, or as soon as it's full, and bots take any empty seats." : 'A duel starts as soon as another pilot joins.'} ${hasAccount ? 'Win to earn money and rating.' : 'Online, everyone fights with equal stats.'}</p>
      <button class="btn" data-cancel>Cancel</button>
    </div>`;
  el.querySelector('[data-cancel]')!.addEventListener('click', onCancel);
  const status = el.querySelector('[data-status]')!;
  const where = el.querySelector('[data-where]')!;
  return {
    el,
    update: (players, capacity, startsIn, arena, mode) => {
      where.textContent = `${MODES[mode].name} on ${ARENAS[arena].name}`;
      if (startsIn < 0) status.textContent = 'Waiting for another pilot to join…';
      else status.textContent = brawl ? `${players} of ${capacity} pilots here. Starting in ${startsIn}…` : `Opponent found! Starting in ${startsIn}…`;
    },
  };
}

export interface GarageActions {
  onEquip: (slot: Slot, id: string) => void;
  onPreviewPart: (part: PartPreview | null) => void;
  onSell: (slot: Slot, id: string) => void;
  onArmour: (armour: number) => void;
  onShelf: (slot: Slot | null) => void;
  onPowerup: (id: PowerupId) => void;
  onUpgrade: (id: UpgradeId) => void;
  onFight: () => void;
  onOnline: (queue: OnlineQueue) => void;
  onTraining: () => void;
  onName: (name: string) => void;
  onCheat: (code: string) => void;
  onSettings: () => void;
  onTab: (tab: GarageTab) => void;
  onSide: (side: SideTab) => void;
  onBuyCategory: (category: BuyCategory) => void;
  onZoom: (step: number) => void;
  onQuit: () => void;
  onPaint: (change: Partial<Paint>) => void;
  onPaintUse: (part: 'primary' | 'secondary') => void;
  onPractice: (change: { arena?: ArenaId; mode?: ModeId }) => void;
  onSignOut: () => void;
  onDelete: () => void;
  onCareer: (fight: Fight) => void;
  onRear: (rear: boolean) => void;
}

export type GarageTab = 'workshop' | 'paintshop' | 'buy' | 'sell' | 'bots' | 'stats' | 'help';
export type SideTab = 'stats' | 'highscore' | 'players';
export type BuyCategory = Slot | 'powerups' | 'upgrades';

const TOP_TABS: [GarageTab, string][] = [['workshop', 'Workshop'], ['paintshop', 'Paintshop'], ['buy', 'Buy Parts'], ['sell', 'Sell Parts']];
const SIDE_TABS: [SideTab, string][] = [['stats', 'Specs'], ['highscore', 'Highscore'], ['players', 'Players']];
const SLOT_LABELS: Record<Slot, string> = {
  chassis: 'Chassis', tower: 'Tower', wheels: 'Wheels', engine: 'Engine', power: 'Power source',
  melee: 'Main weapon', turret: 'Gun', defense: 'Defense',
};
const SLOTS = Object.keys(SLOT_LABELS) as Slot[];
const BUY_CATEGORIES: [BuyCategory, string][] = [...SLOTS.map((slot): [BuyCategory, string] => [slot, SLOT_LABELS[slot]]), ['powerups', 'Powerups'], ['upgrades', 'Upgrades']];
const STAT_MAX = { speed: 24, hp: 440 };

export interface GarageOptions {
  onlineAvailable: boolean;
  /** One-off message, such as why the last online attempt failed. */
  notice: string;
  keys: Bindings;
  tab: GarageTab;
  side: SideTab;
  buyCategory: BuyCategory;
  online: OnlineStatus | null;
  /** Which part type the shelf is showing, or null for everything. */
  shelf: Slot | null;
  /** A part being tried out. Nothing is bought or fitted until the player says so. */
  partPreview: PartPreview | null;
  career: CareerProgress;
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

const MEDAL_LABEL: Record<Medal, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

function careerPanel(progress: CareerProgress): string {
  const cards = CAREER.map((fight, index) => {
    const unlocked = isUnlocked(progress, index);
    const medal = progress[fight.id];
    const reward = medal ? '' : ` · $${fight.reward} first medal`;
    const status = !unlocked ? 'Locked' : medal ? `${MEDAL_LABEL[medal]} · Replay` : 'Fight';
    return `<button class="card${fight.boss ? ' card-boss' : ''}${medal ? ` medal-${medal}` : ''}${unlocked ? '' : ' card-locked'}" data-fight-id="${fight.id}" ${unlocked ? '' : 'disabled'}>
      <strong>${index + 1}. ${fight.title}</strong><span>${fight.blurb}</span><small>${ARENAS[fight.arena].name} · ${MODES[fight.mode].name}${reward}</small><em>${status}</em></button>`;
  }).join('');
  return `<section><h3>Career</h3><p class="settings-hint">Fight your way up the ladder with your current robot. Win a medal to unlock the next fight, and win almost untouched for gold.</p><div class="cards">${cards}</div></section>`;
}

function achievementsPanel(stats: AchievementStats): string {
  const items = ACHIEVEMENTS.map((a) => {
    const earned = a.earned(stats);
    return `<div class="achievement${earned ? ' achievement-on' : ''}"><strong>${earned ? '★ ' : ''}${a.name}</strong><span>${a.blurb}</span></div>`;
  }).join('');
  return `<section><h3>Achievements</h3><div class="achievements">${items}</div></section>`;
}

function profilePanel(account: GarageOptions['account'], career: CareerProgress): string {
  if (!account) {
    return `<section><h3>Profile</h3><p class="settings-hint">Your progress is saved on this device. Connect to a game server to keep a profile, match history and rating.</p></section>${achievementsPanel({ matches: 0, wins: 0, kills: 0, rating: 0, career })}`;
  }
  const { profile, history, googleAvailable, confirmDelete } = account;
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
  return `
    <section><h3>Account</h3>${signIn}</section>
    <section><h3>Record</h3>
      <div class="stat-row">
        <div><b>${rating}</b><span>Rating</span></div>
        <div><b>${save.matches}</b><span>Matches</span></div>
        <div><b>${save.wins}</b><span>Wins</span></div>
        <div><b>${kills}</b><span>Kills</span></div>
        <div><b>${deaths}</b><span>Deaths</span></div>
      </div>
    </section>
    ${achievementsPanel({ matches: save.matches, wins: save.wins, kills, rating, career })}
    <section><h3>Recent online matches</h3>${
      historyRows
        ? `<table class="results"><thead><tr><th>Date</th><th>Map</th><th>Mode</th><th>Place</th><th>K/D</th><th>Payout</th><th>Rating</th></tr></thead><tbody>${historyRows}</tbody></table>`
        : '<p class="settings-hint">No online matches yet.</p>'
    }</section>
    <section><h3>Your data</h3>
      <p class="settings-hint">We store your chosen name, progress and match history. If you sign in with Google, we also store an ID from Google, but not your email or real name. Other players can see your name, paint, rating and stats.</p>
      <button class="mini-btn${confirmDelete ? ' mini-danger' : ''}" data-delete>${confirmDelete ? 'Click again to permanently delete' : 'Delete my account'}</button>
    </section>`;
}

/** Small line drawings of each part type, for the workshop shelf. */
const PART_ICONS: Record<Slot, string> = {
  chassis: '<path d="M6 30 L12 18 H36 L42 30 Z"/><circle cx="14" cy="33" r="5"/><circle cx="34" cy="33" r="5"/>',
  tower: '<rect x="14" y="22" width="20" height="14"/><path d="M14 22 A10 10 0 0 1 34 22"/><path d="M24 14 V6"/>',
  wheels: '<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="6"/><path d="M24 8 V18 M24 30 V40 M8 24 H18 M30 24 H40"/>',
  engine: '<rect x="10" y="16" width="26" height="20"/><path d="M36 22 H42 V30 H36 M16 16 V10 H30 V16 M6 22 V30"/>',
  power: '<rect x="14" y="12" width="20" height="28"/><rect x="20" y="7" width="8" height="5"/><path d="M26 17 L20 27 H28 L22 36"/>',
  melee: '<path d="M8 40 L36 8 L40 12 L14 42 Z"/><path d="M6 32 L16 42"/>',
  turret: '<rect x="8" y="20" width="24" height="12"/><path d="M32 23 H44 M32 29 H44"/><path d="M14 32 V40 H26 V32"/>',
  defense: '<path d="M24 6 L40 12 V24 C40 34 32 40 24 43 C16 40 8 34 8 24 V12 Z"/>',
};

function partIcon(slot: Slot): string {
  return `<svg class="part-icon" viewBox="0 0 48 48" aria-hidden="true">${PART_ICONS[slot]}</svg>`;
}

function partName(slot: Slot, id: string): string {
  return (CATALOG[slot] as Record<string, { name: string }>)[id].name;
}

/** What the shop says about a part. Weapons take room according to their price, and the chassis provides it. */
function partDetails(slot: Slot, id: string): string {
  const def = (CATALOG[slot] as Record<string, { price: number; space?: number }>)[id];
  if (slot === 'chassis') return `Room for ${def.space}`;
  const room = `Takes ${slot === 'melee' || slot === 'turret' || slot === 'defense' ? weaponSpace(def.price) : def.space} room`;
  if (slot === 'melee') {
    const weapon = MELEE[id as MeleeId];
    return `${weapon.type} · ${weapon.cooldown >= 1 ? `${weapon.cooldown}s cooldown · ` : ''}${room}`;
  }
  if (slot === 'turret') {
    const shots = TURRETS[id as TurretId].shots;
    const gun = TURRETS[id as TurretId];
    const count = shots > 0 ? `${shots} ${gun.burst ? 'bursts' : 'shots'} per life` : 'Battery only';
    return `${count} · ${gun.cooldown >= 1 ? `${gun.cooldown}s cooldown · ` : ''}${room}`;
  }
  return room;
}

function bar(label: string, fraction: number, over = false): string {
  return `<div class="stat-bar${over ? ' stat-bar-over' : ''}"><label>${label}</label><div><i style="width:${Math.min(100, Math.round(fraction * 100))}%"></i></div></div>`;
}

function workshopPanel(save: Save, options: GarageOptions): string {
  const { loadout } = save;
  const preview = options.partPreview;
  // Everything on this sheet describes the robot with the part being tried, so it can be compared.
  const shown = previewLoadout(loadout, preview);
  const parts = installedParts(shown);
  const stats = buildStats(shown);
  const used = spaceUsed(shown);
  const capacity = spaceCapacity(shown);
  const trying = (slot: Slot) => (preview?.slot === slot ? ' part-trying' : '');

  const row = (slot: Slot, id: string, extra = '') =>
    `<h4>${SLOT_LABELS[slot]}</h4><div class="part-row${trying(slot)}"><span class="part-name">${partName(slot, id)}</span>${extra}<button class="plate-btn" data-shelf="${slot}">Change</button></div>`;
  const armourFits = spaceUsed({ ...loadout, armour: parts.armour + ARMOUR.step }) <= spaceCapacity(loadout);
  const armour = `<span class="part-armour">Armour:
    <button class="step-btn" data-armour="${parts.armour - ARMOUR.step}" ${parts.armour <= ARMOUR.min ? 'disabled' : ''} aria-label="Less armour">◀</button>
    <b>${parts.armour}</b>
    <button class="step-btn" data-armour="${parts.armour + ARMOUR.step}" ${parts.armour >= ARMOUR.max || !armourFits ? 'disabled' : ''} aria-label="More armour">▶</button></span>`;
  const weapon = (slot: 'melee' | 'turret' | 'defense', placement: string) =>
    `<div class="part-row part-weapon${trying(slot)}"><span class="part-name">${partName(slot, shown[slot])}</span>
      <span class="part-key">Key: <kbd>${keyLabel(options.keys[slot])}</kbd></span>
      <span class="part-place">Placement: ${placement}</span>
      <button class="plate-btn" data-shelf="${slot}">Change</button></div>`;
  const rear = loadout.rearMelee === true;
  const placement = `<select data-placement aria-label="Main weapon placement"><option value="0"${rear ? '' : ' selected'}>Front</option><option value="1"${rear ? ' selected' : ''}>Back</option></select>`;

  const filter = options.shelf;
  // Every part is on the shelf, owned or not, because trying one out is free. Parts you own come first.
  const shelfItems = (filter ? [filter] : SLOTS).flatMap((slot) => {
    const owned = save.owned[slot] as string[];
    const fitted = (loadout as unknown as Record<Slot, string>)[slot] ?? installedParts(loadout)[slot as 'tower'];
    const catalog = CATALOG[slot] as Record<string, { blurb: string; price: number }>;
    return Object.keys(catalog)
      .filter((id) => id !== fitted)
      .sort((a, b) => Number(owned.includes(b)) - Number(owned.includes(a)))
      .map((id) => {
        const has = owned.includes(id);
        const fits = partFits(save, slot, id);
        const { price, blurb } = catalog[id];
        const on = preview?.slot === slot && preview.id === id;
        const action = has
          ? `<button class="plate-btn" data-slot="${slot}" data-id="${id}" ${fits ? '' : 'disabled'}>${fits ? 'Use this part' : 'No room'}</button>`
          : `<button class="plate-btn" data-slot="${slot}" data-id="${id}" ${save.money >= price ? '' : 'disabled'}>Buy $${price}</button>`;
        return `<div class="shelf-item${has ? '' : ' shelf-unowned'}${on ? ' shelf-on' : ''}" title="${SLOT_LABELS[slot]}: ${partName(slot, id)}. ${escapeText(blurb)}">
          ${partIcon(slot)}<small>${partName(slot, id)}</small>
          <button class="plate-btn" data-preview-slot="${on ? '' : slot}" data-preview-id="${id}">${on ? 'Stop preview' : 'Preview'}</button>
          ${action}</div>`;
      });
  });
  const previewNote = preview
    ? `<div class="preview-note">Previewing <b>${partName(preview.slot, preview.id)}</b>. These numbers and the picture show it fitted, but nothing has changed yet. <button class="plate-btn" data-preview-slot="">Stop preview</button></div>`
    : '';
  return `
    <div class="shelf">
      <div class="shelf-head">${filter ? `<button class="plate-btn" data-shelf="">Show all</button>` : ''}</div>
      <div class="shelf-items">${shelfItems.join('')}</div>
    </div>
    <div class="workshop-sheet">
      ${previewNote}
      <div class="stat-bars">
        ${bar(`Used space (${used}/${capacity})`, used / capacity, used > capacity)}
        ${bar('Max speed', stats.speed / STAT_MAX.speed)}
        ${bar('Armour', stats.hp / STAT_MAX.hp)}
      </div>
      ${row('chassis', shown.chassis, armour)}
      ${row('tower', parts.tower)}
      ${row('wheels', parts.wheels)}
      ${row('engine', parts.engine)}
      ${row('power', parts.power)}
      <h4>Weapons</h4>
      ${weapon('melee', placement)}
      ${weapon('turret', '<b>Fixed forward</b>')}
      ${weapon('defense', '<b>Built in</b>')}
    </div>`;
}

function statsPanel(save: Save, preview: PartPreview | null): string {
  const shown = previewLoadout(save.loadout, preview);
  const stats = buildStats(shown);
  const used = spaceUsed(shown);
  const room = spaceCapacity(shown);
  const rows: [string, string, string?][] = [
    ['Armour', `${Math.round(stats.hp)} HP`],
    ['Top speed', stats.speed.toFixed(1)],
    ['Acceleration', stats.accel.toFixed(1)],
    ['Turning', stats.turn.toFixed(2)],
    ['Weight', `${stats.mass.toFixed(2)} t`],
    ['Used space', `${used} / ${room}`, used > room ? 'spec-over' : ''],
    ['Battery recharge', `${Math.round(stats.regen * 100)}%`],
    ['Gun shots', TURRETS[shown.turret].shots > 0 ? String(TURRETS[shown.turret].shots) : 'Battery'],
  ];
  return `<dl class="spec-grid">${rows.map(([label, value, cls]) => `<div class="${cls ?? ''}"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

export function queueLabel(online: OnlineStatus | null, queue: OnlineQueue): string {
  // A server a step behind the page doesn't split these up yet.
  const waiting = online?.queues?.[queue];
  return waiting === undefined ? '' : `${waiting} in queue`;
}

/** Who's around now, and who was recently. */
export function playersPanel(online: OnlineStatus | null): string {
  if (!online) return '<p class="settings-hint">Connect to a game server to see who is playing.</p>';
  const rows = online.recent.map((player) => `<tr><td>${escapeText(player.name)}</td><td>${timeAgo(player.lastSeen)}</td></tr>`).join('');
  return `<div class="stat-row players-now">
      <div><b>${online.queued}</b><span>In queue</span></div>
      <div><b>${online.playing}</b><span>In a match</span></div>
    </div>
    <h4 class="players-heading">Recently active</h4>
    ${rows ? `<table class="side-table">${rows}</table>` : '<p class="settings-hint">Nobody yet. You could be first.</p>'}`;
}

function highscorePanel(account: GarageOptions['account']): string {
  if (!account) return '<p class="settings-hint">Connect to a game server to see the highscores.</p>';
  const rows = account.leaderboard.map((row, i) => `<tr><td>${i + 1}. ${escapeText(row.name)}</td><td>${row.rating}</td></tr>`).join('');
  return rows ? `<table class="side-table">${rows}</table>` : '<p class="settings-hint">Nobody has played an online match yet.</p>';
}

/** A lit plate for each part in the chosen category, or the powerup and upgrade cards. */
function buyPanel(save: Save, options: GarageOptions): string {
  const category = options.buyCategory;
  const tabs = BUY_CATEGORIES.map(([id, label]) => `<button class="mini-btn${category === id ? ' mini-on' : ''}" data-buy="${id}">${label}</button>`).join('');
  let cards = '';
  if (category === 'powerups') {
    cards = POWERUP_ORDER.map((id, i) => {
      const def = POWERUPS[id];
      const n = save.loadout.powerups[id];
      const full = n >= POWERUP_CAP;
      const broke = !full && save.money < def.price;
      return `<button class="card${broke ? ' card-broke' : ''}" data-power="${id}"><strong>[${keyLabel(options.keys[POWER_ACTIONS[i]])}] ${def.name}</strong><span>${def.blurb}</span><small>Carrying ${n}/${POWERUP_CAP}</small><em>${full ? 'Full' : `$${def.price}`}</em></button>`;
    }).join('');
  } else if (category === 'upgrades') {
    cards = UPGRADE_ORDER.map((id) => {
      const def = UPGRADES[id];
      const level = save.loadout.upgrades[id];
      const cost = upgradeCost(save, id);
      const broke = cost !== null && save.money < cost;
      const pips = def.costs.map((_, i) => `<i class="${i < level ? 'pip pip-on' : 'pip'}"></i>`).join('');
      return `<button class="card${broke ? ' card-broke' : ''}" data-upgrade="${id}"><strong>${def.name}</strong><span>${def.blurb}</span><div class="pips">${pips}</div><em>${cost === null ? 'Maxed' : `$${cost}`}</em></button>`;
    }).join('');
  } else {
    const slot = category;
    const equipped = (save.loadout as unknown as Record<Slot, string>)[slot] ?? installedParts(save.loadout)[slot as 'tower'];
    const owned = save.owned[slot] as string[];
    cards = Object.entries(CATALOG[slot] as Record<string, { name: string; blurb: string; price: number }>)
      .map(([id, item]) => {
        const has = owned.includes(id);
        const on = equipped === id;
        const label = on ? 'Fitted' : has ? 'Fit' : `$${item.price}`;
        const broke = !has && save.money < item.price;
        return `<button class="card${on ? ' card-on' : ''}${broke ? ' card-broke' : ''}" data-slot="${slot}" data-id="${id}"><strong>${item.name}</strong><span>${item.blurb}</span><small>${partDetails(slot, id)}</small><em>${label}</em></button>`;
      })
      .join('');
  }
  return `<div class="choices buy-tabs">${tabs}</div><div class="cards">${cards}</div>`;
}

function sellPanel(save: Save): string {
  const cards = SLOTS.flatMap((slot) =>
    (save.owned[slot] as string[])
      .filter((id) => canSell(save, slot, id))
      .map((id) => `<button class="card" data-sell-slot="${slot}" data-sell-id="${id}"><strong>${partName(slot, id)}</strong><span>${SLOT_LABELS[slot]}</span><em>Sell for $${sellPrice(slot, id)}</em></button>`),
  );
  return cards.length
    ? `<p class="settings-hint">Parts sell for half what they cost. Take a part off your robot before selling it.</p><div class="cards">${cards.join('')}</div>`
    : '<p class="settings-hint">Nothing to sell. Only parts you bought and aren\'t using can be sold.</p>';
}

function paintPanel(save: Save): string {
  const paint = { ...DEFAULT_PAINT, ...save.loadout.paint };
  const chip = (part: 'primary' | 'secondary', label: string) => `
    <div class="paint-color"><i style="background:#${paint[part].toString(16).padStart(6, '0')}"></i><span>${label}</span>
      <button class="plate-btn" data-paint-use="${part}">Use selected color</button></div>`;
  const choice = (part: 'pattern' | 'body', table: Record<string, string>) =>
    Object.entries(table)
      .map(([id, label]) => `<button class="mini-btn${paint[part] === id ? ' mini-on' : ''}" data-paint="${part}" data-value="${id}">${label}</button>`)
      .join('');
  return `
    <div data-painter-bar></div>
    <div class="paint-lower">
      <div data-painter-board></div>
      <div class="paint-options">
        <section><h3>Colors</h3>${chip('primary', 'Body and tower')}${chip('secondary', 'Trim')}</section>
        <section><h3>Pattern</h3><div class="choices">${choice('pattern', PATTERNS)}</div></section>
        <section><h3>Body shape</h3><div class="choices">${choice('body', BODIES)}</div></section>
        <p class="settings-hint">Paint and body shape are free, and your opponent sees them. Your painting goes over the pattern. Body shape is only for looks.</p>
      </div>
    </div>`;
}

function botsPanel(save: Save, options: GarageOptions): string {
  const maps = ARENA_ORDER.map((id) => {
    const def = ARENAS[id];
    const on = save.practice.arena === id;
    return `<button class="card${on ? ' card-on' : ''}" data-arena="${id}"><strong>${def.name}</strong><span>${def.blurb}</span><em>${on ? 'Selected' : 'Select'}</em></button>`;
  }).join('');
  const modes = (Object.keys(MODES) as ModeId[])
    .map((id) => {
      const on = save.practice.mode === id;
      return `<button class="card${on ? ' card-on' : ''}" data-mode="${id}"><strong>${MODES[id].name}</strong><span>${MODES[id].blurb}</span><em>${on ? 'Selected' : 'Select'}</em></button>`;
    })
    .join('');
  return `<section><h3>Offline vs Bots</h3><p class="settings-hint">Fight computer-controlled robots, with no other players involved.</p></section>
    <button class="btn btn-primary" data-fight>Start the fight</button>
    <section><h3>Mode</h3><div class="cards">${modes}</div></section>
    <section><h3>Map</h3><div class="cards">${maps}</div></section>
    ${careerPanel(options.career)}`;
}

function pilotPanel(save: Save, options: GarageOptions): string {
  return `<section><h3>Pilot</h3>
      <label class="garage-name">Name <input data-name maxlength="${NAME_MAX}" value="${escapeText(save.name)}" autocomplete="off" spellcheck="false" /></label>
      <p class="settings-hint">${save.wins} wins from ${save.matches} matches.</p></section>
    <section><h3>Cheat codes</h3>
      <form class="cheat-form" data-cheat>
        <input data-cheat-code maxlength="${CHEAT_MAX}" autocomplete="off" spellcheck="false" aria-label="Cheat code" placeholder="Enter a code" />
        <button class="plate-btn" type="submit">Enter</button>
      </form></section>
    ${profilePanel(options.account, options.career)}`;
}

function helpPanel(keys: Bindings): string {
  const list = (items: string[]) => `<ul class="help-list">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
  return `<div class="help-grid">
    <section><h3>The basics</h3>${list([
      'Build a robot in the Workshop. Every part takes up room, so a bigger chassis fits more.',
      'Robots only turn while rolling, so a stopped robot has to drive forward or back to change direction.',
      'Your main weapon does the real damage. Spinners have to reach speed before they bite, so hold the key on the way in.',
      'Guns only fire straight ahead and have few shots per life. Your battery runs your gun and your speed boost.',
      'Strong weapons have a cooldown, shown in red on the panel at the bottom.',
      'A flipper lands you upside down, and you can\'t do anything until your robot rights itself about three seconds later.',
    ])}</section>
    <section><h3>Ways to play</h3>${list([
      '<b>Online Duel:</b> one on one on the roof. Wreck them or knock them off. If time runs out, the most armour left wins.',
      '<b>Online Brawl:</b> up to eight robots on a random map, with bots in any seats no pilot takes. Wrecked robots come back, and first to 12 kills wins.',
      '<b>Offline vs Bots and Career:</b> pick a map and mode, or climb the ladder of fights.',
      '<b>Knocked out of Last Robot Standing?</b> Stay and watch from above. You earn money every second, and you can steer a marker and set off the map\'s traps. Leaving means no payout.',
      'Every match you finish pays at least $100, online or offline.',
    ])}</section>
    <section><h3>Controls</h3>${controlsTable(keys)}
      <button class="btn" data-settings>Settings</button></section>
  </div>`;
}

export function garageScreen(save: Save, actions: GarageActions, options: GarageOptions): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-garage';

  const body = () => {
    switch (options.tab) {
      case 'paintshop':
        return paintPanel(save);
      case 'buy':
        return buyPanel(save, options);
      case 'sell':
        return sellPanel(save);
      case 'bots':
        return botsPanel(save, options);
      case 'stats':
        return pilotPanel(save, options);
      case 'help':
        return helpPanel(options.keys);
      default:
        return workshopPanel(save, options);
    }
  };
  const side = () => {
    if (options.side === 'highscore') return `<div class="side-view">${highscorePanel(options.account)}</div>`;
    if (options.side === 'players') return `<div class="side-view" data-players>${playersPanel(options.online)}</div>`;
    return `<div class="side-view">${statsPanel(save, options.partPreview)}</div>`;
  };
  const topTabs = TOP_TABS.map(([id, label]) => `<button class="top-tab${options.tab === id ? ' top-tab-on' : ''}" data-tab="${id}">${label}</button>`).join('');
  const sideTabs = SIDE_TABS.map(([id, label]) => `<button class="side-tab${options.side === id ? ' side-tab-on' : ''}" data-side="${id}">${label}</button>`).join('');
  const navButton = (label: string, attr: string, extra = '') => `<button class="nav-btn${extra}" ${attr}>${label}</button>`;
  const onlineButton = (label: string, queue: OnlineQueue) =>
    navButton(`${label}<small data-queue="${queue}">${queueLabel(options.online, queue)}</small>`, options.onlineAvailable ? `data-online="${queue}"` : 'disabled title="No game server is connected"', ' nav-btn-play');

  el.innerHTML = `
    <div class="ws">
      <div class="ws-left">
        <nav class="top-tabs">${topTabs}</nav>
        <div class="ws-panel">${options.notice ? `<div class="garage-notice" role="alert">${escapeText(options.notice)}</div>` : ''}${body()}</div>
      </div>
      <div class="ws-right">
        <div class="ws-logo">
          ${logoHtml()}
          <div class="garage-money">$${save.money}</div>
        </div>
        <div class="preview-window" data-preview>
          <div class="zoom-row"><button class="step-btn" data-zoom="0.15" aria-label="Zoom out">−</button><button class="step-btn" data-zoom="-0.15" aria-label="Zoom in">+</button></div>
        </div>
        <nav class="side-tabs">${sideTabs}</nav>
        ${side()}
        <div class="nav-btns">
          ${onlineButton('Online Duel', 'duel')}
          ${onlineButton('Online Brawl', 'brawl')}
          ${navButton('Offline vs Bots', 'data-tab="bots"')}
          ${navButton('Training', 'data-training')}
          ${navButton('Stats', 'data-tab="stats"')}
          ${navButton('Help', 'data-tab="help"')}
          ${navButton('Quit', 'data-quit')}
        </div>
      </div>
    </div>`;

  el.querySelector<HTMLInputElement>('[data-name]')?.addEventListener('change', (e) => {
    actions.onName((e.target as HTMLInputElement).value);
  });
  el.querySelector<HTMLFormElement>('[data-cheat]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    actions.onCheat(el.querySelector<HTMLInputElement>('[data-cheat-code]')!.value);
  });
  el.querySelector<HTMLSelectElement>('[data-placement]')?.addEventListener('change', (e) => {
    actions.onRear((e.target as HTMLSelectElement).value === '1');
  });

  el.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!target) return;
    const { slot, id, power, upgrade, tab, side: sideTab, buy, shelf, armour, zoom, sellSlot, sellId, paint: part, paintUse, value, arena, mode, fightId, previewSlot, previewId } = target.dataset;
    if (previewSlot !== undefined) actions.onPreviewPart(previewSlot && previewId ? { slot: previewSlot as Slot, id: previewId } : null);
    else if (tab) actions.onTab(tab as GarageTab);
    else if (sideTab) actions.onSide(sideTab as SideTab);
    else if (buy) actions.onBuyCategory(buy as BuyCategory);
    else if (shelf !== undefined) actions.onShelf((shelf || null) as Slot | null);
    else if (armour) actions.onArmour(Number(armour));
    else if (zoom) actions.onZoom(Number(zoom));
    else if (sellSlot && sellId) actions.onSell(sellSlot as Slot, sellId);
    else if (fightId) actions.onCareer(CAREER.find((f) => f.id === fightId)!);
    else if (paintUse) actions.onPaintUse(paintUse as 'primary' | 'secondary');
    else if (part && value) actions.onPaint({ [part]: value } as Partial<Paint>);
    else if (arena) actions.onPractice({ arena: arena as ArenaId });
    else if (mode) actions.onPractice({ mode: mode as ModeId });
    else if (slot && id) actions.onEquip(slot as Slot, id);
    else if (power) actions.onPowerup(power as PowerupId);
    else if (upgrade) actions.onUpgrade(upgrade as UpgradeId);
    else if ('fight' in target.dataset) actions.onFight();
    else if (target.dataset.online) actions.onOnline(target.dataset.online as OnlineQueue);
    else if ('training' in target.dataset) actions.onTraining();
    else if ('quit' in target.dataset) actions.onQuit();
    else if ('settings' in target.dataset) actions.onSettings();
    else if ('signout' in target.dataset) actions.onSignOut();
    else if ('delete' in target.dataset) actions.onDelete();
  });
  return el;
}

export function resultsScreen(standings: Standing[], playerId: number, onContinue: () => void, note = '', drawn = false): HTMLElement {
  const mine = standings.find((s) => s.bot.id === playerId)!;
  const el = document.createElement('div');
  el.className = 'screen screen-results';
  const duel = standings.length === 2;
  const headline = drawn ? 'A draw.' : mine.place === 1 ? 'Last bot rolling!' : duel ? 'Scrapped.' : mine.place <= 3 ? 'Still in one piece.' : 'Back to the scrapyard.';
  const rows = standings
    .map(
      (s) => `<tr class="${s.bot.id === playerId ? 'row-me' : ''}"><td>${s.place}</td><td>${escapeText(s.bot.name)}</td><td>${s.bot.kills}</td><td>${s.bot.deaths}</td><td>${Math.round(s.bot.damageDealt)}</td><td>$${s.total}</td></tr>`,
    )
    .join('');
  el.innerHTML = `
    <div class="menu-card results-card">
      <h2>${headline}</h2>
      ${note ? `<p class="payout"><small>${escapeText(note)}</small></p>` : `<p class="payout">You earned <b>$${mine.total}</b> <small>($${Math.round(mine.bot.earned)} in battle + $${mine.bonus} bonus)${mine.total > Math.round(mine.bot.earned + mine.bonus) ? `. Every finished match pays at least $${REWARD.minimum}.` : ''}</small></p>`}
      <table class="results">
        <thead><tr><th>#</th><th>Robot</th><th>Kills</th><th>Deaths</th><th>Damage</th><th>Payout</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button class="btn btn-primary" data-continue>Back to the workshop</button>
    </div>`;
  el.querySelector('[data-continue]')!.addEventListener('click', onContinue);
  return el;
}

export interface SettingsActions {
  onQuality: (quality: Quality) => void;
  onFps: () => void;
  onVolume: (kind: VolumeKind, value: number) => void;
  onVolumeSet: (kind: VolumeKind) => void;
  onMute: () => void;
  onBind: (action: Action) => void;
  onReset: () => void;
  onBack: () => void;
}

const VOLUME_LABELS: Record<VolumeKind, string> = { master: 'Master volume', music: 'Music', effects: 'Sound effects' };

export function settingsScreen(settings: Settings, waitingFor: Action | null, actions: SettingsActions): HTMLElement {
  const el = document.createElement('div');
  el.className = 'screen screen-pause';
  // Sliders update as they move, without redrawing the page, or the drag would stop.
  el.addEventListener('input', (e) => {
    const slider = e.target as HTMLInputElement;
    const kind = slider.dataset.volume as VolumeKind | undefined;
    if (!kind) return;
    el.querySelector(`[data-volume-value="${kind}"]`)!.textContent = `${slider.value}%`;
    actions.onVolume(kind, Number(slider.value));
  });
  el.addEventListener('change', (e) => {
    const kind = (e.target as HTMLInputElement).dataset.volume as VolumeKind | undefined;
    if (kind) actions.onVolumeSet(kind);
  });
  const qualities = (['auto', ...LEVELS] as Quality[])
    .map((q) => `<button class="mini-btn${settings.quality === q ? ' mini-on' : ''}" data-quality="${q}">${q === 'auto' ? 'Auto' : QUALITY[q].label}</button>`)
    .join('');
  const autoHint = settings.quality === 'auto'
    ? `<p class="settings-hint">Auto lowers the graphics if the game can't hold 45 frames a second. It's on ${QUALITY[activeLevel(settings)].label} on this device.</p>`
    : '';
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
      ${autoHint}
      <div class="settings-row"><span>Show frame rate</span>
        <button class="mini-btn${settings.showFps ? ' mini-on' : ''}" data-fps>${settings.showFps ? 'On' : 'Off'}</button></div>
      <h3>Audio</h3>
      ${VOLUME_KINDS.map((kind) => `<label class="settings-row volume-row"><span>${VOLUME_LABELS[kind]}</span>
        <input type="range" min="0" max="100" step="5" value="${settings.volume[kind]}" data-volume="${kind}" aria-label="${VOLUME_LABELS[kind]}" />
        <b data-volume-value="${kind}">${settings.volume[kind]}%</b></label>`).join('')}
      <div class="settings-row"><span>Mute everything (M)</span>
        <button class="mini-btn${settings.muted ? ' mini-on' : ''}" data-mute>${settings.muted ? 'Muted' : 'Off'}</button></div>
      <h3>Keyboard</h3>
      ${bindings}
      <p class="settings-hint">Esc cancels a rebind. Using a key that's taken swaps the two actions. Esc and M stay reserved for pause and mute, and Ctrl for browser shortcuts.</p>
      <h3>Gamepad</h3>
      <p class="settings-hint">Right and left triggers drive, the left stick steers. A: main weapon, RB: gun, B: defense, X: speed boost, D-pad: first four powerups, LB: Repair Kit, Y: look behind, Start: menu.</p>
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
    else if ('mute' in target.dataset) actions.onMute();
    else if ('reset' in target.dataset) actions.onReset();
    else if ('back' in target.dataset) actions.onBack();
  });
  return el;
}
