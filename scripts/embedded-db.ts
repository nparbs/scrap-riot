import { PGlite } from '@electric-sql/pglite';
import type { Db, Queryable } from '../server/db';

/** A real Postgres running in-process and in memory, for tests and local development. */
export function embeddedDb(): Db {
  const lite = new PGlite();
  const wrap = (q: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): Queryable => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await q.query(sql, params)).rows as T[],
  });
  return {
    query: async <T>(sql: string, params: unknown[] = []) => {
      // Schema setup is several statements at once, which only exec() accepts.
      if (params.length === 0 && sql.includes(';')) {
        await lite.exec(sql);
        return [] as T[];
      }
      return (await lite.query(sql, params)).rows as T[];
    },
    tx: (fn) => lite.transaction((tx) => fn(wrap(tx))) as Promise<never>,
    close: () => lite.close(),
  };
}
