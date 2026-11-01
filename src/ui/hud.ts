import { sawPos, TRAP_NAMES } from '../sim/arena';
import { keyLabel, type Action, type Bindings } from '../game/settings';
import { QUICK_CHAT } from '../net/protocol';
import { DEFENSES, leaveWait, legibleColor, MELEE, MODES, POWERUPS, POWERUP_ORDER, SPECTATE, TURRETS, UPGRADES } from '../sim/data';
import { relativeBearing, type Bot, type GameEvent, type Match } from '../sim/match';

const POWER_ACTIONS: Action[] = ['power1', 'power2', 'power3', 'power4', 'power5', 'power6'];
const DAMAGE_MARK_TIME = 1;
const MAP_INTERVAL = 1 / 20;
/** A flash dazzles, but the roof stays visible through it. */
const BLIND_MAX = 0.55;
const q = (root: HTMLElement, selector: string) => root.querySelector<HTMLElement>(selector)!;

function hex(color: number): string {
  return `#${legibleColor(color).toString(16).padStart(6, '0')}`;
}

/** Online, robot names come from other players, so they must always pass through this. */
export function escapeText(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export interface HudActions {
  onChat: (id: number) => void;
  onSurrender: () => void;
  onDraw: () => void;
  /** Giving up after being knocked out of a match that's still going. */
  onLeave: () => void;
  onCountdown: (go: boolean) => void;
}

/** How long "Eliminated" stays up before it gets out of the way of the view. */
const ELIMINATED_SHOWN = 2;
const GO_SHOWN = 0.7;

const SURRENDER_CONFIRM_MS = 3000;
const DRAW_OFFER_MS = 15000;

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
  private lastCount = '';
  private goLeft = 0;
  private outFor = 0;
  private readonly leavePanel: HTMLElement;
  private readonly spectateEarn: HTMLElement;
  private readonly trapReady: Record<'strike' | 'slick' | 'pull', HTMLElement>;
  private readonly leaveText: HTMLElement;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly onCountdown: (go: boolean) => void;
  private readonly ping: HTMLElement;
  private readonly blind: HTMLElement;
  private readonly battery: HTMLElement;
  private readonly shots: HTMLElement;
  private readonly rivalName: HTMLElement;
  private readonly rivalFill: HTMLElement;
  private readonly rivalWeapon: HTMLElement;
  private readonly rivalBattery: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly chatMenu: HTMLElement;
  private readonly surrenderBtn: HTMLButtonElement;
  private readonly drawBtn: HTMLButtonElement;
  private readonly duel: boolean;
  private rival: Bot;

  private readonly tutorial: HTMLElement;
  private readonly damageLayer: HTMLElement;
  /** One indicator per attacker, refreshed while they keep hitting. */
  private readonly damageMarks = new Map<number, { el: HTMLElement; time: number }>();

  constructor(private readonly match: Match, private readonly player: Bot, keys: Bindings, actions: HudActions) {
    const { loadout } = player;
    this.duel = match.mode === 'duel';
    this.rival = match.bots.find((bot) => bot !== player) ?? player;
    this.root.className = `hud${this.duel ? ' hud-duel' : ''}`;
    this.root.innerHTML = `
      <div class="hud-status">
        <div class="hud-money"></div>
        <div class="hud-effects"></div>
      </div>
      <div class="hud-timer"></div>
      <div class="hud-ping"></div>
      <div class="hud-mode">${escapeText(match.arena.name)} · ${MODES[match.mode].name}</div>
      <div class="hud-arrow"></div>
      <div class="hud-board"></div>
      <div class="hud-feed"></div>
      <div class="hud-blind"></div>
      <div class="hud-damage"></div>
      <div class="hud-center"></div>
      <div class="hud-spectate" hidden>
        <h3>Spectating</h3>
        <p class="spectate-earn" data-spectate-earn></p>
        <p class="spectate-hint"><kbd>${keyLabel(keys.forward)}</kbd><kbd>${keyLabel(keys.left)}</kbd><kbd>${keyLabel(keys.back)}</kbd><kbd>${keyLabel(keys.right)}</kbd> move the marker</p>
        ${this.trapRow(keyLabel(keys.melee), TRAP_NAMES[match.arena.id].strike, 'strike')}
        ${this.trapRow(keyLabel(keys.turret), TRAP_NAMES[match.arena.id].slick, 'slick')}
        ${this.trapRow(keyLabel(keys.defense), TRAP_NAMES[match.arena.id].pull, 'pull')}
        <div class="spectate-leave">
          <p data-leave-text></p>
          <small>Leaving now will result in no payout.</small>
          <button class="dock-btn" tabindex="-1" data-leave disabled>Leave match</button>
        </div>
      </div>
      <div class="hud-tutorial" role="status"></div>
      <canvas class="hud-map" width="180" height="180"></canvas>
      <div class="hud-powers">
        ${POWERUP_ORDER.map(
          (id, i) => `<div class="slot slot-power"><kbd>${keyLabel(keys[POWER_ACTIONS[i]])}</kbd><span>${POWERUPS[id].name}</span><b data-power="${i}"></b></div>`,
        ).join('')}
      </div>
      <div class="hud-dock">
        <div class="dock-card">
          <div class="dock-field"><label>Name:</label><div class="dock-name" style="color:${hex(player.color)}">${escapeText(player.name)}</div></div>
          <div class="dock-field"><label>Armour:</label><div class="hp-bar"><div class="hp-fill"></div><span class="hp-text"></span></div></div>
          <div class="dock-slots">
            ${this.slot(keyLabel(keys.melee), MELEE[loadout.melee].name, 'melee')}
            ${this.slot(keyLabel(keys.turret), TURRETS[loadout.turret].name, 'turret', '<b class="slot-shots" data-shots></b>')}
            ${this.slot(keyLabel(keys.defense), DEFENSES[loadout.defense].name, 'defense')}
          </div>
          <div class="dock-battery"><div class="battery"><i data-battery></i></div><label>Battery:</label></div>
        </div>
        <div class="dock-mid">
          <div class="chat-menu" hidden>${QUICK_CHAT.map((text, i) => `<button tabindex="-1" data-chat-id="${i}">${text}</button>`).join('')}</div>
          <button class="dock-btn" tabindex="-1" data-chat>Chat</button>
          <button class="dock-btn" tabindex="-1" data-surrender>Surrender</button>
          <button class="dock-btn" tabindex="-1" data-draw>Offer draw</button>
        </div>
        <div class="dock-card">
          <div class="dock-field"><label>Name:</label><div class="dock-name" data-rival-name></div></div>
          <div class="dock-field"><label>Armour:</label><div class="hp-bar"><div class="hp-fill" data-rival-fill></div></div></div>
          <div class="dock-weapon" data-rival-weapon></div>
          <div class="dock-battery"><div class="battery"><i data-rival-battery></i></div><label>Battery:</label></div>
        </div>
      </div>
    `;
    const q = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
    this.hpFill = q('.hp-fill');
    this.hpText = q('.hp-text');
    this.timer = q('.hud-timer');
    this.ping = q('.hud-ping');
    this.blind = q('.hud-blind');
    this.battery = q('[data-battery]');
    this.shots = q('[data-shots]');
    this.rivalName = q('[data-rival-name]');
    this.rivalFill = q('[data-rival-fill]');
    this.rivalWeapon = q('[data-rival-weapon]');
    this.rivalBattery = q('[data-rival-battery]');
    this.arrow = q('.hud-arrow');
    this.chatMenu = q('.chat-menu');
    this.surrenderBtn = q('[data-surrender]') as HTMLButtonElement;
    this.drawBtn = q('[data-draw]') as HTMLButtonElement;
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
    if (!this.duel) {
      this.surrenderBtn.disabled = true;
      this.drawBtn.disabled = true;
    }
    this.leavePanel = q('.hud-spectate');
    this.spectateEarn = q('[data-spectate-earn]');
    this.trapReady = { strike: q('[data-trap="strike"]'), slick: q('[data-trap="slick"]'), pull: q('[data-trap="pull"]') };
    this.leaveText = q('[data-leave-text]');
    this.leaveBtn = q('[data-leave]') as HTMLButtonElement;
    this.leaveBtn.addEventListener('click', () => actions.onLeave());
    this.onCountdown = actions.onCountdown;
    this.bindDock(actions);
  }

  private bindDock(actions: HudActions): void {
    let confirmTimer = 0;
    q(this.root, '.hud-dock').addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      // A button left focused would catch the spacebar, which fires the main weapon.
      button.blur();
      const { chatId } = button.dataset;
      if (chatId !== undefined) {
        this.chatMenu.hidden = true;
        actions.onChat(Number(chatId));
      } else if ('chat' in button.dataset) {
        this.chatMenu.hidden = !this.chatMenu.hidden;
      } else if ('surrender' in button.dataset) {
        if (confirmTimer) {
          actions.onSurrender();
          return;
        }
        button.textContent = 'Are you sure?';
        confirmTimer = window.setTimeout(() => {
          confirmTimer = 0;
          button.textContent = 'Surrender';
        }, SURRENDER_CONFIRM_MS);
      } else if ('draw' in button.dataset) {
        actions.onDraw();
      }
    });
  }

  private trapRow(key: string, name: string, id: string): string {
    return `<div class="spectate-trap"><kbd>${escapeText(key)}</kbd><span>${escapeText(name)}</span><b class="trap-ready" data-trap="${id}">Ready</b></div>`;
  }

  /** 3, 2, 1, GO! Empty once the match is under way. */
  private countdownText(dt: number): string {
    const { countdown } = this.match;
    let text = '';
    if (countdown > 0) {
      text = String(Math.ceil(countdown));
    } else if (this.lastCount && this.lastCount !== 'GO!') {
      this.goLeft = GO_SHOWN;
      text = 'GO!';
    } else if (this.goLeft > 0) {
      this.goLeft -= dt;
      text = 'GO!';
    }
    if (text && text !== this.lastCount) this.onCountdown(text === 'GO!');
    this.lastCount = text;
    return text;
  }

  /** Once someone's out for good they may go, after a wait, if the match is still running without them. */
  private updateLeave(dt: number): void {
    const waiting = this.player.out && !this.match.over && !this.duel;
    if (this.leavePanel.hidden === waiting) this.leavePanel.hidden = !waiting;
    if (!waiting) return;
    this.outFor += dt;
    const earned = `+$${Math.floor(this.outFor * SPECTATE.payPerSecond)} for staying`;
    if (this.spectateEarn.textContent !== earned) this.spectateEarn.textContent = earned;
    const { strikeCd, slickCd, pullCd } = this.player;
    const ready = (el: HTMLElement, cd: number) => {
      const text = cd > 0 ? `${Math.ceil(cd)}s` : 'Ready';
      if (el.textContent !== text) {
        el.textContent = text;
        el.classList.toggle('trap-ready', cd <= 0);
      }
    };
    ready(this.trapReady.strike, strikeCd);
    ready(this.trapReady.slick, slickCd);
    ready(this.trapReady.pull, pullCd);
    const left = Math.ceil(leaveWait(this.player.eliminatedAt) - this.outFor);
    const text = left > 0 ? `You can leave in ${left}` : 'You can leave now';
    if (this.leaveText.textContent !== text) {
      this.leaveText.textContent = text;
      this.leaveBtn.disabled = left > 0;
    }
  }

  /** A quick-chat line from a pilot. */
  showChat(bot: number, id: number): void {
    const sender = this.match.bots[bot];
    if (!sender || !QUICK_CHAT[id]) return;
    this.addFeed(`<b style="color:${hex(sender.color)}">${escapeText(sender.name)}:</b> ${QUICK_CHAT[id]}`);
  }

  message(text: string): void {
    this.addFeed(escapeText(text));
  }

  /** Lights up the button so the other pilot's offer can be accepted, for as long as it stands. */
  drawOffered(bot: number): void {
    if (bot === this.player.id) {
      this.addFeed('You offered a draw.');
      return;
    }
    this.addFeed(`<b style="color:${hex(this.match.bots[bot].color)}">${escapeText(this.match.bots[bot].name)}</b> offers a draw.`);
    this.drawBtn.textContent = 'Accept draw';
    this.drawBtn.classList.add('dock-btn-hot');
    window.setTimeout(() => {
      this.drawBtn.textContent = 'Offer draw';
      this.drawBtn.classList.remove('dock-btn-hot');
    }, DRAW_OFFER_MS);
  }

  private addFeed(html: string, mine = false): void {
    const row = document.createElement('div');
    row.className = mine ? 'feed-row feed-mine' : 'feed-row';
    row.innerHTML = html;
    this.feed.prepend(row);
    window.setTimeout(() => row.remove(), 5000);
    while (this.feed.children.length > 5) this.feed.lastElementChild?.remove();
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
    const name = (bot: Bot) => `<b style="color:${hex(bot.color)}">${escapeText(bot.name)}</b>`;
    if (killer) this.addFeed(`${name(killer)} ${event.fell ? 'sent' : 'scrapped'} ${name(victim)}${event.fell ? ' over the edge' : ''}`, killer === this.player);
    else this.addFeed(`${name(victim)} ${event.fell ? 'took the long way down' : 'lost to the arena'}`);
  }

  update(dt: number): void {
    const { match, player } = this;
    this.updateDamageMarks(dt);
    const health = player.hp / player.maxHp;
    this.hpFill.style.width = `${health * 100}%`;
    this.hpFill.style.background = health > 0.5 ? '#d8d84a' : health > 0.25 ? '#f2a037' : '#e84a3a';
    this.setText(this.hpText, `${Math.min(Math.ceil(player.hp), Math.round(player.maxHp))} / ${Math.round(player.maxHp)}`);

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
    // A spinner fills up as it reaches speed, so the bar shows how much is still to come.
    const meleeDef = MELEE[loadout.melee];
    this.setCooldown('melee', meleeDef.kind === 'spinner' && player.meleeCd <= 0 ? 1 - player.meleeCharge : fraction(player.meleeCd, meleeDef.cooldown));
    this.setCooldown('turret', fraction(player.turretCd, TURRETS[loadout.turret].cooldown));
    this.setCooldown('defense', fraction(player.defenseCd, DEFENSES[loadout.defense].cooldown));
    this.battery.style.height = `${Math.max(0, player.ammo) * 100}%`;
    this.battery.style.background = player.ammo < TURRETS[loadout.turret].battery ? '#e84a3a' : '#d8d84a';
    // The flamethrower is limited only by the battery.
    this.setText(this.shots, TURRETS[loadout.turret].shots > 0 ? String(player.shots) : '');
    this.updateRival();
    this.blind.style.opacity = String(Math.min(BLIND_MAX, player.blindT * BLIND_MAX * 1.2));
    POWERUP_ORDER.forEach((id, i) => {
      const n = player.powerups[id];
      const el = this.powerCounts[i];
      if (el.textContent !== String(n)) {
        el.textContent = String(n);
        el.parentElement!.classList.toggle('slot-empty', n === 0);
      }
    });

    const tags: string[] = [];
    if (player.boostT > 0) tags.push('BOOST');
    if (player.airT > 0) tags.push('AIRBORNE');
    if (player.rageT > 0) tags.push('RAGE');
    if (player.shieldT > 0) tags.push('FORCE FIELD');
    if (player.megaT > 0) tags.push('MEGA SHIELD');
    if (player.cloakT > 0) tags.push('CLOAKED');
    if (player.xrayT > 0) tags.push('X-RAY');
    if (player.regenT > 0) tags.push('REPAIRING');
    if (player.flipT > 0) tags.push('UPSIDE DOWN');
    else if (player.stunT > 0) tags.push('STUNNED');
    if (player.blindT > 0) tags.push('BLINDED');
    if (player.burnT > 0) tags.push('BURNING');
    if (player.kamikazeT > 0) tags.push('DETONATING');
    if (player.oiled) tags.push('OIL!');
    if (player.glued) tags.push('GLUE!');
    const effectText = tags.join(' · ');
    if (this.effects.textContent !== effectText) this.effects.textContent = effectText;

    const dead = this.duel ? 'SCRAPPED' : player.out ? (this.outFor < ELIMINATED_SHOWN ? 'ELIMINATED' : '') : `SCRAPPED — rebuilding in ${Math.ceil(player.respawnT)}`;
    const won = this.duel && player.alive && this.rival.out ? 'VICTORY!' : '';
    const count = this.countdownText(dt);
    const centerText = this.notice || count || (player.alive ? won : dead);
    this.updateLeave(dt);
    if (centerText !== this.lastCenter) {
      this.lastCenter = centerText;
      this.center.textContent = centerText;
      this.center.classList.toggle('hud-count', count !== '' && centerText === count);
      if (count && centerText === count) {
        this.center.animate([{ transform: 'scale(2.4)', opacity: 0.2 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'ease-out' });
      }
    }

    this.boardTimer -= dt;
    if (this.boardTimer <= 0) {
      this.boardTimer = 0.25;
      if (!this.duel) this.drawBoard();
    }
    this.mapTimer -= dt;
    if (!this.duel && this.mapTimer <= 0) {
      this.mapTimer = MAP_INTERVAL;
      this.drawMap();
    }
  }

  /** Writing text makes the browser lay the page out again, even when the text is the same. */
  private setText(el: HTMLElement, text: string): void {
    if (el.textContent !== text) el.textContent = text;
  }

  /** The right-hand card shows the opponent, or whoever is winning when there are several. */
  private updateRival(): void {
    const { match, player } = this;
    if (!this.duel && this.boardTimer <= 0) this.rival = match.ranked().find((bot) => bot !== player) ?? player;
    const rival = this.rival;
    this.setText(this.rivalName, rival.name);
    this.rivalName.style.color = hex(rival.color);
    this.setText(this.rivalWeapon, MELEE[rival.loadout.melee].name);
    const health = rival.hp / rival.maxHp;
    this.rivalFill.style.width = `${health * 100}%`;
    this.rivalFill.style.background = health > 0.5 ? '#d8d84a' : health > 0.25 ? '#f2a037' : '#e84a3a';
    this.rivalBattery.style.height = `${Math.max(0, rival.ammo) * 100}%`;
    // Without a map, this is how to find them on the roof.
    const seen = this.duel && rival.alive && player.alive && match.canSee(player, rival);
    this.arrow.hidden = !seen;
    if (seen) this.arrow.style.transform = `rotate(${-relativeBearing(player.x, player.z, player.heading, rival.x, rival.z)}rad)`;
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
    for (const block of arena.blocks) {
      g.fillStyle = block.kind === 'fence' ? '#8a8a78' : '#4a4e52';
      g.fillRect(toX(block.x) - (block.w * scale) / 2, toY(block.z) - (block.d * scale) / 2, block.w * scale, block.d * scale);
    }
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
