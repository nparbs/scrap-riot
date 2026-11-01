import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { embeddedDb } from '../scripts/embedded-db';
import { Accounts, ratingChange } from '../server/accounts';
import { connectPostgres, type Db } from '../server/db';
import { startGameServer, type GameServer } from '../server/gameServer';
import { googleVerifier } from '../server/google';
import { STARTING_MONEY } from '../src/game/progress';
import { NetClient } from '../src/net/client';
import { OFFLINE_PAYOUT_MAX, PROTOCOL_VERSION, type OnlineStatus, type Profile, type ServerMessage } from '../src/net/protocol';
import { MELEE, TURRETS } from '../src/sim/data';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
let db: Db;
let accounts: Accounts;
let signingKey: CryptoKey;
let verify: ReturnType<typeof googleVerifier>;

beforeAll(async () => {
  // CI points this at a real Postgres. Locally it uses an embedded one.
  db = process.env.TEST_DATABASE_URL ? connectPostgres(process.env.TEST_DATABASE_URL) : embeddedDb();
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  signingKey = privateKey as CryptoKey;
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
  verify = googleVerifier(CLIENT_ID, createLocalJWKSet({ keys: [jwk] }));
  accounts = new Accounts(db, verify);
  await accounts.migrate();
}, 60_000);

afterAll(() => db.close());

function credential(sub: string, over: { audience?: string; issuer?: string; expires?: string } = {}): Promise<string> {
  return new SignJWT({ email: 'someone@example.com', name: 'Real Name' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub)
    .setIssuer(over.issuer ?? 'https://accounts.google.com')
    .setAudience(over.audience ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(over.expires ?? '1h')
    .sign(signingKey);
}

const uniqueSub = () => `sub-${Math.random().toString(36).slice(2)}`;

describe('google verification', () => {
  it('accepts a valid credential and returns only the stable ID', async () => {
    expect(await verify(await credential('abc'))).toBe('abc');
  });

  it('rejects another site, a wrong issuer, an expired token, and garbage', async () => {
    expect(await verify(await credential('abc', { audience: 'someone-elses-app' }))).toBeNull();
    expect(await verify(await credential('abc', { issuer: 'https://evil.example' }))).toBeNull();
    expect(await verify(await credential('abc', { expires: '-1h' }))).toBeNull();
    expect(await verify('not.a.token')).toBeNull();
  });

  it('rejects a token signed by a different key', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setSubject('victim')
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setExpirationTime('1h')
      .sign(privateKey);
    expect(await verify(forged)).toBeNull();
  });
});

describe('accounts', () => {
  it('starts guests fresh, and stores only a hash of the session token', async () => {
    const { token, profile } = await accounts.createGuest();
    expect(profile.signedIn).toBe(false);
    expect(profile.save.money).toBe(STARTING_MONEY);
    const stored = await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions');
    expect(stored.some((row) => row.token_hash === token)).toBe(false);
    expect((await accounts.profile(token))?.save.money).toBe(STARTING_MONEY);
    expect(await accounts.profile('wrong')).toBeNull();
    expect(await accounts.profile(undefined)).toBeNull();
  });

  it('never stores the email or real name from Google', async () => {
    const sub = uniqueSub();
    await accounts.signInGoogle(await credential(sub), null);
    const [row] = await db.query<Record<string, unknown>>('SELECT * FROM players WHERE google_sub = $1', [sub]);
    const text = JSON.stringify(row);
    expect(text).not.toContain('someone@example.com');
    expect(text).not.toContain('Real Name');
  });

  it('keeps a guest\'s progress when they first sign in with Google', async () => {
    const guest = await accounts.createGuest();
    await accounts.garage(guest.token, { type: 'name', name: 'Keeper' });
    const signed = await accounts.signInGoogle(await credential(uniqueSub()), guest.token);
    expect(signed?.profile.signedIn).toBe(true);
    expect(signed?.profile.save.name).toBe('Keeper');
  });

  it('returns to the existing account when that Google user signs in again', async () => {
    const sub = uniqueSub();
    const first = await accounts.signInGoogle(await credential(sub), null);
    await accounts.garage(first!.token, { type: 'name', name: 'Original' });
    const guest = await accounts.createGuest();
    const again = await accounts.signInGoogle(await credential(sub), guest.token);
    expect(again?.profile.save.name).toBe('Original');
    expect((await accounts.profile(guest.token))?.signedIn).toBe(false);
  });

  it('refuses invalid credentials and does not hijack a guest', async () => {
    const guest = await accounts.createGuest();
    expect(await accounts.signInGoogle('forged', guest.token)).toBeNull();
    expect(await accounts.signInGoogle(undefined, guest.token)).toBeNull();
    expect((await accounts.profile(guest.token))?.signedIn).toBe(false);
  });

  it('signing out ends the session, and deleting removes everything', async () => {
    const a = await accounts.createGuest();
    await accounts.signOut(a.token);
    expect(await accounts.profile(a.token)).toBeNull();

    const b = await accounts.createGuest();
    const { accountId } = (await accounts.forMatch(b.token))!;
    await accounts.recordMatch({
      id: crypto.randomUUID(), arena: 'pit', mode: 'ffa', duration: 60,
      players: [{ accountId, place: 1, kills: 3, deaths: 1, damage: 100, payout: 500, powerupsLeft: b.profile.save.loadout.powerups }],
    });
    expect(await accounts.deleteAccount(b.token)).toBe(true);
    for (const table of ['players', 'sessions', 'ledger', 'match_players']) {
      const column = table === 'players' ? 'id' : 'player_id';
      expect(await db.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [accountId]), table).toHaveLength(0);
    }
    expect(await accounts.deleteAccount(b.token)).toBe(false);
  });

  it('cleans up abandoned guests but keeps Google accounts', async () => {
    const stale = await accounts.createGuest();
    const unplayed = await accounts.createGuest();
    const active = await accounts.createGuest();
    const google = await accounts.signInGoogle(await credential(uniqueSub()), null);
    const id = async (t: string) => (await accounts.forMatch(t))!.accountId;
    await db.query("UPDATE players SET last_seen = now() - interval '61 days', matches = 5 WHERE id = $1", [await id(stale.token)]);
    await db.query("UPDATE players SET last_seen = now() - interval '8 days' WHERE id = $1", [await id(unplayed.token)]);
    await db.query("UPDATE players SET last_seen = now() - interval '400 days' WHERE id = $1", [await id(google!.token)]);
    await accounts.cleanup();
    expect(await accounts.profile(stale.token)).toBeNull();
    expect(await accounts.profile(unplayed.token)).toBeNull();
    expect(await accounts.profile(active.token)).not.toBeNull();
    expect(await accounts.profile(google!.token)).not.toBeNull();
  });
});

describe('rating', () => {
  it('runs evenly from first to last, however many were in the match', () => {
    expect([1, 2].map((place) => ratingChange(place, 2))).toEqual([25, -15]);
    expect([1, 2, 3, 4, 5, 6].map((place) => ratingChange(place, 6))).toEqual([25, 17, 9, 1, -7, -15]);
  });
});

describe('garage on the server', () => {
  it('banks an offline payout within limits, and refuses anything else', async () => {
    const { token } = await accounts.createGuest();
    expect(await accounts.garage(token, { type: 'payout', amount: 250 })).toMatchObject({ ok: true, profile: { save: { money: STARTING_MONEY + 250 } } });
    for (const amount of [-1, 1.5, OFFLINE_PAYOUT_MAX + 1, '100', null]) {
      expect(await accounts.garage(token, { type: 'payout', amount } as never), String(amount)).toMatchObject({ ok: false });
    }
    expect((await accounts.profile(token))!.save.money).toBe(STARTING_MONEY + 250);
    expect((await accounts.profile(token))!.save.matches).toBe(0);
  });

  it('applies cheat codes on the server, records the money and refuses anything else', async () => {
    const { token } = await accounts.createGuest();
    const paid = await accounts.garage(token, { type: 'cheat', code: ' MONEY ' });
    expect(paid).toMatchObject({ ok: true, profile: { save: { money: STARTING_MONEY + 5000 } } });
    const { rows } = { rows: await db.query<{ amount: number; reason: string }>("SELECT amount, reason FROM ledger WHERE reason = 'garage: cheat'") };
    expect(rows.some((row) => row.amount === 5000)).toBe(true);

    const unlocked = await accounts.garage(token, { type: 'cheat', code: 'unlock' });
    expect(unlocked).toMatchObject({ ok: true });
    if (unlocked?.ok) expect(unlocked.profile.save.owned.melee).toContain('vertbar');

    for (const code of ['nope', '', 7, null]) {
      expect(await accounts.garage(token, { type: 'cheat', code } as never), String(code)).toMatchObject({ ok: false });
    }
  });

  const give = async (token: string, money: number) => {
    const { accountId } = (await accounts.forMatch(token))!;
    await db.query('UPDATE players SET money = $1 WHERE id = $2', [money, accountId]);
    return accountId;
  };

  it('buys with server prices and records it in the ledger', async () => {
    const { token } = await accounts.createGuest();
    const id = await give(token, 1000);
    const result = await accounts.garage(token, { type: 'equip', slot: 'melee', id: 'hammer' });
    expect(result).toMatchObject({ ok: true });
    const save = (result as { profile: Profile }).profile.save;
    expect(save.money).toBe(1000 - MELEE.hammer.price);
    expect(save.loadout.melee).toBe('hammer');
    const ledger = await db.query<{ amount: number }>("SELECT amount FROM ledger WHERE player_id = $1 AND reason LIKE 'garage%'", [id]);
    expect(ledger.map((r) => r.amount)).toEqual([-MELEE.hammer.price]);
  });

  it('refuses what they cannot afford, and bad input', async () => {
    const { token } = await accounts.createGuest();
    const bad: unknown[] = [
      { type: 'equip', slot: 'chassis', id: 'juggernaut' },
      { type: 'equip', slot: 'melee', id: 'death-ray' },
      { type: 'equip', slot: 'melee', id: 'constructor' },
      { type: 'equip', slot: '__proto__', id: 'x' },
      { type: 'upgrade', id: 'hax' },
      { type: 'powerup', id: 'toString' },
      { type: 'nope' },
      null,
      'equip',
    ];
    for (const action of bad) {
      expect(await accounts.garage(token, action as never), JSON.stringify(action)).toMatchObject({ ok: false });
    }
    const save = (await accounts.profile(token))!.save;
    expect(save.money).toBe(STARTING_MONEY);
    expect(save.owned.turret).toEqual(['minigun']);
  });

  it('cannot spend the same money twice at once', async () => {
    const { token } = await accounts.createGuest();
    await give(token, TURRETS.laser.price);
    const results = await Promise.all([
      accounts.garage(token, { type: 'equip', slot: 'turret', id: 'laser' }),
      accounts.garage(token, { type: 'equip', slot: 'turret', id: 'arc' }),
      accounts.garage(token, { type: 'equip', slot: 'turret', id: 'bunkerbuster' }),
    ]);
    const save = (await accounts.profile(token))!.save;
    expect(save.money).toBeGreaterThanOrEqual(0);
    expect(results.filter((r) => r?.ok).length).toBe(1);
  });

  it('cleans paint and names', async () => {
    const { token } = await accounts.createGuest();
    const result = await accounts.garage(token, { type: 'paint', paint: { primary: 0x35d0e6, pattern: '<img>' } as never });
    const paint = (result as { profile: Profile }).profile.save.loadout.paint!;
    expect(paint.primary).toBe(0x35d0e6);
    expect(paint.pattern).toBe('solid');
    const named = await accounts.garage(token, { type: 'name', name: `‮${'x'.repeat(99)}` });
    expect((named as { profile: Profile }).profile.save.name).toHaveLength(16);
  });
});

describe('over the network', () => {
  const servers: GameServer[] = [];
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.close());
    await Promise.all(servers.splice(0).map((s) => s.close()));
  });

  async function server(room: Record<string, unknown> = {}, allowedOrigins?: string[]) {
    const s = await startGameServer({
      port: 0,
      host: '127.0.0.1',
      accounts,
      googleClientId: CLIENT_ID,
      allowedOrigins,
      room: { lobbyMs: 60, fullLobbyMs: 10, graceMs: 200, arena: 'pit', mode: 'ffa', minPlayers: 1, capacity: 6, fillSeats: true, keepLeavers: true, countdown: 0, ...room },
    });
    servers.push(s);
    return s;
  }

  const until = async (check: () => boolean, ms = 4000) => {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 5));
    }
  };

  const api = (s: GameServer, path: string, init: RequestInit = {}, token?: string) =>
    fetch(`http://127.0.0.1:${s.port}${path}`, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...init.headers },
    });

  function raw(s: GameServer) {
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}`);
    sockets.push(ws);
    const inbox: ServerMessage[] = [];
    ws.onmessage = (e) => inbox.push(JSON.parse(String(e.data)));
    return { ws, inbox, opened: new Promise<void>((resolve) => (ws.onopen = () => resolve())) };
  }

  it('reports who is queued, who is playing and who was around lately, and nothing else', async () => {
    const s = await server({ minPlayers: 2, capacity: 2, lobbyMs: 300, fullLobbyMs: 300 });
    const online = async () => (await api(s, '/api/online')).json() as Promise<OnlineStatus>;
    const empty = await online();
    expect([empty.queued, empty.playing]).toEqual([0, 0]);

    const named = await accounts.createGuest();
    const unnamed = await accounts.createGuest();
    const label = `Seen${Date.now()}`.slice(0, 16);
    await accounts.garage(named.token, { type: 'name', name: label });
    await accounts.profile(unnamed.token);

    const first = raw(s);
    await first.opened;
    first.ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, session: named.token, name: '', loadout: {} }));
    await until(() => first.inbox.some((m) => m.t === 'queue'));
    const waiting = await online();
    expect([waiting.queued, waiting.playing]).toEqual([1, 0]);
    expect(waiting.queues).toEqual({ duel: 1, brawl: 0 });
    const row = waiting.recent.find((p) => p.name === label)!;
    expect(row).toBeTruthy();
    expect(Object.keys(row).sort()).toEqual(['lastSeen', 'name']);
    expect(new Date(row.lastSeen).getTime()).toBeGreaterThan(Date.now() - 60_000);
    // Guests who never picked a name aren't anyone to list.
    expect(waiting.recent.every((p) => p.name !== 'Pilot')).toBe(true);

    const second = raw(s);
    await second.opened;
    second.ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, session: unnamed.token, name: '', loadout: {} }));
    await until(() => first.inbox.some((m) => m.t === 'start'));
    const fighting = await online();
    expect([fighting.queued, fighting.playing]).toEqual([0, 2]);
  });

  it('does not list players who have been gone a long time', async () => {
    const old = await accounts.createGuest();
    const label = `Old${Date.now()}`.slice(0, 16);
    await accounts.garage(old.token, { type: 'name', name: label });
    const { accountId } = (await accounts.forMatch(old.token))!;
    await db.query("UPDATE players SET last_seen = now() - interval '8 days' WHERE id = $1", [accountId]);
    expect((await accounts.recentPlayers()).some((p) => p.name === label)).toBe(false);
  });

  it('runs the whole API flow', async () => {
    const s = await server();
    const config = await (await api(s, '/api/config')).json();
    expect(config.googleClientId).toBe(CLIENT_ID);

    const guest = await (await api(s, '/api/guest', { method: 'POST' })).json();
    expect(guest.profile.save.money).toBe(STARTING_MONEY);
    expect((await api(s, '/api/me', {}, guest.token)).status).toBe(200);
    expect((await api(s, '/api/me', {}, 'nope')).status).toBe(401);
    expect((await api(s, '/api/me')).status).toBe(401);

    const buy = await api(s, '/api/garage', { method: 'POST', body: JSON.stringify({ action: { type: 'equip', slot: 'melee', id: 'dagger' } }) }, guest.token);
    expect((await buy.json()).profile.save.loadout.melee).toBe('dagger');
    const broke = await api(s, '/api/garage', { method: 'POST', body: JSON.stringify({ action: { type: 'equip', slot: 'turret', id: 'bunkerbuster' } }) }, guest.token);
    expect(broke.status).toBe(400);

    const signIn = await api(s, '/api/auth/google', { method: 'POST', body: JSON.stringify({ credential: await credential(uniqueSub()) }) }, guest.token);
    const signed = await signIn.json();
    expect(signed.profile.signedIn).toBe(true);
    expect(signed.profile.save.loadout.melee).toBe('dagger');
    expect((await api(s, '/api/auth/google', { method: 'POST', body: JSON.stringify({ credential: 'forged' }) })).status).toBe(401);

    expect(((await (await api(s, '/api/history', {}, signed.token)).json()).history)).toEqual([]);
    expect((await api(s, '/api/logout', { method: 'POST' }, signed.token)).status).toBe(200);
    expect((await api(s, '/api/me', {}, signed.token)).status).toBe(401);
    expect((await api(s, '/api/nope')).status).toBe(404);
  });

  it('survives malformed requests, and does not leak internals', async () => {
    const s = await server();
    const guest = await (await api(s, '/api/guest', { method: 'POST' })).json();
    const bad = await api(s, '/api/garage', { method: 'POST', body: '{nope' }, guest.token);
    expect(bad.status).toBe(400);
    const huge = await api(s, '/api/garage', { method: 'POST', body: JSON.stringify({ x: 'y'.repeat(20_000) }) }, guest.token).catch(() => null);
    expect(huge === null || huge.status === 400).toBe(true);
    const empty = await api(s, '/api/garage', { method: 'POST' }, guest.token);
    expect(empty.status).toBe(400);
    expect(JSON.stringify(await empty.json())).not.toMatch(/sql|stack|select/i);
  });

  it('blocks other sites from the API', async () => {
    const s = await server({}, ['https://good.example']);
    const bad = await api(s, '/api/me', { headers: { Origin: 'https://evil.example' } }, 'x');
    expect(bad.status).toBe(403);
    const good = await api(s, '/api/config', { headers: { Origin: 'https://good.example' } });
    expect(good.headers.get('access-control-allow-origin')).toBe('https://good.example');
  });

  it('uses the account\'s gear in a match, and ignores what the client claims', async () => {
    const s = await server();
    const guest = await accounts.createGuest();
    const { accountId } = (await accounts.forMatch(guest.token))!;
    const state = guest.profile.save;
    state.loadout.upgrades.armor = 2;
    await db.query('UPDATE players SET state = $1 WHERE id = $2', [JSON.stringify({ owned: state.owned, loadout: state.loadout, practice: state.practice }), accountId]);

    const { ws, inbox, opened } = raw(s);
    await opened;
    ws.send(JSON.stringify({
      t: 'join', v: PROTOCOL_VERSION, session: guest.token, name: 'Liar',
      loadout: { chassis: 'juggernaut', turret: 'bunkerbuster', upgrades: { armor: 99 }, powerups: { rage: 99 } },
    }));
    await until(() => inbox.some((m) => m.t === 'start'));
    const start = inbox.find((m) => m.t === 'start')!;
    const mine = (start as { setups: { name: string; loadout: { chassis: string; turret: string; upgrades: { armor: number }; powerups: { rage: number } } }[] }).setups[0];
    expect(mine.name).toBe(state.name);
    expect(mine.loadout.chassis).toBe('brawler');
    expect(mine.loadout.turret).toBe('minigun');
    expect(mine.loadout.upgrades.armor).toBe(2);
    expect(mine.loadout.powerups.rage).toBe(0);
  });

  it('requires a session once accounts are on', async () => {
    const s = await server();
    const { ws, inbox, opened } = raw(s);
    await opened;
    ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name: 'Anon', loadout: {} }));
    await until(() => inbox.some((m) => m.t === 'error'));
    expect(inbox[0]).toEqual({ t: 'error', code: 'sign-in' });
  });

  it('will not put one account in a match twice', async () => {
    const s = await server({ lobbyMs: 400 });
    const guest = await accounts.createGuest();
    const first = raw(s);
    const second = raw(s);
    await Promise.all([first.opened, second.opened]);
    first.ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, session: guest.token, name: '', loadout: {} }));
    await until(() => first.inbox.some((m) => m.t === 'queue'));
    second.ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, session: guest.token, name: '', loadout: {} }));
    await until(() => second.inbox.some((m) => m.t === 'error'));
    expect(second.inbox[0]).toEqual({ t: 'error', code: 'in-match' });
  });

  it('pays out, records history and rating, and spends powerups at the end of a match', async () => {
    const s = await server({ duration: 0.5 });
    const a = await accounts.createGuest();
    const b = await accounts.createGuest();
    const clients = [a, b].map(({ token, profile }) => {
      const state = { over: false };
      const c = new NetClient(`ws://127.0.0.1:${s.port}`, { name: 'x', loadout: profile.save.loadout, session: token }, { onOver: () => (state.over = true) });
      c.connect();
      return { c, state, token };
    });
    await until(() => clients.every((c) => c.state.over));
    const standings = clients[0].c.match!.standings();
    for (const { c, token } of clients) {
      const profile = (await accounts.profile(token))!;
      const row = standings.find((st) => st.bot.id === c.player!.id)!;
      expect(profile.save.money).toBe(STARTING_MONEY + row.total);
      expect(profile.save.matches).toBe(1);
      expect(profile.rating).not.toBe(1000);
      const history = await accounts.history(token);
      expect(history).toHaveLength(1);
      expect(history![0]).toMatchObject({ arena: 'pit', mode: 'ffa', place: row.place, payout: row.total });
    }
    const board = await accounts.leaderboard(100);
    expect(board.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(board[0]).sort()).toEqual(['kills', 'matches', 'name', 'rating', 'wins']);
  });

  it('counts leaving a brawl as last place, and scales rating by the seats in the match', async () => {
    const s = await server({ fillSeats: false, keepLeavers: false, minPlayers: 3, capacity: 3, lobbyMs: 20 });
    const [quitter, second, third] = await Promise.all([accounts.createGuest(), accounts.createGuest(), accounts.createGuest()]);
    const open = (guest: typeof quitter, events = {}) => new NetClient(`ws://127.0.0.1:${s.port}`, { name: 'x', loadout: guest.profile.save.loadout, session: guest.token }, events);
    let over = 0;
    const q = open(quitter, { onStart: () => setTimeout(() => q.leave(), 50) });
    const b = open(second, { onStart: () => setTimeout(() => b.leave(), 150), onOver: () => over++ });
    const c = open(third, { onOver: () => over++ });
    [q, b, c].forEach((client) => client.connect());
    await until(() => over > 0, 6000);
    const start = quitter.profile.rating;
    const rows = await Promise.all([quitter, second, third].map(async (guest) => (await accounts.profile(guest.token))!));
    expect(rows.map((row) => row.save.matches)).toEqual([1, 1, 1]);
    expect(rows.map((row) => row.rating - start).sort((x, y) => x - y)).toEqual([-15, -15, 25]);
    expect(rows[2].rating - start).toBe(25);
    expect(rows[0].save.money).toBe(STARTING_MONEY);
    expect(rows[2].save.money).toBeGreaterThanOrEqual(STARTING_MONEY + 100);
  });

  it('pays nothing to a player who leaves early', async () => {
    const s = await server({ duration: 0.8 });
    const quitter = await accounts.createGuest();
    const stayer = await accounts.createGuest();
    const q = new NetClient(`ws://127.0.0.1:${s.port}`, { name: 'q', loadout: quitter.profile.save.loadout, session: quitter.token }, {
      onStart: () => setTimeout(() => q.leave(), 50),
    });
    let over = false;
    const c = new NetClient(`ws://127.0.0.1:${s.port}`, { name: 's', loadout: stayer.profile.save.loadout, session: stayer.token }, { onOver: () => (over = true) });
    q.connect();
    c.connect();
    await until(() => over);
    expect((await accounts.profile(quitter.token))!.save.money).toBe(STARTING_MONEY);
    expect((await accounts.profile(quitter.token))!.save.matches).toBe(0);
    expect((await accounts.profile(stayer.token))!.save.matches).toBe(1);
  });
});
