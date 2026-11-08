import { RAGDOLL_TIME } from '../sim/data';
import { lerpAngle, type GameEvent, type Match } from '../sim/match';
import { applyBotState, applyWorldState, encodeSnapshot } from '../net/snapshot';

/** How much of the match is kept for the replay at the end. */
const KEEP = 12;
/** Frames are kept at most this often, so a fast screen doesn't fill memory. */
const FRAME_GAP = 1 / 60;
/** How far back from the deciding kill the replay starts. */
const LEAD_IN = 3;
/** How long the replay runs on after the kill, which takes in the tumble and the blast. */
const FOLLOW_ON = RAGDOLL_TIME + 1;
/** A kill longer ago than this before the end isn't what decided the match, so there's no replay. */
const RECENT = 8;
/** How fast the slow motion around the kill runs. */
const SLOW = 0.3;
const AFTER = 0.8;

type Frame = ReturnType<typeof encodeSnapshot> & { clock: number };

export type KillEvent = Extract<GameEvent, { type: 'kill' }>;

export interface KillMoment {
  /** When it happened, on the recording's clock. */
  clock: number;
  event: KillEvent;
}

/** Keeps the last few seconds of a match as it was drawn, positions already blended, ready to play back. */
export class ReplayRecorder {
  frames: Frame[] = [];
  private clock = 0;
  private pending: GameEvent[] = [];

  reset(): void {
    this.frames = [];
    this.clock = 0;
    this.pending = [];
  }

  capture(match: Match, events: GameEvent[], alpha: number, dt: number): void {
    this.clock += dt;
    if (events.length) this.pending.push(...events);
    const last = this.frames[this.frames.length - 1];
    if (last && this.clock - last.clock < FRAME_GAP && !this.pending.some((e) => e.type === 'kill')) return;
    this.frames.push(snapshotAsDrawn(match, this.pending, alpha, this.clock));
    this.pending = [];
    while (this.frames.length > 2 && this.frames[0].clock < this.clock - KEEP) this.frames.shift();
  }

  /** The kill that decided the match, if one happened near enough to the end. */
  decidingKill(): KillMoment | null {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const frame = this.frames[i];
      if (frame.clock < this.clock - RECENT) break;
      const kill = [...frame.events].reverse().find((e): e is KillEvent => e.type === 'kill');
      if (kill) return { clock: frame.clock, event: kill };
    }
    return null;
  }
}

function snapshotAsDrawn(match: Match, events: GameEvent[], alpha: number, clock: number): Frame {
  const frame = { ...encodeSnapshot(match, events), clock };
  // The match's own time is kept unrounded, so hazards play back smoothly.
  frame.time = match.time;
  match.bots.forEach((bot, i) => {
    const row = frame.bots[i];
    row[0] = bot.prevX + (bot.x - bot.prevX) * alpha;
    row[1] = bot.prevZ + (bot.z - bot.prevZ) * alpha;
    row[2] = lerpAngle(bot.prevHeading, bot.heading, alpha);
  });
  return frame;
}

function smoothstep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/**
 * Plays the recording back into the match the view draws from. Robots glide between frames,
 * so the slow motion stays smooth, and each frame's events play once as the replay passes them.
 */
export class ReplayPlayer {
  /** Where the replay is, on the recording's clock. */
  t: number;
  readonly start: number;
  readonly end: number;
  readonly slowFrom: number;
  readonly slowTo: number;
  private index = 0;
  private played = -1;
  /** The match as it finished, put back once the replay is over. */
  private readonly final: Frame;

  constructor(
    private readonly match: Match,
    private readonly frames: Frame[],
    readonly kill: KillMoment,
  ) {
    const fell = kill.event.fell;
    this.start = Math.max(frames[0].clock, kill.clock - LEAD_IN);
    this.end = kill.clock + FOLLOW_ON;
    this.slowFrom = kill.clock - (fell ? 0.8 : 0.5);
    this.slowTo = kill.clock + 0.8;
    this.t = this.start;
    this.final = snapshotAsDrawn(match, [], 1, Infinity);
    while (this.index < frames.length - 1 && frames[this.index + 1].clock <= this.t) this.index++;
    // Whatever happened before the replay starts is already on screen.
    this.played = this.index;
  }

  get done(): boolean {
    return this.t >= this.end;
  }

  /** How far into the kill the replay is: below zero before it, above after. */
  get sinceKill(): number {
    return this.t - this.kill.clock;
  }

  /** Recording seconds per real second, slowing right down around the kill. */
  speed(): number {
    if (this.t < this.slowTo) return 1 + (SLOW - 1) * smoothstep(this.slowFrom - 0.3, this.slowFrom, this.t);
    return SLOW + (AFTER - SLOW) * smoothstep(this.slowTo, this.slowTo + 0.4, this.t);
  }

  /** Moves on and returns how much recording time went by, along with the events passed on the way. */
  advance(realDt: number): { dt: number; events: GameEvent[]; alpha: number } {
    const dt = realDt * this.speed();
    this.t = Math.min(this.end, this.t + dt);
    const { frames, match } = this;
    while (this.index < frames.length - 1 && frames[this.index + 1].clock <= this.t) this.index++;
    const events: GameEvent[] = [];
    for (let i = this.played + 1; i <= this.index; i++) events.push(...frames[i].events);
    this.played = this.index;

    const a = frames[this.index];
    const b = frames[this.index + 1] ?? a;
    const alpha = b.clock <= a.clock ? 1 : Math.max(0, Math.min(1, (this.t - a.clock) / (b.clock - a.clock)));
    match.time = a.time + (b.time - a.time) * alpha;
    applyWorldState(match, a, 0);
    match.bots.forEach((bot, i) => {
      const from = a.bots[i];
      const to = b.bots[i];
      if (!from || !to) return;
      applyBotState(bot, from);
      bot.prevX = from[0];
      bot.prevZ = from[1];
      bot.prevHeading = from[2];
      bot.x = to[0];
      bot.z = to[1];
      bot.heading = to[2];
      bot.vx = from[3];
      bot.vz = from[4];
    });
    return { dt, events, alpha };
  }

  /** Puts the match back as it ended, for anything that reads it afterwards. */
  restore(): void {
    const { match, final } = this;
    match.time = final.time;
    applyWorldState(match, final, 0);
    match.bots.forEach((bot, i) => {
      const row = final.bots[i];
      applyBotState(bot, row);
      bot.x = bot.prevX = row[0];
      bot.z = bot.prevZ = row[1];
      bot.heading = bot.prevHeading = row[2];
      bot.vx = row[3];
      bot.vz = row[4];
    });
  }
}
