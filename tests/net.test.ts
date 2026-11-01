import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket as NodeWebSocket } from 'ws';
import { startGameServer, type GameServer } from '../server/gameServer';
import { BRAWL_ROOM_OPTIONS, Room } from '../server/room';
import { ARENA_ORDER, ARENAS } from '../src/sim/arena';
import { NetClient, type NetFailure } from '../src/net/client';
import { onlineLoadout, PROTOCOL_VERSION, sanitizeName, type OnlineQueue, type ServerMessage } from '../src/net/protocol';
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

async function server(room: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Promise<GameServer> {
  const s = await startGameServer({ port: 0, host: '127.0.0.1', room: { lobbyMs: 80, fullLobbyMs: 10, graceMs: 200, arena: 'pit', mode: 'ffa', minPlayers: 1, capacity: 6, fillSeats: true, keepLeavers: true, countdown: 0, ...room }, ...extra });
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

function client(port: number, name = 'Tester', queue?: OnlineQueue) {
  const state = { started: false, over: false, failed: null as NetFailure | null, queue: 0, arena: '', reconnecting: false };
  const c = new NetClient(`ws://127.0.0.1:${port}`, { name, loadout: newSave().loadout, queue }, {
    onStart: () => (state.started = true),
    onOver: () => (state.over = true),
    onFail: (reason) => (state.failed = reason),
    onQueue: (players, _capacity, _startsIn, arena) => {
      state.queue = players;
      state.arena = arena;
    },
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
  describe('brawl', () => {
    /** The real settings, with shorter waits. */
    const brawlServer = async (brawlRoom: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
      const s = await startGameServer({ port: 0, host: '127.0.0.1', brawlRoom: { lobbyMs: 150, fullLobbyMs: 10, graceMs: 200, countdown: 0, ...brawlRoom }, ...extra });
      servers.push(s);
      return s;
    };
    const brawler = (port: number, name: string) => client(port, name, 'brawl');

    it('never starts with one player', async () => {
      const s = await brawlServer({ lobbyMs: 20 });
      const a = brawler(s.port, 'Ann');
      await until(() => a.state.queue === 1);
      await sleep(200);
      expect(a.state.started).toBe(false);
    });

    it('is set up for eight seats, on a random map, ten seconds after the second pilot', () => {
      expect(BRAWL_ROOM_OPTIONS).toMatchObject({ capacity: 8, minPlayers: 2, lobbyMs: 10_000, fillSeats: true, arena: 'random', mode: 'ffa' });
      const maps = new Set(Array.from({ length: 60 }, () => new Room(BRAWL_ROOM_OPTIONS, 0).arena));
      expect(maps.size).toBeGreaterThan(1);
      for (const map of maps) expect(ARENA_ORDER).toContain(map);
      for (const id of ARENA_ORDER) expect(new Set(ARENAS[id].spawns.map((p) => `${p.x},${p.z}`)).size).toBeGreaterThanOrEqual(8);
    });

    it('waits out the countdown for more pilots, then fills the rest with bots on the map it announced', async () => {
      const s = await brawlServer({ lobbyMs: 300 });
      const a = brawler(s.port, 'Ann');
      await until(() => a.state.queue === 1);
      const b = brawler(s.port, 'Bea');
      await until(() => a.state.queue === 2);
      await sleep(50);
      expect(a.state.started).toBe(false);
      const c = brawler(s.port, 'Cal');
      await until(() => a.state.started && b.state.started && c.state.started);
      const { bots } = a.c.match!;
      expect(bots).toHaveLength(8);
      expect(bots.slice(0, 3).map((bot) => bot.name).sort()).toEqual(['Ann', 'Bea', 'Cal']);
      expect(bots.slice(3).every((bot) => bot.name.endsWith('[bot]'))).toBe(true);
      expect(a.c.match!.arena.id).toBe(a.state.arena);
      expect(a.c.match!.mode).toBe('ffa');
      expect(s.stats().rooms).toBe(1);
    });

    it('fills with bots even if only two pilots ever join', async () => {
      const s = await brawlServer();
      const a = brawler(s.port, 'Ann');
      await until(() => a.state.queue === 1);
      const b = brawler(s.port, 'Bea');
      await until(() => a.state.started && b.state.started);
      expect(a.c.match!.bots).toHaveLength(8);
      expect(a.c.match!.bots.filter((bot) => bot.name.endsWith('[bot]'))).toHaveLength(6);
    });

    it('starts at once when all eight seats fill, and a ninth pilot waits for the next one', async () => {
      const s = await brawlServer({ lobbyMs: 60_000 }, { maxConnectionsPerIp: 20 });
      const eight = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((name) => brawler(s.port, name));
      await until(() => eight.every((p) => p.state.started));
      expect(eight[0].c.match!.bots).toHaveLength(8);
      expect(eight[0].c.match!.bots.some((bot) => bot.name.endsWith('[bot]'))).toBe(false);
      expect(new Set(eight[0].c.match!.bots.map((bot) => bot.color)).size).toBe(8);
      const ninth = brawler(s.port, 'I');
      await until(() => ninth.state.queue === 1);
      expect(ninth.state.started).toBe(false);
      expect(s.stats().rooms).toBe(2);
    });

    it('lets the last human fight on against the bots, and ends once every human has gone', async () => {
      const s = await brawlServer();
      const [a, b] = ['Ann', 'Bea'].map((name) => brawler(s.port, name));
      await until(() => a.state.started && b.state.started);
      const stops = [a, b].map((p) => pump(p.c));
      const annId = a.c.player!.id;
      a.c.leave();
      await until(() => b.c.match!.bots[annId].out);
      await sleep(100);
      expect(b.state.over).toBe(false);
      expect(b.c.match!.bots.filter((bot) => !bot.out)).toHaveLength(7);
      b.c.leave();
      await until(() => s.stats().rooms === 0);
      stops.forEach((stop) => stop());
    });

    it('keeps duels and brawls apart', async () => {
      const s = await brawlServer({ lobbyMs: 60_000 });
      const fighter = brawler(s.port, 'Ann');
      await until(() => fighter.state.queue === 1);
      const dueller = client(s.port, 'Bea', 'duel');
      await until(() => dueller.state.queue === 1);
      expect(fighter.state.queue).toBe(1);
      expect(s.stats().rooms).toBe(2);
    });

    it('takes a leaver out of the match, and with no bots ends it when one pilot is left', async () => {
      const s = await brawlServer({ fillSeats: false });
      const [a, b, c] = ['Ann', 'Bea', 'Cal'].map((name) => brawler(s.port, name));
      await until(() => a.state.started && b.state.started && c.state.started);
      const stops = [a, b, c].map((p) => pump(p.c));
      const annId = a.c.player!.id;
      a.c.leave();
      await until(() => c.c.match!.bots[annId].out);
      await sleep(100);
      expect(c.state.over).toBe(false);
      b.c.leave();
      await until(() => c.state.over);
      expect(c.c.match!.ranked()[0].name).toBe('Cal');
      expect(c.c.match!.ranked().at(-1)!.out).toBe(true);
      stops.forEach((stop) => stop());
    });

    it('holds a dropped robot for the grace period, then takes it out', async () => {
      const s = await brawlServer();
      const [a, b, c] = ['Ann', 'Bea', 'Cal'].map((name) => brawler(s.port, name));
      await until(() => a.state.started && b.state.started && c.state.started);
      const stops = [b, c].map((p) => pump(p.c));
      const annId = a.c.player!.id;
      a.c.close();
      await sleep(80);
      expect(b.c.match!.bots[annId].out).toBe(false);
      await until(() => b.c.match!.bots[annId].out);
      expect(b.state.over).toBe(false);
      stops.forEach((stop) => stop());
    });
  });

  /** A server set up the way the real one is: duels only, and no bots. */
  const duelServer = async (room: Record<string, unknown> = {}) => {
    const s = await startGameServer({ port: 0, host: '127.0.0.1', room: { lobbyMs: 40, fullLobbyMs: 40, graceMs: 200, countdown: 0, ...room } });
    servers.push(s);
    return s;
  };

  it('holds everyone through the countdown, and the client knows when it ends', async () => {
    const s = await duelServer({ countdown: 0.5 });
    const a = client(s.port);
    await until(() => a.state.queue === 1);
    const b = client(s.port);
    await until(() => a.state.started && b.state.started);
    const stops = [pump(a.c, (input) => (input.throttle = 1)), pump(b.c)];
    await until(() => a.c.match!.countdown > 0);
    const start = { x: a.c.player!.x, z: a.c.player!.z };
    await sleep(120);
    expect(a.c.match!.countdown).toBeGreaterThan(0);
    expect(Math.hypot(a.c.player!.x - start.x, a.c.player!.z - start.z)).toBe(0);
    await until(() => a.c.match!.countdown === 0);
    await until(() => Math.hypot(a.c.player!.x - start.x, a.c.player!.z - start.z) > 1);
    stops.forEach((stop) => stop());
  });

  it('never starts with one player, however long they wait', async () => {
    const s = await duelServer();
    const a = client(s.port);
    await until(() => a.state.queue === 1);
    await sleep(300);
    expect(a.state.started).toBe(false);
  });

  it('starts a 1v1 on the roof with no bots once a second player joins', async () => {
    const s = await duelServer();
    const a = client(s.port, 'Ann');
    await until(() => a.state.queue === 1);
    const b = client(s.port, 'Bea');
    await until(() => a.state.started && b.state.started);
    expect(a.c.match!.bots.map((bot) => bot.name).sort()).toEqual(['Ann', 'Bea']);
    expect(a.c.match!.arena.id).toBe('skyscraper');
    expect(a.c.match!.mode).toBe('duel');
    expect(s.stats().rooms).toBe(1);
  });

  it('gives two pilots in the same paint different colors', async () => {
    const s = await duelServer();
    const a = client(s.port);
    await until(() => a.state.queue === 1);
    const b = client(s.port);
    await until(() => a.state.started && b.state.started);
    const [one, two] = a.c.match!.bots;
    expect(one.color).not.toBe(two.color);
    expect(one.loadout.paint!.primary).not.toBe(two.loadout.paint!.primary);
  });

  it('goes back to waiting if the opponent leaves the countdown', async () => {
    const s = await duelServer({ lobbyMs: 300, fullLobbyMs: 300 });
    const a = client(s.port);
    await until(() => a.state.queue === 1);
    const b = client(s.port);
    await until(() => a.state.queue === 2);
    b.c.close();
    await until(() => a.state.queue === 1);
    await sleep(500);
    expect(a.state.started).toBe(false);
  });

  /** Two players in a running duel, with the render loop going. */
  async function duel(room: Record<string, unknown> = {}) {
    const s = await duelServer(room);
    const a = client(s.port, 'Ann');
    await until(() => a.state.queue === 1);
    const b = client(s.port, 'Bea');
    await until(() => a.state.started && b.state.started);
    const stops = [pump(a.c), pump(b.c)];
    return { s, a, b, stop: () => stops.forEach((f) => f()) };
  }

  it('ends the duel when a player surrenders, and the other wins', async () => {
    const { a, b, stop } = await duel();
    a.c.surrender();
    await until(() => a.state.over && b.state.over);
    stop();
    expect(b.c.match!.standings()[0].bot.name).toBe('Bea');
    expect(b.c.match!.drawn).toBe(false);
  });

  it('walking out of a duel loses it', async () => {
    const { a, b, stop } = await duel();
    a.c.leave();
    await until(() => b.state.over);
    stop();
    expect(b.c.match!.standings()[0].bot.name).toBe('Bea');
  });

  it('a dropped player who never returns forfeits', async () => {
    const { a, b, stop } = await duel();
    (a.c as unknown as { ws: WebSocket }).ws.close();
    a.c.close();
    await until(() => b.state.over);
    stop();
    expect(b.c.match!.standings()[0].bot.name).toBe('Bea');
  });

  it('draws only when both pilots agree', async () => {
    const { a, b, stop } = await duel();
    let offered = -1;
    (b.c as unknown as { events: { onDrawOffer: (bot: number) => void } }).events.onDrawOffer = (bot) => (offered = bot);
    a.c.offerDraw();
    await until(() => offered === a.c.player!.id);
    a.c.offerDraw();
    await sleep(100);
    expect(a.state.over).toBe(false);
    b.c.offerDraw();
    await until(() => a.state.over && b.state.over);
    stop();
    expect(a.c.match!.drawn).toBe(true);
    expect(a.c.match!.standings().map((row) => row.place)).toEqual([1, 1]);
  });

  it('only passes on chat from the preset list', async () => {
    const { a, b, stop } = await duel();
    const heard: number[] = [];
    (b.c as unknown as { events: { onChat: (bot: number, id: number) => void } }).events.onChat = (_, id) => heard.push(id);
    a.c.chat(999);
    a.c.chat(1);
    await until(() => heard.length > 0);
    a.c.chat(2);
    await sleep(100);
    stop();
    // The second one came too soon after the first, and 999 isn't a phrase.
    expect(heard).toEqual([1]);
  });

  it('shows other players a validated paint job', async () => {
    const s = await server();
    const { ws, inbox, opened } = raw(s.port);
    await opened;
    const paint = { primary: 0x35d0e6, secondary: 123456, pattern: 'flames', body: '<script>' };
    ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name: 'Painter', loadout: { paint } }));
    await until(() => inbox.some((m) => m.t === 'start'));
    const start = inbox.find((m) => m.t === 'start') as unknown as { setups: { loadout: { paint: Record<string, unknown> } }[] };
    expect(start.setups[0].loadout.paint).toEqual({ primary: 0x35d0e6, secondary: 0x33363b, pattern: 'flames', body: 'wedge' });
  });

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

  it.each([[false], [true]])('draws the driver smoothly, with almost nothing left to correct (boosting: %s)', async (boost) => {
    // Alone on the roof, since anything it bumps into is meant to cause a correction.
    const s = await server({ arena: 'skyscraper', capacity: 1 });
    const { c, state } = client(s.port);
    await until(() => state.started);
    const internals = c as unknown as { corrX: number; corrZ: number };
    let cruising = false;
    let hitSomething = false;
    const read = (input: BotInput) => {
      input.throttle = 1;
      input.boost = boost;
      // A tight circle that stays clear of everything on this part of the roof.
      input.steer = 1;
    };
    let last = performance.now();
    const steps: number[] = [];
    let worst = 0;
    let frames = 0;
    let px = 0;
    let pz = 0;
    await new Promise<void>((done) => {
      const timer = setInterval(() => {
        const now = performance.now();
        const dt = (now - last) / 1000;
        last = now;
        c.update(dt, read);
        const player = c.player!;
        const speed = Math.hypot(player.vx, player.vz);
        // Speeding up from rest doesn't count, and a crash is meant to correct.
        cruising ||= speed >= 11;
        hitSomething ||= cruising && speed < 11;
        if (++frames > 40 && cruising && !hitSomething) {
          steps.push(Math.hypot(player.x - px, player.z - pz) / dt / speed);
          worst = Math.max(worst, Math.hypot(internals.corrX, internals.corrZ));
        }
        px = player.x;
        pz = player.z;
        if (frames > 120) {
          clearInterval(timer);
          done();
        }
      }, 16);
    });
    expect(steps.length).toBeGreaterThan(10);
    const stalled = steps.filter((v) => v < 0.5).length / steps.length;
    console.log(`stalled frames ${(stalled * 100).toFixed(0)}%, worst correction ${worst.toFixed(3)}`);
    expect(stalled).toBeLessThan(0.05);
    // An occasional resync of one or two sim steps is fine, and a step is longer when boosting.
    expect(worst).toBeLessThan(boost ? 0.4 : 0.25);
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
    // They connect simultaneously, so any six may get in. Exactly one must overflow.
    const started = () => players.filter((p) => p.state.started).length;
    await until(() => started() === 6 && s.stats().rooms === 2);
    await sleep(100);
    expect(started()).toBe(6);
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
