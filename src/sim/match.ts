import { ARENA, sawPos } from './arena';
import { BotBrain } from './ai';
import {
  CHASSIS,
  DEFENSES,
  EMP_RADIUS,
  EMP_STUN,
  MATCH,
  MELEE,
  OVERDRIVE_MULT,
  OVERDRIVE_TIME,
  POWERUP_ORDER,
  REPAIR_FRACTION,
  REWARD,
  TURBO_MULT,
  TURBO_TIME,
  TURRETS,
  UPGRADES,
  type ChassisDef,
  type ChassisId,
  type DefenseId,
  type MeleeId,
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
  respawnT: number;
  meleeCd: number;
  meleeWindup: number;
  /** Seconds since the last strike, used to animate the swing. */
  meleeSwing: number;
  meleeActive: boolean;
  lungeT: number;
  turretCd: number;
  defenseCd: number;
  shieldT: number;
  turboT: number;
  overdriveT: number;
  stunT: number;
  invulnT: number;
  ramCd: number;
  flashT: number;
  lastHitT: number;
  lastAttacker: number;
  oiled: boolean;
  powerups: Record<PowerupId, number>;
  kills: number;
  deaths: number;
  damageDealt: number;
  earned: number;
}

export interface Projectile {
  id: number;
  owner: number;
  kind: 'bullet' | 'rocket';
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  damage: number;
  splash: number;
}

export interface Mine {
  id: number;
  owner: number;
  x: number;
  z: number;
  armT: number;
  life: number;
  damage: number;
  radius: number;
}

export interface OilPatch {
  id: number;
  owner: number;
  x: number;
  z: number;
  r: number;
  life: number;
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
  | { type: 'strike'; x: number; z: number; owner: number }
  | { type: 'kill'; killer: number; victim: number }
  | { type: 'spawn'; bot: number }
  | { type: 'pickup'; bot: number; kind: 'repair' | 'scrap'; x: number; z: number }
  | { type: 'powerup'; bot: number; kind: PowerupId }
  | { type: 'defense'; bot: number; kind: DefenseId };

export interface BotSetup {
  name: string;
  color: number;
  loadout: Loadout;
  isAI: boolean;
  skill?: number;
}

export interface MatchOptions {
  seed: number;
  duration?: number;
  killTarget?: number;
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

export function bearing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

export class Match {
  readonly rng: Rng;
  readonly bots: Bot[] = [];
  readonly projectiles: Projectile[] = [];
  readonly mines: Mine[] = [];
  readonly oil: OilPatch[] = [];
  readonly pickups: Pickup[] = [];
  readonly duration: number;
  readonly killTarget: number;
  time = 0;
  over = false;
  private events: GameEvent[] = [];
  private brains = new Map<number, BotBrain>();
  private nextId = 1;
  private repairTimer: number = MATCH.repairInterval / 2;

  constructor(setups: BotSetup[], options: MatchOptions) {
    this.rng = makeRng(options.seed);
    this.duration = options.duration ?? MATCH.duration;
    this.killTarget = options.killTarget ?? MATCH.killTarget;
    setups.forEach((setup, id) => {
      const bot = this.createBot(id, setup);
      this.bots.push(bot);
      if (setup.isAI) this.brains.set(id, new BotBrain(this, bot, setup.skill ?? 0.6));
    });
    this.bots.forEach((bot, i) => {
      const spawn = ARENA.spawns[i % ARENA.spawns.length];
      this.place(bot, spawn.x, spawn.z);
    });
  }

  private createBot(id: number, setup: BotSetup): Bot {
    const chassis = CHASSIS[setup.loadout.chassis];
    const up = setup.loadout.upgrades;
    const maxHp = chassis.hp * (1 + UPGRADES.armor.perLevel * up.armor);
    return {
      id,
      name: setup.name,
      color: setup.color,
      loadout: setup.loadout,
      chassis,
      isAI: setup.isAI,
      input: emptyInput(),
      x: 0,
      z: 0,
      prevX: 0,
      prevZ: 0,
      heading: 0,
      prevHeading: 0,
      vx: 0,
      vz: 0,
      turretAngle: 0,
      turretTarget: -1,
      turretError: 0,
      hp: maxHp,
      maxHp,
      speedMult: 1 + UPGRADES.engine.perLevel * up.engine,
      damageMult: 1 + UPGRADES.weapons.perLevel * up.weapons,
      radius: chassis.radius,
      mass: chassis.mass,
      alive: true,
      respawnT: 0,
      meleeCd: 0,
      meleeWindup: 0,
      meleeSwing: 99,
      meleeActive: false,
      lungeT: 0,
      turretCd: 0,
      defenseCd: 0,
      shieldT: 0,
      turboT: 0,
      overdriveT: 0,
      stunT: 0,
      invulnT: MATCH.spawnInvuln,
      ramCd: 0,
      flashT: 0,
      lastHitT: -99,
      lastAttacker: -1,
      oiled: false,
      powerups: { ...setup.loadout.powerups },
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      earned: 0,
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

  get timeLeft(): number {
    return Math.max(0, this.duration - this.time);
  }

  step(dt: number = STEP): void {
    if (this.over) return;
    this.time += dt;

    for (const bot of this.bots) {
      bot.prevX = bot.x;
      bot.prevZ = bot.z;
      bot.prevHeading = bot.heading;
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
      this.updateDefense(bot);
    }

    this.collideBots();
    this.collideWorld();
    this.updateHazards(dt);
    this.updateProjectiles(dt);
    this.updateMines(dt);
    this.updateOil(dt);
    this.updatePickups(dt);

    const leader = this.bots.some((b) => b.kills >= this.killTarget);
    if (this.time >= this.duration || leader) this.over = true;
  }

  private tickTimers(bot: Bot, dt: number): void {
    bot.meleeCd = Math.max(0, bot.meleeCd - dt);
    bot.turretCd = Math.max(0, bot.turretCd - dt);
    bot.defenseCd = Math.max(0, bot.defenseCd - dt);
    bot.shieldT = Math.max(0, bot.shieldT - dt);
    bot.turboT = Math.max(0, bot.turboT - dt);
    bot.overdriveT = Math.max(0, bot.overdriveT - dt);
    bot.stunT = Math.max(0, bot.stunT - dt);
    bot.invulnT = Math.max(0, bot.invulnT - dt);
    bot.ramCd = Math.max(0, bot.ramCd - dt);
    bot.flashT = Math.max(0, bot.flashT - dt);
    bot.lungeT = Math.max(0, bot.lungeT - dt);
    bot.meleeSwing += dt;
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
      case 'overdrive':
        bot.overdriveT = OVERDRIVE_TIME;
        break;
      case 'emp':
        for (const other of this.bots) {
          if (other === bot || !other.alive) continue;
          if (Math.hypot(other.x - bot.x, other.z - bot.z) <= EMP_RADIUS) {
            other.stunT = Math.max(other.stunT, EMP_STUN);
          }
        }
        break;
    }
    this.events.push({ type: 'powerup', bot: bot.id, kind });
  }

  private drive(bot: Bot, dt: number): void {
    const input = bot.input;
    const stunned = bot.stunT > 0;
    const throttle = stunned ? 0 : Math.max(-1, Math.min(1, input.throttle));
    const steer = stunned ? 0 : Math.max(-1, Math.min(1, input.steer));

    bot.oiled = this.oil.some((p) => p.owner !== bot.id && Math.hypot(p.x - bot.x, p.z - bot.z) < p.r);
    const c = bot.chassis;
    let top = c.speed * bot.speedMult;
    if (bot.turboT > 0) top *= TURBO_MULT;
    if (bot.oiled) top *= 0.6;
    const reverse = throttle < 0 ? 0.65 : 1;

    bot.heading = wrapAngle(bot.heading + steer * c.turn * (bot.oiled ? 1.35 : 1) * dt);
    const fx = Math.sin(bot.heading);
    const fz = Math.cos(bot.heading);
    const lx = fz;
    const lz = -fx;
    let forward = bot.vx * fx + bot.vz * fz;
    let lateral = bot.vx * lx + bot.vz * lz;

    const target = throttle * top * reverse;
    const accel = c.accel * bot.speedMult * (bot.oiled ? 0.35 : 1);
    if (bot.lungeT <= 0) {
      const delta = target - forward;
      forward += Math.sign(delta) * Math.min(Math.abs(delta), accel * dt);
    }
    lateral *= Math.exp(-(bot.oiled ? 0.8 : 7) * dt);

    bot.vx = fx * forward + lx * lateral;
    bot.vz = fz * forward + lz * lateral;
    bot.x += bot.vx * dt;
    bot.z += bot.vz * dt;
  }

  private damageOutput(bot: Bot): number {
    return bot.damageMult * (bot.overdriveT > 0 ? OVERDRIVE_MULT : 1);
  }

  private inCone(bot: Bot, other: Bot, range: number, arc: number): boolean {
    const dist = Math.hypot(other.x - bot.x, other.z - bot.z) - other.radius;
    if (dist > range) return false;
    const angle = wrapAngle(bearing(bot.x, bot.z, other.x, other.z) - bot.heading);
    return Math.abs(angle) <= arc;
  }

  private updateMelee(bot: Bot, dt: number): void {
    const id = bot.loadout.melee;
    const def = MELEE[id];
    const pressed = bot.input.melee && bot.stunT <= 0;
    bot.meleeActive = false;

    if (id === 'chainsaw') {
      if (!pressed) return;
      bot.meleeActive = true;
      for (const other of this.bots) {
        if (other === bot || !other.alive) continue;
        if (this.inCone(bot, other, def.range, def.arc)) {
          this.damage(other, def.damage * this.damageOutput(bot) * dt, bot.id);
        }
      }
      return;
    }

    if (id === 'ram') {
      if (pressed && bot.meleeCd <= 0) {
        bot.meleeCd = def.cooldown;
        bot.lungeT = 0.35;
        bot.meleeSwing = 0;
        bot.vx += Math.sin(bot.heading) * def.knockback;
        bot.vz += Math.cos(bot.heading) * def.knockback;
        this.events.push({ type: 'strike', x: bot.x, z: bot.z, owner: bot.id });
      }
      return;
    }

    if (bot.meleeWindup > 0) {
      bot.meleeWindup -= dt;
      if (bot.meleeWindup <= 0) {
        bot.meleeSwing = 0;
        const fx = Math.sin(bot.heading);
        const fz = Math.cos(bot.heading);
        this.events.push({
          type: 'strike',
          x: bot.x + fx * (bot.radius + 1.5),
          z: bot.z + fz * (bot.radius + 1.5),
          owner: bot.id,
        });
        for (const other of this.bots) {
          if (other === bot || !other.alive) continue;
          if (this.inCone(bot, other, def.range, def.arc)) {
            this.damage(other, def.damage * this.damageOutput(bot), bot.id);
            other.stunT = Math.max(other.stunT, def.stun);
            other.vx += fx * def.knockback / other.mass;
            other.vz += fz * def.knockback / other.mass;
          }
        }
      }
    } else if (pressed && bot.meleeCd <= 0) {
      bot.meleeCd = def.cooldown;
      bot.meleeWindup = def.windup;
    }
  }

  private nearestEnemy(bot: Bot, range: number): Bot | null {
    let best: Bot | null = null;
    let bestDist = range;
    for (const other of this.bots) {
      if (other === bot || !other.alive) continue;
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
    const target = this.nearestEnemy(bot, def.range);
    bot.turretTarget = target ? target.id : -1;
    let desired = bot.heading;
    if (target) {
      // Lead moving targets so slow projectiles can still connect.
      const flight = def.projectileSpeed > 0 ? Math.hypot(target.x - bot.x, target.z - bot.z) / def.projectileSpeed : 0;
      desired = bearing(bot.x, bot.z, target.x + target.vx * flight, target.z + target.vz * flight);
    }
    const diff = wrapAngle(desired - bot.turretAngle);
    const turn = def.trackRate * dt;
    bot.turretAngle = wrapAngle(bot.turretAngle + Math.max(-turn, Math.min(turn, diff)));
    bot.turretError = Math.abs(wrapAngle(desired - bot.turretAngle));

    if (!bot.input.turret || bot.turretCd > 0 || bot.stunT > 0) return;
    const dirX = Math.sin(bot.turretAngle);
    const dirZ = Math.cos(bot.turretAngle);
    const muzzleX = bot.x + dirX * (bot.radius + 0.6);
    const muzzleZ = bot.z + dirZ * (bot.radius + 0.6);
    const dmg = def.damage * this.damageOutput(bot);

    if (bot.loadout.turret === 'arc') {
      // The coil only discharges with a target in its sights, so it never wastes the cooldown.
      if (!target || Math.abs(diff) > 0.25) return;
      bot.turretCd = def.cooldown;
      const second = this.bots.find(
        (o) => o !== bot && o !== target && o.alive && Math.hypot(o.x - target.x, o.z - target.z) < 7,
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
    this.projectiles.push({
      id: this.nextId++,
      owner: bot.id,
      kind: bot.loadout.turret === 'rockets' ? 'rocket' : 'bullet',
      x: muzzleX,
      z: muzzleZ,
      vx: dirX * def.projectileSpeed,
      vz: dirZ * def.projectileSpeed,
      life: def.range / def.projectileSpeed,
      damage: dmg,
      splash: def.splash,
    });
    this.events.push({ type: 'shot', x: muzzleX, z: muzzleZ, owner: bot.id, kind: bot.loadout.turret });
  }

  private updateDefense(bot: Bot): void {
    if (!bot.input.defense || bot.defenseCd > 0 || bot.stunT > 0) return;
    const id = bot.loadout.defense;
    const def = DEFENSES[id];
    bot.defenseCd = def.cooldown;
    const backX = bot.x - Math.sin(bot.heading) * (bot.radius + 1);
    const backZ = bot.z - Math.cos(bot.heading) * (bot.radius + 1);
    if (id === 'shield') {
      bot.shieldT = def.duration;
    } else if (id === 'mines') {
      const own = this.mines.filter((m) => m.owner === bot.id);
      if (own.length >= 3) this.mines.splice(this.mines.indexOf(own[0]), 1);
      this.mines.push({
        id: this.nextId++,
        owner: bot.id,
        x: backX,
        z: backZ,
        armT: 0.6,
        life: def.duration,
        damage: def.damage * this.damageOutput(bot),
        radius: def.radius,
      });
    } else {
      this.oil.push({ id: this.nextId++, owner: bot.id, x: backX, z: backZ, r: def.radius, life: def.duration });
    }
    this.events.push({ type: 'defense', bot: bot.id, kind: id });
  }

  damage(target: Bot, amount: number, source: number): void {
    if (!target.alive || target.invulnT > 0 || amount <= 0) return;
    const shielded = target.shieldT > 0;
    const dealt = Math.min(target.hp, shielded ? amount * (1 - MATCH.shieldAbsorb) : amount);
    target.hp -= dealt;
    target.flashT = 0.12;
    target.lastHitT = this.time;
    const attacker = source >= 0 ? this.bots[source] : undefined;
    if (attacker && attacker !== target) {
      target.lastAttacker = source;
      attacker.damageDealt += dealt;
      attacker.earned += dealt * REWARD.damage;
    }
    this.events.push({ type: 'hit', x: target.x, z: target.z, amount: dealt, target: target.id, source, shielded });
    if (target.hp <= 0) this.destroy(target);
  }

  private destroy(bot: Bot): void {
    bot.alive = false;
    bot.hp = 0;
    bot.deaths++;
    bot.respawnT = MATCH.respawnTime;
    bot.meleeActive = false;
    bot.meleeWindup = 0;
    const killer = bot.lastAttacker >= 0 ? this.bots[bot.lastAttacker] : undefined;
    if (killer) {
      killer.kills++;
      killer.earned += REWARD.kill;
    }
    this.events.push({ type: 'kill', killer: killer ? killer.id : -1, victim: bot.id });
    this.events.push({ type: 'explosion', x: bot.x, z: bot.z, big: true });
    this.pickups.push({ id: this.nextId++, kind: 'scrap', x: bot.x, z: bot.z, spot: -1 });
  }

  private respawn(bot: Bot): void {
    // Spawn wherever is furthest from the nearest living robot.
    let bestSpawn = ARENA.spawns[0];
    let bestScore = -1;
    for (const spawn of ARENA.spawns) {
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
    bot.stunT = bot.turboT = bot.overdriveT = bot.shieldT = 0;
    this.events.push({ type: 'spawn', bot: bot.id });
  }

  private collideBots(): void {
    for (let i = 0; i < this.bots.length; i++) {
      const a = this.bots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.bots.length; j++) {
        const b = this.bots[j];
        if (!b.alive) continue;
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
    const amount = speed * MATCH.ramDamage * attacker.mass * spike * this.damageOutput(attacker);
    this.damage(victim, amount, attacker.id);
  }

  private collideWorld(): void {
    const half = ARENA.half;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const limit = half - bot.radius;
      if (bot.x > limit || bot.x < -limit) {
        bot.x = Math.max(-limit, Math.min(limit, bot.x));
        bot.vx *= -0.3;
      }
      if (bot.z > limit || bot.z < -limit) {
        bot.z = Math.max(-limit, Math.min(limit, bot.z));
        bot.vz *= -0.3;
      }
      for (const pillar of ARENA.pillars) {
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
  }

  private updateHazards(dt: number): void {
    for (const saw of ARENA.saws) {
      const pos = sawPos(saw, this.time);
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        const dx = bot.x - pos.x;
        const dz = bot.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= ARENA.sawRadius + bot.radius || dist < 1e-4) continue;
        const attacker = bot.lastAttacker;
        this.damage(bot, ARENA.sawDps * dt, -1);
        bot.lastAttacker = attacker;
        bot.vx += (dx / dist) * ARENA.sawKnock * dt * 8;
        bot.vz += (dz / dist) * ARENA.sawKnock * dt * 8;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      let hit = p.life <= 0 || Math.abs(p.x) > ARENA.half || Math.abs(p.z) > ARENA.half;
      if (!hit) hit = ARENA.pillars.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r);
      if (!hit) {
        for (const bot of this.bots) {
          if (bot.id === p.owner || !bot.alive) continue;
          if (Math.hypot(bot.x - p.x, bot.z - p.z) < bot.radius) {
            if (p.splash <= 0) this.damage(bot, p.damage, p.owner);
            hit = true;
            break;
          }
        }
      }
      if (!hit) continue;
      if (p.kind === 'rocket') this.explode(p.x, p.z, p.damage, p.splash, p.owner, false);
      this.projectiles.splice(i, 1);
    }
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

  private updateMines(dt: number): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.armT -= dt;
      m.life -= dt;
      if (m.life <= 0) {
        this.mines.splice(i, 1);
        continue;
      }
      if (m.armT > 0) continue;
      const tripped = this.bots.some(
        (b) => b.id !== m.owner && b.alive && Math.hypot(b.x - m.x, b.z - m.z) < 1 + b.radius,
      );
      if (tripped) {
        this.mines.splice(i, 1);
        this.explode(m.x, m.z, m.damage, m.radius, m.owner, false);
      }
    }
  }

  private updateOil(dt: number): void {
    for (let i = this.oil.length - 1; i >= 0; i--) {
      this.oil[i].life -= dt;
      if (this.oil[i].life <= 0) this.oil.splice(i, 1);
    }
  }

  private updatePickups(dt: number): void {
    this.repairTimer -= dt;
    if (this.repairTimer <= 0) {
      this.repairTimer = MATCH.repairInterval;
      const free = ARENA.repairSpots
        .map((_, spot) => spot)
        .filter((spot) => !this.pickups.some((p) => p.spot === spot));
      if (free.length > 0) {
        const spot = free[Math.floor(this.rng() * free.length)];
        const pos = ARENA.repairSpots[spot];
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

  standings(): Standing[] {
    return [...this.bots]
      .sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt || a.id - b.id)
      .map((bot, index) => {
        const bonus = REWARD.placement[index] ?? 0;
        return { bot, place: index + 1, bonus, total: Math.round(bot.earned + bonus) };
      });
  }
}

export function freshPowerups(): Record<PowerupId, number> {
  return Object.fromEntries(POWERUP_ORDER.map((id) => [id, 0])) as Record<PowerupId, number>;
}
