import { ARENA, sawPos } from './arena';
import { MELEE, TURRETS } from './data';
import { bearing, wrapAngle, type Bot, type Match } from './match';

const THINK_INTERVAL = 0.2;
const RETARGET_INTERVAL = 1.5;

/** Drives one bot by writing to its input, exactly as the keyboard does for the player. */
export class BotBrain {
  private thinkT = 0;
  private retargetT = 0;
  private target: Bot | null = null;
  private goalX = 0;
  private goalZ = 0;
  private stuckT = 0;
  private reverseT = 0;
  private burstT = 0;
  private strafeSign: number;

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
    this.fight(dt);
  }

  private think(): void {
    const { bot, match } = this;
    if (this.retargetT <= 0 || !this.target?.alive) {
      this.retargetT = RETARGET_INTERVAL;
      this.target = this.pickTarget();
    }

    const hurt = bot.hp / bot.maxHp < 0.35;
    const repair = hurt ? this.nearestPickup('repair') : null;
    const scrap = this.nearestPickup('scrap');
    if (repair) {
      this.goalX = repair.x;
      this.goalZ = repair.z;
    } else if (scrap && Math.hypot(scrap.x - bot.x, scrap.z - bot.z) < 10) {
      this.goalX = scrap.x;
      this.goalZ = scrap.z;
    } else if (this.target) {
      const standoff = this.preferredRange();
      const dist = Math.hypot(this.target.x - bot.x, this.target.z - bot.z);
      if (standoff > 0 && dist < standoff + 4) {
        // Ranged builds circle at a distance instead of closing in.
        const around = bearing(this.target.x, this.target.z, bot.x, bot.z) + 0.8 * this.strafeSign;
        this.goalX = this.target.x + Math.sin(around) * standoff;
        this.goalZ = this.target.z + Math.cos(around) * standoff;
      } else {
        this.goalX = this.target.x;
        this.goalZ = this.target.z;
      }
    } else {
      this.goalX = 0;
      this.goalZ = 0;
    }

    this.usePowerups();
    if (match.rng() < 0.05) this.strafeSign *= -1;
  }

  private preferredRange(): number {
    return this.bot.loadout.turret === 'rockets' ? 13 : this.bot.loadout.turret === 'arc' ? 8 : 0;
  }

  private pickTarget(): Bot | null {
    const { bot, match } = this;
    let best: Bot | null = null;
    let bestScore = Infinity;
    for (const other of match.bots) {
      if (other === bot || !other.alive) continue;
      let score = Math.hypot(other.x - bot.x, other.z - bot.z) + other.hp * 0.08;
      if (other.id === bot.lastAttacker) score -= 10;
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
    for (const pillar of ARENA.pillars) repel(pillar.x, pillar.z, pillar.r, 5, 1.6);
    for (const saw of ARENA.saws) {
      const pos = sawPos(saw, match.time);
      repel(pos.x, pos.z, ARENA.sawRadius, 5, 2.2);
    }
    for (const mine of match.mines) {
      if (mine.owner !== bot.id) repel(mine.x, mine.z, 1, 3 * this.skill, 1.5);
    }
    const wall = ARENA.half - 5;
    if (bot.x > wall) dirX -= (bot.x - wall) * 0.4;
    if (bot.x < -wall) dirX += (-wall - bot.x) * 0.4;
    if (bot.z > wall) dirZ -= (bot.z - wall) * 0.4;
    if (bot.z < -wall) dirZ += (-wall - bot.z) * 0.4;

    const speed = Math.hypot(bot.vx, bot.vz);
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      bot.input.throttle = -1;
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
  }

  private fight(dt: number): void {
    const { bot, match } = this;
    const target = this.target;
    bot.input.melee = false;
    bot.input.defense = false;
    if (!target || !target.alive) {
      bot.input.turret = false;
      return;
    }

    const dist = Math.hypot(target.x - bot.x, target.z - bot.z);
    const angle = Math.abs(wrapAngle(bearing(bot.x, bot.z, target.x, target.z) - bot.heading));
    const melee = MELEE[bot.loadout.melee];
    if (bot.loadout.melee === 'ram') {
      bot.input.melee = dist < 10 && angle < 0.25;
    } else {
      bot.input.melee = dist - target.radius < melee.range && angle < melee.arc;
    }

    // Short bursts rather than holding the trigger, so low-skill bots lose some damage.
    this.burstT -= dt;
    if (this.burstT < -0.4) this.burstT = 0.3 + this.skill * 1.5;
    const aimed = bot.turretTarget >= 0 && bot.turretError < 0.2;
    bot.input.turret = aimed && this.burstT > 0 && dist < TURRETS[bot.loadout.turret].range;

    const recentlyHit = match.time - bot.lastHitT < 0.5;
    switch (bot.loadout.defense) {
      case 'shield':
        bot.input.defense = recentlyHit && bot.hp / bot.maxHp < 0.7;
        break;
      case 'mines':
      case 'oil':
        bot.input.defense = dist < 9 && angle > 2.2;
        break;
    }
  }

  private usePowerups(): void {
    const { bot, match, target } = this;
    if (match.rng() > this.skill) return;
    const dist = target ? Math.hypot(target.x - bot.x, target.z - bot.z) : Infinity;
    const health = bot.hp / bot.maxHp;
    if (health < 0.4 && bot.powerups.repair > 0) bot.input.powerup = 'repair';
    else if (dist < 9 && health > 0.4 && bot.powerups.overdrive > 0) bot.input.powerup = 'overdrive';
    else if (dist < 6 && health < 0.6 && bot.powerups.emp > 0) bot.input.powerup = 'emp';
    else if (dist > 22 && bot.powerups.turbo > 0) bot.input.powerup = 'turbo';
  }
}
