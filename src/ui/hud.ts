import { ARENA, sawPos } from '../sim/arena';
import { DEFENSES, MELEE, POWERUPS, POWERUP_ORDER, TURRETS, UPGRADES } from '../sim/data';
import type { Bot, GameEvent, Match } from '../sim/match';

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
  private lastMoney = -1;
  private lastCenter = '';
  /** Takes priority over the respawn message. */
  notice = '';
  private readonly ping: HTMLElement;

  constructor(private readonly match: Match, private readonly player: Bot) {
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
      <div class="hud-board"></div>
      <div class="hud-feed"></div>
      <div class="hud-center"></div>
      <div class="hud-slots">
        ${this.slot('X', MELEE[loadout.melee].name, 'melee')}
        ${this.slot('C', TURRETS[loadout.turret].name, 'turret')}
        ${this.slot('V', DEFENSES[loadout.defense].name, 'defense')}
        <div class="slot-gap"></div>
        ${POWERUP_ORDER.map(
          (id, i) => `<div class="slot slot-power"><kbd>${i + 1}</kbd><span>${POWERUPS[id].name}</span><b data-power="${i}"></b></div>`,
        ).join('')}
      </div>
      <canvas class="hud-map" width="180" height="180"></canvas>
    `;
    const q = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
    this.hpFill = q('.hp-fill');
    this.hpText = q('.hp-text');
    this.timer = q('.hud-timer');
    this.ping = q('.hud-ping');
    this.board = q('.hud-board');
    this.feed = q('.hud-feed');
    this.center = q('.hud-center');
    this.money = q('.hud-money');
    this.effects = q('.hud-effects');
    this.cooldowns = { melee: q('[data-cd="melee"]'), turret: q('[data-cd="turret"]'), defense: q('[data-cd="defense"]') };
    POWERUP_ORDER.forEach((_, i) => this.powerCounts.push(q(`[data-power="${i}"]`)));
    this.minimap = this.root.querySelector<HTMLCanvasElement>('.hud-map')!.getContext('2d')!;
  }

  private slot(key: string, name: string, id: string): string {
    return `<div class="slot"><div class="slot-cd" data-cd="${id}"></div><kbd>${key}</kbd><span>${name}</span></div>`;
  }

  handleEvent(event: GameEvent): void {
    if (event.type !== 'kill') return;
    const { bots } = this.match;
    const victim = bots[event.victim];
    const killer = event.killer >= 0 ? bots[event.killer] : null;
    const row = document.createElement('div');
    row.className = killer === this.player ? 'feed-row feed-mine' : 'feed-row';
    row.innerHTML = killer
      ? `<b style="color:${hex(killer.color)}">${escapeText(killer.name)}</b> scrapped <b style="color:${hex(victim.color)}">${escapeText(victim.name)}</b>`
      : `<b style="color:${hex(victim.color)}">${escapeText(victim.name)}</b> found the saws`;
    this.feed.prepend(row);
    window.setTimeout(() => row.remove(), 5000);
    while (this.feed.children.length > 5) this.feed.lastElementChild?.remove();
  }

  update(dt: number): void {
    const { match, player } = this;
    const health = player.hp / player.maxHp;
    this.hpFill.style.width = `${health * 100}%`;
    this.hpFill.style.background = health > 0.5 ? '#5be36a' : health > 0.25 ? '#f2c037' : '#e84a3a';
    this.hpText.textContent = `${Math.ceil(player.hp)} / ${Math.round(player.maxHp)}`;

    const left = Math.ceil(match.timeLeft);
    this.timer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('hud-timer-low', left <= 15);

    const money = Math.round(player.earned);
    if (money !== this.lastMoney) {
      this.lastMoney = money;
      this.money.textContent = `+$${money}`;
    }

    const { loadout } = player;
    this.setCooldown('melee', MELEE[loadout.melee].cooldown ? player.meleeCd / MELEE[loadout.melee].cooldown : 0);
    this.setCooldown('turret', player.turretCd / TURRETS[loadout.turret].cooldown);
    this.setCooldown('defense', player.defenseCd / DEFENSES[loadout.defense].cooldown);
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
    if (player.overdriveT > 0) tags.push('OVERDRIVE');
    if (player.shieldT > 0) tags.push('SHIELD');
    if (player.stunT > 0) tags.push('STUNNED');
    if (player.oiled) tags.push('OIL!');
    const effectText = tags.join(' · ');
    if (this.effects.textContent !== effectText) this.effects.textContent = effectText;

    const centerText = this.notice || (player.alive ? '' : `SCRAPPED — rebuilding in ${Math.ceil(player.respawnT)}`);
    if (centerText !== this.lastCenter) {
      this.lastCenter = centerText;
      this.center.textContent = centerText;
    }

    this.boardTimer -= dt;
    if (this.boardTimer <= 0) {
      this.boardTimer = 0.25;
      this.drawBoard();
    }
    this.drawMap();
  }

  setPing(ms: number): void {
    const text = ms > 0 ? `${ms} ms` : '';
    if (this.ping.textContent !== text) this.ping.textContent = text;
  }

  private setCooldown(id: 'melee' | 'turret' | 'defense', fraction: number): void {
    this.cooldowns[id].style.transform = `scaleY(${Math.min(1, fraction)})`;
  }

  private drawBoard(): void {
    const sorted = [...this.match.bots].sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt);
    this.board.innerHTML = sorted
      .map(
        (bot) =>
          `<div class="board-row${bot === this.player ? ' board-me' : ''}${bot.alive ? '' : ' board-dead'}">` +
          `<i style="background:${hex(bot.color)}"></i><span>${escapeText(bot.name)}</span><b>${bot.kills}</b></div>`,
      )
      .join('');
  }

  private drawMap(): void {
    const g = this.minimap;
    const size = 180;
    const scale = size / (ARENA.half * 2);
    // Up is +z and right is -x, matching what a camera looking along +z sees.
    const toX = (x: number) => size / 2 - x * scale;
    const toY = (z: number) => size / 2 - z * scale;
    g.clearRect(0, 0, size, size);
    g.fillStyle = 'rgba(15,17,20,0.75)';
    g.fillRect(0, 0, size, size);
    g.strokeStyle = '#e6b422';
    g.lineWidth = 2;
    g.strokeRect(1, 1, size - 2, size - 2);

    g.fillStyle = '#4a4e52';
    for (const p of ARENA.pillars) {
      g.beginPath();
      g.arc(toX(p.x), toY(p.z), p.r * scale, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e84a3a';
    for (const saw of ARENA.saws) {
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
      if (!bot.alive) continue;
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
