import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Accounts } from './accounts';

// Has to fit a paint job, which is the largest thing anyone sends.
const MAX_BODY_BYTES = 32 * 1024;
const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 120;
const GUESTS_PER_HOUR = 20;

class Limiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  allow(key: string, now: number): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }

  /** Forgets finished windows, so this can't grow without bound. */
  prune(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (size === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('bad json'));
      }
    });
  });
}

export interface ApiOptions {
  accounts: Accounts;
  allowedOrigins: Set<string>;
  googleClientId: string | null;
  clientAddress: (req: IncomingMessage) => string;
  /** How many people are in the queue and in matches right now. */
  presence: () => { queued: number; playing: number };
}

export type ApiHandler = ((req: IncomingMessage, res: ServerResponse) => void) & { prune: () => void };

/** The REST API behind the garage, sign-in, match history and leaderboards. */
export function createApi({ accounts, allowedOrigins, googleClientId, clientAddress, presence }: ApiOptions): ApiHandler {
  const general = new Limiter(REQUESTS_PER_WINDOW, WINDOW_MS);
  const guests = new Limiter(GUESTS_PER_HOUR, 60 * WINDOW_MS);

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };

    const origin = req.headers.origin;
    if (origin && allowedOrigins.size > 0 && !allowedOrigins.has(origin)) return send(403, { error: 'origin' });
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const now = Date.now();
    const address = clientAddress(req);
    if (!general.allow(address, now)) return send(429, { error: 'slow-down' });

    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    const route = `${req.method} ${(req.url ?? '').split('?')[0]}`;

    const run = async () => {
      switch (route) {
        case 'GET /api/config':
          return send(200, { googleClientId });
        case 'POST /api/guest':
          if (!guests.allow(address, now)) return send(429, { error: 'slow-down' });
          return send(200, await accounts.createGuest());
        case 'POST /api/auth/google': {
          const body = (await readBody(req)) as { credential?: unknown };
          const result = await accounts.signInGoogle(body?.credential, token);
          return result ? send(200, result) : send(401, { error: 'google' });
        }
        case 'GET /api/me': {
          const profile = await accounts.profile(token);
          return profile ? send(200, { profile }) : send(401, { error: 'session' });
        }
        case 'POST /api/garage': {
          const body = (await readBody(req)) as { action?: never };
          const result = await accounts.garage(token, body?.action as never);
          if (!result) return send(401, { error: 'session' });
          return result.ok ? send(200, { profile: result.profile }) : send(400, { error: result.reason });
        }
        case 'GET /api/history': {
          const history = await accounts.history(token);
          return history ? send(200, { history }) : send(401, { error: 'session' });
        }
        case 'GET /api/leaderboard':
          return send(200, { leaderboard: await accounts.leaderboard() });
        case 'GET /api/online':
          return send(200, { ...presence(), recent: await accounts.recentPlayers() });
        case 'POST /api/logout':
          await accounts.signOut(token);
          return send(200, {});
        case 'DELETE /api/me':
          return (await accounts.deleteAccount(token)) ? send(200, {}) : send(401, { error: 'session' });
        default:
          return send(404, { error: 'not-found' });
      }
    };

    run().catch((error: Error) => {
      // Details stay in the server log, and clients only learn that it failed.
      if (error.message !== 'bad json' && error.message !== 'too large') console.error('API error:', route, error.message);
      if (!res.headersSent) send(error.message === 'bad json' || error.message === 'too large' ? 400 : 500, { error: 'failed' });
    });
  };

  return Object.assign(handler, {
    prune: () => {
      const now = Date.now();
      general.prune(now);
      guests.prune(now);
    },
  });
}
