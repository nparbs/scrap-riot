import { POWERUP_ORDER } from '../sim/data';
import type { Bot, GameEvent, Match, MineKind, PatchKind, Trap } from '../sim/match';
import type { SnapshotMessage } from './protocol';

// Bots travel as flat number arrays. A JSON object per robot at 20 Hz would be several times larger.
const MOTION = ['x', 'z', 'heading', 'vx', 'vz'] as const;
const STATE = [
  'hp', 'respawnT', 'meleeCd', 'defenseCd', 'shieldT', 'megaT', 'boostT', 'rageT', 'stunT',
  'invulnT', 'flashT', 'burnT', 'slowT', 'blindT', 'cloakT', 'xrayT', 'regenT', 'bladesT', 'kamikazeT',
  'meleeWindup', 'meleeSwing', 'lungeT', 'ammo', 'trapX', 'trapZ', 'strikeCd', 'slickCd', 'pullCd', 'airT', 'flipT', 'meleeCharge', 'hillScore', 'kills', 'assists', 'deaths', 'damageDealt', 'earned', 'eliminatedAt',
] as const;
const FLAGS = ['alive', 'out', 'forfeited', 'meleeActive', 'oiled', 'glued'] as const;

const FLAGS_AT = MOTION.length + STATE.length;
const POWERUPS_AT = FLAGS_AT + 1;

const PATCH_KINDS: PatchKind[] = ['oil', 'glue', 'nails'];
const MINE_KINDS: MineKind[] = ['mine', 'charge'];
const TRAP_KINDS: Trap['kind'][] = ['strike', 'pull'];
const KIND_REPAIR = 0;
const KIND_SCRAP = 1;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A hundredth of a radian is a visible twitch on the driver's own robot. */
function roundAngle(n: number): number {
  return Math.round(n * 1000) / 1000;
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
    countdown: round(match.countdown),
    bots: match.bots.map((bot) => {
      let flags = 0;
      FLAGS.forEach((key, i) => {
        if (bot[key]) flags |= 1 << i;
      });
      return [
        ...MOTION.map((key) => (key === 'heading' ? roundAngle(bot[key]) : round(bot[key]))),
        ...STATE.map((key) => round(bot[key])),
        flags,
        ...POWERUP_ORDER.map((id) => bot.powerups[id]),
      ];
    }),
    mines: match.mines.map((m) => [m.id, m.owner, round(m.x), round(m.z), round(m.armT), MINE_KINDS.indexOf(m.kind)]),
    oil: match.oil.map((p) => [p.id, p.owner, round(p.x), round(p.z), p.r, round(p.life), PATCH_KINDS.indexOf(p.kind)]),
    traps: match.traps.map((t) => [t.id, t.owner, TRAP_KINDS.indexOf(t.kind), round(t.x), round(t.z), round(t.t)]),
    drones: match.drones.map((d) => [d.id, d.owner, round(d.x), round(d.z), round(d.heading)]),
    pickups: match.pickups.map((p) => [p.id, p.kind === 'scrap' ? KIND_SCRAP : KIND_REPAIR, round(p.x), round(p.z), p.spot]),
    events: compactEvents(events),
  };
}

export function readMotion(row: number[]): { x: number; z: number; heading: number; vx: number; vz: number } {
  return { x: row[0], z: row[1], heading: row[2], vx: row[3], vz: row[4] };
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

/** Rebuilds the shared lists the renderer reads. `ahead` brings timers up to the render time. */
export function applyWorldState(match: Match, snap: SnapshotMessage, ahead: number): void {
  match.mines.length = 0;
  for (const [id, owner, x, z, armT, kind] of snap.mines) {
    match.mines.push({ id, owner, kind: MINE_KINDS[kind], x, z, armT, life: 1, damage: 0, radius: 0 });
  }
  match.oil.length = 0;
  for (const [id, owner, x, z, r, life, kind] of snap.oil) {
    match.oil.push({ id, owner, kind: PATCH_KINDS[kind], x, z, r, life, damage: 0 });
  }
  match.traps.length = 0;
  for (const [id, owner, kind, x, z, t] of snap.traps) {
    match.traps.push({ id, owner, kind: TRAP_KINDS[kind], x, z, t: Math.max(0, t - ahead) });
  }
  match.drones.length = 0;
  for (const [id, owner, x, z, heading] of snap.drones) {
    match.drones.push({ id, owner, x, z, heading, life: 1, damage: 0, radius: 0 });
  }
  match.pickups.length = 0;
  for (const [id, kind, x, z, spot] of snap.pickups) {
    match.pickups.push({ id, kind: kind === KIND_SCRAP ? 'scrap' : 'repair', x, z, spot });
  }
}
