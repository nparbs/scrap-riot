import type { ArenaId } from '../sim/arena';
import type { ModeId } from '../sim/data';
import { emptyInput, lerpAngle, Match, STEP, wrapAngle, type Bot, type BotInput, type Loadout } from '../sim/match';
import {
  INPUT_RATE,
  INPUT_STEPS,
  packFlags,
  powerupIndex,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
  type SnapshotMessage,
  type StartMessage,
  type OnlineQueue,
} from './protocol';
import { applyBotState, applyWorldState, readAlive, readMotion } from './snapshot';

/** Other robots are drawn this far in the past so there are always two snapshots to blend. */
const RENDER_DELAY = 0.1;
const MAX_BUFFER = 20;
const MAX_PENDING = 120;
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000];
const PING_INTERVAL = 2;
const CORRECTION_DECAY = 10;
/** A jump this large is a respawn or heavy lag, so snap instead of sliding across the arena. */
const MAX_CORRECTION = 6;
const MAX_CATCH_UP_STEPS = 6;

export type NetFailure = ErrorCode | 'unreachable' | 'lost';

export interface NetClientEvents {
  onQueue?: (players: number, capacity: number, startsIn: number, arena: ArenaId, mode: ModeId) => void;
  onStart?: (match: Match, player: Bot) => void;
  onOver?: () => void;
  onChat?: (bot: number, id: number) => void;
  onDrawOffer?: (bot: number) => void;
  onFail?: (reason: NetFailure) => void;
  onReconnecting?: (active: boolean) => void;
}

interface Pending {
  seq: number;
  throttle: number;
  steer: number;
  boost: boolean;
}

export class NetClient {
  match: Match | null = null;
  player: Bot | null = null;
  rttMs = 0;
  private ws: WebSocket | null = null;
  private start: StartMessage | null = null;
  private token: string | null = null;
  private closed = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private inputTimer = 0;
  private pingTimer = 0;
  private readonly current: BotInput = emptyInput();
  private pending: Pending[] = [];
  private snaps: SnapshotMessage[] = [];
  private renderTime = 0;
  private pred = { x: 0, z: 0, heading: 0, vx: 0, vz: 0 };
  /** Where the prediction was one input ago. The robot is drawn between the two, or it would move at only 30 Hz. */
  private predFrom = { x: 0, z: 0, heading: 0 };
  private corrX = 0;
  private corrZ = 0;
  private corrHeading = 0;

  constructor(
    private readonly url: string,
    private readonly hello: { name: string; loadout: Loadout; session?: string; queue?: OnlineQueue },
    private readonly events: NetClientEvents = {},
  ) {}

  connect(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.fail('unreachable');
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.token) this.send({ t: 'resume', v: PROTOCOL_VERSION, token: this.token });
      else this.send({ t: 'join', v: PROTOCOL_VERSION, name: this.hello.name, loadout: this.withoutSkin(), session: this.hello.session, queue: this.hello.queue });
    };
    ws.onmessage = (e) => this.handle(JSON.parse(String(e.data)) as ServerMessage);
    // Not every runtime follows a failed connection's error event with a close event.
    ws.onerror = ws.onclose = () => {
      if (ws !== this.ws) return;
      this.ws = null;
      this.handleClose();
    };
  }

  /** The server has an account's paint job already, and a paint job won't fit in a join message. */
  private withoutSkin(): Loadout {
    const { loadout } = this.hello;
    if (!loadout.paint?.skin) return loadout;
    const { skin: _skin, ...paint } = loadout.paint;
    return { ...loadout, paint };
  }

  private send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private handleClose(): void {
    if (this.closed) return;
    // Only a player already in a match has something to come back to.
    if (!this.token) {
      this.fail('unreachable');
      return;
    }
    const delay = RECONNECT_DELAYS[this.attempts++];
    if (delay === undefined) {
      this.fail('lost');
      return;
    }
    this.events.onReconnecting?.(true);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private fail(reason: NetFailure): void {
    this.close();
    this.events.onFail?.(reason);
  }

  /** Leaves for good. The server hands this robot to the AI. */
  leave(): void {
    this.send({ t: 'leave' });
    this.close();
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private handle(message: ServerMessage): void {
    switch (message.t) {
      case 'queue':
        this.events.onQueue?.(message.players, message.capacity, message.startsIn, message.arena, message.mode);
        break;
      case 'start':
        this.handleStart(message);
        break;
      case 'snap':
        this.handleSnapshot(message);
        break;
      case 'over':
        if (this.match) {
          this.match.over = true;
          this.match.drawn = message.drawn === true;
        }
        this.close();
        this.events.onOver?.();
        break;
      case 'error':
        this.fail(message.code);
        break;
      case 'chat':
        this.events.onChat?.(message.bot, message.id);
        break;
      case 'draw-offer':
        this.events.onDrawOffer?.(message.bot);
        break;
      case 'pong':
        this.rttMs = Date.now() - message.c;
        break;
    }
  }

  private handleStart(message: StartMessage): void {
    this.attempts = 0;
    this.token = message.token;
    this.pending = [];
    this.events.onReconnecting?.(false);
    // A resume lands back in the same match, so the existing world stays.
    if (this.start?.match === message.match) return;
    this.start = message;
    this.snaps = [];
    this.match = new Match(message.setups, {
      seed: message.seed,
      arena: message.arena,
      mode: message.mode,
      duration: message.duration,
      killTarget: message.killTarget,
    });
    this.player = this.match.bots[message.you];
    const { x, z, heading, vx, vz } = this.player;
    this.pred = { x, z, heading, vx, vz };
    this.predFrom = { x, z, heading };
    this.events.onStart?.(this.match, this.player);
  }

  private handleSnapshot(snap: SnapshotMessage): void {
    const { match, player } = this;
    if (!match || !player) return;
    match.countdown = snap.countdown;
    if (this.snaps.length === 0) this.renderTime = snap.time - RENDER_DELAY;
    this.snaps.push(snap);
    if (this.snaps.length > MAX_BUFFER) this.snaps.shift();
    match.pushEvents(snap.events);

    const row = snap.bots[player.id];
    applyBotState(player, row);
    this.reconcile(row, snap.ack, snap.due ?? 0);
  }

  /** Rewinds to what the server says, then replays the inputs it has not seen yet. */
  private reconcile(row: number[], ack: number, due: number): void {
    const before = this.pred;
    const server = readMotion(row);
    this.pending = this.pending.filter((p) => p.seq >= ack);
    this.pred = { x: server.x, z: server.z, heading: server.heading, vx: server.vx, vz: server.vz };
    if (!readAlive(row)) {
      this.pending = [];
      this.snapToPrediction();
      return;
    }
    let skip = Math.max(0, -due);
    for (const p of this.pending) {
      const steps = p.seq === ack ? Math.max(0, due) : INPUT_STEPS;
      const skipped = Math.min(skip, steps);
      skip -= skipped;
      this.predictSteps(p.throttle, p.steer, p.boost, steps - skipped);
    }
    // The server has outrun everything sent so far. Sending sooner gets back ahead of it, which
    // is what lets the replay above land exactly on the prediction.
    this.inputTimer += Math.min(skip, MAX_CATCH_UP_STEPS) * STEP;
    const shiftX = this.pred.x - before.x;
    const shiftZ = this.pred.z - before.z;
    const shiftHeading = wrapAngle(this.pred.heading - before.heading);
    this.corrX -= shiftX;
    this.corrZ -= shiftZ;
    this.corrHeading -= shiftHeading;
    if (Math.hypot(this.corrX, this.corrZ) > MAX_CORRECTION) {
      this.snapToPrediction();
      return;
    }
    // Both ends of the blend move together, so the correction alone decides what's drawn.
    this.predFrom.x += shiftX;
    this.predFrom.z += shiftZ;
    this.predFrom.heading += shiftHeading;
  }

  private snapToPrediction(): void {
    this.corrX = this.corrZ = this.corrHeading = 0;
    const { x, z, heading } = this.pred;
    this.predFrom = { x, z, heading };
  }

  private predictSteps(throttle: number, steer: number, boost: boolean, steps = INPUT_STEPS): void {
    const { match, player, pred } = this;
    if (!match || !player) return;
    player.x = pred.x;
    player.z = pred.z;
    player.heading = pred.heading;
    player.vx = pred.vx;
    player.vz = pred.vz;
    for (let i = 0; i < steps; i++) match.predict(player, throttle, steer, boost, STEP);
    this.pred = { x: player.x, z: player.z, heading: player.heading, vx: player.vx, vz: player.vz };
  }

  surrender(): void {
    this.send({ t: 'surrender' });
  }

  /** Accepts the other pilot's offer if there's one open. */
  offerDraw(): void {
    this.send({ t: 'draw' });
  }

  chat(id: number): void {
    this.send({ t: 'chat', id });
  }

  /** Tells the server to stop driving this robot, for when the tab goes to the background. */
  sendNeutral(): void {
    this.send({ t: 'input', s: ++this.seq, th: 0, st: 0, f: 0, p: -1 });
  }

  /** Call once per rendered frame. `readInput` fills in the player's current controls. */
  update(dt: number, readInput: (input: BotInput) => void): void {
    const { match, player } = this;
    if (!match || !player) return;

    this.pingTimer -= dt;
    if (this.pingTimer <= 0) {
      this.pingTimer = PING_INTERVAL;
      this.send({ t: 'ping', c: Date.now() });
    }

    this.inputTimer += dt;
    const interval = 1 / INPUT_RATE;
    while (this.inputTimer >= interval) {
      this.inputTimer -= interval;
      this.sampleInput(readInput);
    }

    this.renderOthers(dt);

    const decay = Math.exp(-dt * CORRECTION_DECAY);
    this.corrX *= decay;
    this.corrZ *= decay;
    this.corrHeading *= decay;
    if (player.alive) {
      const { pred, predFrom } = this;
      const blend = this.inputTimer / interval;
      player.x = player.prevX = predFrom.x + (pred.x - predFrom.x) * blend + this.corrX;
      player.z = player.prevZ = predFrom.z + (pred.z - predFrom.z) * blend + this.corrZ;
      player.heading = player.prevHeading = wrapAngle(lerpAngle(predFrom.heading, pred.heading, blend) + this.corrHeading);
      player.vx = this.pred.vx;
      player.vz = this.pred.vz;
    }
  }

  private sampleInput(readInput: (input: BotInput) => void): void {
    const { current, player } = this;
    if (!player) return;
    const { x, z, heading } = this.pred;
    this.predFrom = { x, z, heading };
    readInput(current);
    this.seq++;
    this.send({
      t: 'input',
      s: this.seq,
      th: current.throttle,
      st: current.steer,
      f: packFlags(current.melee, current.turret, current.defense, current.boost),
      p: powerupIndex(current.powerup),
    });
    current.powerup = null;
    if (player.alive && this.ws?.readyState === WebSocket.OPEN) {
      this.pending.push({ seq: this.seq, throttle: current.throttle, steer: current.steer, boost: current.boost });
      if (this.pending.length > MAX_PENDING) this.pending.shift();
      this.predictSteps(current.throttle, current.steer, current.boost);
    }
  }

  private renderOthers(dt: number): void {
    const { match, player, snaps } = this;
    if (!match || !player || snaps.length === 0) return;

    const latest = snaps[snaps.length - 1];
    const target = latest.time - RENDER_DELAY;
    const drift = target - this.renderTime;
    this.renderTime += dt;
    if (Math.abs(drift) > 0.5) this.renderTime = target;
    else this.renderTime += drift * Math.min(1, dt * 2);
    match.time = Math.max(0, this.renderTime);

    let a = snaps[0];
    let b = latest;
    for (let i = 0; i < snaps.length - 1; i++) {
      if (snaps[i].time <= this.renderTime && snaps[i + 1].time >= this.renderTime) {
        a = snaps[i];
        b = snaps[i + 1];
        break;
      }
    }
    const span = b.time - a.time;
    const t = span > 0 ? Math.max(0, Math.min(1, (this.renderTime - a.time) / span)) : 1;

    for (const bot of match.bots) {
      if (bot === player) continue;
      const from = readMotion(a.bots[bot.id]);
      const to = readMotion(b.bots[bot.id]);
      applyBotState(bot, b.bots[bot.id]);
      // A big jump means a respawn, which should teleport rather than glide.
      const teleported = Math.hypot(to.x - from.x, to.z - from.z) > 8;
      const blend = teleported ? 1 : t;
      bot.x = bot.prevX = from.x + (to.x - from.x) * blend;
      bot.z = bot.prevZ = from.z + (to.z - from.z) * blend;
      bot.heading = bot.prevHeading = lerpAngle(from.heading, to.heading, blend);
      bot.vx = to.vx;
      bot.vz = to.vz;
    }

    applyWorldState(match, b, Math.max(0, this.renderTime - b.time));
  }
}
