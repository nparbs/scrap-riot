import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { PROTOCOL_VERSION, type ClientMessage, type ErrorCode, type ServerMessage } from '../src/net/protocol';
import { STEP } from '../src/sim/match';
import type { Accounts } from './accounts';
import { createApi } from './api';
import { DEFAULT_ROOM_OPTIONS, Room, type Conn, type Player, type RoomOptions } from './room';

export interface GameServerOptions {
  port: number;
  host?: string;
  /** Browser origins allowed to connect. Empty allows any, which is only suitable for local use. */
  allowedOrigins?: string[];
  /**
   * Header holding the real client address, such as cf-connecting-ip. Set this only when a proxy
   * always overwrites it and the server cannot be reached directly, or clients could spoof it.
   */
  clientIpHeader?: string;
  maxRooms?: number;
  maxConnectionsPerIp?: number;
  room?: Partial<RoomOptions>;
  /** Turns on the API and server-owned progress. Without it, online play is anonymous. */
  accounts?: Accounts;
  /** Shown to the client so it can offer Google sign-in. */
  googleClientId?: string;
}

export interface GameServer {
  port: number;
  stats(): { rooms: number; connections: number };
  close(): Promise<void>;
}

const MAX_MESSAGE_BYTES = 2048;
/** Input at 30 Hz plus pings. Anything far above this is not a real client. */
const MAX_MESSAGES_PER_SECOND = 120;
const HEARTBEAT_MS = 15_000;
const CLEANUP_MS = 60 * 60 * 1000;

interface Session {
  socket: WebSocket;
  conn: Conn;
  room: Room | null;
  player: Player | null;
  /** Set while the database looks up this player's account. */
  joining: boolean;
  alive: boolean;
  windowStart: number;
  windowCount: number;
}

function clientAddress(req: IncomingMessage, header: string | undefined): string {
  const value = header ? req.headers[header.toLowerCase()] : undefined;
  if (typeof value === 'string' && value) return value.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

export function startGameServer(options: GameServerOptions): Promise<GameServer> {
  const roomOptions: RoomOptions = { ...DEFAULT_ROOM_OPTIONS, ...options.room };
  const allowed = new Set(options.allowedOrigins ?? []);
  const maxRooms = options.maxRooms ?? 50;
  const maxPerIp = options.maxConnectionsPerIp ?? 8;
  const rooms = new Set<Room>();
  const tokens = new Map<string, { room: Room; player: Player }>();
  const perIp = new Map<string, number>();
  const sessions = new Set<Session>();
  const { accounts } = options;
  /** Which player each account is, so one account can't enter a match twice. */
  const accountPlayers = new Map<string, { room: Room; player: Player }>();
  const addressOf = (req: IncomingMessage) => clientAddress(req, options.clientIpHeader);
  const presence = () => {
    let queued = 0;
    let playing = 0;
    for (const room of rooms) {
      if (room.finished) continue;
      if (room.match) playing += room.connected;
      else queued += room.players.size;
    }
    return { queued, playing };
  };
  const api = accounts
    ? createApi({ accounts, allowedOrigins: allowed, googleClientId: options.googleClientId ?? null, clientAddress: addressOf, presence })
    : null;

  const http: Server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, connections: sessions.size }));
      return;
    }
    if (api && req.url?.startsWith('/api/')) {
      api(req, res);
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: ({ origin }: { origin?: string }) => allowed.size === 0 || (!!origin && allowed.has(origin)),
  });

  const sendTo = (session: Session, message: ServerMessage) => session.conn.send(JSON.stringify(message));

  const fail = (session: Session, code: ErrorCode) => {
    sendTo(session, { t: 'error', code });
    session.socket.close();
  };

  const openRoom = (now: number): Room | null => {
    for (const room of rooms) if (room.open) return room;
    if (rooms.size >= maxRooms) return null;
    const room = new Room(roomOptions, now, accounts ? (result) => accounts.recordMatch(result) : undefined);
    rooms.add(room);
    return room;
  };

  const joinWithAccount = async (session: Session, token: unknown) => {
    let account: Awaited<ReturnType<Accounts['forMatch']>>;
    try {
      account = await accounts!.forMatch(token);
    } catch (error) {
      console.error('Could not load account:', (error as Error).message);
      return fail(session, 'bad-request');
    }
    if (!account) return fail(session, 'sign-in');
    if (session.socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();

    const existing = accountPlayers.get(account.accountId);
    if (existing && !existing.room.finished && !existing.player.left) {
      // Someone who reloaded the page mid-match gets their robot back.
      if (existing.player.conn || !existing.room.match) return fail(session, 'in-match');
      session.room = existing.room;
      session.player = existing.player;
      existing.room.resume(existing.player, session.conn);
      return;
    }

    const room = openRoom(now);
    if (!room) return fail(session, 'full');
    session.room = room;
    session.player = room.join(session.conn, null, null, now, account);
    tokens.set(session.player.token, { room, player: session.player });
    accountPlayers.set(account.accountId, { room, player: session.player });
  };

  const handle = (session: Session, message: ClientMessage) => {
    const now = Date.now();
    switch (message.t) {
      case 'join': {
        if (session.room || session.joining) return;
        if (message.v !== PROTOCOL_VERSION) return fail(session, 'outdated');
        if (!accounts) {
          const room = openRoom(now);
          if (!room) return fail(session, 'full');
          session.room = room;
          session.player = room.join(session.conn, message.name, message.loadout, now);
          tokens.set(session.player.token, { room, player: session.player });
          return;
        }
        session.joining = true;
        void joinWithAccount(session, message.session).finally(() => {
          session.joining = false;
        });
        return;
      }
      case 'resume': {
        if (session.room) return;
        if (message.v !== PROTOCOL_VERSION) return fail(session, 'outdated');
        const entry = typeof message.token === 'string' ? tokens.get(message.token) : undefined;
        if (!entry || entry.room.finished || entry.player.left || !entry.room.match) return fail(session, 'expired');
        session.room = entry.room;
        session.player = entry.player;
        entry.room.resume(entry.player, session.conn);
        return;
      }
      case 'input': {
        const { s, th, st, f, p } = message;
        if (![s, th, st, f, p].every((n) => typeof n === 'number' && Number.isFinite(n))) return;
        if (session.room && session.player?.conn === session.conn) {
          session.room.input(session.player, s, th, st, f, p);
        }
        return;
      }
      case 'surrender':
        if (session.room && session.player?.conn === session.conn) session.room.surrender(session.player);
        return;
      case 'draw':
        if (session.room && session.player?.conn === session.conn) session.room.offerDraw(session.player, now);
        return;
      case 'chat':
        if (session.room && session.player?.conn === session.conn && typeof message.id === 'number') session.room.chat(session.player, message.id, now);
        return;
      case 'ping':
        if (typeof message.c === 'number') sendTo(session, { t: 'pong', c: message.c });
        return;
      case 'leave':
        if (session.room && session.player?.conn === session.conn) {
          tokens.delete(session.player.token);
          if (session.player.accountId) accountPlayers.delete(session.player.accountId);
          session.room.leave(session.player, now);
          session.room = null;
          session.player = null;
        }
        return;
    }
  };

  wss.on('connection', (socket, req) => {
    const address = addressOf(req);
    const count = perIp.get(address) ?? 0;
    if (count >= maxPerIp) {
      socket.close(1008, 'too many connections');
      return;
    }
    perIp.set(address, count + 1);

    const conn: Conn = {
      send: (data) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(data);
      },
      backlog: () => socket.bufferedAmount,
      close: () => socket.close(),
    };
    const session: Session = { socket, conn, room: null, player: null, joining: false, alive: true, windowStart: Date.now(), windowCount: 0 };
    sessions.add(session);

    socket.on('pong', () => {
      session.alive = true;
    });
    socket.on('message', (raw) => {
      const now = Date.now();
      if (now - session.windowStart >= 1000) {
        session.windowStart = now;
        session.windowCount = 0;
      }
      if (++session.windowCount > MAX_MESSAGES_PER_SECOND) {
        socket.close(1008, 'too many messages');
        return;
      }
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      if (typeof message === 'object' && message !== null) handle(session, message);
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      sessions.delete(session);
      const remaining = (perIp.get(address) ?? 1) - 1;
      if (remaining > 0) perIp.set(address, remaining);
      else perIp.delete(address);
      if (session.room && session.player?.conn === conn) session.room.disconnect(session.player, Date.now());
    });
  });

  const loop = setInterval(() => {
    const now = Date.now();
    for (const room of rooms) {
      room.tick(now);
      if (!room.finished) continue;
      rooms.delete(room);
      for (const player of room.players.values()) {
        tokens.delete(player.token);
        if (player.accountId) accountPlayers.delete(player.accountId);
      }
    }
  }, STEP * 1000);

  const heartbeat = setInterval(() => {
    for (const session of sessions) {
      if (!session.alive) {
        session.socket.terminate();
        continue;
      }
      session.alive = false;
      session.socket.ping();
    }
  }, HEARTBEAT_MS);

  const cleanup = setInterval(() => {
    api?.prune();
    accounts?.cleanup().catch((error: Error) => console.error('Cleanup failed:', error.message));
  }, CLEANUP_MS);

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, options.host, () => {
      resolve({
        port: (http.address() as AddressInfo).port,
        stats: () => ({ rooms: rooms.size, connections: sessions.size }),
        close: () =>
          new Promise((done) => {
            clearInterval(loop);
            clearInterval(heartbeat);
            clearInterval(cleanup);
            for (const session of sessions) session.socket.terminate();
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}
