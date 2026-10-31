import { POWERUP_ORDER } from '../sim/data';
import type { Bot, GameEvent, Match } from '../sim/match';
import type { SnapshotMessage } from './protocol';

// Bots travel as flat number arrays. A JSON object per robot at 20 Hz would be several times larger.
const MOTION = ['x', 'z', 'heading', 'vx', 'vz', 'turretAngle'] as const;
const STATE = [
  'hp', 'respawnT', 'meleeCd', 'turretCd', 'defenseCd', 'shieldT', 'turboT', 'overdriveT', 'stunT',
  'invulnT', 'flashT', 'meleeWindup', 'meleeSwing', 'lungeT', 'kills', 'deaths', 'damageDealt', 'earned',
] as const;
const FLAGS = ['alive', 'meleeActive', 'oiled'] as const;

const FLAGS_AT = MOTION.length + STATE.length;
const POWERUPS_AT = FLAGS_AT + 1;

const KIND_BULLET = 0;
const KIND_ROCKET = 1;
const KIND_REPAIR = 0;
const KIND_SCRAP = 1;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Chainsaws and saws deal damage every tick, so hits are merged per target and source. */
export function compactEvents(events: GameEvent[]): GameEvent[] {
  const out: GameEvent[] = [];
  const hits = new Map<string, Extract<GameEvent, { type: 'hit' }>>();
  for (const event of events) {
    if (event.type !== 'hit') {
      out.push(event);
      continue;
    }
    const key = `${event.target}:${event.source}:${event.shielded}`;
    const merged = hits.get(key);
    if (merged) {
      merged.amount += event.amount;
    } else {
      const copy = { ...event };
      hits.set(key, copy);
      out.push(copy);
    }
  }
  for (const hit of hits.values()) {
    hit.x = round(hit.x);
    hit.z = round(hit.z);
    hit.amount = round(hit.amount);
  }
  return out;
}

/** Everything except `t` and `ack`, which differ per player. */
export function encodeSnapshot(match: Match, events: GameEvent[]): Omit<SnapshotMessage, 't' | 'ack'> {
  return {
    time: round(match.time),
    bots: match.bots.map((bot) => {
      let flags = 0;
      FLAGS.forEach((key, i) => {
        if (bot[key]) flags |= 1 << i;
      });
      return [
        ...MOTION.map((key) => round(bot[key])),
        ...STATE.map((key) => round(bot[key])),
        flags,
        ...POWERUP_ORDER.map((id) => bot.powerups[id]),
      ];
    }),
    proj: match.projectiles.map((p) => [p.id, p.kind === 'rocket' ? KIND_ROCKET : KIND_BULLET, round(p.x), round(p.z), round(p.vx), round(p.vz)]),
    mines: match.mines.map((m) => [m.id, m.owner, round(m.x), round(m.z), round(m.armT)]),
    oil: match.oil.map((p) => [p.id, p.owner, round(p.x), round(p.z), p.r, round(p.life)]),
    pickups: match.pickups.map((p) => [p.id, p.kind === 'scrap' ? KIND_SCRAP : KIND_REPAIR, round(p.x), round(p.z), p.spot]),
    events: compactEvents(events),
  };
}

export function readMotion(row: number[]): { x: number; z: number; heading: number; vx: number; vz: number; turretAngle: number } {
  return { x: row[0], z: row[1], heading: row[2], vx: row[3], vz: row[4], turretAngle: row[5] };
}

export function readAlive(row: number[]): boolean {
  return (row[FLAGS_AT] & 1) !== 0;
}

/** Applies health, timers, scores and flags. Position is handled separately by the client. */
export function applyBotState(bot: Bot, row: number[]): void {
  STATE.forEach((key, i) => {
    bot[key] = row[MOTION.length + i];
  });
  FLAGS.forEach((key, i) => {
    bot[key] = (row[FLAGS_AT] & (1 << i)) !== 0;
  });
  POWERUP_ORDER.forEach((id, i) => {
    bot.powerups[id] = row[POWERUPS_AT + i];
  });
}

/** Rebuilds the shared lists the renderer reads. `ahead` extrapolates shots to the render time. */
export function applyWorldState(match: Match, snap: SnapshotMessage, ahead: number): void {
  match.projectiles.length = 0;
  for (const [id, kind, x, z, vx, vz] of snap.proj) {
    match.projectiles.push({
      id,
      owner: -1,
      kind: kind === KIND_ROCKET ? 'rocket' : 'bullet',
      x: x + vx * ahead,
      z: z + vz * ahead,
      vx,
      vz,
      life: 1,
      damage: 0,
      splash: 0,
    });
  }
  match.mines.length = 0;
  for (const [id, owner, x, z, armT] of snap.mines) {
    match.mines.push({ id, owner, x, z, armT, life: 1, damage: 0, radius: 0 });
  }
  match.oil.length = 0;
  for (const [id, owner, x, z, r, life] of snap.oil) {
    match.oil.push({ id, owner, x, z, r, life });
  }
  match.pickups.length = 0;
  for (const [id, kind, x, z, spot] of snap.pickups) {
    match.pickups.push({ id, kind: kind === KIND_SCRAP ? 'scrap' : 'repair', x, z, spot });
  }
}
