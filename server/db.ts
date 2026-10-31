import pg from 'pg';

/** The little the game needs from a database, so tests can run on an embedded Postgres. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Runs `fn` in one transaction, rolling back if it throws. */
  tx<R>(fn: (q: Queryable) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

export function connectPostgres(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });
  // An idle connection dropping shouldn't take the game server down with it.
  pool.on('error', (error) => console.error('Database connection error:', error.message));
  return {
    query: async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[],
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async <T>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as T[] });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub text UNIQUE,
  name text NOT NULL,
  money integer NOT NULL CHECK (money >= 0),
  state jsonb NOT NULL,
  rating integer NOT NULL DEFAULT 1000,
  matches integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  kills integer NOT NULL DEFAULT 0,
  deaths integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_rating ON players (rating DESC) WHERE matches > 0;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY,
  arena text NOT NULL,
  mode text NOT NULL,
  duration_seconds real NOT NULL,
  ended_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  place integer NOT NULL,
  kills integer NOT NULL,
  deaths integer NOT NULL,
  damage integer NOT NULL,
  payout integer NOT NULL,
  rating_change integer NOT NULL,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS match_players_player ON match_players (player_id);

-- Every change to a player's money, so any balance can be audited.
CREATE TABLE IF NOT EXISTS ledger (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL,
  match_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_player ON ledger (player_id);
`;
