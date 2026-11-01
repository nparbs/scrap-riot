import { randomUUID } from 'node:crypto';
import { makeRivals, type Save } from '../src/game/progress';
import { INPUT_STEPS, onlineLoadout, QUICK_CHAT, sanitizeName, SNAPSHOT_STEPS, unpackFlags, type OnlineQueue, type ServerMessage, type StartMessage } from '../src/net/protocol';
import { encodeSnapshot } from '../src/net/snapshot';
import type { ArenaId } from '../src/sim/arena';
import { DUEL_OUTRO, MODES, POWERUP_ORDER, type ModeId, type UpgradeId } from '../src/sim/data';
import { Match, STEP, type BotSetup, type Loadout } from '../src/sim/match';

import type { MatchResult } from './accounts';

export interface Conn {
  send(data: string): void;
  /** Bytes queued for this socket. Snapshots are skipped for clients that are falling behind. */
  backlog(): number;
  close(): void;
}

export interface RoomOptions {
  lobbyMs: number;
  /** Countdown once the room fills, so nobody is thrown in the instant the last player joins. */
  fullLobbyMs: number;
  /** How long a dropped player has to come back before forfeiting, and how long a match with nobody connected survives. */
  graceMs: number;
  /** The match won't start with fewer humans than this, however long that takes. */
  minPlayers: number;
  /** Seats in the match. */
  capacity: number;
  /** Bots take any seats left over, and keep a leaver's robot going. Without them, anyone who leaves is out of the match. */
  bots: boolean;
  queue: OnlineQueue;
  /** Fixes the match length. By default each mode uses its own. */
  duration?: number;
  killTarget: number;
  arena: ArenaId;
  mode: ModeId;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  lobbyMs: 3_000,
  fullLobbyMs: 3_000,
  graceMs: 20_000,
  minPlayers: 2,
  capacity: 2,
  bots: false,
  queue: 'duel',
  killTarget: 12,
  arena: 'skyscraper',
  mode: 'duel',
};

export const BRAWL_ROOM_OPTIONS: RoomOptions = {
  ...DEFAULT_ROOM_OPTIONS,
  // Starts with whoever's there, but gives others time to get in first.
  lobbyMs: 20_000,
  capacity: 6,
  queue: 'brawl',
  mode: 'ffa',
};

const HUMAN_COLORS = [0xff8a2a, 0x35d0e6, 0xf25fd0, 0x9be03a, 0xf4f1e8, 0xffd23a];
const MAX_BACKLOG = 256 * 1024;
const MAX_CATCH_UP = 0.25;
/** Past this many queued inputs the player has lagged, so old ones go rather than delaying their weapons. */
const MAX_QUEUED_INPUTS = 4;
const QUEUED_AFTER_DROP = 2;
const DRAW_OFFER_MS = 15_000;
const CHAT_GAP_MS = 1_000;
/** Steps a late client may repay, which limits how much a stall can skip afterwards. */
const MAX_DEBT = 12;

interface QueuedInput {
  seq: number;
  throttle: number;
  steer: number;
  flags: number;
  powerup: number;
}

export interface Player {
  token: string;
  conn: Conn | null;
  name: string;
  loadout: Loadout;
  /** Absent when the server runs without accounts. */
  accountId?: string;
  botId: number;
  ack: number;
  left: boolean;
  /** Newest input received, which can be ahead of `ack`, the one being run. */
  received: number;
  queue: QueuedInput[];
  /** Sim steps left on the current input. */
  stepsLeft: number;
  /** Steps run on the old input because the next one was late, taken off the next ones when they arrive. */
  debt: number;
  /** When the connection dropped, while it is still gone. */
  droppedAt: number | null;
  lastChat: number;
}

export class Room {
  readonly id = randomUUID();
  readonly players = new Map<string, Player>();
  match: Match | null = null;
  finished = false;
  private startAt: number;
  readonly arena: ArenaId;
  readonly mode: ModeId;
  private readonly duration: number;
  private seed = Math.floor(Math.random() * 2 ** 31);
  private setups: BotSetup[] = [];
  private last = 0;
  private accumulator = 0;
  private steps = 0;
  private queueSentAt = 0;
  private emptySince: number | null = null;
  private aloneSince: number | null = null;
  private drawOffer: { token: string; at: number } | null = null;

  constructor(private readonly options: RoomOptions, now: number, private readonly onResults?: (result: MatchResult) => Promise<void>) {
    this.startAt = options.minPlayers <= 1 ? now + options.lobbyMs : Infinity;
    this.arena = options.arena;
    this.mode = options.mode;
    this.duration = options.duration ?? MODES[this.mode].duration;
  }

  get queue(): OnlineQueue {
    return this.options.queue;
  }

  get open(): boolean {
    return !this.match && !this.finished && this.players.size < this.options.capacity;
  }

  get connected(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.conn) n++;
    return n;
  }

  /** With an account the gear comes from the database, and without one nothing purchased counts. */
  join(conn: Conn, rawName: unknown, rawLoadout: unknown, now: number, account?: { accountId: string; save: Save }): Player {
    const player: Player = {
      token: randomUUID(),
      conn,
      name: account ? account.save.name : sanitizeName(rawName),
      loadout: account ? account.save.loadout : onlineLoadout(rawLoadout),
      accountId: account?.accountId,
      botId: -1,
      ack: 0,
      left: false,
      received: 0,
      queue: [],
      stepsLeft: 0,
      debt: 0,
      droppedAt: null,
      lastChat: 0,
    };
    this.players.set(player.token, player);
    if (this.players.size >= this.options.minPlayers && this.startAt === Infinity) this.startAt = now + this.options.lobbyMs;
    if (this.players.size >= this.options.capacity) this.startAt = Math.min(this.startAt, now + this.options.fullLobbyMs);
    this.broadcastQueue(now);
    return player;
  }

  /** A dropped connection keeps its robot during a match, and frees the slot in the lobby. */
  disconnect(player: Player, now: number): void {
    player.conn = null;
    if (!this.match) {
      this.players.delete(player.token);
      if (this.players.size === 0) {
        this.finished = true;
        return;
      }
      // Someone left the countdown, so it's back to waiting.
      if (this.players.size < this.options.minPlayers) this.startAt = Infinity;
      this.broadcastQueue(now);
      return;
    }
    player.droppedAt = now;
    this.match.setAI(player.botId, true);
  }

  /** The player chose to go, so their token stops working and the AI keeps the robot. */
  leave(player: Player, now: number): void {
    player.left = true;
    this.disconnect(player, now);
    // Walking out loses, rather than leaving a bot to fight on.
    if (this.match && !this.options.bots) this.match.forfeit(player.botId);
  }

  surrender(player: Player): void {
    if (this.match && !this.match.over && this.mode === 'duel') this.match.forfeit(player.botId);
  }

  /** Offering when the other pilot has an offer open accepts it. */
  offerDraw(player: Player, now: number): void {
    if (!this.match || this.match.over || this.mode !== 'duel') return;
    const open = this.drawOffer && now - this.drawOffer.at < DRAW_OFFER_MS ? this.drawOffer : null;
    if (open && open.token !== player.token) {
      this.match.drawn = true;
      this.match.over = true;
      return;
    }
    this.drawOffer = { token: player.token, at: now };
    this.broadcast({ t: 'draw-offer', bot: player.botId });
  }

  chat(player: Player, id: number, now: number): void {
    if (!this.match || !QUICK_CHAT[id] || now - player.lastChat < CHAT_GAP_MS) return;
    player.lastChat = now;
    this.broadcast({ t: 'chat', bot: player.botId, id });
  }

  resume(player: Player, conn: Conn): void {
    player.conn?.close();
    player.conn = conn;
    player.droppedAt = null;
    this.match?.setAI(player.botId, false);
    player.ack = player.received = player.stepsLeft = player.debt = 0;
    player.queue = [];
    conn.send(JSON.stringify(this.startMessage(player)));
  }

  input(player: Player, seq: number, throttle: number, steer: number, flags: number, powerup: number): void {
    if (!this.match || seq <= player.received) return;
    player.received = seq;
    player.queue.push({ seq, throttle, steer, flags, powerup });
    if (player.queue.length <= MAX_QUEUED_INPUTS) return;
    while (player.queue.length > QUEUED_AFTER_DROP) this.applyInput(player, player.queue.shift()!);
  }

  private applyInput(player: Player, next: QueuedInput): void {
    player.ack = next.seq;
    const input = this.match!.bots[player.botId].input;
    input.throttle = Math.max(-1, Math.min(1, next.throttle));
    input.steer = Math.max(-1, Math.min(1, next.steer));
    const { melee, turret, defense, boost } = unpackFlags(next.flags);
    input.melee = melee;
    input.turret = turret;
    input.defense = defense;
    input.boost = boost;
    const id = POWERUP_ORDER[next.powerup];
    if (id) input.powerup = id;
  }

  /**
   * Runs every input for exactly INPUT_STEPS, as the client predicted. Replaying then lands on
   * the same spot as the prediction, however unevenly the inputs arrived.
   */
  private feedInput(player: Player): void {
    for (;;) {
      if (player.stepsLeft > 0) {
        player.stepsLeft--;
        return;
      }
      const next = player.queue.shift();
      if (!next) {
        player.debt = Math.min(MAX_DEBT, player.debt + 1);
        return;
      }
      this.applyInput(player, next);
      const repaid = Math.min(player.debt, INPUT_STEPS);
      player.debt -= repaid;
      player.stepsLeft = INPUT_STEPS - repaid;
    }
  }

  tick(now: number): void {
    if (this.finished) return;
    if (!this.match) {
      if (now >= this.startAt) this.begin(now);
      else if (now - this.queueSentAt >= 1000) this.broadcastQueue(now);
      return;
    }

    if (this.connected === 0) {
      this.emptySince ??= now;
      if (now - this.emptySince > this.options.graceMs) {
        this.finished = true;
        return;
      }
    } else {
      this.emptySince = null;
    }

    if (!this.options.bots) {
      for (const player of this.players.values()) {
        if (player.droppedAt !== null && now - player.droppedAt > this.options.graceMs) this.match.forfeit(player.botId);
      }
      // A duel ends itself. A brawl would otherwise leave the last pilot alone until time ran out.
      if (this.mode !== 'duel' && this.match.bots.filter((bot) => !bot.out).length <= 1) {
        this.aloneSince ??= now;
        // Clients draw slightly in the past, so ending at once would beat the news of who left.
        if (now - this.aloneSince >= DUEL_OUTRO * 1000) this.match.over = true;
      }
    }

    this.accumulator += Math.min(MAX_CATCH_UP, (now - this.last) / 1000);
    this.last = now;
    while (this.accumulator >= STEP && !this.match.over) {
      for (const player of this.players.values()) if (player.conn) this.feedInput(player);
      this.match.step();
      this.accumulator -= STEP;
      if (++this.steps % SNAPSHOT_STEPS === 0) this.broadcastSnapshot();
    }
    if (this.match.over) this.finish();
  }

  private begin(now: number): void {
    const humans = [...this.players.values()];
    // Two pilots in the same paint can't tell which robot is which, so a clash is settled for this match only.
    const taken = new Set<number>();
    const humanSetups: BotSetup[] = humans.map((player, i) => {
      player.botId = i;
      const wanted = player.loadout.paint?.primary ?? HUMAN_COLORS[i];
      const color = taken.has(wanted) ? HUMAN_COLORS.find((c) => !taken.has(c)) ?? wanted : wanted;
      taken.add(color);
      const paint = player.loadout.paint && { ...player.loadout.paint, primary: color };
      return { name: player.name, color, loadout: { ...player.loadout, paint }, isAI: false };
    });
    // Bots match the average human, so upgrades don't make a match trivial.
    const average = (key: UpgradeId) => Math.round(humans.reduce((sum, p) => sum + p.loadout.upgrades[key], 0) / Math.max(1, humans.length));
    const progress = { wins: 0, loadout: { upgrades: { armor: average('armor'), engine: average('engine'), weapons: average('weapons') } } };
    const rivals = makeRivals(progress, this.options.bots ? this.options.capacity - humans.length : 0, this.seed).map((rival) => ({
      ...rival,
      name: `${rival.name} [bot]`,
    }));
    this.setups = [...humanSetups, ...rivals];
    this.match = new Match(this.setups, {
      seed: this.seed,
      arena: this.arena,
      mode: this.mode,
      duration: this.duration,
      killTarget: this.options.killTarget,
    });
    this.last = now;
    for (const player of humans) player.conn?.send(JSON.stringify(this.startMessage(player)));
    this.broadcastSnapshot();
  }

  private startMessage(player: Player): StartMessage {
    return {
      t: 'start',
      match: this.id,
      you: player.botId,
      token: player.token,
      seed: this.seed,
      arena: this.arena,
      mode: this.mode,
      // Clients run no AI, so every robot is a puppet driven by snapshots.
      setups: this.setups.map(({ name, color, loadout }) => ({ name, color, loadout, isAI: false })),
      duration: this.duration,
      killTarget: this.options.killTarget,
    };
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const player of this.players.values()) player.conn?.send(data);
  }

  private broadcastQueue(now: number): void {
    this.queueSentAt = now;
    this.broadcast({
      t: 'queue',
      players: this.players.size,
      capacity: this.options.capacity,
      startsIn: this.startAt === Infinity ? -1 : Math.max(0, Math.ceil((this.startAt - now) / 1000)),
      arena: this.arena,
      mode: this.mode,
    });
  }

  private broadcastSnapshot(): void {
    const match = this.match!;
    // Serialized once and shared. Only `ack` and `due` differ between players.
    const body = JSON.stringify(encodeSnapshot(match, match.drainEvents())).slice(1);
    for (const player of this.players.values()) {
      if (player.conn && player.conn.backlog() < MAX_BACKLOG) {
        player.conn.send(`{"t":"snap","ack":${player.ack},"due":${player.stepsLeft - player.debt},${body}`);
      }
    }
  }

  private finish(): void {
    this.broadcastSnapshot();
    this.finished = true;
    // "Over" waits for the database, so a client fetching its balance next sees the payout.
    const announce = () => this.broadcast({ t: 'over', drawn: this.match!.drawn });
    if (!this.onResults) return announce();
    this.onResults(this.results()).catch((error: Error) => console.error('Could not record match:', error.message)).finally(announce);
  }

  /** Payouts are worked out here from the server's own sim. Clients never report results. */
  private results(): MatchResult {
    const match = this.match!;
    const standings = match.standings();
    const players = [...this.players.values()]
      // Leaving still counts as losing, so nobody can quit to protect their rating.
      .filter((p) => p.accountId && (!p.left || !this.options.bots))
      .map((p) => {
        const row = standings.find((s) => s.bot.id === p.botId)!;
        return {
          accountId: p.accountId!,
          // However they ranked when they went, leaving never earns rating.
          place: row.bot.out ? match.bots.length : row.place,
          kills: row.bot.kills,
          deaths: row.bot.deaths,
          damage: row.bot.damageDealt,
          payout: row.total,
          powerupsLeft: row.bot.powerups,
        };
      });
    return { id: this.id, arena: this.arena, mode: this.mode, duration: match.time, drawn: match.drawn, seats: match.bots.length, players };
  }
}
