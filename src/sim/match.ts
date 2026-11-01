import {
  ARENAS,
  closestOnBlock,
  FIRE_DPS,
  PISTON_ACTIVE,
  PISTON_DAMAGE,
  PISTON_FORCE,
  PISTON_RADIUS,
  PISTON_REACH,
  pistonExtension,
  SAW_DPS,
  TRAP_NAMES,
  SAW_KNOCK,
  SAW_RADIUS,
  sawPos,
  SENTRY_DPS,
  SHOCK_DPS,
  SHOCK_STUN,
  shockerActive,
  type ArenaDef,
  type ArenaId,
  ballHeight,
  ballPos,
  BALL_DAMAGE,
  BALL_FORCE,
  BALL_HIT_HEIGHT,
  BALL_RADIUS,
  GRINDER_DPS,
  GRINDER_PUSH,
  HAMMER_DAMAGE,
  HAMMER_HIT,
  HAMMER_STUN,
  hammerClock,
  LAUNCH_AIR,
  LAUNCH_MIN_SPEED,
  LAUNCH_SPEED,
  onDeck,
  overChasm,
  solidGround,
  trapdoorOpen,
  VENT_MULT,
  ventErupting,
} from './arena';
import { BotBrain } from './ai';
import {
  BATTERY_REGEN,
  BOOST_ACCEL,
  BOOST_DRAIN,
  BOOST_SPEED,
  BURN_DPS,
  BURN_TIME,
  buildStats,
  CHASSIS,
  carriedPowerups,
  CLOAK_TIME,
  CROWD_SPLASH,
  DEFENSES,
  DUEL_OUTRO,
  FLIP_TIME,
  FORFEIT_OUTRO,
  HILL_CROWD,
  HILL_TARGET,
  HILL_TARGET_CROWD,
  MATCH,
  MEGA_ABSORB,
  MEGA_TIME,
  MELEE,
  MODES,
  RAGE_MULT,
  RAGE_TIME,
  REPAIR_FRACTION,
  REWARD,
  SPECTATE,
  TRAP,
  SPINNER_KEPT_SPEED,
  SPINNER_MIN_SPEED,
  SPINNER_RECOIL,
  STUN_GUARD,
  UPGRADES,
  XRAY_TIME,
  type ChassisDef,
  type ChassisId,
  type DefenseId,
  type EngineId,
  type MeleeId,
  type ModeId,
  type Paint,
  type PowerId,
  type PowerupId,
  type TowerId,
  type UpgradeId,
  type WheelsId,
} from './data';
import { makeRng, type Rng } from './rng';

export const STEP = 1 / 60;
/** How fast a robot must be rolling, forward or back, to turn at its full rate. */
const TURN_FULL_SPEED = 4;
/** Below ramming speed. */
const MAGNET_PULL_SPEED = 4.5;

export interface Loadout {
  chassis: ChassisId;
  melee: MeleeId;
  defense: DefenseId;
  powerups: Record<PowerupId, number>;
  /** Which powerups go into a match, in slot order. */
  powerupSlots?: PowerupId[];
  upgrades: Record<UpgradeId, number>;
  paint?: Paint;
  /** The front weapon faces backward, for fighting while reversing away. */
  rearMelee?: boolean;
  tower?: TowerId;
  wheels?: WheelsId;
  engine?: EngineId;
  power?: PowerId;
  armour?: number;
}

export interface BotInput {
  throttle: number;
  /** +1 turns left, -1 turns right. */
  steer: number;
  melee: boolean;
  defense: boolean;
  /** Held for a burst of speed, paid for from the battery. */
  boost: boolean;
  /** One-shot; the sim clears it after reading. */
  powerup: PowerupId | null;
}

export interface Bot {
  id: number;
  name: string;
  color: number;
  loadout: Loadout;
  chassis: ChassisDef;
  isAI: boolean;
  /** Drawn at this scale. Above 1 for bosses. */
  size: number;
  input: BotInput;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  heading: number;
  prevHeading: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  speedMult: number;
  damageMult: number;
  /** From the power source. */
  batteryRegen: number;
  radius: number;
  mass: number;
  alive: boolean;
  /** Eliminated for good in Last Robot Standing. */
  out: boolean;
  /** Surrendered or walked away, rather than being beaten. */
  forfeited: boolean;
  eliminatedAt: number;
  respawnT: number;
  meleeCd: number;
  meleeWindup: number;
  /** Seconds since the last strike, used to animate the swing. */
  meleeSwing: number;
  meleeActive: boolean;
  /** How fast a spinner is turning, from 0 to 1. */
  meleeCharge: number;
  lungeT: number;
  clawTarget: number;
  clawT: number;
  /** The battery, from 0 to 1. It runs the boost and powered weapons. */
  ammo: number;
  /** How long a held weapon has been running without a break. */
  heldT: number;
  /** Where a knocked-out pilot's target marker is, and how long until each trap is ready. */
  trapX: number;
  trapZ: number;
  strikeCd: number;
  slickCd: number;
  pullCd: number;
  /** Seconds left in the air after being thrown. Nothing can steer in the air. */
  airT: number;
  /** Seconds until a flipped robot is back on its wheels, counting the time in the air. It's stunned throughout. */
  flipT: number;
  defenseCd: number;
  /** Stops a held key from repeating actions like planting and detonating charges. */
  defenseHeld: boolean;
  shieldT: number;
  megaT: number;
  /** Above zero while the boost is running. */
  boostT: number;
  rageT: number;
  stunT: number;
  /** While this runs, new stuns are shorter. */
  stunGuardT: number;
  invulnT: number;
  ramCd: number;
  pistonCd: number;
  flashT: number;
  burnT: number;
  burnSource: number;
  slowT: number;
  blindT: number;
  cloakT: number;
  xrayT: number;
  regenT: number;
  bladesT: number;
  kamikazeT: number;
  lastHitT: number;
  lastAttacker: number;
  oiled: boolean;
  glued: boolean;
  hillScore: number;
  powerups: Record<PowerupId, number>;
  kills: number;
  assists: number;
  deaths: number;
  damageDealt: number;
  earned: number;
}

export type MineKind = 'mine' | 'charge';

export interface Mine {
  id: number;
  owner: number;
  kind: MineKind;
  x: number;
  z: number;
  armT: number;
  life: number;
  damage: number;
  radius: number;
}

export type PatchKind = 'oil' | 'glue' | 'nails';

export interface OilPatch {
  id: number;
  owner: number;
  kind: PatchKind;
  x: number;
  z: number;
  r: number;
  life: number;
  damage: number;
}

export interface Drone {
  id: number;
  owner: number;
  x: number;
  z: number;
  heading: number;
  life: number;
  damage: number;
  radius: number;
}

export interface Pickup {
  id: number;
  kind: 'repair' | 'scrap';
  x: number;
  z: number;
  /** Which repair spot it occupies, or -1 for scrap. */
  spot: number;
}

export type GameEvent =
  | { type: 'hit'; x: number; z: number; amount: number; target: number; source: number; shielded: boolean }
  | { type: 'explosion'; x: number; z: number; big: boolean }
  | { type: 'arc'; points: { x: number; z: number }[]; owner: number }
  | { type: 'strike'; x: number; z: number; owner: number }
  | { type: 'kill'; killer: number; victim: number; fell: boolean; x: number; z: number; vx: number; vz: number }
  | { type: 'spawn'; bot: number }
  | { type: 'pickup'; bot: number; kind: 'repair' | 'scrap'; x: number; z: number }
  | { type: 'powerup'; bot: number; kind: PowerupId }
  | { type: 'defense'; bot: number; kind: DefenseId }
  | { type: 'teleport'; x1: number; z1: number; x2: number; z2: number }
  | { type: 'pulse'; x: number; z: number; radius: number; color: number };

export interface BotSetup {
  name: string;
  color: number;
  loadout: Loadout;
  isAI: boolean;
  skill?: number;
  /** Career bosses are tougher and physically bigger. */
  boss?: { hpMult: number; size: number };
}

export interface Trap {
  id: number;
  owner: number;
  kind: 'strike' | 'pull';
  x: number;
  z: number;
  /** Seconds until a strike lands, or until a pull lets go. */
  t: number;
}

export interface MatchOptions {
  seed: number;
  arena?: ArenaId;
  mode?: ModeId;
  duration?: number;
  killTarget?: number;
  hillTarget?: number;
  /** Seconds everyone waits on the start line. */
  countdown?: number;
}

export interface Standing {
  bot: Bot;
  place: number;
  bonus: number;
  total: number;
}

export function emptyInput(): BotInput {
  return { throttle: 0, steer: 0, melee: false, defense: false, boost: false, powerup: null };
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

export function bearing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

/** Where a point lies relative to the way a robot faces: 0 ahead, positive to its left. */
export function relativeBearing(x: number, z: number, heading: number, toX: number, toZ: number): number {
  return wrapAngle(bearing(x, z, toX, toZ) - heading);
}

export class Match {
  readonly rng: Rng;
  readonly arena: ArenaDef;
  readonly mode: ModeId;
  readonly bots: Bot[] = [];
  readonly mines: Mine[] = [];
  readonly oil: OilPatch[] = [];
  readonly traps: Trap[] = [];
  readonly drones: Drone[] = [];
  readonly pickups: Pickup[] = [];
  readonly duration: number;
  readonly killTarget: number;
  readonly hillTarget: number;
  time = 0;
  over = false;
  /** Both pilots agreed to call it off. */
  drawn = false;
  private decidedAt: number | null = null;
  private events: GameEvent[] = [];
  private brains = new Map<number, BotBrain>();
  private nextId = 1;
  /** Who last hurt each robot, and when, for assists. */
  private readonly attackers = new Map<number, Map<number, number>>();
  /** More robots go through more repairs, so they turn up more often in a big match. */
  private readonly repairEvery: number;
  /** Seconds left before anything moves. */
  countdown: number;
  private repairTimer: number = MATCH.repairInterval / 2;

  constructor(setups: BotSetup[], options: MatchOptions) {
    this.rng = makeRng(options.seed);
    this.arena = ARENAS[options.arena ?? 'pit'];
    this.mode = options.mode ?? 'ffa';
    this.countdown = options.countdown ?? 0;
    this.duration = options.duration ?? MODES[this.mode].duration;
    this.killTarget = options.killTarget ?? MATCH.killTarget;
    this.hillTarget = options.hillTarget ?? (setups.length >= HILL_CROWD ? HILL_TARGET_CROWD : HILL_TARGET);
    this.repairEvery = MATCH.repairInterval * Math.min(1, 4 / Math.max(1, setups.length));
    setups.forEach((setup, id) => {
      const bot = this.createBot(id, setup);
      this.bots.push(bot);
      if (setup.isAI) this.brains.set(id, new BotBrain(this, bot, setup.skill ?? 0.6));
    });
    this.bots.forEach((bot, i) => {
      const spawn = this.arena.spawns[i % this.arena.spawns.length];
      this.place(bot, spawn.x, spawn.z);
    });
  }

  private createBot(id: number, setup: BotSetup): Bot {
    const stats = buildStats(setup.loadout);
    // Each robot gets its own copy, tuned by the parts bolted onto it.
    const chassis = { ...CHASSIS[setup.loadout.chassis], speed: stats.speed, accel: stats.accel, turn: stats.turn, mass: stats.mass };
    const up = setup.loadout.upgrades;
    const size = setup.boss?.size ?? 1;
    const maxHp = stats.hp * (1 + UPGRADES.armor.perLevel * up.armor) * (setup.boss?.hpMult ?? 1);
    return {
      id,
      name: setup.name,
      color: setup.color,
      loadout: setup.loadout,
      chassis,
      isAI: setup.isAI,
      size,
      input: emptyInput(),
      x: 0, z: 0, prevX: 0, prevZ: 0, heading: 0, prevHeading: 0, vx: 0, vz: 0,
      hp: maxHp,
      maxHp,
      speedMult: 1 + UPGRADES.engine.perLevel * up.engine,
      damageMult: 1 + UPGRADES.weapons.perLevel * up.weapons,
      batteryRegen: stats.regen,
      radius: chassis.radius * size,
      mass: chassis.mass * size,
      alive: true, out: false, forfeited: false, eliminatedAt: 0, respawnT: 0,
      meleeCd: 0, meleeWindup: 0, meleeSwing: 99, meleeActive: false, meleeCharge: 0, lungeT: 0, clawTarget: -1, clawT: 0,
      ammo: 1, heldT: 0, trapX: 0, trapZ: 0, strikeCd: 0, slickCd: 0, pullCd: 0, airT: 0, flipT: 0, defenseCd: 0, defenseHeld: false,
      shieldT: 0, megaT: 0, boostT: 0, rageT: 0, stunT: 0, stunGuardT: 0,
      invulnT: MATCH.spawnInvuln,
      ramCd: 0, pistonCd: 0, flashT: 0, burnT: 0, burnSource: -1, slowT: 0, blindT: 0,
      cloakT: 0, xrayT: 0, regenT: 0, bladesT: 0, kamikazeT: 0,
      lastHitT: -99, lastAttacker: -1, oiled: false, glued: false, hillScore: 0,
      powerups: carriedPowerups(setup.loadout),
      kills: 0, assists: 0, deaths: 0, damageDealt: 0, earned: 0,
    };
  }

  private place(bot: Bot, x: number, z: number): void {
    bot.x = bot.prevX = x;
    bot.z = bot.prevZ = z;
    bot.heading = bot.prevHeading = bearing(x, z, 0, 0);
    bot.vx = bot.vz = 0;
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Clients receive events over the network instead of generating them. */
  pushEvents(events: GameEvent[]): void {
    this.events.push(...events);
  }

  /** Hands a robot to the AI when its player drops, and back when they return. */
  setAI(id: number, ai: boolean, skill = 0.6): void {
    const bot = this.bots[id];
    bot.isAI = ai;
    if (ai) {
      this.brains.set(id, new BotBrain(this, bot, skill));
    } else {
      this.brains.delete(id);
      bot.input = emptyInput();
    }
  }

  get timeLeft(): number {
    return Math.max(0, this.duration - this.time);
  }

  /** One life each, in the modes where being destroyed puts a robot out. */
  private get oneLife(): boolean {
    return this.mode === 'lms' || this.mode === 'duel';
  }

  /** A robot gives up. The match then ends the same way as if it had been destroyed. */
  forfeit(id: number): void {
    const bot = this.bots[id];
    if (bot.out) return;
    bot.out = true;
    bot.forfeited = true;
    bot.alive = false;
    bot.hp = 0;
    bot.eliminatedAt = this.time;
    this.events.push({ type: 'explosion', x: bot.x, z: bot.z, big: true });
  }

  /** The number shown on the scoreboard for this mode. */
  score(bot: Bot): number {
    return this.mode === 'koth' ? Math.floor(bot.hillScore) : bot.kills;
  }

  /** How many bots, other than the one asking, are already after this robot. */
  chasersOf(target: number, asking: number): number {
    let count = 0;
    for (const [id, brain] of this.brains) {
      if (id !== asking && brain.targetId === target) count++;
    }
    return count;
  }

  /** Can this robot see and target the other one? */
  canSee(bot: Bot, other: Bot): boolean {
    return other.cloakT <= 0 || bot.xrayT > 0;
  }

  step(dt: number = STEP): void {
    if (this.over) return;
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - dt);
      return;
    }
    this.time += dt;

    for (const bot of this.bots) {
      bot.prevX = bot.x;
      bot.prevZ = bot.z;
      bot.prevHeading = bot.heading;
      if (bot.out) {
        this.updateSpectator(bot, dt);
        continue;
      }
      if (!bot.alive) {
        bot.respawnT -= dt;
        if (bot.respawnT <= 0) this.respawn(bot);
        continue;
      }
      this.brains.get(bot.id)?.update(dt);
      this.tickTimers(bot, dt);
      this.usePowerup(bot);
      this.drive(bot, dt);
      this.updateMelee(bot, dt);
      this.updateDefense(bot, dt);
    }

    this.collideBots();
    this.collideWorld();
    this.updateHazards(dt);
    this.updateMines(dt);
    this.updatePatches(dt);
    this.updateDrones(dt);
    this.updateTraps(dt);
    this.updatePickups(dt);
    this.updateHill(dt);
    this.checkEnd();
  }

  private checkEnd(): void {
    if (this.time >= this.duration) this.over = true;
    if (this.mode === 'ffa' && this.bots.some((b) => b.kills >= this.killTarget)) this.over = true;
    if (this.mode === 'koth' && this.bots.some((b) => b.hillScore >= this.hillTarget)) this.over = true;
    if (this.mode === 'lms' && this.bots.filter((b) => !b.out).length <= 1) this.over = true;
    if (this.mode === 'duel' && this.bots.filter((b) => !b.out).length <= 1) {
      this.decidedAt ??= this.time;
      const outro = this.bots.some((b) => b.forfeited) ? FORFEIT_OUTRO : DUEL_OUTRO;
      if (this.time - this.decidedAt >= outro) this.over = true;
    }
  }

  private updateHill(dt: number): void {
    if (this.mode !== 'koth') return;
    const { hill } = this.arena;
    const inside = this.bots.filter((b) => b.alive && Math.hypot(b.x - hill.x, b.z - hill.z) < hill.r);
    // Sharing the zone splits the points, so a crowded hill still moves toward a winner.
    for (const bot of inside) {
      bot.hillScore += dt / inside.length;
      bot.earned += (REWARD.hillPerSecond * dt) / inside.length;
    }
  }

  private tickTimers(bot: Bot, dt: number): void {
    const down = (v: number) => Math.max(0, v - dt);
    bot.meleeCd = down(bot.meleeCd);
    bot.defenseCd = down(bot.defenseCd);
    bot.shieldT = down(bot.shieldT);
    bot.megaT = down(bot.megaT);
    bot.boostT = down(bot.boostT);
    bot.airT = down(bot.airT);
    bot.flipT = down(bot.flipT);
    bot.rageT = down(bot.rageT);
    bot.stunT = down(bot.stunT);
    bot.stunGuardT = down(bot.stunGuardT);
    bot.invulnT = down(bot.invulnT);
    bot.ramCd = down(bot.ramCd);
    bot.pistonCd = down(bot.pistonCd);
    bot.flashT = down(bot.flashT);
    bot.lungeT = down(bot.lungeT);
    bot.slowT = down(bot.slowT);
    bot.blindT = down(bot.blindT);
    bot.cloakT = down(bot.cloakT);
    bot.xrayT = down(bot.xrayT);
    bot.bladesT = down(bot.bladesT);
    bot.meleeSwing += dt;
    // No recharging while the key is held, or an empty battery would flicker the boost on and off.
    if (bot.input.boost) {
      if (bot.ammo > 0 && bot.stunT <= 0 && bot.airT <= 0) {
        bot.ammo = Math.max(0, bot.ammo - BOOST_DRAIN * dt);
        bot.boostT = 0.12;
      }
    } else {
      bot.ammo = Math.min(1, bot.ammo + BATTERY_REGEN * bot.batteryRegen * dt);
    }

    if (bot.burnT > 0) {
      bot.burnT = down(bot.burnT);
      this.damage(bot, BURN_DPS * dt, bot.burnSource);
    }
    if (bot.regenT > 0) {
      bot.regenT = down(bot.regenT);
      bot.hp = Math.min(bot.maxHp, bot.hp + DEFENSES.regen.damage * dt);
    }
  }

  private usePowerup(bot: Bot): void {
    const kind = bot.input.powerup;
    bot.input.powerup = null;
    if (!kind || bot.powerups[kind] <= 0 || bot.stunT > 0) return;
    if (kind === 'repair' && bot.hp >= bot.maxHp) return;
    if (kind === 'battery' && bot.ammo >= 1) return;
    bot.powerups[kind]--;
    switch (kind) {
      case 'repair':
        bot.hp = Math.min(bot.maxHp, bot.hp + bot.maxHp * REPAIR_FRACTION);
        break;
      case 'battery':
        bot.ammo = 1;
        break;
      case 'rage':
        bot.rageT = RAGE_TIME;
        break;
      case 'megashield':
        bot.megaT = MEGA_TIME;
        break;
      case 'cloaking':
        bot.cloakT = CLOAK_TIME;
        break;
      case 'xray':
        bot.xrayT = XRAY_TIME;
        break;
    }
    this.events.push({ type: 'powerup', bot: bot.id, kind });
  }

  private patchUnder(bot: Bot, kind: PatchKind): boolean {
    return this.oil.some((p) => p.kind === kind && p.owner !== bot.id && Math.hypot(p.x - bot.x, p.z - bot.z) < p.r);
  }

  private drive(bot: Bot, dt: number): void {
    // Thrown robots just follow their arc until they land.
    if (bot.airT > 0) {
      bot.x += bot.vx * dt;
      bot.z += bot.vz * dt;
      return;
    }
    const input = bot.input;
    const stunned = bot.stunT > 0;
    const throttle = stunned ? 0 : Math.max(-1, Math.min(1, input.throttle));
    const steer = stunned ? 0 : Math.max(-1, Math.min(1, input.steer));

    bot.oiled = this.patchUnder(bot, 'oil');
    bot.glued = this.patchUnder(bot, 'glue');
    const c = bot.chassis;
    let top = c.speed * bot.speedMult;
    const boosting = !stunned && input.boost && bot.ammo > 0;
    if (boosting) top *= BOOST_SPEED;
    if (bot.oiled) top *= 0.6;
    if (bot.glued) top *= 0.35;
    if (bot.slowT > 0) top *= 0.55;
    const reverse = throttle < 0 ? 0.65 : 1;
    const grip = this.arena.grip * (bot.oiled ? 0.35 : 1);

    // Wheels only turn a robot that's rolling. Reversing steers the way a car does, so the tail goes where you steer.
    const rolling = bot.vx * Math.sin(bot.heading) + bot.vz * Math.cos(bot.heading);
    const turning = Math.max(-1, Math.min(1, rolling / TURN_FULL_SPEED));
    bot.heading = wrapAngle(bot.heading + steer * turning * c.turn * (bot.oiled ? 1.35 : 1) * dt);
    const fx = Math.sin(bot.heading);
    const fz = Math.cos(bot.heading);
    const lx = fz;
    const lz = -fx;
    let forward = bot.vx * fx + bot.vz * fz;
    let lateral = bot.vx * lx + bot.vz * lz;

    const target = throttle * top * reverse;
    const accel = c.accel * bot.speedMult * grip * (boosting ? BOOST_ACCEL : 1);
    if (bot.lungeT <= 0) {
      const delta = target - forward;
      forward += Math.sign(delta) * Math.min(Math.abs(delta), accel * dt);
    }
    lateral *= Math.exp(-7 * grip * dt);

    bot.vx = fx * forward + lx * lateral;
    bot.vz = fz * forward + lz * lateral;
    bot.x += bot.vx * dt;
    bot.z += bot.vz * dt;
  }

  /** Client-side prediction: moves one robot as the server would, ignoring other robots. */
  predict(bot: Bot, throttle: number, steer: number, boost: boolean, dt: number): void {
    if (this.countdown > 0) return;
    bot.input.throttle = throttle;
    bot.input.steer = steer;
    bot.input.boost = boost;
    this.drive(bot, dt);
    this.collideBotWithWorld(bot);
  }

  private damageOutput(bot: Bot): number {
    return bot.damageMult * (bot.rageT > 0 ? RAGE_MULT : 1);
  }

  private inCone(bot: Bot, other: Bot, angle: number, range: number, arc: number): boolean {
    const dist = Math.hypot(other.x - bot.x, other.z - bot.z) - other.radius;
    if (dist > range) return false;
    return Math.abs(wrapAngle(bearing(bot.x, bot.z, other.x, other.z) - angle)) <= arc;
  }

  /** A second stun soon after the first is much shorter. The guard keeps running through the first stun. */
  private stun(target: Bot, seconds: number): void {
    if (seconds <= 0) return;
    const applied = target.stunGuardT > 0 ? seconds * STUN_GUARD.share : seconds;
    if (target.stunGuardT <= 0) target.stunGuardT = seconds + STUN_GUARD.time;
    target.stunT = Math.max(target.stunT, applied);
  }

  private enemies(bot: Bot): Bot[] {
    return this.bots.filter((other) => other !== bot && other.alive);
  }

  private meleeAngle(bot: Bot): number {
    return bot.loadout.rearMelee ? wrapAngle(bot.heading + Math.PI) : bot.heading;
  }

  /** Defenses always go on the side the main weapon isn't. */
  private defenseAngle(bot: Bot): number {
    return wrapAngle(this.meleeAngle(bot) + Math.PI);
  }

  private updateMelee(bot: Bot, dt: number): void {
    const facing = this.meleeAngle(bot);
    const id = bot.loadout.melee;
    const def = MELEE[id];
    const pressed = (bot.input.melee || !!def.passive) && bot.stunT <= 0;
    bot.meleeActive = false;

    switch (def.kind) {
      case 'held':
        if (!pressed) {
          bot.heldT = 0;
          return;
        }
        if (bot.meleeCd > 0) return;
        if (def.drain) {
          if (bot.ammo < def.drain * dt) return;
          bot.ammo -= def.drain * dt;
        }
        if (def.runTime) {
          bot.heldT += dt;
          if (bot.heldT >= def.runTime) {
            bot.heldT = 0;
            bot.meleeCd = def.cooldown;
            return;
          }
        }
        bot.meleeActive = true;
        for (const other of this.enemies(bot)) {
          if (!this.inCone(bot, other, facing, def.range, def.arc)) continue;
          this.damage(other, def.damage * this.damageOutput(bot) * dt, bot.id);
          if (def.slow) other.slowT = Math.max(other.slowT, def.slow);
          if (def.burns) {
            other.burnT = BURN_TIME;
            other.burnSource = bot.id;
          }
        }
        return;
      case 'ram':
        if (pressed && bot.meleeCd <= 0) {
          bot.meleeCd = def.cooldown;
          bot.lungeT = 0.35;
          bot.meleeSwing = 0;
          bot.vx += Math.sin(facing) * def.knockback;
          bot.vz += Math.cos(facing) * def.knockback;
          this.events.push({ type: 'strike', x: bot.x, z: bot.z, owner: bot.id });
        }
        return;
      case 'claw':
        this.updateClaw(bot, pressed, dt);
        return;
      case 'spinner':
        this.updateSpinner(bot, pressed, dt);
        return;
      case 'magnet':
        if (!pressed) return;
        bot.meleeActive = true;
        {
          // It grabs one robot at a time, the nearest, so it can't farm a whole crowd.
          let other: Bot | null = null;
          let dist = Infinity;
          for (const candidate of this.enemies(bot)) {
            if (!this.canSee(bot, candidate) || !this.inCone(bot, candidate, facing, def.range, def.arc)) continue;
            const gap = Math.hypot(candidate.x - bot.x, candidate.z - bot.z) || 1;
            if (gap < dist) {
              dist = gap;
              other = candidate;
            }
          }
          if (!other) return;
          // Dragged no faster than a crawl, or arriving would count as being rammed by it.
          const towardX = (bot.x - other.x) / dist;
          const towardZ = (bot.z - other.z) / dist;
          if (other.vx * towardX + other.vz * towardZ < MAGNET_PULL_SPEED) {
            const pull = (def.knockback / other.mass) * dt;
            other.vx += towardX * pull;
            other.vz += towardZ * pull;
          }
          if (dist - other.radius - bot.radius < 2) this.damage(other, def.damage * this.damageOutput(bot) * dt, bot.id);
        }
        return;
      case 'strike':
        break;
    }

    if (def.saw && pressed) {
      bot.meleeActive = true;
      for (const other of this.enemies(bot)) {
        if (this.inCone(bot, other, facing, def.range, def.arc)) this.damage(other, def.saw * this.damageOutput(bot) * dt, bot.id);
      }
    }

    if (bot.meleeWindup > 0) {
      bot.meleeWindup -= dt;
      if (bot.meleeWindup <= 0) {
        bot.meleeSwing = 0;
        const fx = Math.sin(facing);
        const fz = Math.cos(facing);
        this.events.push({ type: 'strike', x: bot.x + fx * (bot.radius + 1.5), z: bot.z + fz * (bot.radius + 1.5), owner: bot.id });
        const struck: Bot[] = [];
        for (const other of this.enemies(bot)) {
          if (!this.inCone(bot, other, facing, def.range, def.arc)) continue;
          struck.push(other);
          this.damage(other, def.damage * this.damageOutput(bot), bot.id);
          this.stun(other, def.stun);
          other.vx += (fx * def.knockback) / other.mass;
          other.vz += (fz * def.knockback) / other.mass;
          if (def.launch && other.invulnT <= 0) {
            other.airT = Math.max(other.airT, def.launch);
            if (def.flips) {
              other.flipT = other.airT + FLIP_TIME;
              other.stunT = Math.max(other.stunT, other.flipT);
            }
          }
        }
        if (def.chain) this.chainStrike(bot, struck, def.chain, def.damage * this.damageOutput(bot) * 0.5, def.stun);
      }
    } else if (pressed && bot.meleeCd <= 0 && bot.ammo >= (def.battery ?? 0)) {
      bot.ammo -= def.battery ?? 0;
      bot.meleeCd = def.cooldown;
      bot.meleeWindup = def.windup;
    }
  }

  /** A Tesla bolt: to each robot it hit, and on from the first of them to one more. */
  private chainStrike(bot: Bot, struck: Bot[], reach: number, damage: number, stun: number): void {
    const facing = this.meleeAngle(bot);
    const muzzle = { x: bot.x + Math.sin(facing) * (bot.radius + 0.4), z: bot.z + Math.cos(facing) * (bot.radius + 0.4) };
    if (struck.length === 0) {
      const range = MELEE[bot.loadout.melee].range;
      this.events.push({ type: 'arc', points: [muzzle, { x: muzzle.x + Math.sin(facing) * range, z: muzzle.z + Math.cos(facing) * range }], owner: bot.id });
      return;
    }
    const [first] = struck;
    const points = [muzzle, { x: first.x, z: first.z }];
    const next = this.bots.find((o) => o !== bot && o.alive && !struck.includes(o) && Math.hypot(o.x - first.x, o.z - first.z) < reach);
    if (next) {
      this.damage(next, damage, bot.id);
      this.stun(next, stun);
      points.push({ x: next.x, z: next.z });
    }
    this.events.push({ type: 'arc', points, owner: bot.id });
  }

  /** Holding the key stores energy, and a hit spends most of it, throwing both robots apart. */
  private updateSpinner(bot: Bot, pressed: boolean, dt: number): void {
    const def = MELEE[bot.loadout.melee];
    // It can't be spun back up until the cooldown from its last hit is over.
    const spinning = pressed && bot.meleeCd <= 0;
    const change = spinning ? dt / def.windup : -dt / (def.windup * 2);
    bot.meleeCharge = Math.max(0, Math.min(1, bot.meleeCharge + change));
    bot.meleeActive = spinning;
    if (bot.meleeCharge < SPINNER_MIN_SPEED || bot.meleeCd > 0) return;
    const facing = this.meleeAngle(bot);
    const target = this.enemies(bot).find((other) => other.invulnT <= 0 && this.inCone(bot, other, facing, def.range, def.arc));
    if (!target) return;
    const speed = bot.meleeCharge;
    const dist = Math.hypot(target.x - bot.x, target.z - bot.z) || 1;
    const nx = (target.x - bot.x) / dist;
    const nz = (target.z - bot.z) / dist;
    this.damage(target, def.damage * speed * this.damageOutput(bot), bot.id);
    const throwForce = def.knockback * speed;
    target.vx += (nx * throwForce) / target.mass;
    target.vz += (nz * throwForce) / target.mass;
    this.stun(target, def.stun * speed);
    if (def.slow) target.slowT = Math.max(target.slowT, def.slow);
    // A weak hit doesn't get anything off the ground.
    if (def.launch && speed > 0.5) target.airT = Math.max(target.airT, def.launch * speed);
    bot.vx -= (nx * throwForce * SPINNER_RECOIL) / bot.mass;
    bot.vz -= (nz * throwForce * SPINNER_RECOIL) / bot.mass;
    bot.meleeCharge = speed * SPINNER_KEPT_SPEED;
    bot.meleeCd = def.cooldown;
    bot.meleeSwing = 0;
    this.events.push({ type: 'strike', x: target.x, z: target.z, owner: bot.id });
  }

  private updateClaw(bot: Bot, pressed: boolean, dt: number): void {
    const facing = this.meleeAngle(bot);
    const def = MELEE[bot.loadout.melee];
    const holding = bot.clawTarget >= 0 ? this.bots[bot.clawTarget] : null;
    if (holding) {
      bot.clawT -= dt;
      if (!pressed || !holding.alive || bot.clawT <= 0) {
        bot.clawTarget = -1;
        bot.meleeCd = def.cooldown;
        return;
      }
      bot.meleeActive = true;
      const reach = bot.radius + holding.radius + 0.4;
      holding.x = bot.x + Math.sin(facing) * reach;
      holding.z = bot.z + Math.cos(facing) * reach;
      holding.vx = bot.vx;
      holding.vz = bot.vz;
      holding.stunT = Math.max(holding.stunT, 0.1);
      this.damage(holding, def.damage * this.damageOutput(bot) * dt, bot.id);
      return;
    }
    if (!pressed || bot.meleeCd > 0) return;
    const target = this.enemies(bot).find((other) => this.inCone(bot, other, facing, def.range, def.arc));
    if (target && target.invulnT <= 0) {
      bot.clawTarget = target.id;
      // The def's windup field holds the maximum grip time for this weapon.
      bot.clawT = def.windup;
      bot.meleeSwing = 0;
      target.lastAttacker = bot.id;
      this.events.push({ type: 'strike', x: target.x, z: target.z, owner: bot.id });
    }
  }

  private updateDefense(bot: Bot, dt: number): void {
    const id = bot.loadout.defense;
    const def = DEFENSES[id];

    if (bot.kamikazeT > 0) {
      bot.kamikazeT -= dt;
      if (bot.kamikazeT <= 0) {
        this.explode(bot.x, bot.z, def.damage * this.damageOutput(bot), def.radius, bot.id, true);
        this.destroy(bot, false);
      }
      return;
    }
    if (bot.bladesT > 0) {
      for (const other of this.enemies(bot)) {
        const gap = Math.hypot(other.x - bot.x, other.z - bot.z) - other.radius - bot.radius;
        if (gap < def.radius) this.damage(other, def.damage * this.damageOutput(bot) * dt, bot.id);
      }
    }

    const pressed = bot.input.defense && !bot.defenseHeld;
    bot.defenseHeld = bot.input.defense;
    if (def.passive || !bot.input.defense || bot.defenseCd > 0 || bot.stunT > 0) return;
    // Only these two care about a fresh press. The rest fire whenever they're ready.
    if ((id === 'remote' || id === 'kamikaze') && !pressed) return;

    const dropAngle = this.defenseAngle(bot);
    const dropX = bot.x + Math.sin(dropAngle) * (bot.radius + 1);
    const dropZ = bot.z + Math.cos(dropAngle) * (bot.radius + 1);
    const pushPatch = (kind: PatchKind) =>
      this.oil.push({ id: this.nextId++, owner: bot.id, kind, x: dropX, z: dropZ, r: def.radius, life: def.duration, damage: def.damage });

    switch (id) {
      case 'shield':
        bot.shieldT = def.duration;
        break;
      case 'mines': {
        const own = this.mines.filter((m) => m.owner === bot.id);
        if (own.length >= 3) this.mines.splice(this.mines.indexOf(own[0]), 1);
        this.mines.push({
          id: this.nextId++, owner: bot.id, kind: 'mine', x: dropX, z: dropZ, armT: 0.6,
          life: def.duration, damage: def.damage * this.damageOutput(bot), radius: def.radius,
        });
        break;
      }
      case 'oil':
        pushPatch('oil');
        break;
      case 'glue':
        pushPatch('glue');
        break;
      case 'nails':
        pushPatch('nails');
        break;
      case 'blades':
        bot.bladesT = def.duration;
        break;
      case 'cutter':
        for (const other of this.enemies(bot)) {
          const dist = Math.hypot(other.x - bot.x, other.z - bot.z);
          if (dist - other.radius > def.radius) continue;
          this.damage(other, def.damage * this.damageOutput(bot), bot.id);
          const n = dist || 1;
          other.vx += (((other.x - bot.x) / n) * 16) / other.mass;
          other.vz += (((other.z - bot.z) / n) * 16) / other.mass;
        }
        this.events.push({ type: 'pulse', x: bot.x, z: bot.z, radius: def.radius, color: 0xdfe5ea });
        break;
      case 'teleport':
        if (!this.teleport(bot, def.radius)) return;
        break;
      case 'flash':
        for (const other of this.enemies(bot)) {
          if (Math.hypot(other.x - bot.x, other.z - bot.z) > def.radius) continue;
          other.blindT = def.duration;
          other.slowT = Math.max(other.slowT, def.duration);
        }
        this.events.push({ type: 'pulse', x: bot.x, z: bot.z, radius: def.radius, color: 0xffffff });
        break;
      case 'regen':
        bot.regenT = def.duration;
        break;
      case 'cloak':
        bot.cloakT = def.duration;
        break;
      case 'emp':
        for (const other of this.enemies(bot)) {
          if (Math.hypot(other.x - bot.x, other.z - bot.z) <= def.radius) this.stun(other, def.duration);
        }
        this.events.push({ type: 'pulse', x: bot.x, z: bot.z, radius: def.radius, color: 0x7fe8ff });
        break;
      case 'minibot':
        this.drones.push({
          id: this.nextId++, owner: bot.id, x: dropX, z: dropZ, heading: dropAngle,
          life: def.duration, damage: def.damage * this.damageOutput(bot), radius: def.radius,
        });
        break;
      case 'remote': {
        const charges = this.mines.filter((m) => m.owner === bot.id && m.kind === 'charge');
        const armed = charges.filter((m) => m.armT <= 0);
        if (armed.length > 0) {
          for (const charge of armed) {
            this.mines.splice(this.mines.indexOf(charge), 1);
            this.explode(charge.x, charge.z, charge.damage, charge.radius, bot.id, false);
          }
        } else if (charges.length === 0) {
          this.mines.push({
            id: this.nextId++, owner: bot.id, kind: 'charge', x: dropX, z: dropZ, armT: 0.4,
            life: def.duration, damage: def.damage * this.damageOutput(bot), radius: def.radius,
          });
        }
        break;
      }
      case 'kamikaze':
        bot.kamikazeT = def.duration;
        break;
      case 'steelram':
      case 'plow':
        return;
    }
    bot.defenseCd = def.cooldown;
    this.events.push({ type: 'defense', bot: bot.id, kind: id });
  }

  /** True if the point is safe ground, clear of edges, pits and pillars. */
  isSafeGround(x: number, z: number, radius: number): boolean {
    const { arena } = this;
    const limit = arena.half - radius - 0.5;
    if (Math.abs(x) > limit || Math.abs(z) > limit) return false;
    // Checked out at the robot's own width, so its wheels stay on the ground as well.
    const reach = radius + 0.5;
    for (const [dx, dz] of [[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach], [reach * 0.7, reach * 0.7], [reach * 0.7, -reach * 0.7], [-reach * 0.7, reach * 0.7], [-reach * 0.7, -reach * 0.7]]) {
      if (!solidGround(arena, x + dx, z + dz)) return false;
    }
    if (arena.pits.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + radius)) return false;
    if (arena.trapdoors.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + radius)) return false;
    if (arena.blocks.some((b) => {
      const near = closestOnBlock(b, x, z);
      return Math.hypot(near.x - x, near.z - z) < radius;
    })) return false;
    return !arena.pillars.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + radius);
  }

  private teleport(bot: Bot, distance: number): boolean {
    const fx = Math.sin(bot.heading);
    const fz = Math.cos(bot.heading);
    for (const reach of [distance, distance * 0.7, distance * 0.4]) {
      const x = bot.x + fx * reach;
      const z = bot.z + fz * reach;
      if (!this.isSafeGround(x, z, bot.radius)) continue;
      this.events.push({ type: 'teleport', x1: bot.x, z1: bot.z, x2: x, z2: z });
      bot.x = bot.prevX = x;
      bot.z = bot.prevZ = z;
      return true;
    }
    return false;
  }

  damage(target: Bot, amount: number, source: number): void {
    if (!target.alive || target.invulnT > 0 || amount <= 0) return;
    const attacker = source >= 0 ? this.bots[source] : undefined;

    let taken = amount;
    if (target.megaT > 0) taken *= 1 - MEGA_ABSORB;
    else if (target.shieldT > 0) taken *= 1 - MATCH.shieldAbsorb;
    if (target.loadout.defense === 'steelram' && attacker && attacker !== target) {
      const facing = Math.abs(relativeBearing(target.x, target.z, this.defenseAngle(target), attacker.x, attacker.z));
      if (facing < 0.9) taken *= DEFENSES.steelram.damage;
    }
    if (target.loadout.defense === 'plow' && attacker && attacker !== target) {
      const facing = Math.abs(relativeBearing(target.x, target.z, this.defenseAngle(target), attacker.x, attacker.z));
      if (facing < 0.9) taken *= DEFENSES.plow.damage;
    }
    const shielded = taken < amount;
    const dealt = Math.min(target.hp, taken);
    target.hp -= dealt;
    target.flashT = 0.12;
    target.lastHitT = this.time;
    if (attacker && attacker !== target) {
      target.lastAttacker = source;
      attacker.damageDealt += dealt;
      attacker.earned += dealt * REWARD.damage;
      // Protection and invisibility are for getting into a fight, not for having one.
      attacker.cloakT = 0;
      attacker.invulnT = 0;
      this.noteAttacker(target.id, source);
    }
    this.events.push({ type: 'hit', x: target.x, z: target.z, amount: dealt, target: target.id, source, shielded });
    if (target.hp <= 0) this.destroy(target, false);
  }

  private noteAttacker(victim: number, attacker: number): void {
    let recent = this.attackers.get(victim);
    if (!recent) this.attackers.set(victim, (recent = new Map()));
    recent.set(attacker, this.time);
  }

  /** Everyone who helped gets something, so a brawl doesn't pay only whoever landed the last hit. */
  private creditAssists(victim: Bot, killer: Bot | undefined): void {
    const recent = this.attackers.get(victim.id);
    if (!recent) return;
    for (const [id, time] of recent) {
      if (id === killer?.id || this.time - time > MATCH.assistWindow) continue;
      this.bots[id].assists++;
      this.bots[id].earned += REWARD.assist;
    }
    recent.clear();
  }

  private destroy(bot: Bot, fell: boolean): void {
    if (!bot.alive) return;
    bot.alive = false;
    bot.hp = 0;
    bot.deaths++;
    bot.respawnT = MATCH.respawnTime;
    bot.meleeActive = false;
    bot.meleeWindup = 0;
    bot.clawTarget = -1;
    bot.kamikazeT = 0;
    bot.burnT = 0;
    if (this.oneLife) {
      bot.out = true;
      bot.eliminatedAt = this.time;
      bot.trapX = bot.x;
      bot.trapZ = bot.z;
    }
    const killer = bot.lastAttacker >= 0 && bot.lastAttacker !== bot.id ? this.bots[bot.lastAttacker] : undefined;
    if (killer) {
      killer.kills++;
      killer.earned += REWARD.kill;
    }
    this.creditAssists(bot, killer);
    // The explosion itself is drawn when the robot has finished tumbling, a moment from now.
    this.events.push({ type: 'kill', killer: killer ? killer.id : -1, victim: bot.id, fell, x: bot.x, z: bot.z, vx: bot.vx, vz: bot.vz });
    if (!fell) this.pickups.push({ id: this.nextId++, kind: 'scrap', x: bot.x, z: bot.z, spot: -1 });
  }

  private respawn(bot: Bot): void {
    // Spawn wherever is furthest from the nearest living robot.
    let bestSpawn = this.arena.spawns[0];
    let bestScore = -1;
    for (const spawn of this.arena.spawns) {
      let nearest = Infinity;
      for (const other of this.bots) {
        if (other === bot || !other.alive) continue;
        nearest = Math.min(nearest, Math.hypot(other.x - spawn.x, other.z - spawn.z));
      }
      if (nearest > bestScore) {
        bestScore = nearest;
        bestSpawn = spawn;
      }
    }
    this.place(bot, bestSpawn.x, bestSpawn.z);
    bot.alive = true;
    bot.hp = bot.maxHp;
    bot.invulnT = MATCH.spawnInvuln;
    bot.lastAttacker = -1;
    bot.stunT = bot.stunGuardT = bot.boostT = bot.rageT = bot.shieldT = bot.megaT = bot.airT = bot.flipT = bot.meleeCharge = 0;
    bot.slowT = bot.blindT = bot.cloakT = bot.bladesT = bot.regenT = 0;
    bot.ammo = 1;
    bot.heldT = 0;
    this.events.push({ type: 'spawn', bot: bot.id });
  }

  private collideBots(): void {
    for (let i = 0; i < this.bots.length; i++) {
      const a = this.bots[i];
      if (!a.alive || a.airT > 0) continue;
      for (let j = i + 1; j < this.bots.length; j++) {
        const b = this.bots[j];
        if (!b.alive || b.airT > 0) continue;
        // A robot in a claw is carried, so the claw shouldn't also shove it away.
        if (a.clawTarget === b.id || b.clawTarget === a.id) continue;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let dist = Math.hypot(dx, dz);
        const min = a.radius + b.radius;
        if (dist >= min) continue;
        if (dist < 1e-4) {
          dx = 1;
          dz = 0;
          dist = 1;
        }
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = min - Math.min(dist, min);
        const total = a.mass + b.mass;
        a.x -= nx * overlap * (b.mass / total);
        a.z -= nz * overlap * (b.mass / total);
        b.x += nx * overlap * (a.mass / total);
        b.z += nz * overlap * (a.mass / total);

        const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (closing <= 0) continue;
        this.ram(a, b, closing, nx, nz);
        this.ram(b, a, closing, -nx, -nz);
        const impulse = (1.3 * closing) / (1 / a.mass + 1 / b.mass);
        a.vx -= (impulse / a.mass) * nx;
        a.vz -= (impulse / a.mass) * nz;
        b.vx += (impulse / b.mass) * nx;
        b.vz += (impulse / b.mass) * nz;
        // A shove counts as an attack, so a robot pushed off a ledge credits whoever pushed it.
        b.lastAttacker = closing > 2 ? a.id : b.lastAttacker;
        a.lastAttacker = closing > 2 ? b.id : a.lastAttacker;
      }
    }
  }

  /** Only the robot whose nose is pointed at the other one deals ram damage. */
  private ram(attacker: Bot, victim: Bot, closing: number, nx: number, nz: number): void {
    if (closing < MATCH.ramMinSpeed || attacker.ramCd > 0) return;
    const facing = Math.sin(attacker.heading) * nx + Math.cos(attacker.heading) * nz;
    if (facing < 0.6) return;
    attacker.ramCd = MATCH.ramCooldown;
    const speed = Math.min(closing, MATCH.ramCapSpeed) - MATCH.ramMinSpeed;
    const spike = attacker.loadout.melee === 'ram' ? MATCH.spikeRamMult : 1;
    // Only a plate on the nose is leading the charge.
    const plate = attacker.loadout.defense === 'steelram' && attacker.loadout.rearMelee ? 1.3 : 1;
    const amount = speed * MATCH.ramDamage * attacker.mass * spike * plate * this.damageOutput(attacker);
    this.damage(victim, amount, attacker.id);
  }

  private collideWorld(): void {
    for (const bot of this.bots) {
      if (bot.alive) this.collideBotWithWorld(bot);
    }
  }

  private collideBotWithWorld(bot: Bot): void {
    const { arena } = this;
    if (arena.walled) {
      const limit = arena.half - bot.radius;
      if (bot.x > limit || bot.x < -limit) {
        bot.x = Math.max(-limit, Math.min(limit, bot.x));
        bot.vx *= -0.3;
      }
      if (bot.z > limit || bot.z < -limit) {
        bot.z = Math.max(-limit, Math.min(limit, bot.z));
        bot.vz *= -0.3;
      }
    }
    for (const pillar of arena.pillars) {
      const dx = bot.x - pillar.x;
      const dz = bot.z - pillar.z;
      const dist = Math.hypot(dx, dz);
      const min = pillar.r + bot.radius;
      if (dist >= min || dist < 1e-4) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      bot.x = pillar.x + nx * min;
      bot.z = pillar.z + nz * min;
      const into = bot.vx * nx + bot.vz * nz;
      if (into < 0) {
        bot.vx -= nx * into * 1.3;
        bot.vz -= nz * into * 1.3;
      }
    }
    for (const block of arena.blocks) this.collideBotWithBlock(bot, block);
  }

  private collideBotWithBlock(bot: Bot, block: ArenaDef['blocks'][number]): void {
    const near = closestOnBlock(block, bot.x, bot.z);
    let nx = bot.x - near.x;
    let nz = bot.z - near.z;
    const dist = Math.hypot(nx, nz);
    if (dist >= bot.radius) return;
    if (dist > 1e-4) {
      nx /= dist;
      nz /= dist;
      bot.x = near.x + nx * bot.radius;
      bot.z = near.z + nz * bot.radius;
    } else {
      // The center got inside, so leave by the nearest side.
      const overX = block.w / 2 - Math.abs(bot.x - block.x);
      const overZ = block.d / 2 - Math.abs(bot.z - block.z);
      if (overX < overZ) {
        nx = Math.sign(bot.x - block.x) || 1;
        nz = 0;
        bot.x = block.x + nx * (block.w / 2 + bot.radius);
      } else {
        nx = 0;
        nz = Math.sign(bot.z - block.z) || 1;
        bot.z = block.z + nz * (block.d / 2 + bot.radius);
      }
    }
    const into = bot.vx * nx + bot.vz * nz;
    if (into < 0) {
      bot.vx -= nx * into * 1.3;
      bot.vz -= nz * into * 1.3;
    }
  }

  /** A human knocked out of a match still running is paid to stay, and gets to play with the map. */
  private updateSpectator(bot: Bot, dt: number): void {
    if (this.mode !== 'lms' || bot.isAI || bot.forfeited) return;
    bot.earned += SPECTATE.payPerSecond * dt;
    bot.strikeCd = Math.max(0, bot.strikeCd - dt);
    bot.slickCd = Math.max(0, bot.slickCd - dt);
    bot.pullCd = Math.max(0, bot.pullCd - dt);

    const { input } = bot;
    const limit = this.arena.half;
    const clamp = (n: number) => Math.max(-limit, Math.min(limit, n));
    // The camera looks along +z from above, so these match the screen.
    bot.trapX = clamp(bot.trapX + Math.max(-1, Math.min(1, input.steer)) * SPECTATE.markerSpeed * dt);
    bot.trapZ = clamp(bot.trapZ + Math.max(-1, Math.min(1, input.throttle)) * SPECTATE.markerSpeed * dt);

    if (input.melee && bot.strikeCd <= 0) {
      bot.strikeCd = TRAP.strike.cooldown;
      this.traps.push({ id: this.nextId++, owner: bot.id, kind: 'strike', x: bot.trapX, z: bot.trapZ, t: TRAP.strike.warning });
    }
    if (input.boost && bot.slickCd <= 0) {
      bot.slickCd = TRAP.slick.cooldown;
      this.oil.push({ id: this.nextId++, owner: bot.id, kind: TRAP_NAMES[this.arena.id].patch, x: bot.trapX, z: bot.trapZ, r: TRAP.slick.radius, life: TRAP.slick.life, damage: 0 });
    }
    if (input.defense && bot.pullCd <= 0) {
      bot.pullCd = TRAP.pull.cooldown;
      this.traps.push({ id: this.nextId++, owner: bot.id, kind: 'pull', x: bot.trapX, z: bot.trapZ, t: TRAP.pull.life });
    }
  }

  private updateTraps(dt: number): void {
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const trap = this.traps[i];
      trap.t -= dt;
      for (const bot of this.bots) {
        if (!bot.alive || bot.airT > 0) continue;
        const dx = bot.x - trap.x;
        const dz = bot.z - trap.z;
        const dist = Math.hypot(dx, dz) || 1;
        if (trap.kind === 'pull' && dist < TRAP.pull.radius) {
          bot.vx -= (dx / dist) * (TRAP.pull.force / bot.mass) * dt;
          bot.vz -= (dz / dist) * (TRAP.pull.force / bot.mass) * dt;
        } else if (trap.kind === 'strike' && trap.t <= 0 && dist < TRAP.strike.radius + bot.radius) {
          this.damage(bot, TRAP.strike.damage, trap.owner);
          bot.vx += (dx / dist) * (TRAP.strike.knockback / bot.mass);
          bot.vz += (dz / dist) * (TRAP.strike.knockback / bot.mass);
        }
      }
      if (trap.t > 0) continue;
      if (trap.kind === 'strike') this.events.push({ type: 'explosion', x: trap.x, z: trap.z, big: false });
      this.traps.splice(i, 1);
    }
  }

  private updateHazards(dt: number): void {
    const { arena } = this;
    const hurt = (bot: Bot, amount: number) => {
      const attacker = bot.lastAttacker;
      this.damage(bot, amount, -1);
      bot.lastAttacker = attacker;
    };

    for (const bot of this.bots) {
      if (!bot.alive) continue;

      // The center of the robot has to cross the edge, so wheels can hang over a little.
      const overEdge = !arena.walled && !onDeck(arena, bot.x, bot.z);
      const inPit = arena.pits.some((p) => Math.hypot(bot.x - p.x, bot.z - p.z) < p.r)
        || overChasm(arena, bot.x, bot.z)
        || arena.trapdoors.some((door) => trapdoorOpen(door, this.time) && Math.hypot(bot.x - door.x, bot.z - door.z) < door.r);
      // A thrown robot only falls once it comes down, so it can sail over a hole.
      if ((overEdge || inPit) && bot.clawTarget < 0 && bot.airT <= 0) {
        this.destroy(bot, true);
        continue;
      }

      for (const saw of arena.saws) {
        const pos = sawPos(saw, this.time);
        const dx = bot.x - pos.x;
        const dz = bot.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= SAW_RADIUS + bot.radius || dist < 1e-4) continue;
        hurt(bot, SAW_DPS * dt);
        bot.vx += (dx / dist) * SAW_KNOCK * dt * 8;
        bot.vz += (dz / dist) * SAW_KNOCK * dt * 8;
      }
      for (const fire of arena.firePits) {
        if (Math.hypot(bot.x - fire.x, bot.z - fire.z) < fire.r) hurt(bot, FIRE_DPS * (ventErupting(fire, this.time) ? VENT_MULT : 1) * dt);
      }
      for (const coil of arena.shockers) {
        if (!shockerActive(coil, this.time) || Math.hypot(bot.x - coil.x, bot.z - coil.z) >= coil.r) continue;
        hurt(bot, SHOCK_DPS * dt);
        bot.stunT = Math.max(bot.stunT, SHOCK_STUN);
      }
      for (const sentry of arena.sentries) {
        if (Math.hypot(bot.x - sentry.x, bot.z - sentry.z) < sentry.range) hurt(bot, SENTRY_DPS * dt);
      }
      for (const piston of arena.pistons) {
        const extension = pistonExtension(piston, this.time);
        if (bot.pistonCd > 0 || extension <= 0.2) continue;
        if ((this.time + piston.phase) % piston.period > PISTON_ACTIVE) continue;
        const headX = piston.x + piston.dirX * PISTON_REACH * extension;
        const headZ = piston.z + piston.dirZ * PISTON_REACH * extension;
        if (Math.hypot(bot.x - headX, bot.z - headZ) > PISTON_RADIUS + bot.radius) continue;
        bot.pistonCd = 1;
        hurt(bot, PISTON_DAMAGE);
        bot.vx += (piston.dirX * PISTON_FORCE) / bot.mass;
        bot.vz += (piston.dirZ * PISTON_FORCE) / bot.mass;
      }

      if (bot.airT <= 0) {
        for (const belt of arena.conveyors) {
          if (Math.abs(bot.x - belt.x) > belt.w / 2 || Math.abs(bot.z - belt.z) > belt.d / 2) continue;
          bot.x += belt.dirX * belt.speed * dt;
          bot.z += belt.dirZ * belt.speed * dt;
        }
        for (const ramp of arena.launchers) {
          if (bot.pistonCd > 0 || Math.hypot(bot.x - ramp.x, bot.z - ramp.z) > ramp.r) continue;
          if (bot.vx * ramp.dirX + bot.vz * ramp.dirZ < LAUNCH_MIN_SPEED) continue;
          bot.pistonCd = 0.6;
          bot.airT = LAUNCH_AIR;
          bot.vx = ramp.dirX * LAUNCH_SPEED;
          bot.vz = ramp.dirZ * LAUNCH_SPEED;
        }
      }
      for (const hammer of arena.hammers) {
        if (bot.pistonCd > 0 || hammerClock(hammer, this.time) > HAMMER_HIT || Math.hypot(bot.x - hammer.x, bot.z - hammer.z) > hammer.r) continue;
        bot.pistonCd = 1;
        hurt(bot, HAMMER_DAMAGE);
        bot.stunT = Math.max(bot.stunT, HAMMER_STUN);
      }
      for (const ball of arena.balls) {
        const now = ballPos(ball, this.time);
        if (bot.pistonCd > 0 || ballHeight(ball, now.along) > BALL_HIT_HEIGHT) continue;
        if (Math.hypot(bot.x - now.x, bot.z - now.z) > BALL_RADIUS + bot.radius) continue;
        // Knocked the way the ball is going.
        const next = ballPos(ball, this.time + 0.05);
        const dx = next.x - now.x;
        const dz = next.z - now.z;
        const travel = Math.hypot(dx, dz) || 1;
        bot.pistonCd = 1;
        hurt(bot, BALL_DAMAGE);
        bot.vx += (dx / travel) * BALL_FORCE / bot.mass;
        bot.vz += (dz / travel) * BALL_FORCE / bot.mass;
      }
      for (const grinder of arena.grinders) {
        const near = closestOnBlock(grinder, bot.x, bot.z);
        const dx = bot.x - near.x;
        const dz = bot.z - near.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= bot.radius || dist < 1e-4) continue;
        hurt(bot, GRINDER_DPS * dt);
        bot.vx += (dx / dist) * GRINDER_PUSH * dt;
        bot.vz += (dz / dist) * GRINDER_PUSH * dt;
      }

      for (const patch of this.oil) {
        if (patch.kind !== 'nails' || patch.owner === bot.id) continue;
        if (Math.hypot(bot.x - patch.x, bot.z - patch.z) < patch.r) this.damage(bot, patch.damage * dt, patch.owner);
      }
    }
  }

  /** Splash never hurts the robot that caused it. */
  explode(x: number, z: number, damage: number, radius: number, owner: number, big: boolean): void {
    this.events.push({ type: 'explosion', x, z, big });
    const caught = this.bots.filter((bot) => bot.id !== owner && bot.alive && Math.hypot(bot.x - x, bot.z - z) < radius + bot.radius);
    const crowd = 1 / (1 + CROWD_SPLASH * Math.max(0, caught.length - 1));
    for (const bot of caught) {
      const dist = Math.hypot(bot.x - x, bot.z - z);
      const reach = radius + bot.radius;
      const falloff = 1 - 0.6 * (dist / reach);
      this.damage(bot, damage * falloff * crowd, owner);
      const nx = dist > 1e-4 ? (bot.x - x) / dist : 1;
      const nz = dist > 1e-4 ? (bot.z - z) / dist : 0;
      bot.vx += (nx * 12 * falloff) / bot.mass;
      bot.vz += (nz * 12 * falloff) / bot.mass;
    }
  }

  private plowHits(bot: Bot, x: number, z: number, radius: number): boolean {
    if (bot.loadout.defense !== 'plow' || !bot.alive) return false;
    if (Math.hypot(bot.x - x, bot.z - z) >= radius + bot.radius + 0.5) return false;
    return Math.abs(relativeBearing(bot.x, bot.z, this.defenseAngle(bot), x, z)) < 1;
  }

  private updateMines(dt: number): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.armT -= dt;
      m.life -= dt;
      const plowed = this.bots.some((b) => b.id !== m.owner && this.plowHits(b, m.x, m.z, 1));
      if (m.life <= 0 || plowed) {
        this.mines.splice(i, 1);
        continue;
      }
      if (m.armT > 0 || m.kind === 'charge') continue;
      const tripped = this.bots.some(
        (b) => b.id !== m.owner && b.alive && Math.hypot(b.x - m.x, b.z - m.z) < 1 + b.radius,
      );
      if (tripped) {
        this.mines.splice(i, 1);
        this.explode(m.x, m.z, m.damage, m.radius, m.owner, false);
      }
    }
  }

  private updatePatches(dt: number): void {
    for (let i = this.oil.length - 1; i >= 0; i--) {
      const patch = this.oil[i];
      patch.life -= dt;
      const plowed = patch.kind === 'nails' && this.bots.some((b) => b.id !== patch.owner && this.plowHits(b, patch.x, patch.z, patch.r * 0.6));
      if (patch.life <= 0 || plowed) this.oil.splice(i, 1);
    }
  }

  private updateDrones(dt: number): void {
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const d = this.drones[i];
      d.life -= dt;
      const owner = this.bots[d.owner];
      const targets = this.enemies(owner).filter((b) => b.cloakT <= 0);
      let nearest: Bot | null = null;
      let best = Infinity;
      for (const b of targets) {
        const dist = Math.hypot(b.x - d.x, b.z - d.z);
        if (dist < best) {
          best = dist;
          nearest = b;
        }
      }
      if (nearest) {
        const diff = wrapAngle(bearing(d.x, d.z, nearest.x, nearest.z) - d.heading);
        d.heading = wrapAngle(d.heading + Math.max(-4 * dt, Math.min(4 * dt, diff)));
      }
      d.x += Math.sin(d.heading) * 13 * dt;
      d.z += Math.cos(d.heading) * 13 * dt;
      const contact = nearest !== null && best < nearest.radius + 0.6;
      if (d.life > 0 && !contact) continue;
      this.drones.splice(this.drones.indexOf(d), 1);
      this.explode(d.x, d.z, d.damage, d.radius, d.owner, false);
    }
  }

  private updatePickups(dt: number): void {
    const { arena } = this;
    this.repairTimer -= dt;
    if (this.repairTimer <= 0) {
      this.repairTimer = this.repairEvery;
      const free = arena.repairSpots
        .map((_, spot) => spot)
        .filter((spot) => !this.pickups.some((p) => p.spot === spot));
      if (free.length > 0) {
        const spot = free[Math.floor(this.rng() * free.length)];
        const pos = arena.repairSpots[spot];
        this.pickups.push({ id: this.nextId++, kind: 'repair', x: pos.x, z: pos.z, spot });
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const bot = this.bots.find((b) => b.alive && Math.hypot(b.x - p.x, b.z - p.z) < b.radius + 1);
      if (!bot) continue;
      if (p.kind === 'repair') {
        if (bot.hp >= bot.maxHp) continue;
        bot.hp = Math.min(bot.maxHp, bot.hp + bot.maxHp * REWARD.repairPickup);
      } else {
        bot.earned += REWARD.scrap;
      }
      this.events.push({ type: 'pickup', bot: bot.id, kind: p.kind, x: p.x, z: p.z });
      this.pickups.splice(i, 1);
    }
  }

  private rank(a: Bot, b: Bot): number {
    // Anyone who's out comes last, which outside the one-life modes means they left.
    if (a.out !== b.out) return a.out ? 1 : -1;
    if (this.oneLife && a.eliminatedAt !== b.eliminatedAt) return b.eliminatedAt - a.eliminatedAt;
    if (this.mode === 'koth' && a.hillScore !== b.hillScore) return b.hillScore - a.hillScore;
    // A duel that runs out of time goes to whoever has more armour left.
    if (this.mode === 'duel' && a.hp / a.maxHp !== b.hp / b.maxHp) return b.hp / b.maxHp - a.hp / a.maxHp;
    return b.kills - a.kills || b.assists - a.assists || b.damageDealt - a.damageDealt || a.id - b.id;
  }

  /** Current order, best first. */
  ranked(): Bot[] {
    return [...this.bots].sort((a, b) => this.rank(a, b));
  }

  private bonusFor(index: number): number {
    if (this.drawn) return 0;
    return (this.mode === 'duel' ? REWARD.duel : REWARD.placement)[index] ?? 0;
  }

  standings(): Standing[] {
    return this.ranked().map((bot, index) => {
      // Outside the one-life modes, being out means walking away, which earns no bonus.
      const bonus = bot.out && !this.oneLife ? 0 : this.bonusFor(index);
      const earned = Math.round(bot.earned + bonus);
      return { bot, place: this.drawn ? 1 : index + 1, bonus, total: bot.forfeited ? earned : Math.max(REWARD.minimum, earned) };
    });
  }
}

