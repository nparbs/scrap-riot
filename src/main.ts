import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sfx } from './audio';
import { applyResult, buyOrEquip, buyPowerup, buyUpgrade, loadSave, makeRivals, writeSave, type Save, type Slot } from './game/progress';
import { Keyboard } from './input';
import { GarageView } from './render/garageView';
import { MatchView } from './render/matchView';
import { Match, STEP, type Bot, type BotSetup, type GameEvent } from './sim/match';
import { Hud } from './ui/hud';
import { garageScreen, menuScreen, PLAYER_COLOR, pauseScreen, resultsScreen } from './ui/screens';

type Mode = 'menu' | 'garage' | 'match' | 'paused' | 'results';

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

class Game {
  private readonly stage = document.getElementById('stage')!;
  private readonly ui = document.getElementById('ui')!;
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly storage = safeStorage();
  private readonly save: Save = loadSave(this.storage);
  private readonly view = new MatchView();
  private readonly garage = new GarageView();
  private readonly keyboard = new Keyboard();
  private readonly sfx = new Sfx();
  private mode: Mode = 'menu';
  private match: Match | null = null;
  private player: Bot | null = null;
  private hud: Hud | null = null;
  private accumulator = 0;
  private last = performance.now();
  private clock = 0;

  constructor() {
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.stage.appendChild(r.domElement);

    // Metal needs something to reflect, or it renders black.
    const pmrem = new THREE.PMREMGenerator(r);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    for (const scene of [this.view.arena.scene, this.garage.scene]) {
      scene.environment = environment;
      scene.environmentIntensity = 0.55;
    }

    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.keyboard.onFirstInput = () => this.sfx.unlock();
    this.keyboard.onPause = () => this.togglePause();
    this.keyboard.onMute = () => this.sfx.toggleMute();
    window.addEventListener('pointerdown', () => this.sfx.unlock());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'match') this.togglePause();
    });
    this.view.onEvent = (event) => this.onMatchEvent(event);

    this.showMenu();
    requestAnimationFrame((t) => this.frame(t));
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.view.resize(w, h);
    this.garage.resize(w, h);
  }

  private setScreen(el: HTMLElement | null): void {
    this.ui.replaceChildren(...(el ? [el] : []));
  }

  private showMenu(): void {
    this.mode = 'menu';
    this.startDemo();
    this.setScreen(menuScreen(() => this.showGarage()));
  }

  /** The title screen runs a real AI-only match in the background. */
  private startDemo(): void {
    const seed = Math.floor(Math.random() * 1e9);
    this.match = new Match(makeRivals(null, 6, seed), { seed });
    this.player = null;
    this.view.setMatch(this.match, 0);
  }

  private showGarage(): void {
    this.sfx.click();
    this.mode = 'garage';
    this.match = null;
    this.hud = null;
    this.sfx.setLoops(-1, false);
    this.refreshGarage();
  }

  private refreshGarage(): void {
    const { loadout } = this.save;
    const { chassis, melee, turret, defense } = loadout;
    this.garage.setBuild({ chassis, melee, turret, defense, color: PLAYER_COLOR });
    const panel = this.ui.querySelector('.garage-panel');
    const scroll = panel ? panel.scrollTop : 0;
    const buy = (ok: boolean) => {
      if (ok) {
        this.sfx.click();
        writeSave(this.storage, this.save);
        this.refreshGarage();
      } else {
        this.sfx.deny();
      }
    };
    this.setScreen(
      garageScreen(this.save, {
        onEquip: (slot: Slot, id: string) => buy(buyOrEquip(this.save, slot, id)),
        onPowerup: (id) => buy(buyPowerup(this.save, id)),
        onUpgrade: (id) => buy(buyUpgrade(this.save, id)),
        onFight: () => this.startMatch(),
      }),
    );
    const next = this.ui.querySelector('.garage-panel');
    if (next) next.scrollTop = scroll;
  }

  private startMatch(): void {
    const seed = Math.floor(Math.random() * 1e9);
    const me: BotSetup = { name: 'You', color: PLAYER_COLOR, loadout: this.save.loadout, isAI: false };
    this.match = new Match([me, ...makeRivals(this.save, 5, seed)], { seed });
    this.player = this.match.bots[0];
    this.hud = new Hud(this.match, this.player);
    this.view.setMatch(this.match, this.player.id);
    this.setScreen(this.hud.root);
    this.keyboard.clear();
    this.accumulator = 0;
    this.mode = 'match';
    this.sfx.click();
  }

  private togglePause(): void {
    if (this.mode === 'match') {
      this.mode = 'paused';
      this.sfx.setLoops(-1, false);
      const overlay = pauseScreen(() => this.togglePause(), () => this.showGarage());
      this.ui.appendChild(overlay);
    } else if (this.mode === 'paused') {
      this.mode = 'match';
      this.ui.querySelector('.screen-pause')?.remove();
      this.keyboard.clear();
    }
  }

  private finishMatch(): void {
    const { match, player } = this;
    if (!match || !player) return;
    this.mode = 'results';
    this.sfx.setLoops(-1, false);
    const standings = match.standings();
    const mine = standings.find((s) => s.bot === player)!;
    applyResult(this.save, mine.total, mine.place, player.powerups);
    writeSave(this.storage, this.save);
    this.setScreen(resultsScreen(standings, player.id, () => this.showGarage()));
  }

  private onMatchEvent(event: GameEvent): void {
    this.hud?.handleEvent(event);
    const player = this.player;
    if (!player || !this.match) return;
    // Sounds fade with distance from the player.
    const near = (x: number, z: number) => Math.max(0.05, 1 - Math.hypot(x - player.x, z - player.z) / 40);
    switch (event.type) {
      case 'shot':
        this.sfx.shot(event.kind, near(event.x, event.z));
        break;
      case 'arc':
        this.sfx.arc(near(event.points[0].x, event.points[0].z));
        break;
      case 'hit':
        if (event.source === player.id && event.amount >= 1) this.sfx.hit(0.8);
        else if (event.target === player.id && event.amount >= 1) this.sfx.hit(1);
        break;
      case 'strike':
        this.sfx.strike(near(event.x, event.z));
        break;
      case 'explosion':
        this.sfx.explosion(near(event.x, event.z));
        break;
      case 'pickup':
        if (event.bot === player.id) this.sfx.pickup();
        break;
      case 'powerup':
        if (event.bot === player.id) this.sfx.powerup();
        break;
      default:
        break;
    }
  }

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;

    switch (this.mode) {
      case 'garage':
        this.garage.update(dt);
        this.renderer.render(this.garage.scene, this.garage.camera);
        return;
      case 'menu':
        this.tickDemo(dt);
        break;
      case 'match':
        this.tickMatch(dt);
        break;
      case 'paused':
      case 'results':
        break;
    }

    if (this.mode === 'paused' || this.mode === 'results') {
      this.renderer.render(this.view.arena.scene, this.view.camera);
      return;
    }
    if (!this.match) return;
    this.view.update(dt, this.accumulator / STEP);
    if (this.mode === 'menu') this.view.orbitCamera(this.clock);
    this.renderer.render(this.view.arena.scene, this.view.camera);
  }

  private tickDemo(dt: number): void {
    const match = this.match;
    if (!match) return;
    this.accumulator += dt;
    while (this.accumulator >= STEP) {
      match.step();
      this.accumulator -= STEP;
    }
    if (match.over) this.startDemo();
  }

  private tickMatch(dt: number): void {
    const { match, player } = this;
    if (!match || !player) return;
    this.accumulator += dt;
    while (this.accumulator >= STEP) {
      this.keyboard.applyTo(player.input);
      match.step();
      this.accumulator -= STEP;
    }
    this.view.rearView = this.keyboard.rearView;
    this.hud?.update(dt);
    const top = player.chassis.speed * player.speedMult;
    this.sfx.setLoops(player.alive ? Math.min(1, Math.hypot(player.vx, player.vz) / top) : -1, player.alive && player.meleeActive);
    if (match.over) {
      this.view.update(0, 1);
      this.finishMatch();
    }
  }
}

const game = new Game();
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
