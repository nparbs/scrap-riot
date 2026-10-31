import { createHash, randomBytes } from 'node:crypto';
import { buyOrEquip, buyPowerup, buyUpgrade, CATALOG, newSave, sellPart, setArmour, type Save, type Slot } from '../src/game/progress';
import { sanitizeName, sanitizePaint, type GarageAction, type HistoryEntry, type LeaderboardEntry, type Profile } from '../src/net/protocol';
import { isArenaId } from '../src/sim/arena';
import { DEFAULT_PAINT, MODES, POWERUPS, UPGRADES, type ModeId, type PowerupId, type UpgradeId } from '../src/sim/data';
import { SCHEMA, type Db, type Queryable } from './db';
import type { GoogleVerifier } from './google';

const SESSION_DAYS = 90;
/** Guest accounts nobody has used in this long are deleted. */
const GUEST_RETENTION_DAYS = 60;
/** A guest that never played a match is cleaned up much sooner. */
const UNPLAYED_GUEST_DAYS = 7;
const RATING_BY_PLACE = [25, -15];

interface PlayerRow {
  id: string;
  google_sub: string | null;
  name: string;
  money: number;
  state: Pick<Save, 'owned' | 'loadout' | 'practice'>;
  rating: number;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
}

export interface MatchResult {
  id: string;
  arena: string;
  mode: string;
  duration: number;
  drawn?: boolean;
  players: {
    accountId: string;
    place: number;
    kills: number;
    deaths: number;
    damage: number;
    payout: number;
    powerupsLeft: Record<PowerupId, number>;
  }[];
}

export type GarageResult = { ok: true; profile: Profile } | { ok: false; reason: 'rejected' };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toSave(row: PlayerRow): Save {
  // Rows from before a part type existed simply start with the free one.
  const state = { ...row.state, owned: { ...newSave().owned, ...row.state.owned } };
  return { name: row.name, money: row.money, matches: row.matches, wins: row.wins, ...state };
}

function toProfile(row: PlayerRow): Profile {
  return { save: toSave(row), rating: row.rating, kills: row.kills, deaths: row.deaths, signedIn: row.google_sub !== null };
}

const has = (table: object, key: unknown): key is string => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);

/** Everything about a player's account. All money changes happen inside a locked transaction. */
export class Accounts {
  constructor(private readonly db: Db, private readonly verifyGoogle: GoogleVerifier | null) {}

  async migrate(): Promise<void> {
    await this.db.query(SCHEMA);
  }

  private async createPlayer(q: Queryable, googleSub: string | null): Promise<PlayerRow> {
    const fresh = newSave();
    const [row] = await q.query<PlayerRow>(
      'INSERT INTO players (google_sub, name, money, state) VALUES ($1, $2, $3, $4) RETURNING *',
      [googleSub, fresh.name, fresh.money, JSON.stringify({ owned: fresh.owned, loadout: fresh.loadout, practice: fresh.practice })],
    );
    await q.query('INSERT INTO ledger (player_id, amount, reason) VALUES ($1, $2, $3)', [row.id, fresh.money, 'starting money']);
    return row;
  }

  private async openSession(q: Queryable, playerId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await q.query(`INSERT INTO sessions (token_hash, player_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [hashToken(token), playerId]);
    return token;
  }

  async createGuest(): Promise<{ token: string; profile: Profile }> {
    return this.db.tx(async (q) => {
      const row = await this.createPlayer(q, null);
      return { token: await this.openSession(q, row.id), profile: toProfile(row) };
    });
  }

  private async playerForToken(q: Queryable, token: unknown, lock = false): Promise<PlayerRow | null> {
    if (typeof token !== 'string' || !token) return null;
    const [row] = await q.query<PlayerRow>(
      `SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id
       WHERE s.token_hash = $1 AND s.expires_at > now() ${lock ? 'FOR UPDATE OF p' : ''}`,
      [hashToken(token)],
    );
    return row ?? null;
  }

  async profile(token: unknown): Promise<Profile | null> {
    const row = await this.playerForToken(this.db, token);
    if (!row) return null;
    await this.db.query('UPDATE players SET last_seen = now() WHERE id = $1', [row.id]);
    return toProfile(row);
  }

  /** What the game server needs to put this account into a match. */
  async forMatch(token: unknown): Promise<{ accountId: string; save: Save } | null> {
    const row = await this.playerForToken(this.db, token);
    return row ? { accountId: row.id, save: toSave(row) } : null;
  }

  get googleEnabled(): boolean {
    return this.verifyGoogle !== null;
  }

  /**
   * Signs in with Google. A guest signing in for the first time keeps their progress. If this
   * Google account already exists, the player moves to it and the guest is left to expire.
   */
  async signInGoogle(credential: unknown, currentToken: unknown): Promise<{ token: string; profile: Profile } | null> {
    if (!this.verifyGoogle || typeof credential !== 'string') return null;
    const sub = await this.verifyGoogle(credential);
    if (!sub) return null;
    return this.db.tx(async (q) => {
      let [row] = await q.query<PlayerRow>('SELECT * FROM players WHERE google_sub = $1', [sub]);
      if (!row) {
        const guest = await this.playerForToken(q, currentToken, true);
        if (guest && guest.google_sub === null) {
          [row] = await q.query<PlayerRow>('UPDATE players SET google_sub = $1 WHERE id = $2 RETURNING *', [sub, guest.id]);
        } else {
          row = await this.createPlayer(q, sub);
        }
      }
      return { token: await this.openSession(q, row.id), profile: toProfile(row) };
    });
  }

  async signOut(token: unknown): Promise<void> {
    if (typeof token === 'string') await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  }

  /** Removes the account and everything tied to it. */
  async deleteAccount(token: unknown): Promise<boolean> {
    const row = await this.playerForToken(this.db, token);
    if (!row) return false;
    await this.db.query('DELETE FROM players WHERE id = $1', [row.id]);
    return true;
  }

  /** Applies one garage change. Prices come from the server's own tables, never the request. */
  async garage(token: unknown, action: GarageAction): Promise<GarageResult | null> {
    return this.db.tx(async (q) => {
      const row = await this.playerForToken(q, token, true);
      if (!row) return null;
      const save = toSave(row);
      if (!this.applyAction(save, action)) return { ok: false, reason: 'rejected' } as const;

      const spent = row.money - save.money;
      if (spent !== 0) {
        await q.query('INSERT INTO ledger (player_id, amount, reason) VALUES ($1, $2, $3)', [row.id, -spent, `garage: ${action.type}`]);
      }
      const { owned, loadout, practice } = save;
      const [updated] = await q.query<PlayerRow>(
        'UPDATE players SET name = $1, money = $2, state = $3, last_seen = now() WHERE id = $4 RETURNING *',
        [save.name, save.money, JSON.stringify({ owned, loadout, practice }), row.id],
      );
      return { ok: true, profile: toProfile(updated) } as const;
    });
  }

  private applyAction(save: Save, action: GarageAction): boolean {
    if (typeof action !== 'object' || action === null) return false;
    switch (action.type) {
      case 'equip':
        return has(CATALOG, action.slot) && has(CATALOG[action.slot as Slot], action.id) && buyOrEquip(save, action.slot as Slot, action.id);
      case 'sell':
        return has(CATALOG, action.slot) && has(CATALOG[action.slot as Slot], action.id) && sellPart(save, action.slot as Slot, action.id);
      case 'armour':
        return typeof action.armour === 'number' && setArmour(save, action.armour);
      case 'powerup':
        return has(POWERUPS, action.id) && buyPowerup(save, action.id as PowerupId);
      case 'upgrade':
        return has(UPGRADES, action.id) && buyUpgrade(save, action.id as UpgradeId);
      case 'paint':
        save.loadout.paint = sanitizePaint({ ...(save.loadout.paint ?? DEFAULT_PAINT), ...(typeof action.paint === 'object' ? action.paint : {}) });
        return true;
      case 'practice':
        if (isArenaId(action.arena)) save.practice.arena = action.arena;
        if (has(MODES, action.mode)) save.practice.mode = action.mode as ModeId;
        return true;
      case 'name':
        save.name = sanitizeName(action.name);
        return true;
      case 'rear':
        save.loadout.rearMelee = action.rear === true;
        return true;
      default:
        return false;
    }
  }

  /** Banks a finished match. It all commits together, so a crash can't pay out half a match. */
  async recordMatch(result: MatchResult): Promise<void> {
    if (result.players.length === 0) return;
    await this.db.tx(async (q) => {
      await q.query('INSERT INTO matches (id, arena, mode, duration_seconds) VALUES ($1, $2, $3, $4)', [result.id, result.arena, result.mode, result.duration]);
      for (const p of result.players) {
        const [row] = await q.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [p.accountId]);
        // The account may have been deleted during the match.
        if (!row) continue;
        const change = result.drawn ? 0 : RATING_BY_PLACE[p.place - 1] ?? RATING_BY_PLACE[RATING_BY_PLACE.length - 1];
        const state = { ...row.state, loadout: { ...row.state.loadout, powerups: p.powerupsLeft } };
        await q.query(
          `UPDATE players SET money = money + $1, rating = GREATEST(0, rating + $2), matches = matches + 1,
             wins = wins + $3, kills = kills + $4, deaths = deaths + $5, state = $6, last_seen = now() WHERE id = $7`,
          [p.payout, change, p.place === 1 && !result.drawn ? 1 : 0, p.kills, p.deaths, JSON.stringify(state), p.accountId],
        );
        await q.query('INSERT INTO ledger (player_id, amount, reason, match_id) VALUES ($1, $2, $3, $4)', [p.accountId, p.payout, 'match payout', result.id]);
        await q.query(
          `INSERT INTO match_players (match_id, player_id, place, kills, deaths, damage, payout, rating_change)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [result.id, p.accountId, p.place, p.kills, p.deaths, Math.round(p.damage), p.payout, change],
        );
      }
    });
  }

  async history(token: unknown, limit = 20): Promise<HistoryEntry[] | null> {
    const row = await this.playerForToken(this.db, token);
    if (!row) return null;
    return this.db.query<HistoryEntry>(
      `SELECT m.arena, m.mode, mp.place, mp.kills, mp.deaths, mp.damage, mp.payout, mp.rating_change AS "ratingChange", m.ended_at AS "endedAt"
       FROM match_players mp JOIN matches m ON m.id = mp.match_id
       WHERE mp.player_id = $1 ORDER BY m.ended_at DESC LIMIT $2`,
      [row.id, limit],
    );
  }

  /** Public, so it holds only what other players already see in a match. */
  leaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    return this.db.query<LeaderboardEntry>(
      'SELECT name, rating, wins, matches, kills FROM players WHERE matches > 0 ORDER BY rating DESC, wins DESC, created_at ASC LIMIT $1',
      [limit],
    );
  }

  /** Removes expired sessions and abandoned guests. Run periodically. */
  async cleanup(): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE expires_at <= now()');
    await this.db.query(
      `DELETE FROM players WHERE google_sub IS NULL AND (
         last_seen < now() - interval '${GUEST_RETENTION_DAYS} days'
         OR (matches = 0 AND last_seen < now() - interval '${UNPLAYED_GUEST_DAYS} days'))`,
    );
  }
}
