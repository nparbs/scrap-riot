// Everything both the browser client and the game server need to agree on.
import type { ArenaId } from '../sim/arena';
import {
  ARMOUR,
  BODIES,
  CHASSIS,
  DEFAULT_PAINT,
  DEFENSES,
  ENGINES,
  MELEE,
  PAINT_COLORS,
  PATTERNS,
  POWER_SOURCES,
  POWERUP_ORDER,
  TOWERS,
  TURRETS,
  WHEELS,
  type ModeId,
  type Paint,
  type PowerupId,
} from '../sim/data';
import type { BotSetup, GameEvent, Loadout } from '../sim/match';
import type { Save } from '../game/progress';
import { decodeSkin } from '../game/skin';

export const PROTOCOL_VERSION = 9;
/** The most a browser can bank for a match it ran itself. */
export const OFFLINE_PAYOUT_MAX = 10_000;
export const NAME_MAX = 16;
export const DEFAULT_NAME = 'Pilot';
/** Clients send input at this rate; each message covers INPUT_STEPS sim steps. */
export const INPUT_RATE = 30;
export const INPUT_STEPS = 2;
/** The server sends a snapshot every this many sim steps (20 Hz). */
export const SNAPSHOT_STEPS = 3;
/** Chat is picked from this list, so strangers can't send each other anything worse. */
export const QUICK_CHAT = ['Good luck!', 'Nice hit!', 'Come here!', 'Oops!', 'Good game.', 'Rematch?'];

/** The online matches a player can queue for. */
export type OnlineQueue = 'duel' | 'brawl';

const FLAG_MELEE = 1;
const FLAG_TURRET = 2;
const FLAG_DEFENSE = 4;
const FLAG_BOOST = 8;

export type ClientMessage =
  | { t: 'join'; v: number; name: string; loadout: Loadout; session?: string; queue?: OnlineQueue }
  | { t: 'resume'; v: number; token: string }
  | { t: 'input'; s: number; th: number; st: number; f: number; p: number }
  | { t: 'ping'; c: number }
  | { t: 'surrender' }
  | { t: 'draw' }
  | { t: 'chat'; id: number }
  | { t: 'leave' };

export interface StartMessage {
  t: 'start';
  match: string;
  you: number;
  /** Lets this player reclaim their robot after a dropped connection. Sent only to them. */
  token: string;
  seed: number;
  arena: ArenaId;
  mode: ModeId;
  setups: BotSetup[];
  duration: number;
  killTarget: number;
}

export interface SnapshotMessage {
  t: 'snap';
  ack: number;
  /** Steps of input `ack` still to run, or if negative, steps the server has run ahead of the input it has. */
  due?: number;
  time: number;
  countdown: number;
  bots: number[][];
  proj: number[][];
  mines: number[][];
  oil: number[][];
  traps: number[][];
  drones: number[][];
  pickups: number[][];
  events: GameEvent[];
}

export type ErrorCode = 'outdated' | 'expired' | 'full' | 'bad-request' | 'sign-in' | 'in-match';

export type ServerMessage =
  /** `startsIn` is -1 while still waiting for enough players. */
  | { t: 'queue'; players: number; capacity: number; startsIn: number; arena: ArenaId; mode: ModeId }
  | StartMessage
  | SnapshotMessage
  | { t: 'over'; drawn?: boolean }
  | { t: 'chat'; bot: number; id: number }
  | { t: 'draw-offer'; bot: number }
  | { t: 'error'; code: ErrorCode }
  | { t: 'pong'; c: number };

export function packFlags(melee: boolean, turret: boolean, defense: boolean, boost: boolean): number {
  return (melee ? FLAG_MELEE : 0) | (turret ? FLAG_TURRET : 0) | (defense ? FLAG_DEFENSE : 0) | (boost ? FLAG_BOOST : 0);
}

export function unpackFlags(flags: number): { melee: boolean; turret: boolean; defense: boolean; boost: boolean } {
  return { melee: !!(flags & FLAG_MELEE), turret: !!(flags & FLAG_TURRET), defense: !!(flags & FLAG_DEFENSE), boost: !!(flags & FLAG_BOOST) };
}

export function powerupIndex(id: PowerupId | null): number {
  return id ? POWERUP_ORDER.indexOf(id) : -1;
}

/** Names are shown to other players, so control characters and excess length go. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_NAME;
  const clean = raw.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').trim();
  return [...clean].slice(0, NAME_MAX).join('').trim() || DEFAULT_NAME;
}

function pickKey<T extends object>(table: T, raw: unknown, fallback: keyof T): keyof T {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(table, raw) ? (raw as keyof T) : fallback;
}

function pickColor(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && PAINT_COLORS.includes(raw) ? raw : fallback;
}

/** Paint is shown to other players, so only the palette and the listed styles get through. */
export function sanitizePaint(raw: unknown): Paint {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    primary: pickColor(r.primary, DEFAULT_PAINT.primary),
    secondary: pickColor(r.secondary, DEFAULT_PAINT.secondary),
    pattern: pickKey(PATTERNS, r.pattern, DEFAULT_PAINT.pattern),
    body: pickKey(BODIES, r.body, DEFAULT_PAINT.body),
    // Anything that isn't a real paint job is dropped, leaving the robot unpainted.
    ...(typeof r.skin === 'string' && r.skin !== '' && decodeSkin(r.skin) ? { skin: r.skin } : {}),
  };
}

/**
 * Builds the loadout a player actually gets online. Browser saves can be edited, so nothing
 * purchased counts yet: everyone gets the same stats and one of each powerup, and only the
 * choice of gear carries over. This goes away once the server owns player progress.
 */
export function onlineLoadout(raw: unknown): Loadout {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    chassis: pickKey(CHASSIS, r.chassis, 'brawler'),
    melee: pickKey(MELEE, r.melee, 'chainsaw'),
    turret: pickKey(TURRETS, r.turret, 'minigun'),
    defense: pickKey(DEFENSES, r.defense, 'shield'),
    powerups: { rage: 1, megashield: 1, cloaking: 1, xray: 1, repair: 1, battery: 1 },
    upgrades: { armor: 0, engine: 0, weapons: 0 },
    paint: sanitizePaint(r.paint),
    rearMelee: r.rearMelee === true,
    tower: pickKey(TOWERS, r.tower, 'medium'),
    wheels: pickKey(WHEELS, r.wheels, 'large4'),
    engine: pickKey(ENGINES, r.engine, 'medium'),
    power: pickKey(POWER_SOURCES, r.power, 'alkaline'),
    armour: typeof r.armour === 'number' && r.armour >= ARMOUR.min && r.armour <= ARMOUR.max ? r.armour : ARMOUR.default,
  };
}

// --- Accounts ---

export interface Profile {
  save: Save;
  rating: number;
  kills: number;
  deaths: number;
  signedIn: boolean;
}

export type GarageAction =
  | { type: 'equip'; slot: string; id: string }
  | { type: 'sell'; slot: string; id: string }
  | { type: 'armour'; armour: number }
  | { type: 'powerup'; id: string }
  | { type: 'upgrade'; id: string }
  | { type: 'paint'; paint: Partial<Paint> }
  | { type: 'practice'; arena?: ArenaId; mode?: ModeId }
  | { type: 'name'; name: string }
  | { type: 'rear'; rear: boolean }
  | { type: 'cheat'; code: string }
  | { type: 'payout'; amount: number };

export interface HistoryEntry {
  arena: ArenaId;
  mode: ModeId;
  place: number;
  kills: number;
  deaths: number;
  damage: number;
  payout: number;
  ratingChange: number;
  endedAt: string;
}

/** Public, so it holds nothing beyond what other players could see in a match, plus when they were last around. */
export interface OnlineStatus {
  /** People waiting for a match right now. */
  queued: number;
  /** The same people, by which match they're waiting for. */
  queues: Record<OnlineQueue, number>;
  /** People in a match right now. */
  playing: number;
  recent: { name: string; lastSeen: string }[];
}

export interface LeaderboardEntry {
  name: string;
  rating: number;
  wins: number;
  matches: number;
  kills: number;
}
