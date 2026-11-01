import { closestOnBlock, rayBlock, sawPos, shockerActive, type Block, ballHeight, ballPos, BALL_HIT_HEIGHT, BALL_RADIUS, HAMMER_WARN, hammerClock, solidGround, trapdoorWarning } from './arena';
import { DEFENSES, MELEE } from './data';
import { bearing, wrapAngle, type Bot, type Match } from './match';

const THINK_INTERVAL = 0.2;
const RETARGET_INTERVAL = 1.5;
/** How wide a berth to give big obstacles when driving round them. */
/** How much room a robot keeps between itself and a ledge, and how far before that it slows for a turn. */
/** How close to a bridge's middle counts as being on it, and how far along it the far bank is. */
const CROSSING_REACHED = 3.5;
const CROSSING_FAR_SIDE = 7;
/** How far ahead a bot looks for a drop on a map that isn't a plain square. */
const ROOM_LOOKAHEAD = 24;
const EDGE_CLEARANCE = 3;
const EDGE_SLOW_ZONE = 6;
const ROUTE_MARGIN = 1.5;
const ROUTE_REACHED = 2;
const CHASER_PENALTY = 7;
const LEADER_PULL = 1.2;

/** Drives one bot by writing to its input, exactly as the keyboard does for the player. */
export class BotBrain {
  private thinkT = 0;
  private retargetT = 0;
  private target: Bot | null = null;
  private goalX = 0;
  private goalZ = 0;
  private stuckT = 0;
  private reverseT = 0;
  private strafeSign: number;
  /** Who this robot is after, so the others can spread out rather than all pile on one. */
  get targetId(): number {
    return this.target?.id ?? -1;
  }

  constructor(
    private readonly match: Match,
    private readonly bot: Bot,
    /** 0..1. Lower skill means slower decisions and sloppier weapon and powerup use. */
    private readonly skill: number,
  ) {
    this.strafeSign = match.rng() < 0.5 ? -1 : 1;
  }

  update(dt: number): void {
    this.thinkT -= dt;
    this.retargetT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = THINK_INTERVAL * (1.6 - this.skill);
      this.think();
    }
    this.steer(dt);
    this.fight();
  }

  /** Heading for a bridge, rather than straight for the goal. */
  private crossing = false;

  private think(): void {
    const { bot, match } = this;
    if (this.retargetT <= 0 || !this.target?.alive || !match.canSee(bot, this.target)) {
      this.retargetT = RETARGET_INTERVAL;
      this.target = this.pickTarget();
    }

    const hurt = bot.hp / bot.maxHp < 0.35;
    const repair = hurt ? this.nearestPickup('repair') : null;
    const scrap = this.nearestPickup('scrap');
    if (bot.clawTarget >= 0 && !match.arena.walled) {
      // Holding a robot on a map with edges, so take it to the nearest one.
      const { half } = match.arena;
      if (Math.abs(bot.x) > Math.abs(bot.z)) this.setGoal(Math.sign(bot.x) * half, bot.z);
      else this.setGoal(bot.x, Math.sign(bot.z) * half);
    } else if (repair) {
      this.setGoal(repair.x, repair.z);
    } else if (match.mode === 'koth' && !hurt) {
      this.setGoal(match.arena.hill.x, match.arena.hill.z);
    } else if (scrap && Math.hypot(scrap.x - bot.x, scrap.z - bot.z) < 10) {
      this.setGoal(scrap.x, scrap.z);
    } else if (this.target) {
      // Every build closes in, because the real damage is up close.
      this.setGoal(this.target.x, this.target.z);
    } else {
      this.setGoal(0, 0);
    }

    this.usePowerups();
    if (match.rng() < 0.05) this.strafeSign *= -1;
  }

  /** Never drive toward a goal past a ledge, even if the target is hanging over one. */
  private setGoal(x: number, z: number): void {
    const { half, walled } = this.match.arena;
    const limit = walled ? half : half - 4;
    const goalX = Math.max(-limit, Math.min(limit, x));
    const goalZ = Math.max(-limit, Math.min(limit, z));
    const crossing = this.crossingToward(goalX, goalZ);
    this.crossing = crossing !== null;
    if (crossing) {
      this.goalX = crossing.x;
      this.goalZ = crossing.z;
      return;
    }
    const corner = this.cornerAround(goalX, goalZ, limit);
    this.goalX = corner ? corner.x : goalX;
    this.goalZ = corner ? corner.z : goalZ;
  }

  /** The bridge to head for if there's a chasm on the way to the goal, or null if there isn't. */
  private crossingToward(goalX: number, goalZ: number): { x: number; z: number } | null {
    const { bot, match } = this;
    const { chasms, crossings } = match.arena;
    if (chasms.length === 0) return null;
    const dist = Math.hypot(goalX - bot.x, goalZ - bot.z);
    if (dist < 1e-3) return null;
    const dirX = (goalX - bot.x) / dist;
    const dirZ = (goalZ - bot.z) / dist;
    const blocked = chasms.some((chasm) => {
      const t = rayBlock({ ...chasm, w: chasm.w + bot.radius, d: chasm.d + bot.radius }, bot.x, bot.z, dirX, dirZ);
      return t !== null && t < dist;
    });
    if (!blocked) return null;
    let best: { x: number; z: number } | null = null;
    let bestCost = Infinity;
    for (const bridge of crossings) {
      const cost = Math.hypot(bridge.x - bot.x, bridge.z - bot.z) + Math.hypot(goalX - bridge.x, goalZ - bridge.z);
      if (cost >= bestCost) continue;
      bestCost = cost;
      // Once on it, on across to the far side, which is the way the goal lies.
      const near = Math.hypot(bridge.x - bot.x, bridge.z - bot.z) < CROSSING_REACHED;
      best = near ? { x: bridge.x + Math.sign(goalX - bridge.x || 1) * CROSSING_FAR_SIDE, z: bridge.z } : bridge;
    }
    return best;
  }

  /** The way round the first big obstacle in the way, or null if the path is clear. */
  private cornerAround(goalX: number, goalZ: number, limit: number): { x: number; z: number } | null {
    const { bot, match } = this;
    const dist = Math.hypot(goalX - bot.x, goalZ - bot.z);
    if (dist < 1e-3) return null;
    const dirX = (goalX - bot.x) / dist;
    const dirZ = (goalZ - bot.z) / dist;
    const clearance = bot.radius + ROUTE_MARGIN;
    let nearest: Block | null = null;
    let nearestT = dist;
    for (const block of match.arena.blocks) {
      const padded = { ...block, w: block.w + clearance * 2 - ROUTE_MARGIN, d: block.d + clearance * 2 - ROUTE_MARGIN };
      const t = rayBlock(padded, bot.x, bot.z, dirX, dirZ);
      if (t !== null && t < nearestT) {
        nearest = block;
        nearestT = t;
      }
    }
    if (!nearest) return null;
    let best: { x: number; z: number } | null = null;
    let bestCost = Infinity;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = nearest.x + sx * (nearest.w / 2 + clearance);
        const z = nearest.z + sz * (nearest.d / 2 + clearance);
        // Skip corners off the map, and the one the robot has effectively reached.
        if (Math.abs(x) > limit || Math.abs(z) > limit) continue;
        const toCorner = Math.hypot(x - bot.x, z - bot.z);
        if (toCorner < ROUTE_REACHED) continue;
        const cost = toCorner + Math.hypot(goalX - x, goalZ - z);
        if (cost < bestCost) {
          bestCost = cost;
          best = { x, z };
        }
      }
    }
    return best;
  }

  private pickTarget(): Bot | null {
    const { bot, match } = this;
    let best: Bot | null = null;
    let bestScore = Infinity;
    for (const other of match.bots) {
      if (other === bot || !other.alive || !match.canSee(bot, other)) continue;
      let score = Math.hypot(other.x - bot.x, other.z - bot.z) + other.hp * 0.08;
      if (other.id === bot.lastAttacker) score -= 10;
      // In a crowd, go for whoever isn't already being chased, and lean toward whoever's winning.
      score += match.chasersOf(other.id, bot.id) * CHASER_PENALTY;
      score -= other.kills * LEADER_PULL;
      score += match.rng() * 6;
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    return best;
  }

  private nearestPickup(kind: 'repair' | 'scrap') {
    const { bot, match } = this;
    let best = null;
    let bestDist = Infinity;
    for (const p of match.pickups) {
      if (p.kind !== kind) continue;
      const d = Math.hypot(p.x - bot.x, p.z - bot.z);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  private steer(dt: number): void {
    const { bot, match } = this;
    const { arena } = match;
    let dirX = this.goalX - bot.x;
    let dirZ = this.goalZ - bot.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;

    const repel = (x: number, z: number, r: number, reach: number, strength: number) => {
      const dx = bot.x - x;
      const dz = bot.z - z;
      const dist = Math.hypot(dx, dz);
      const gap = dist - r - bot.radius;
      if (gap > reach || dist < 1e-4) return;
      const force = strength * (1 - Math.max(gap, 0) / reach);
      dirX += (dx / dist) * force;
      dirZ += (dz / dist) * force;
    };
    // Sliding on ice means reacting to hazards from much further away.
    const caution = arena.grip < 0.5 ? 2 : 1;
    for (const pillar of arena.pillars) repel(pillar.x, pillar.z, pillar.r, 5, 1.6);
    for (const block of arena.blocks) {
      const near = closestOnBlock(block, bot.x, bot.z);
      repel(near.x, near.z, 0, 4, 2);
    }
    for (const saw of arena.saws) {
      const pos = sawPos(saw, match.time);
      repel(pos.x, pos.z, 1.7, 5, 2.2);
    }
    for (const pit of arena.pits) repel(pit.x, pit.z, pit.r, 6 * caution, 4);
    for (const door of arena.trapdoors) {
      if (trapdoorWarning(door, match.time + 1) > 0) repel(door.x, door.z, door.r, 6 * caution, 4);
    }
    for (const chasm of arena.chasms) {
      const near = closestOnBlock(chasm, bot.x, bot.z);
      // Shying away this far would stop it ever getting onto a bridge, which runs right between two of them.
      if (this.crossing) repel(near.x, near.z, 0, 2, 1.5);
      else repel(near.x, near.z, 0, 6 * caution, 4);
    }
    if (arena.shape === 'plus') {
      // The cut-away corners are drops like any other.
      const arm = arena.arm!;
      const size = arena.half - arm;
      const middle = arm + size / 2;
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const near = closestOnBlock({ x: sx * middle, z: sz * middle, w: size, d: size }, bot.x, bot.z);
        repel(near.x, near.z, 0, 6 * caution, 4);
      }
    }
    for (const hammer of arena.hammers) {
      if (hammerClock(hammer, match.time) > hammer.period - HAMMER_WARN) repel(hammer.x, hammer.z, hammer.r, 3, 3);
    }
    for (const ball of arena.balls) {
      const soon = ballPos(ball, match.time + 0.5);
      if (ballHeight(ball, soon.along) < BALL_HIT_HEIGHT) repel(soon.x, soon.z, BALL_RADIUS, 4, 3);
    }
    for (const grinder of arena.grinders) {
      const near = closestOnBlock(grinder, bot.x, bot.z);
      repel(near.x, near.z, 0, 3, 2);
    }
    for (const fire of arena.firePits) repel(fire.x, fire.z, fire.r, 4, 2);
    for (const coil of arena.shockers) {
      if (shockerActive(coil, match.time + 1)) repel(coil.x, coil.z, coil.r, 3, 2.5);
    }
    for (const sentry of arena.sentries) repel(sentry.x, sentry.z, sentry.range, 3, 2);
    for (const mine of match.mines) {
      if (mine.owner !== bot.id) repel(mine.x, mine.z, 1, 3 * this.skill, 1.5);
    }
    for (const patch of match.oil) {
      if (patch.owner !== bot.id) repel(patch.x, patch.z, patch.r, 1.5 * this.skill, 1);
    }

    const margin = arena.walled ? 5 : 8 * caution;
    const pull = arena.walled ? 0.4 : 1;
    const wall = arena.half - margin;
    if (bot.x > wall) dirX -= (bot.x - wall) * pull;
    if (bot.x < -wall) dirX += (-wall - bot.x) * pull;
    if (bot.z > wall) dirZ -= (bot.z - wall) * pull;
    if (bot.z < -wall) dirZ += (-wall - bot.z) * pull;
    if (arena.shape === 'round') {
      const out = Math.hypot(bot.x, bot.z);
      if (out > wall) {
        dirX -= (bot.x / out) * (out - wall) * pull;
        dirZ -= (bot.z / out) * (out - wall) * pull;
      }
    }

    const speed = Math.hypot(bot.vx, bot.vz);
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      bot.input.throttle = !arena.walled && this.roomTo(-1) < EDGE_CLEARANCE ? 1 : -1;
      bot.input.steer = this.strafeSign;
      return;
    }
    this.stuckT = speed < 1.5 ? this.stuckT + dt : 0;
    if (this.stuckT > 1) {
      this.stuckT = 0;
      this.reverseT = 0.8;
    }

    const diff = wrapAngle(Math.atan2(dirX, dirZ) - bot.heading);
    bot.input.steer = Math.max(-1, Math.min(1, diff * 3));
    bot.input.throttle = Math.abs(diff) > 1.4 ? 0.25 : 1;
    if (!arena.walled) this.mindTheEdge(diff, caution);
  }

  /**
   * Robots can't turn on the spot, so a ledge has to be dealt with early: slow down to tighten the
   * turn, and if there's no room left to make it, back away first.
   */
  private mindTheEdge(diff: number, caution: number): void {
    const { bot } = this;
    const forward = bot.vx * Math.sin(bot.heading) + bot.vz * Math.cos(bot.heading);
    const stopping = (forward * Math.abs(forward) * 0.5) / Math.max(bot.chassis.accel * this.match.arena.grip, 1);
    const ahead = this.roomTo(1);
    if (ahead < (EDGE_CLEARANCE + Math.max(stopping, 0)) * caution && this.roomTo(-1) > EDGE_CLEARANCE) {
      bot.input.throttle = -1;
      // Steering works the other way round in reverse, and this swings the nose toward the goal.
      bot.input.steer = -bot.input.steer;
    } else if (ahead < (EDGE_CLEARANCE + EDGE_SLOW_ZONE + Math.max(stopping, 0)) * caution && Math.abs(diff) > 0.25) {
      bot.input.throttle = Math.min(bot.input.throttle, 0.35);
    }
  }

  /** How far the robot can roll, forward (1) or back (-1), before it reaches the edge of the map. */
  private roomTo(direction: 1 | -1): number {
    const { bot, match } = this;
    const dx = Math.sin(bot.heading) * direction;
    const dz = Math.cos(bot.heading) * direction;
    const limit = match.arena.half - bot.radius;
    const across = dx > 1e-6 ? (limit - bot.x) / dx : dx < -1e-6 ? (-limit - bot.x) / dx : Infinity;
    const along = dz > 1e-6 ? (limit - bot.z) / dz : dz < -1e-6 ? (-limit - bot.z) / dz : Infinity;
    const room = Math.min(across, along);
    const { arena } = match;
    if (arena.shape === 'square' && arena.chasms.length === 0) return room;
    // Anything other than a plain square gets walked along to find the drop.
    for (let d = 1; d < Math.min(room, ROOM_LOOKAHEAD); d++) {
      if (!solidGround(arena, bot.x + dx * d, bot.z + dz * d)) return Math.max(0, d - bot.radius);
    }
    return room;
  }

  private fight(): void {
    const { bot } = this;
    const target = this.target;
    bot.input.melee = false;
    bot.input.defense = false;
    if (!target || !target.alive) {
      bot.input.boost = false;
      return;
    }

    const dist = Math.hypot(target.x - bot.x, target.z - bot.z);
    const angle = Math.abs(wrapAngle(bearing(bot.x, bot.z, target.x, target.z) - bot.heading));
    const melee = MELEE[bot.loadout.melee];
    switch (melee.kind) {
      case 'ram':
        bot.input.melee = dist < 10 && angle < 0.25;
        break;
      case 'magnet':
        bot.input.melee = dist < melee.range && angle < melee.arc;
        break;
      case 'spinner':
        // Spin up on the way in, so the weapon is at speed when it arrives.
        bot.input.melee = dist < 16;
        break;
      default:
        bot.input.melee = dist - target.radius < melee.range && angle < melee.arc;
    }

    bot.input.boost = dist > 12 && angle < 0.3 && bot.ammo > 0.4;

    bot.input.defense = this.wantsDefense(target, dist, angle);
  }

  private wantsDefense(target: Bot, dist: number, angle: number): boolean {
    const { bot, match } = this;
    const health = bot.hp / bot.maxHp;
    const recentlyHit = match.time - bot.lastHitT < 0.5;
    const def = DEFENSES[bot.loadout.defense];
    switch (bot.loadout.defense) {
      case 'shield':
        return recentlyHit && health < 0.7;
      case 'mines':
      case 'oil':
      case 'glue':
      case 'nails':
        return dist < 9 && angle > 2.2;
      case 'blades':
      case 'cutter':
        return dist - target.radius - bot.radius < def.radius;
      case 'teleport':
        return (health < 0.4 && recentlyHit) || (dist > 18 && angle < 0.2);
      case 'flash':
      case 'emp':
        return dist < def.radius * 0.7;
      case 'regen':
        return health < 0.6;
      case 'cloak':
        return health < 0.45 && recentlyHit;
      case 'minibot':
        return dist < 24;
      case 'remote': {
        const charge = match.mines.find((m) => m.owner === bot.id && m.kind === 'charge');
        if (!charge) return dist < 12 && angle > 1.5;
        return match.bots.some((o) => o !== bot && o.alive && Math.hypot(o.x - charge.x, o.z - charge.z) < charge.radius * 0.7);
      }
      case 'kamikaze':
        return health < 0.2 && dist < def.radius * 0.6;
      case 'steelram':
      case 'plow':
        return false;
    }
  }

  private usePowerups(): void {
    const { bot, match, target } = this;
    if (match.rng() > this.skill) return;
    const dist = target ? Math.hypot(target.x - bot.x, target.z - bot.z) : Infinity;
    const health = bot.hp / bot.maxHp;
    const p = bot.powerups;
    if (health < 0.4 && p.repair > 0) bot.input.powerup = 'repair';
    else if (health < 0.5 && dist < 12 && p.megashield > 0) bot.input.powerup = 'megashield';
    else if (dist < 9 && health > 0.4 && p.rage > 0) bot.input.powerup = 'rage';
    else if (health < 0.3 && p.cloaking > 0) bot.input.powerup = 'cloaking';
    else if (!target && p.xray > 0) bot.input.powerup = 'xray';
    else if (bot.ammo < 0.15 && p.battery > 0) bot.input.powerup = 'battery';
  }
}
