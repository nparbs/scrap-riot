import { sawPos } from '../sim/arena';
import { keyLabel, type Action, type Bindings } from '../game/settings';
import { DEFENSES, MELEE, MODES, POWERUPS, POWERUP_ORDER, TURRETS, UPGRADES } from '../sim/data';
import { relativeBearing, type Bot, type GameEvent, type Match } from '../sim/match';

const POWER_ACTIONS: Action[] = ['power1', 'power2', 'power3', 'power4', 'power5', 'power6'];
const DAMAGE_MARK_TIME = 1;
const MAP_INTERVAL = 1 / 20;

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Online, robot names come from other players, so they must always pass through this. */
export function escapeText(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export class Hud {
  readonly root = document.createElement('div');
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly board: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly center: HTMLElement;
  private readonly money: HTMLElement;
  private readonly effects: HTMLElement;
  private readonly cooldowns: Record<'melee' | 'turret' | 'defense', HTMLElement>;
  private readonly powerCounts: HTMLElement[] = [];
  private readonly minimap: CanvasRenderingContext2D;
  private boardTimer = 0;
  private mapTimer = 0;
  private boardHtml = '';
  private lastMoney = -1;
  private lastCenter = '';
  /** Takes priority over the respawn message. */
  notice = '';
  private readonly ping: HTMLElement;
  private readonly blind: HTMLElement;
  private readonly ammo: HTMLElement;

  private readonly tutorial: HTMLElement;
  private readonly damageLayer: HTMLElement;
  /** One indicator per attacker, refreshed while they keep hitting. */
  private readonly damageMarks = new Map<number, { el: HTMLElement; time: number }>();

  constructor(private readonly match: Match, private readonly player: Bot, keys: Bindings) {
    const { loadout } = player;
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-status">
        <div class="hud-name" style="color:${hex(player.color)}">${escapeText(player.name)}</div>
        <div class="hp-bar"><div class="hp-fill"></div><span class="hp-text"></span></div>
        <div class="hud-money"></div>
        <div class="hud-effects"></div>
      </div>
      <div class="hud-timer"></div>
      <div class="hud-ping"></div>
      <div class="hud-mode">${escapeText(match.arena.name)} · ${MODES[match.mode].name}</div>
      <div class="hud-board"></div>
      <div class="hud-feed"></div>
      <div class="hud-blind"></div>
      <div class="hud-damage"></div>
      <div class="hud-center"></div>
      <div class="hud-tutorial" role="status"></div>
      <div class="hud-slots">
        ${this.slot(keyLabel(keys.melee), MELEE[loadout.melee].name, 'melee')}
        ${this.slot(keyLabel(keys.turret), TURRETS[loadout.turret].name, 'turret', '<div class="slot-ammo"><i data-ammo></i></div>')}
        ${this.slot(keyLabel(keys.defense), DEFENSES[loadout.defense].name, 'defense')}
        <div class="slot-gap"></div>
        ${POWERUP_ORDER.map(
          (id, i) => `<div class="slot slot-power"><kbd>${keyLabel(keys[POWER_ACTIONS[i]])}</kbd><span>${POWERUPS[id].name}</span><b data-power="${i}"></b></div>`,
        ).join('')}
      </div>
      <canvas class="hud-map" width="180" height="180"></canvas>
    `;
    const q = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
    this.hpFill = q('.hp-fill');
    this.hpText = q('.hp-text');
    this.timer = q('.hud-timer');
    this.ping = q('.hud-ping');
    this.blind = q('.hud-blind');
    this.ammo = q('[data-ammo]');
    this.tutorial = q('.hud-tutorial');
    this.damageLayer = q('.hud-damage');
    this.board = q('.hud-board');
    this.feed = q('.hud-feed');
    this.center = q('.hud-center');
    this.money = q('.hud-money');
    this.effects = q('.hud-effects');
    this.cooldowns = { melee: q('[data-cd="melee"]'), turret: q('[data-cd="turret"]'), defense: q('[data-cd="defense"]') };
    POWERUP_ORDER.forEach((_, i) => this.powerCounts.push(q(`[data-power="${i}"]`)));
    this.minimap = this.root.querySelector<HTMLCanvasElement>('.hud-map')!.getContext('2d')!;
  }

  private slot(key: string, name: string, id: string, extra = ''): string {
    return `<div class="slot"><div class="slot-cd" data-cd="${id}"></div><kbd>${key}</kbd><span>${name}</span>${extra}</div>`;
  }

  private markDamage(source: number): void {
    let mark = this.damageMarks.get(source);
    if (!mark) {
      const el = document.createElement('div');
      el.className = 'damage-mark';
      // Hidden until the next update rotates it, or it would flash pointing straight ahead.
      el.style.opacity = '0';
      this.damageLayer.appendChild(el);
      mark = { el, time: 0 };
      this.damageMarks.set(source, mark);
    }
    mark.time = DAMAGE_MARK_TIME;
  }

  private updateDamageMarks(dt: number): void {
    const { player, match } = this;
    for (const [source, mark] of this.damageMarks) {
      mark.time -= dt;
      if (mark.time <= 0) {
        mark.el.remove();
        this.damageMarks.delete(source);
        continue;
      }
      const from = match.bots[source];
      const angle = relativeBearing(player.x, player.z, player.heading, from.x, from.z);
      // Positive means left of the robot, which is counterclockwise on screen.
      mark.el.style.transform = `rotate(${-angle}rad)`;
      mark.el.style.opacity = String(Math.min(1, mark.time * 2));
    }
  }

  setTutorialPrompt(text: string): void {
    if (this.tutorial.textContent !== text) this.tutorial.textContent = text;
  }

  handleEvent(event: GameEvent): void {
    if (event.type === 'hit' && event.target === this.player.id && event.source >= 0 && event.source !== this.player.id) {
      this.markDamage(event.source);
      return;
    }
    if (event.type !== 'kill') return;
    const { bots } = this.match;
    const victim = bots[event.victim];
    const killer = event.killer >= 0 ? bots[event.killer] : null;
    const row = document.createElement('div');
    row.className = killer === this.player ? 'feed-row feed-mine' : 'feed-row';
    const name = (bot: Bot) => `<b style="color:${hex(bot.color)}">${escapeText(bot.name)}</b>`;
    if (killer) row.innerHTML = `${name(killer)} ${event.fell ? 'sent' : 'scrapped'} ${name(victim)}${event.fell ? ' over the edge' : ''}`;
    else row.innerHTML = `${name(victim)} ${event.fell ? 'took the long way down' : 'lost to the arena'}`;
    this.feed.prepend(row);
    window.setTimeout(() => row.remove(), 5000);
    while (this.feed.children.length > 5) this.feed.lastElementChild?.remove();
  }

  update(dt: number): void {
    const { match, player } = this;
    this.updateDamageMarks(dt);
    const health = player.hp / player.maxHp;
    this.hpFill.style.width = `${health * 100}%`;
    this.hpFill.style.background = health > 0.5 ? '#5be36a' : health > 0.25 ? '#f2c037' : '#e84a3a';
    this.setText(this.hpText, `${Math.ceil(player.hp)} / ${Math.round(player.maxHp)}`);

    const left = Math.ceil(match.timeLeft);
    this.setText(this.timer, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    this.timer.classList.toggle('hud-timer-low', left <= 15);

    const money = Math.round(player.earned);
    if (money !== this.lastMoney) {
      this.lastMoney = money;
      this.money.textContent = `+$${money}`;
    }

    const { loadout } = player;
    const fraction = (left: number, total: number) => (total > 0 ? left / total : 0);
    this.setCooldown('melee', fraction(player.meleeCd, MELEE[loadout.melee].cooldown));
    this.setCooldown('turret', fraction(player.turretCd, TURRETS[loadout.turret].cooldown));
    this.setCooldown('defense', fraction(player.defenseCd, DEFENSES[loadout.defense].cooldown));
    this.ammo.style.width = `${Math.max(0, player.ammo) * 100}%`;
    this.ammo.style.background = player.ammo < TURRETS[loadout.turret].ammo ? '#e84a3a' : '#f2c037';
    this.blind.style.opacity = String(Math.min(1, player.blindT * 1.2));
    POWERUP_ORDER.forEach((id, i) => {
      const n = player.powerups[id];
      const el = this.powerCounts[i];
      if (el.textContent !== String(n)) {
        el.textContent = String(n);
        el.parentElement!.classList.toggle('slot-empty', n === 0);
      }
    });

    const tags: string[] = [];
    if (player.turboT > 0) tags.push('TURBO');
    if (player.rageT > 0) tags.push('RAGE');
    if (player.shieldT > 0) tags.push('FORCE FIELD');
    if (player.megaT > 0) tags.push('MEGA SHIELD');
    if (player.cloakT > 0) tags.push('CLOAKED');
    if (player.xrayT > 0) tags.push('X-RAY');
    if (player.regenT > 0) tags.push('REPAIRING');
    if (player.stunT > 0) tags.push('STUNNED');
    if (player.blindT > 0) tags.push('BLINDED');
    if (player.burnT > 0) tags.push('BURNING');
    if (player.kamikazeT > 0) tags.push('DETONATING');
    if (player.oiled) tags.push('OIL!');
    if (player.glued) tags.push('GLUE!');
    const effectText = tags.join(' · ');
    if (this.effects.textContent !== effectText) this.effects.textContent = effectText;

    const dead = player.out ? 'ELIMINATED — spectating' : `SCRAPPED — rebuilding in ${Math.ceil(player.respawnT)}`;
    const centerText = this.notice || (player.alive ? '' : dead);
    if (centerText !== this.lastCenter) {
      this.lastCenter = centerText;
      this.center.textContent = centerText;
    }

    this.boardTimer -= dt;
    if (this.boardTimer <= 0) {
      this.boardTimer = 0.25;
      this.drawBoard();
    }
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = MAP_INTERVAL;
      this.drawMap();
    }
  }

  /** Writing text makes the browser lay the page out again, even when the text is the same. */
  private setText(el: HTMLElement, text: string): void {
    if (el.textContent !== text) el.textContent = text;
  }

  setPing(ms: number): void {
    const text = ms > 0 ? `${ms} ms` : '';
    if (this.ping.textContent !== text) this.ping.textContent = text;
  }

  private setCooldown(id: 'melee' | 'turret' | 'defense', fraction: number): void {
    this.cooldowns[id].style.transform = `scaleY(${Math.min(1, fraction)})`;
  }

  private drawBoard(): void {
    const html = this.match.ranked()
      .map(
        (bot) =>
          `<div class="board-row${bot === this.player ? ' board-me' : ''}${bot.alive ? '' : ' board-dead'}">` +
          `<i style="background:${hex(bot.color)}"></i><span>${escapeText(bot.name)}</span><b>${this.match.score(bot)}</b></div>`,
      )
      .join('');
    if (html === this.boardHtml) return;
    this.boardHtml = html;
    this.board.innerHTML = html;
  }

  private drawMap(): void {
    const g = this.minimap;
    const size = 180;
    const { arena } = this.match;
    const scale = size / (arena.half * 2);
    // Up is +z and right is -x, matching what a camera looking along +z sees.
    const toX = (x: number) => size / 2 - x * scale;
    const toY = (z: number) => size / 2 - z * scale;
    g.clearRect(0, 0, size, size);
    g.fillStyle = 'rgba(15,17,20,0.75)';
    g.fillRect(0, 0, size, size);
    g.strokeStyle = '#e6b422';
    g.lineWidth = 2;
    g.strokeRect(1, 1, size - 2, size - 2);

    const circles = (list: { x: number; z: number; r: number }[], color: string) => {
      g.fillStyle = color;
      for (const p of list) {
        g.beginPath();
        g.arc(toX(p.x), toY(p.z), p.r * scale, 0, Math.PI * 2);
        g.fill();
      }
    };
    circles(arena.pits, '#000');
    circles(arena.firePits, '#a8481a');
    circles(arena.shockers, '#2b6a8a');
    circles(arena.pillars, '#4a4e52');
    if (this.match.mode === 'koth') {
      g.strokeStyle = '#ffd23a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(toX(arena.hill.x), toY(arena.hill.z), arena.hill.r * scale, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#e84a3a';
    for (const saw of arena.saws) {
      const pos = sawPos(saw, this.match.time);
      g.beginPath();
      g.arc(toX(pos.x), toY(pos.z), 3, 0, Math.PI * 2);
      g.fill();
    }
    for (const p of this.match.pickups) {
      g.fillStyle = p.kind === 'repair' ? '#5be36a' : '#ffd24a';
      g.fillRect(toX(p.x) - 2, toY(p.z) - 2, 4, 4);
    }
    for (const bot of this.match.bots) {
      if (!bot.alive || (bot !== this.player && !this.match.canSee(this.player, bot))) continue;
      const x = toX(bot.x);
      const y = toY(bot.z);
      const r = bot === this.player ? 7 : 5;
      g.save();
      g.translate(x, y);
      g.rotate(-bot.heading);
      g.fillStyle = hex(bot.color);
      g.beginPath();
      g.moveTo(0, -r);
      g.lineTo(r * 0.7, r * 0.8);
      g.lineTo(-r * 0.7, r * 0.8);
      g.closePath();
      g.fill();
      if (bot === this.player) {
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.stroke();
      }
      g.restore();
    }
  }
}

export const UPGRADE_ORDER = Object.keys(UPGRADES) as (keyof typeof UPGRADES)[];
