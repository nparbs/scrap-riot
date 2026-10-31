// Everything both the browser client and the game server need to agree on.
import type { ArenaId } from '../sim/arena';
import {
  CHASSIS,
  DEFAULT_PAINT,
  DEFENSES,
  MELEE,
  PAINT_COLORS,
  PATTERNS,
  POWERUP_ORDER,
  TOPPERS,
  TURRETS,
  type ModeId,
  type Paint,
  type PowerupId,
} from '../sim/data';
import type { BotSetup, GameEvent, Loadout } from '../sim/match';
import type { Save } from '../game/progress';

export const PROTOCOL_VERSION = 3;
export const MAX_PLAYERS = 6;
export const NAME_MAX = 16;
export const DEFAULT_NAME = 'Pilot';
/** Clients send input at this rate; each message covers INPUT_STEPS sim steps. */
export const INPUT_RATE = 30;
export const INPUT_STEPS = 2;
/** The server sends a snapshot every this many sim steps (20 Hz). */
export const SNAPSHOT_STEPS = 3;

const FLAG_MELEE = 1;
const FLAG_TURRET = 2;
const FLAG_DEFENSE = 4;

export type ClientMessage =
  | { t: 'join'; v: number; name: string; loadout: Loadout; session?: string }
  | { t: 'resume'; v: number; token: string }
  | { t: 'input'; s: number; th: number; st: number; f: number; p: number }
  | { t: 'ping'; c: number }
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
  time: number;
  bots: number[][];
  proj: number[][];
  mines: number[][];
  oil: number[][];
  drones: number[][];
  pickups: number[][];
  events: GameEvent[];
}

export type ErrorCode = 'outdated' | 'expired' | 'full' | 'bad-request' | 'sign-in' | 'in-match';

export type ServerMessage =
  | { t: 'queue'; players: number; capacity: number; startsIn: number; arena: ArenaId; mode: ModeId }
  | StartMessage
  | SnapshotMessage
  | { t: 'over' }
  | { t: 'error'; code: ErrorCode }
  | { t: 'pong'; c: number };

export function packFlags(melee: boolean, turret: boolean, defense: boolean): number {
  return (melee ? FLAG_MELEE : 0) | (turret ? FLAG_TURRET : 0) | (defense ? FLAG_DEFENSE : 0);
}

export function unpackFlags(flags: number): { melee: boolean; turret: boolean; defense: boolean } {
  return { melee: !!(flags & FLAG_MELEE), turret: !!(flags & FLAG_TURRET), defense: !!(flags & FLAG_DEFENSE) };
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
    eye: pickColor(r.eye, DEFAULT_PAINT.eye),
    pattern: pickKey(PATTERNS, r.pattern, DEFAULT_PAINT.pattern),
    topper: pickKey(TOPPERS, r.topper, DEFAULT_PAINT.topper),
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
    powerups: { rage: 1, megashield: 1, cloaking: 1, xray: 1, repair: 1, turbo: 1 },
    upgrades: { armor: 0, engine: 0, weapons: 0 },
    paint: sanitizePaint(r.paint),
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
  | { type: 'powerup'; id: string }
  | { type: 'upgrade'; id: string }
  | { type: 'paint'; paint: Partial<Paint> }
  | { type: 'practice'; arena?: ArenaId; mode?: ModeId }
  | { type: 'name'; name: string };

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

export interface LeaderboardEntry {
  name: string;
  rating: number;
  wins: number;
  matches: number;
  kills: number;
}
