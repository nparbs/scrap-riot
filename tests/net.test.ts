import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket as NodeWebSocket } from 'ws';
import { startGameServer, type GameServer } from '../server/gameServer';
import { NetClient, type NetFailure } from '../src/net/client';
import { onlineLoadout, PROTOCOL_VERSION, sanitizeName, type ServerMessage } from '../src/net/protocol';
import { compactEvents } from '../src/net/snapshot';
import { newSave } from '../src/game/progress';
import type { BotInput } from '../src/sim/match';

const servers: GameServer[] = [];
const clients: NetClient[] = [];
const sockets: WebSocket[] = [];
const nodeSockets: NodeWebSocket[] = [];

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  sockets.splice(0).forEach((s) => s.close());
  nodeSockets.splice(0).forEach((s) => s.terminate());
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function server(room: Record<string, number> = {}, extra: Record<string, unknown> = {}): Promise<GameServer> {
  const s = await startGameServer({ port: 0, host: '127.0.0.1', room: { lobbyMs: 80, fullLobbyMs: 10, graceMs: 200, ...room }, ...extra });
  servers.push(s);
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting for condition');
    await sleep(5);
  }
}

function client(port: number, name = 'Tester') {
  const state = { started: false, over: false, failed: null as NetFailure | null, queue: 0, reconnecting: false };
  const c = new NetClient(`ws://127.0.0.1:${port}`, { name, loadout: newSave().loadout }, {
    onStart: () => (state.started = true),
    onOver: () => (state.over = true),
    onFail: (reason) => (state.failed = reason),
    onQueue: (players) => (state.queue = players),
    onReconnecting: (active) => (state.reconnecting = active),
  });
  clients.push(c);
  c.connect();
  return { c, state };
}

/** Pumps the client as a render loop would. */
function pump(c: NetClient, read: (i: BotInput) => void = () => {}) {
  const timer = setInterval(() => c.update(1 / 60, read), 16);
  return () => clearInterval(timer);
}

function raw(port: number): { ws: WebSocket; inbox: ServerMessage[]; opened: Promise<void> } {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  const inbox: ServerMessage[] = [];
  ws.onmessage = (e) => inbox.push(JSON.parse(String(e.data)));
  return { ws, inbox, opened: new Promise((resolve) => (ws.onopen = () => resolve())) };
}

describe('protocol', () => {
  it('sanitizes names', () => {
    expect(sanitizeName('  Ace\u0000‮  ')).toBe('Ace');
    expect(sanitizeName('x'.repeat(50))).toHaveLength(16);
    expect(sanitizeName('   ')).toBe('Pilot');
    expect(sanitizeName(42)).toBe('Pilot');
  });

  it('ignores purchased stats and rejects unknown gear', () => {
    const loadout = onlineLoadout({
      chassis: 'juggernaut',
      melee: 'death-ray',
      turret: '__proto__',
      upgrades: { armor: 999, engine: 999, weapons: 999 },
      powerups: { repair: 99 },
    });
    expect(loadout.chassis).toBe('juggernaut');
    expect(loadout.melee).toBe('chainsaw');
    expect(loadout.turret).toBe('minigun');
    expect(loadout.upgrades).toEqual({ armor: 0, engine: 0, weapons: 0 });
    expect(loadout.powerups.repair).toBe(1);
    expect(onlineLoadout(null).chassis).toBe('brawler');
  });

  it('merges per-tick hits', () => {
    const hit = { type: 'hit' as const, x: 1, z: 2, amount: 0.5, target: 1, source: 0, shielded: false };
    const merged = compactEvents([hit, { ...hit }, { ...hit, target: 2 }]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ target: 1, amount: 1 });
  });
});

describe('online match', () => {
  it('puts two players in one match and fills the rest with bots', async () => {
    const s = await server();
    const a = client(s.port, 'Ann');
    const b = client(s.port, 'Bea');
    await until(() => a.state.started && b.state.started);
    expect(a.c.match!.bots).toHaveLength(6);
    expect(a.c.player!.id).not.toBe(b.c.player!.id);
    expect(a.c.match!.bots[a.c.player!.id].name).toBe('Ann');
    expect(a.c.match!.bots[b.c.player!.id].name).toBe('Bea');
    expect(a.c.match!.bots.filter((bot) => bot.name.endsWith('[bot]'))).toHaveLength(4);
    expect(s.stats().rooms).toBe(1);
  });

  it('applies input on the server, and other players see the movement', async () => {
    const s = await server();
    const a = client(s.port);
    const b = client(s.port);
    await until(() => a.state.started && b.state.started);
    const stopA = pump(a.c, (input) => {
      input.throttle = 1;
    });
    const stopB = pump(b.c);
    const id = a.c.player!.id;
    await until(() => b.c.match!.time > 0.2);
    const start = { x: b.c.match!.bots[id].x, z: b.c.match!.bots[id].z };
    await sleep(700);
    const seen = b.c.match!.bots[id];
    expect(Math.hypot(seen.x - start.x, seen.z - start.z)).toBeGreaterThan(2);
    // The driver's prediction and what others see should agree to within about the render delay.
    const self = a.c.player!;
    expect(Math.hypot(self.x - seen.x, self.z - seen.z)).toBeLessThan(5);
    stopA();
    stopB();
  });

  it('never trusts a client: speed comes from the server sim', async () => {
    const s = await server();
    const { ws, inbox, opened } = raw(s.port);
    await opened;
    ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name: 'Cheat', loadout: { upgrades: { engine: 500 } } }));
    await until(() => inbox.some((m) => m.t === 'start'));
    for (let i = 1; i <= 30; i++) ws.send(JSON.stringify({ t: 'input', s: i, th: 1e9, st: 0, f: 0, p: -1 }));
    await sleep(600);
    const snaps = inbox.filter((m) => m.t === 'snap');
    const row = snaps[snaps.length - 1].bots[0];
    expect(Math.hypot(row[3], row[4])).toBeLessThanOrEqual(12.5 + 0.01);
  });

  it('survives garbage input', async () => {
    const s = await server();
    const { ws, inbox, opened } = raw(s.port);
    await opened;
    ws.send('not json');
    ws.send('null');
    ws.send('[]');
    ws.send(JSON.stringify({ t: 'nope' }));
    ws.send(JSON.stringify({ t: 'input', s: 'x' }));
    ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name: { evil: 1 }, loadout: 7 }));
    await until(() => inbox.some((m) => m.t === 'start'));
    ws.send(JSON.stringify({ t: 'input', s: 1, th: null, st: 'x', f: {}, p: [] }));
    await sleep(100);
    const snap = inbox.filter((m) => m.t === 'snap').pop()!;
    expect(snap.bots[0].every((n) => Number.isFinite(n))).toBe(true);
  });

  it('rejects an outdated client', async () => {
    const s = await server();
    const { ws, inbox, opened } = raw(s.port);
    await opened;
    ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION + 1, name: 'Old', loadout: {} }));
    await until(() => inbox.some((m) => m.t === 'error'));
    expect(inbox[0]).toEqual({ t: 'error', code: 'outdated' });
  });

  it('hands a dropped player to the AI and returns the robot on resume', async () => {
    const s = await server();
    const a = client(s.port, 'Ann');
    const b = client(s.port, 'Bea');
    await until(() => a.state.started && b.state.started);
    const start = a.c.match;
    const stop = pump(a.c);
    const ws = (a.c as unknown as { ws: WebSocket }).ws;
    ws.close();
    await until(() => a.state.reconnecting);
    await until(() => !a.state.reconnecting);
    expect(a.c.match).toBe(start);
    const ack = () => (a.c as unknown as { snaps: { ack: number }[] }).snaps.at(-1)!.ack;
    await until(() => ack() > 0);
    stop();
  });

  it('refuses a resume token after the player leaves', async () => {
    const s = await server();
    const a = client(s.port);
    const b = client(s.port);
    await until(() => a.state.started && b.state.started);
    const token = (a.c as unknown as { token: string }).token;
    a.c.leave();
    await sleep(50);
    const { ws, inbox, opened } = raw(s.port);
    await opened;
    ws.send(JSON.stringify({ t: 'resume', v: PROTOCOL_VERSION, token }));
    await until(() => inbox.some((m) => m.t === 'error'));
    expect(inbox[0]).toEqual({ t: 'error', code: 'expired' });
  });

  it('never sends a resume token to other players', async () => {
    const s = await server();
    const a = raw(s.port);
    const b = raw(s.port);
    await Promise.all([a.opened, b.opened]);
    a.ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name: 'A', loadout: {} }));
    b.ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name: 'B', loadout: {} }));
    await until(() => a.inbox.some((m) => m.t === 'start') && b.inbox.some((m) => m.t === 'start'));
    await sleep(100);
    const tokenA = (a.inbox.find((m) => m.t === 'start') as { token: string }).token;
    expect(JSON.stringify(b.inbox)).not.toContain(tokenA);
  });

  it('ends the match for everyone and reports matching standings', async () => {
    const s = await server({ duration: 0.4 });
    const a = client(s.port, 'Ann');
    const b = client(s.port, 'Bea');
    await until(() => a.state.over && b.state.over);
    const scores = (c: NetClient) => c.match!.standings().map((row) => [row.bot.name, row.place, row.total]);
    expect(scores(a.c)).toEqual(scores(b.c));
    await until(() => s.stats().rooms === 0);
  });

  it('closes a match once every player is gone for the grace period', async () => {
    const s = await server();
    const a = client(s.port);
    await until(() => a.state.started);
    a.c.close();
    await until(() => s.stats().rooms === 0);
  });

  it('frees the lobby slot when a queued player disconnects', async () => {
    const s = await server({ lobbyMs: 5000 });
    const a = client(s.port);
    const b = client(s.port);
    await until(() => a.state.queue === 2);
    b.c.close();
    await until(() => a.state.queue === 1);
    expect(a.state.started).toBe(false);
  });

  it('starts early when full, and overflows into a new room', async () => {
    const s = await server({ lobbyMs: 5000 });
    const players = Array.from({ length: 7 }, (_, i) => client(s.port, `P${i}`));
    await until(() => players.slice(0, 6).every((p) => p.state.started));
    expect(players[6].state.started).toBe(false);
    expect(s.stats().rooms).toBe(2);
  });

  it('limits connections per address and message rate', async () => {
    const s = await server({}, { maxConnectionsPerIp: 1 });
    const first = raw(s.port);
    await first.opened;
    const second = raw(s.port);
    await new Promise<void>((resolve) => (second.ws.onclose = () => resolve()));
    for (let i = 0; i < 300; i++) first.ws.send(JSON.stringify({ t: 'ping', c: i }));
    await new Promise<void>((resolve) => (first.ws.onclose = () => resolve()));
  });

  it('counts connections by the configured client IP header', async () => {
    const s = await server({}, { maxConnectionsPerIp: 1, clientIpHeader: 'cf-connecting-ip' });
    const open = (ip: string) =>
      new Promise<'open' | 'closed'>((resolve) => {
        const ws = new NodeWebSocket(`ws://127.0.0.1:${s.port}`, { headers: { 'cf-connecting-ip': ip } });
        nodeSockets.push(ws);
        ws.once('close', () => resolve('closed'));
        ws.once('open', () => setTimeout(() => resolve(ws.readyState === ws.OPEN ? 'open' : 'closed'), 50));
      });
    expect(await open('203.0.113.1')).toBe('open');
    expect(await open('203.0.113.2')).toBe('open');
    expect(await open('203.0.113.1')).toBe('closed');
  });

  it('blocks origins not on the allowlist', async () => {
    const s = await server({}, { allowedOrigins: ['https://good.example'] });
    const res = await fetch(`http://127.0.0.1:${s.port}/health`);
    expect(res.ok).toBe(true);
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}`);
    sockets.push(ws);
    const outcome = await new Promise<string>((resolve) => {
      ws.onopen = () => resolve('open');
      ws.onerror = ws.onclose = () => resolve('refused');
    });
    expect(outcome).toBe('refused');
  });

  it('tells the player when the server is unreachable', async () => {
    const a = client(1, 'Lonely');
    await until(() => a.state.failed === 'unreachable');
  });
});
