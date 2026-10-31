import {
  ARENAS,
  FIRE_DPS,
  PISTON_ACTIVE,
  PISTON_DAMAGE,
  PISTON_FORCE,
  PISTON_RADIUS,
  PISTON_REACH,
  pistonExtension,
  SAW_DPS,
  SAW_KNOCK,
  SAW_RADIUS,
  sawPos,
  SENTRY_DPS,
  SHOCK_DPS,
  SHOCK_STUN,
  shockerActive,
  type ArenaDef,
  type ArenaId,
} from './arena';
import { BotBrain } from './ai';
import {
  AMMO_REGEN,
  BURN_DPS,
  BURN_TIME,
  CHASSIS,
  CLOAK_TIME,
  DEFENSES,
  HILL_TARGET,
  MATCH,
  MEGA_ABSORB,
  MEGA_TIME,
  MELEE,
  MODES,
  RAGE_MULT,
  RAGE_TIME,
  REPAIR_FRACTION,
  REWARD,
  TURBO_MULT,
  TURBO_TIME,
  TURRETS,
  UPGRADES,
  XRAY_TIME,
  type ChassisDef,
  type ChassisId,
  type DefenseId,
  type MeleeId,
  type ModeId,
  type Paint,
  type PowerupId,
  type TurretId,
  type UpgradeId,
} from './data';
import { makeRng, type Rng } from './rng';

export const STEP = 1 / 60;

export interface Loadout {
  chassis: ChassisId;
  melee: MeleeId;
  turret: TurretId;
  defense: DefenseId;
  powerups: Record<PowerupId, number>;
  upgrades: Record<UpgradeId, number>;
  paint?: Paint;
  /** The front weapon faces backward, for fighting while reversing away. */
  rearMelee?: boolean;
}

export interface BotInput {
  throttle: number;
  /** +1 turns left, -1 turns right. */
  steer: number;
  melee: boolean;
  turret: boolean;
  defense: boolean;
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
  turretAngle: number;
  /** Bot id the turret is currently tracking, or -1. */
  turretTarget: number;
  /** Radians between the barrel and its aim point. */
  turretError: number;
  hp: number;
  maxHp: number;
  speedMult: number;
  damageMult: number;
  radius: number;
  mass: number;
  alive: boolean;
  /** Eliminated for good in Last Robot Standing. */
  out: boolean;
  eliminatedAt: number;
  respawnT: number;
  meleeCd: number;
  meleeWindup: number;
  /** Seconds since the last strike, used to animate the swing. */
  meleeSwing: number;
  meleeActive: boolean;
  lungeT: number;
  clawTarget: number;
  clawT: number;
  ammo: number;
  turretFiring: boolean;
  turretCd: number;
  defenseCd: number;
  /** Stops a held key from repeating actions like planting and detonating charges. */
  defenseHeld: boolean;
  shieldT: number;
  megaT: number;
  turboT: number;
  rageT: number;
  stunT: number;
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
  deaths: number;
  damageDealt: number;
  earned: number;
}

export type ProjectileKind = 'bullet' | 'rocket' | 'homing' | 'mortar' | 'grenade' | 'disc' | 'spear';

export interface Projectile {
  id: number;
  owner: number;
  kind: ProjectileKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  /** Total flight time of a lobbed shell, or 0. Used to draw its arc. */
  flight: number;
  damage: number;
  splash: number;
  knockback: number;
  target: number;
  homing: number;
  bounces: number;
  /** Set once a disc has ricocheted, when it can hit whoever fired it. */
  ricocheted: boolean;
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
  | { type: 'shot'; x: number; z: number; owner: number; kind: TurretId }
  | { type: 'arc'; points: { x: number; z: number }[]; owner: number }
  | { type: 'beam'; x1: number; z1: number; x2: number; z2: number; owner: number }
  | { type: 'strike'; x: number; z: number; owner: number }
  | { type: 'kill'; killer: number; victim: number; fell: boolean }
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

export interface MatchOptions {
  seed: number;
  arena?: ArenaId;
  mode?: ModeId;
  duration?: number;
  killTarget?: number;
  hillTarget?: number;
}

export interface Standing {
  bot: Bot;
  place: number;
  bonus: number;
  total: number;
}

export function emptyInput(): BotInput {
  return { throttle: 0, steer: 0, melee: false, turret: false, defense: false, powerup: null };
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
  readonly projectiles: Projectile[] = [];
  readonly mines: Mine[] = [];
  readonly oil: OilPatch[] = [];
  readonly drones: Drone[] = [];
  readonly pickups: Pickup[] = [];
  readonly duration: number;
  readonly killTarget: number;
  readonly hillTarget: number;
  time = 0;
  over = false;
  private events: GameEvent[] = [];
  private brains = new Map<number, BotBrain>();
  private nextId = 1;
  private repairTimer: number = MATCH.repairInterval / 2;

  constructor(setups: BotSetup[], options: MatchOptions) {
    this.rng = makeRng(options.seed);
    this.arena = ARENAS[options.arena ?? 'pit'];
    this.mode = options.mode ?? 'ffa';
    this.duration = options.duration ?? MODES[this.mode].duration;
    this.killTarget = options.killTarget ?? MATCH.killTarget;
    this.hillTarget = options.hillTarget ?? HILL_TARGET;
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
    const chassis = CHASSIS[setup.loadout.chassis];
    const up = setup.loadout.upgrades;
    const size = setup.boss?.size ?? 1;
    const maxHp = chassis.hp * (1 + UPGRADES.armor.perLevel * up.armor) * (setup.boss?.hpMult ?? 1);
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
      turretAngle: 0, turretTarget: -1, turretError: 0,
      hp: maxHp,
      maxHp,
      speedMult: 1 + UPGRADES.engine.perLevel * up.engine,
      damageMult: 1 + UPGRADES.weapons.perLevel * up.weapons,
      radius: chassis.radius * size,
      mass: chassis.mass * size,
      alive: true, out: false, eliminatedAt: 0, respawnT: 0,
      meleeCd: 0, meleeWindup: 0, meleeSwing: 99, meleeActive: false, lungeT: 0, clawTarget: -1, clawT: 0,
      ammo: 1, turretFiring: false, turretCd: 0, defenseCd: 0, defenseHeld: false,
      shieldT: 0, megaT: 0, turboT: 0, rageT: 0, stunT: 0,
      invulnT: MATCH.spawnInvuln,
      ramCd: 0, pistonCd: 0, flashT: 0, burnT: 0, burnSource: -1, slowT: 0, blindT: 0,
      cloakT: 0, xrayT: 0, regenT: 0, bladesT: 0, kamikazeT: 0,
      lastHitT: -99, lastAttacker: -1, oiled: false, glued: false, hillScore: 0,
      powerups: { ...setup.loadout.powerups },
      kills: 0, deaths: 0, damageDealt: 0, earned: 0,
    };
  }

  private place(bot: Bot, x: number, z: number): void {
    bot.x = bot.prevX = x;
    bot.z = bot.prevZ = z;
    bot.heading = bot.prevHeading = bearing(x, z, 0, 0);
    bot.turretAngle = bot.heading;
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

  /** The number shown on the scoreboard for this mode. */
  score(bot: Bot): number {
    return this.mode === 'koth' ? Math.floor(bot.hillScore) : bot.kills;
  }

  /** Can this robot see and target the other one? */
  canSee(bot: Bot, other: Bot): boolean {
    return other.cloakT <= 0 || bot.xrayT > 0;
  }

  step(dt: number = STEP): void {
    if (this.over) return;
    this.time += dt;

    for (const bot of this.bots) {
      bot.prevX = bot.x;
      bot.prevZ = bot.z;
      bot.prevHeading = bot.heading;
      if (bot.out) continue;
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
      this.updateTurret(bot, dt);
      this.updateDefense(bot, dt);
    }

    this.collideBots();
    this.collideWorld();
    this.updateHazards(dt);
    this.updateProjectiles(dt);
    this.updateMines(dt);
    this.updatePatches(dt);
    this.updateDrones(dt);
    this.updatePickups(dt);
    this.updateHill(dt);
    this.checkEnd();
  }

  private checkEnd(): void {
    if (this.time >= this.duration) this.over = true;
    if (this.mode === 'ffa' && this.bots.some((b) => b.kills >= this.killTarget)) this.over = true;
    if (this.mode === 'koth' && this.bots.some((b) => b.hillScore >= this.hillTarget)) this.over = true;
    if (this.mode === 'lms' && this.bots.filter((b) => !b.out).length <= 1) this.over = true;
  }

  private updateHill(dt: number): void {
    if (this.mode !== 'koth') return;
    const { hill } = this.arena;
    const inside = this.bots.filter((b) => b.alive && Math.hypot(b.x - hill.x, b.z - hill.z) < hill.r);
    if (inside.length !== 1) return;
    inside[0].hillScore += dt;
    inside[0].earned += REWARD.hillPerSecond * dt;
  }

  private tickTimers(bot: Bot, dt: number): void {
    const down = (v: number) => Math.max(0, v - dt);
    bot.meleeCd = down(bot.meleeCd);
    bot.turretCd = down(bot.turretCd);
    bot.defenseCd = down(bot.defenseCd);
    bot.shieldT = down(bot.shieldT);
    bot.megaT = down(bot.megaT);
    bot.turboT = down(bot.turboT);
    bot.rageT = down(bot.rageT);
    bot.stunT = down(bot.stunT);
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
    bot.ammo = Math.min(1, bot.ammo + AMMO_REGEN * dt);

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
    bot.powerups[kind]--;
    switch (kind) {
      case 'repair':
        bot.hp = Math.min(bot.maxHp, bot.hp + bot.maxHp * REPAIR_FRACTION);
        break;
      case 'turbo':
        bot.turboT = TURBO_TIME;
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
    const input = bot.input;
    const stunned = bot.stunT > 0;
    const throttle = stunned ? 0 : Math.max(-1, Math.min(1, input.throttle));
    const steer = stunned ? 0 : Math.max(-1, Math.min(1, input.steer));

    bot.oiled = this.patchUnder(bot, 'oil');
    bot.glued = this.patchUnder(bot, 'glue');
    const c = bot.chassis;
    let top = c.speed * bot.speedMult;
    if (bot.turboT > 0) top *= TURBO_MULT;
    if (bot.oiled) top *= 0.6;
    if (bot.glued) top *= 0.35;
    if (bot.slowT > 0) top *= 0.55;
    const reverse = throttle < 0 ? 0.65 : 1;
    const grip = this.arena.grip * (bot.oiled ? 0.35 : 1);

    bot.heading = wrapAngle(bot.heading + steer * c.turn * (bot.oiled ? 1.35 : 1) * dt);
    const fx = Math.sin(bot.heading);
    const fz = Math.cos(bot.heading);
    const lx = fz;
    const lz = -fx;
    let forward = bot.vx * fx + bot.vz * fz;
    let lateral = bot.vx * lx + bot.vz * lz;

    const target = throttle * top * reverse;
    const accel = c.accel * bot.speedMult * grip;
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
  predict(bot: Bot, throttle: number, steer: number, dt: number): void {
    bot.input.throttle = throttle;
    bot.input.steer = steer;
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

  private enemies(bot: Bot): Bot[] {
    return this.bots.filter((other) => other !== bot && other.alive);
  }

  private meleeAngle(bot: Bot): number {
    return bot.loadout.rearMelee ? wrapAngle(bot.heading + Math.PI) : bot.heading;
  }

  private updateMelee(bot: Bot, dt: number): void {
    const facing = this.meleeAngle(bot);
    const id = bot.loadout.melee;
    const def = MELEE[id];
    const pressed = (bot.input.melee || !!def.passive) && bot.stunT <= 0;
    bot.meleeActive = false;

    switch (def.kind) {
      case 'held':
        if (!pressed) return;
        bot.meleeActive = true;
        for (const other of this.enemies(bot)) {
          if (!this.inCone(bot, other, facing, def.range, def.arc)) continue;
          this.damage(other, def.damage * this.damageOutput(bot) * dt, bot.id);
          if (def.slow) other.slowT = Math.max(other.slowT, def.slow);
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
        this.updateClaw(bot, def.damage, pressed, dt);
        return;
      case 'magnet':
        if (!pressed) return;
        bot.meleeActive = true;
        for (const other of this.enemies(bot)) {
          if (!this.canSee(bot, other) || !this.inCone(bot, other, facing, def.range, def.arc)) continue;
          const dist = Math.hypot(other.x - bot.x, other.z - bot.z) || 1;
          const pull = (def.knockback / other.mass) * dt;
          other.vx += ((bot.x - other.x) / dist) * pull;
          other.vz += ((bot.z - other.z) / dist) * pull;
          if (dist - other.radius - bot.radius < 2) this.damage(other, def.damage * this.damageOutput(bot) * dt, bot.id);
        }
        return;
      case 'strike':
        break;
    }

    if (bot.meleeWindup > 0) {
      bot.meleeWindup -= dt;
      if (bot.meleeWindup <= 0) {
        bot.meleeSwing = 0;
        const fx = Math.sin(facing);
        const fz = Math.cos(facing);
        this.events.push({ type: 'strike', x: bot.x + fx * (bot.radius + 1.5), z: bot.z + fz * (bot.radius + 1.5), owner: bot.id });
        for (const other of this.enemies(bot)) {
          if (!this.inCone(bot, other, facing, def.range, def.arc)) continue;
          this.damage(other, def.damage * this.damageOutput(bot), bot.id);
          other.stunT = Math.max(other.stunT, def.stun);
          other.vx += (fx * def.knockback) / other.mass;
          other.vz += (fz * def.knockback) / other.mass;
        }
      }
    } else if (pressed && bot.meleeCd <= 0) {
      bot.meleeCd = def.cooldown;
      bot.meleeWindup = def.windup;
    }
  }

  private updateClaw(bot: Bot, dps: number, pressed: boolean, dt: number): void {
    const facing = this.meleeAngle(bot);
    const def = MELEE.claw;
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
      this.damage(holding, dps * this.damageOutput(bot) * dt, bot.id);
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

  private nearestEnemy(bot: Bot, range: number): Bot | null {
    let best: Bot | null = null;
    let bestDist = range;
    for (const other of this.bots) {
      if (other === bot || !other.alive || !this.canSee(bot, other)) continue;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (d < bestDist) {
        best = other;
        bestDist = d;
      }
    }
    return best;
  }

  private updateTurret(bot: Bot, dt: number): void {
    const def = TURRETS[bot.loadout.turret];
    // A blinded robot's turret just drifts with the hull.
    const target = bot.blindT > 0 ? null : this.nearestEnemy(bot, def.range);
    bot.turretTarget = target ? target.id : -1;
    let desired = bot.heading;
    let flight = 0;
    if (target) {
      // Lead moving targets so slow projectiles can still connect.
      const dist = Math.hypot(target.x - bot.x, target.z - bot.z);
      if (def.kind === 'lob') flight = Math.max(0.6, Math.min(1.6, dist / 18));
      else if (def.projectileSpeed > 0) flight = dist / def.projectileSpeed;
      desired = bearing(bot.x, bot.z, target.x + target.vx * flight, target.z + target.vz * flight);
    }
    const diff = wrapAngle(desired - bot.turretAngle);
    const turn = def.trackRate * dt;
    bot.turretAngle = wrapAngle(bot.turretAngle + Math.max(-turn, Math.min(turn, diff)));
    bot.turretError = Math.abs(wrapAngle(desired - bot.turretAngle));

    bot.turretFiring = false;
    if (!bot.input.turret || bot.stunT > 0) return;

    const dirX = Math.sin(bot.turretAngle);
    const dirZ = Math.cos(bot.turretAngle);
    const muzzleX = bot.x + dirX * (bot.radius + 0.6);
    const muzzleZ = bot.z + dirZ * (bot.radius + 0.6);
    const dmg = def.damage * this.damageOutput(bot);

    if (def.kind === 'flame') {
      if (bot.ammo < def.ammo * dt) return;
      bot.ammo -= def.ammo * dt;
      bot.turretFiring = true;
      bot.cloakT = 0;
      for (const other of this.enemies(bot)) {
        if (!this.inCone(bot, other, bot.turretAngle, def.range, def.cone ?? 0.4)) continue;
        this.damage(other, dmg * dt, bot.id);
        other.burnT = BURN_TIME;
        other.burnSource = bot.id;
      }
      return;
    }

    if (bot.turretCd > 0 || bot.ammo < def.ammo) return;

    if (def.kind === 'arc') {
      // The coil only discharges with a target in its sights, so it never wastes the cooldown.
      if (!target || Math.abs(diff) > 0.25) return;
      bot.turretCd = def.cooldown;
      bot.ammo -= def.ammo;
      bot.cloakT = 0;
      const second = this.bots.find(
        (o) => o !== bot && o !== target && o.alive && this.canSee(bot, o) && Math.hypot(o.x - target.x, o.z - target.z) < 7,
      );
      this.damage(target, dmg, bot.id);
      const points = [{ x: muzzleX, z: muzzleZ }, { x: target.x, z: target.z }];
      if (second) {
        this.damage(second, dmg * 0.5, bot.id);
        points.push({ x: second.x, z: second.z });
      }
      this.events.push({ type: 'arc', points, owner: bot.id });
      return;
    }

    bot.turretCd = def.cooldown;
    bot.ammo -= def.ammo;
    bot.cloakT = 0;

    if (def.kind === 'beam') {
      const end = this.castBeam(bot, muzzleX, muzzleZ, dirX, dirZ, def.range, dmg);
      this.events.push({ type: 'beam', x1: muzzleX, z1: muzzleZ, x2: end.x, z2: end.z, owner: bot.id });
      return;
    }

    if (def.kind === 'lob') {
      const reach = target ? Math.hypot(target.x + target.vx * flight - bot.x, target.z + target.vz * flight - bot.z) : def.range * 0.6;
      const time = target ? flight : 1.2;
      this.spawnProjectile(bot, def, 'mortar', muzzleX, muzzleZ, (dirX * reach) / time, (dirZ * reach) / time, time, dmg, target);
    } else {
      const kind: ProjectileKind =
        def.kind === 'homing' ? 'homing'
        : def.kind === 'grenade' ? 'grenade'
        : def.kind === 'disc' ? 'disc'
        : bot.loadout.turret === 'rockets' ? 'rocket'
        : bot.loadout.turret === 'spear' ? 'spear'
        : 'bullet';
      const life = def.kind === 'grenade' ? 1.3 : def.range / def.projectileSpeed;
      this.spawnProjectile(bot, def, kind, muzzleX, muzzleZ, dirX * def.projectileSpeed, dirZ * def.projectileSpeed, life, dmg, target);
    }
    this.events.push({ type: 'shot', x: muzzleX, z: muzzleZ, owner: bot.id, kind: bot.loadout.turret });
  }

  private spawnProjectile(
    bot: Bot,
    def: (typeof TURRETS)[TurretId],
    kind: ProjectileKind,
    x: number,
    z: number,
    vx: number,
    vz: number,
    life: number,
    damage: number,
    target: Bot | null,
  ): void {
    this.projectiles.push({
      id: this.nextId++,
      owner: bot.id,
      kind,
      x,
      z,
      vx,
      vz,
      life,
      flight: kind === 'mortar' ? life : 0,
      damage,
      splash: def.splash,
      knockback: def.knockback ?? 0,
      target: target ? target.id : -1,
      homing: def.homing ?? 0,
      bounces: def.bounces ?? 0,
      ricocheted: false,
    });
  }

  /** Stops at the first robot or pillar along the line, and returns where the beam ended. */
  private castBeam(bot: Bot, x: number, z: number, dirX: number, dirZ: number, range: number, damage: number): { x: number; z: number } {
    let best = range;
    for (const pillar of this.arena.pillars) {
      const t = rayCircle(x, z, dirX, dirZ, pillar.x, pillar.z, pillar.r);
      if (t !== null && t < best) best = t;
    }
    let victim: Bot | null = null;
    for (const other of this.enemies(bot)) {
      const t = rayCircle(x, z, dirX, dirZ, other.x, other.z, other.radius);
      if (t !== null && t < best) {
        best = t;
        victim = other;
      }
    }
    if (victim) this.damage(victim, damage, bot.id);
    return { x: x + dirX * best, z: z + dirZ * best };
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

    const backX = bot.x - Math.sin(bot.heading) * (bot.radius + 1);
    const backZ = bot.z - Math.cos(bot.heading) * (bot.radius + 1);
    const pushPatch = (kind: PatchKind) =>
      this.oil.push({ id: this.nextId++, owner: bot.id, kind, x: backX, z: backZ, r: def.radius, life: def.duration, damage: def.damage });

    switch (id) {
      case 'shield':
        bot.shieldT = def.duration;
        break;
      case 'mines': {
        const own = this.mines.filter((m) => m.owner === bot.id);
        if (own.length >= 3) this.mines.splice(this.mines.indexOf(own[0]), 1);
        this.mines.push({
          id: this.nextId++, owner: bot.id, kind: 'mine', x: backX, z: backZ, armT: 0.6,
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
          if (Math.hypot(other.x - bot.x, other.z - bot.z) <= def.radius) other.blindT = def.duration;
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
          if (Math.hypot(other.x - bot.x, other.z - bot.z) <= def.radius) other.stunT = Math.max(other.stunT, def.duration);
        }
        this.events.push({ type: 'pulse', x: bot.x, z: bot.z, radius: def.radius, color: 0x7fe8ff });
        break;
      case 'minibot':
        this.drones.push({
          id: this.nextId++, owner: bot.id, x: backX, z: backZ, heading: bot.heading,
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
            id: this.nextId++, owner: bot.id, kind: 'charge', x: backX, z: backZ, armT: 0.4,
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
    if (arena.pits.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + radius)) return false;
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
      const facing = Math.abs(relativeBearing(target.x, target.z, target.heading, attacker.x, attacker.z));
      if (facing < 0.9) taken *= DEFENSES.steelram.damage;
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
    }
    this.events.push({ type: 'hit', x: target.x, z: target.z, amount: dealt, target: target.id, source, shielded });
    if (target.hp <= 0) this.destroy(target, false);
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
    if (this.mode === 'lms') {
      bot.out = true;
      bot.eliminatedAt = this.time;
    }
    const killer = bot.lastAttacker >= 0 && bot.lastAttacker !== bot.id ? this.bots[bot.lastAttacker] : undefined;
    if (killer) {
      killer.kills++;
      killer.earned += REWARD.kill;
    }
    this.events.push({ type: 'kill', killer: killer ? killer.id : -1, victim: bot.id, fell });
    if (!fell) {
      this.events.push({ type: 'explosion', x: bot.x, z: bot.z, big: true });
      this.pickups.push({ id: this.nextId++, kind: 'scrap', x: bot.x, z: bot.z, spot: -1 });
    }
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
    bot.stunT = bot.turboT = bot.rageT = bot.shieldT = bot.megaT = 0;
    bot.slowT = bot.blindT = bot.cloakT = bot.bladesT = bot.regenT = 0;
    bot.ammo = 1;
    this.events.push({ type: 'spawn', bot: bot.id });
  }

  private collideBots(): void {
    for (let i = 0; i < this.bots.length; i++) {
      const a = this.bots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.bots.length; j++) {
        const b = this.bots[j];
        if (!b.alive) continue;
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
    const plate = attacker.loadout.defense === 'steelram' ? 1.3 : 1;
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
      const overEdge = !arena.walled && (Math.abs(bot.x) > arena.half || Math.abs(bot.z) > arena.half);
      const inPit = arena.pits.some((p) => Math.hypot(bot.x - p.x, bot.z - p.z) < p.r);
      if ((overEdge || inPit) && bot.clawTarget < 0) {
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
        if (Math.hypot(bot.x - fire.x, bot.z - fire.z) < fire.r) hurt(bot, FIRE_DPS * dt);
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

      for (const patch of this.oil) {
        if (patch.kind !== 'nails' || patch.owner === bot.id) continue;
        if (Math.hypot(bot.x - patch.x, bot.z - patch.z) < patch.r) this.damage(bot, patch.damage * dt, patch.owner);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const { arena } = this;
    const bound = arena.walled ? arena.half : arena.half + 12;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      if (p.homing > 0 && p.target >= 0) {
        const target = this.bots[p.target];
        if (target.alive && target.cloakT <= 0) {
          const speed = Math.hypot(p.vx, p.vz);
          const angle = Math.atan2(p.vx, p.vz);
          const diff = wrapAngle(bearing(p.x, p.z, target.x, target.z) - angle);
          const turn = p.homing * dt;
          const next = angle + Math.max(-turn, Math.min(turn, diff));
          p.vx = Math.sin(next) * speed;
          p.vz = Math.cos(next) * speed;
        }
      }

      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.life -= dt;

      let hit = p.life <= 0;
      if (p.kind !== 'mortar') {
        if (!hit && (p.kind === 'disc' || p.kind === 'grenade') && p.bounces > 0) {
          this.ricochet(p, bound);
        } else if (!hit) {
          hit = Math.abs(p.x) > bound || Math.abs(p.z) > bound;
          if (!hit) hit = arena.pillars.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r);
        }
        if (!hit) hit = this.projectileHitsBot(p);
      }
      if (!hit) continue;

      if (p.splash > 0) this.explode(p.x, p.z, p.damage, p.splash, p.owner, false);
      // Removal goes by identity, because a ricochet's explosion chain can't reorder the list.
      this.projectiles.splice(this.projectiles.indexOf(p), 1);
    }
  }

  private ricochet(p: Projectile, bound: number): void {
    let bounced = false;
    if (Math.abs(p.x) > bound) {
      p.x = Math.sign(p.x) * bound;
      p.vx = -p.vx;
      bounced = true;
    }
    if (Math.abs(p.z) > bound) {
      p.z = Math.sign(p.z) * bound;
      p.vz = -p.vz;
      bounced = true;
    }
    for (const c of this.arena.pillars) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= c.r || dist < 1e-4) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const into = p.vx * nx + p.vz * nz;
      p.vx -= 2 * into * nx;
      p.vz -= 2 * into * nz;
      p.x = c.x + nx * c.r;
      p.z = c.z + nz * c.r;
      bounced = true;
    }
    if (!bounced) return;
    p.bounces--;
    if (p.bounces <= 0) p.life = 0;
    p.ricocheted = true;
  }

  private projectileHitsBot(p: Projectile): boolean {
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      if (bot.id === p.owner && !(p.kind === 'disc' && p.ricocheted)) continue;
      if (Math.hypot(bot.x - p.x, bot.z - p.z) >= bot.radius) continue;

      // A plow throws discs back the way they came.
      if (p.kind === 'disc' && bot.loadout.defense === 'plow') {
        const angle = Math.abs(relativeBearing(bot.x, bot.z, bot.heading, p.x, p.z));
        if (angle < 1) {
          p.vx = -p.vx;
          p.vz = -p.vz;
          p.owner = bot.id;
          p.ricocheted = false;
          return false;
        }
      }
      if (p.splash <= 0) {
        const source = bot.id === p.owner ? -1 : p.owner;
        this.damage(bot, p.damage, source);
        if (p.knockback > 0) {
          const speed = Math.hypot(p.vx, p.vz) || 1;
          bot.vx += ((p.vx / speed) * p.knockback) / bot.mass;
          bot.vz += ((p.vz / speed) * p.knockback) / bot.mass;
          bot.lastAttacker = p.owner;
        }
      }
      return true;
    }
    return false;
  }

  /** Splash never hurts the robot that caused it. */
  explode(x: number, z: number, damage: number, radius: number, owner: number, big: boolean): void {
    this.events.push({ type: 'explosion', x, z, big });
    for (const bot of this.bots) {
      if (bot.id === owner || !bot.alive) continue;
      const dist = Math.hypot(bot.x - x, bot.z - z);
      const reach = radius + bot.radius;
      if (dist >= reach) continue;
      const falloff = 1 - 0.6 * (dist / reach);
      this.damage(bot, damage * falloff, owner);
      const nx = dist > 1e-4 ? (bot.x - x) / dist : 1;
      const nz = dist > 1e-4 ? (bot.z - z) / dist : 0;
      bot.vx += (nx * 12 * falloff) / bot.mass;
      bot.vz += (nz * 12 * falloff) / bot.mass;
    }
  }

  private plowHits(bot: Bot, x: number, z: number, radius: number): boolean {
    if (bot.loadout.defense !== 'plow' || !bot.alive) return false;
    if (Math.hypot(bot.x - x, bot.z - z) >= radius + bot.radius + 0.5) return false;
    return Math.abs(relativeBearing(bot.x, bot.z, bot.heading, x, z)) < 1;
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
      this.repairTimer = MATCH.repairInterval;
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
    if (this.mode === 'lms') {
      if (a.out !== b.out) return a.out ? 1 : -1;
      if (a.eliminatedAt !== b.eliminatedAt) return b.eliminatedAt - a.eliminatedAt;
    }
    if (this.mode === 'koth' && a.hillScore !== b.hillScore) return b.hillScore - a.hillScore;
    return b.kills - a.kills || b.damageDealt - a.damageDealt || a.id - b.id;
  }

  /** Current order, best first. */
  ranked(): Bot[] {
    return [...this.bots].sort((a, b) => this.rank(a, b));
  }

  standings(): Standing[] {
    return this.ranked().map((bot, index) => {
      const bonus = REWARD.placement[index] ?? 0;
      return { bot, place: index + 1, bonus, total: Math.round(bot.earned + bonus) };
    });
  }
}

/** Distance along a ray to a circle, or null if it misses. */
function rayCircle(x: number, z: number, dirX: number, dirZ: number, cx: number, cz: number, r: number): number | null {
  const ox = cx - x;
  const oz = cz - z;
  const along = ox * dirX + oz * dirZ;
  if (along < 0) return null;
  const off = ox * dirZ - oz * dirX;
  if (Math.abs(off) > r) return null;
  return Math.max(0, along - Math.sqrt(r * r - off * off));
}
