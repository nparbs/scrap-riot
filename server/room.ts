import { randomUUID } from 'node:crypto';
import { makeRivals, randomArena, type Save } from '../src/game/progress';
import { MAX_PLAYERS, onlineLoadout, sanitizeName, SNAPSHOT_STEPS, unpackFlags, type ServerMessage, type StartMessage } from '../src/net/protocol';
import { encodeSnapshot } from '../src/net/snapshot';
import type { ArenaId } from '../src/sim/arena';
import { MODES, POWERUP_ORDER, type ModeId, type UpgradeId } from '../src/sim/data';
import { Match, STEP, type BotSetup, type Loadout } from '../src/sim/match';
import { makeRng } from '../src/sim/rng';

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
  /** How long a match with no connected humans survives waiting for a reconnect. */
  graceMs: number;
  /** Fixes the match length. By default each mode uses its own. */
  duration?: number;
  killTarget: number;
  /** Fixes the map and mode, otherwise each room rolls its own. */
  arena?: ArenaId;
  mode?: ModeId;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  lobbyMs: 10_000,
  fullLobbyMs: 2_000,
  graceMs: 20_000,
  killTarget: 12,
};

const HUMAN_COLORS = [0xff8a2a, 0x35d0e6, 0xf25fd0, 0x9be03a, 0xf4f1e8, 0xffd23a];
const MAX_BACKLOG = 256 * 1024;
const MAX_CATCH_UP = 0.25;

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

  constructor(private readonly options: RoomOptions, now: number, private readonly onResults?: (result: MatchResult) => Promise<void>) {
    this.startAt = now + options.lobbyMs;
    const rng = makeRng(this.seed);
    this.arena = options.arena ?? randomArena(rng);
    // Mostly free-for-all, with the other two modes mixed in for variety.
    const roll = rng();
    this.mode = options.mode ?? (roll < 0.6 ? 'ffa' : roll < 0.8 ? 'lms' : 'koth');
    this.duration = options.duration ?? MODES[this.mode].duration;
  }

  get open(): boolean {
    return !this.match && !this.finished && this.players.size < MAX_PLAYERS;
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
    };
    this.players.set(player.token, player);
    if (this.players.size >= MAX_PLAYERS) this.startAt = Math.min(this.startAt, now + this.options.fullLobbyMs);
    this.broadcastQueue(now);
    return player;
  }

  /** A dropped connection keeps its robot during a match, and frees the slot in the lobby. */
  disconnect(player: Player, now: number): void {
    player.conn = null;
    if (!this.match) {
      this.players.delete(player.token);
      if (this.players.size === 0) this.finished = true;
      else this.broadcastQueue(now);
      return;
    }
    this.match.setAI(player.botId, true);
  }

  /** The player chose to go, so their token stops working and the AI keeps the robot. */
  leave(player: Player, now: number): void {
    player.left = true;
    this.disconnect(player, now);
  }

  resume(player: Player, conn: Conn): void {
    player.conn?.close();
    player.conn = conn;
    this.match?.setAI(player.botId, false);
    player.ack = 0;
    conn.send(JSON.stringify(this.startMessage(player)));
  }

  input(player: Player, seq: number, throttle: number, steer: number, flags: number, powerup: number): void {
    const match = this.match;
    if (!match || seq <= player.ack) return;
    player.ack = seq;
    const input = match.bots[player.botId].input;
    input.throttle = Math.max(-1, Math.min(1, throttle));
    input.steer = Math.max(-1, Math.min(1, steer));
    const { melee, turret, defense } = unpackFlags(flags);
    input.melee = melee;
    input.turret = turret;
    input.defense = defense;
    const id = POWERUP_ORDER[powerup];
    if (id) input.powerup = id;
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

    this.accumulator += Math.min(MAX_CATCH_UP, (now - this.last) / 1000);
    this.last = now;
    while (this.accumulator >= STEP && !this.match.over) {
      this.match.step();
      this.accumulator -= STEP;
      if (++this.steps % SNAPSHOT_STEPS === 0) this.broadcastSnapshot();
    }
    if (this.match.over) this.finish();
  }

  private begin(now: number): void {
    const humans = [...this.players.values()];
    const humanSetups: BotSetup[] = humans.map((player, i) => {
      player.botId = i;
      return { name: player.name, color: player.loadout.paint?.primary ?? HUMAN_COLORS[i], loadout: player.loadout, isAI: false };
    });
    // Bots match the average human, so upgrades don't make a match trivial.
    const average = (key: UpgradeId) => Math.round(humans.reduce((sum, p) => sum + p.loadout.upgrades[key], 0) / Math.max(1, humans.length));
    const progress = { wins: 0, loadout: { upgrades: { armor: average('armor'), engine: average('engine'), weapons: average('weapons') } } };
    const rivals = makeRivals(progress, MAX_PLAYERS - humans.length, this.seed).map((rival) => ({
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
      capacity: MAX_PLAYERS,
      startsIn: Math.max(0, Math.ceil((this.startAt - now) / 1000)),
      arena: this.arena,
      mode: this.mode,
    });
  }

  private broadcastSnapshot(): void {
    const match = this.match!;
    // Serialized once and shared. Only `ack` differs between players.
    const body = JSON.stringify(encodeSnapshot(match, match.drainEvents())).slice(1);
    for (const player of this.players.values()) {
      if (player.conn && player.conn.backlog() < MAX_BACKLOG) {
        player.conn.send(`{"t":"snap","ack":${player.ack},${body}`);
      }
    }
  }

  private finish(): void {
    this.broadcastSnapshot();
    this.finished = true;
    // "Over" waits for the database, so a client fetching its balance next sees the payout.
    const announce = () => this.broadcast({ t: 'over' });
    if (!this.onResults) return announce();
    this.onResults(this.results()).catch((error: Error) => console.error('Could not record match:', error.message)).finally(announce);
  }

  /** Payouts are worked out here from the server's own sim. Clients never report results. */
  private results(): MatchResult {
    const match = this.match!;
    const standings = match.standings();
    const players = [...this.players.values()]
      .filter((p) => p.accountId && !p.left)
      .map((p) => {
        const row = standings.find((s) => s.bot.id === p.botId)!;
        return {
          accountId: p.accountId!,
          place: row.place,
          kills: row.bot.kills,
          deaths: row.bot.deaths,
          damage: row.bot.damageDealt,
          payout: row.total,
          powerupsLeft: row.bot.powerups,
        };
      });
    return { id: this.id, arena: this.arena, mode: this.mode, duration: match.time, players };
  }
}
