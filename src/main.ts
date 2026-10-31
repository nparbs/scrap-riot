import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sfx } from './audio';
import { applyResult, buyOrEquip, buyPowerup, buyUpgrade, loadSave, makeRivals, randomArena, writeSave, type Save, type Slot } from './game/progress';
import { DEFAULT_BINDINGS, loadSettings, QUALITY, rebind, writeSettings, type Action } from './game/settings';
import { Tutorial } from './game/tutorial';
import { Keyboard } from './input';
import { NetClient, type NetFailure } from './net/client';
import { sanitizeName } from './net/protocol';
import { GarageView } from './render/garageView';
import { MatchView } from './render/matchView';
import { DEFAULT_PAINT } from './sim/data';
import { emptyInput, Match, STEP, type Bot, type BotSetup, type GameEvent } from './sim/match';
import { Hud } from './ui/hud';
import { garageScreen, lobbyScreen, menuScreen, pauseScreen, resultsScreen, settingsScreen, type GarageTab } from './ui/screens';

type Mode = 'menu' | 'garage' | 'lobby' | 'match' | 'paused' | 'results';

/** Without a configured server, the build simply offers no online mode. */
const SERVER_URL: string = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? 'ws://localhost:8787' : '');

const FAILURE_TEXT: Record<NetFailure, string> = {
  unreachable: "Couldn't reach the game server. It may be offline, so try a practice match for now.",
  lost: 'Lost the connection to the game server. That match has no payout.',
  expired: 'That match is no longer available.',
  full: 'The game server is full right now. Please try again shortly.',
  outdated: 'This page is out of date. Refresh to get the latest version.',
  'bad-request': 'The server rejected that request. Refreshing may help.',
};

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
  private readonly settings = loadSettings(this.storage);
  private readonly view = new MatchView();
  private readonly garage = new GarageView();
  private readonly keyboard = new Keyboard(this.settings.bindings);
  private readonly sfx = new Sfx();
  private mode: Mode = 'menu';
  private match: Match | null = null;
  private player: Bot | null = null;
  private hud: Hud | null = null;
  private net: NetClient | null = null;
  private notice = '';
  private garageTab: GarageTab = 'chassis';
  private tutorial: Tutorial | null = null;
  private readonly tutorialInput = emptyInput();
  private readonly fpsEl = document.createElement('div');
  private fpsFrames = 0;
  private fpsTime = 0;
  private accumulator = 0;
  private last = performance.now();
  private clock = 0;

  constructor() {
    const r = this.renderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.stage.appendChild(r.domElement);

    // Metal needs something to reflect, or it renders black.
    const pmrem = new THREE.PMREMGenerator(r);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.view.setEnvironment(environment);
    this.garage.scene.environment = environment;
    this.garage.scene.environmentIntensity = 0.55;

    window.addEventListener('resize', () => this.resize());
    this.applyQuality();

    this.fpsEl.className = 'fps-counter';
    this.fpsEl.hidden = !this.settings.showFps;
    document.body.appendChild(this.fpsEl);

    this.keyboard.onFirstInput = () => this.sfx.unlock();
    this.keyboard.onPause = () => this.togglePause();
    this.keyboard.onMute = () => this.sfx.toggleMute();
    window.addEventListener('pointerdown', () => this.sfx.unlock());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden || this.mode !== 'match') return;
      // An online match cannot pause, and a hidden tab stops sending input, so let go of the controls.
      if (this.net) this.net.sendNeutral();
      else this.togglePause();
    });
    this.view.onEvent = (event) => this.onMatchEvent(event);

    this.showMenu();
    requestAnimationFrame((t) => this.frame(t));
  }

  private applyQuality(): void {
    const quality = QUALITY[this.settings.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    this.renderer.shadowMap.enabled = quality.shadows;
    this.view.setParticleDensity(quality.particles);
    // Materials compile with or without shadow support, so they must rebuild when it changes.
    for (const scene of [this.view.arena.scene, this.garage.scene]) {
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) (node.material as THREE.Material).needsUpdate = true;
      });
    }
    this.resize();
  }

  private openSettings(back: () => void): void {
    let waiting: Action | null = null;
    const save = () => writeSettings(this.storage, this.settings);
    const render = () => {
      this.setScreen(
        settingsScreen(this.settings, waiting, {
          onQuality: (quality) => {
            this.settings.quality = quality;
            save();
            this.applyQuality();
            render();
          },
          onFps: () => {
            this.settings.showFps = !this.settings.showFps;
            this.fpsEl.hidden = !this.settings.showFps;
            save();
            render();
          },
          onBind: (action) => {
            waiting = action;
            render();
            this.keyboard.captureNextKey((code) => {
              waiting = null;
              if (code && rebind(this.settings.bindings, action, code)) {
                this.keyboard.setBindings(this.settings.bindings);
                save();
              }
              render();
            });
          },
          onReset: () => {
            this.keyboard.cancelCapture();
            waiting = null;
            this.settings.bindings = { ...DEFAULT_BINDINGS };
            this.keyboard.setBindings(this.settings.bindings);
            save();
            render();
          },
          onBack: () => {
            this.keyboard.cancelCapture();
            back();
          },
        }),
      );
    };
    this.sfx.click();
    render();
  }

  private beginTutorial(): void {
    this.tutorial = this.settings.tutorialDone ? null : new Tutorial(this.settings.bindings);
  }

  private endTutorial(): void {
    this.tutorial = null;
    if (this.settings.tutorialDone) return;
    this.settings.tutorialDone = true;
    writeSettings(this.storage, this.settings);
  }

  private updateTutorial(dt: number, player: Bot): void {
    const { tutorial, tutorialInput: input } = this;
    if (!tutorial) return;
    this.keyboard.peek(input);
    const powerups = Object.values(player.powerups).reduce((sum, n) => sum + n, 0);
    tutorial.update(dt, { ...input, powerups });
    this.hud?.setTutorialPrompt(tutorial.prompt);
    if (tutorial.finished) this.endTutorial();
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
    this.showMenuScreen();
  }

  private showMenuScreen(): void {
    this.setScreen(
      menuScreen(() => this.showGarage(), () => this.openSettings(() => this.showMenuScreen()), this.settings.bindings),
    );
  }

  /** The title screen runs a real AI-only match in the background. */
  private startDemo(): void {
    const seed = Math.floor(Math.random() * 1e9);
    this.match = new Match(makeRivals(null, 6, seed), { seed, arena: randomArena(Math.random) });
    this.player = null;
    this.view.setMatch(this.match, 0);
  }

  private showGarage(): void {
    this.sfx.click();
    this.net?.leave();
    this.net = null;
    this.mode = 'garage';
    this.match = null;
    this.hud = null;
    this.sfx.setLoops(-1, false);
    this.refreshGarage();
  }

  private refreshGarage(): void {
    const { loadout } = this.save;
    const { chassis, melee, turret, defense, paint = DEFAULT_PAINT } = loadout;
    this.garage.setBuild({ chassis, melee, turret, defense, paint, color: paint.primary });
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
    const notice = this.notice;
    this.notice = '';
    this.setScreen(
      garageScreen(
        this.save,
        {
          onEquip: (slot: Slot, id: string) => buy(buyOrEquip(this.save, slot, id)),
          onPowerup: (id) => buy(buyPowerup(this.save, id)),
          onUpgrade: (id) => buy(buyUpgrade(this.save, id)),
          onFight: () => this.startMatch(),
          onOnline: () => this.startOnline(),
          onSettings: () => this.openSettings(() => this.refreshGarage()),
          onTab: (tab) => {
            this.garageTab = tab;
            this.sfx.click();
            this.refreshGarage();
            this.ui.querySelector('.garage-panel')!.scrollTop = 0;
          },
          onPaint: (change) => {
            this.save.loadout.paint = { ...(this.save.loadout.paint ?? DEFAULT_PAINT), ...change };
            buy(true);
          },
          onPractice: (change) => {
            Object.assign(this.save.practice, change);
            buy(true);
          },
          onName: (name) => {
            this.save.name = sanitizeName(name);
            writeSave(this.storage, this.save);
          },
        },
        { onlineAvailable: SERVER_URL !== '', notice, keys: this.settings.bindings, tab: this.garageTab },
      ),
    );
    const next = this.ui.querySelector('.garage-panel');
    if (next) next.scrollTop = scroll;
  }

  private startMatch(): void {
    const seed = Math.floor(Math.random() * 1e9);
    const { name, loadout, practice } = this.save;
    const me: BotSetup = { name, color: (loadout.paint ?? DEFAULT_PAINT).primary, loadout, isAI: false };
    this.match = new Match([me, ...makeRivals(this.save, 5, seed)], { seed, arena: practice.arena, mode: practice.mode });
    this.player = this.match.bots[0];
    this.hud = new Hud(this.match, this.player, this.settings.bindings);
    this.beginTutorial();
    this.view.setMatch(this.match, this.player.id);
    this.setScreen(this.hud.root);
    this.keyboard.clear();
    this.accumulator = 0;
    this.mode = 'match';
    this.sfx.click();
  }

  private startOnline(): void {
    this.sfx.click();
    this.mode = 'lobby';
    const lobby = lobbyScreen(() => this.showGarage());
    this.setScreen(lobby.el);
    const { name, loadout } = this.save;
    this.net = new NetClient(SERVER_URL, { name, loadout }, {
      onQueue: lobby.update,
      onStart: (match, player) => {
        this.match = match;
        this.player = player;
        this.hud = new Hud(match, player, this.settings.bindings);
        this.beginTutorial();
        this.view.setMatch(match, player.id);
        this.setScreen(this.hud.root);
        this.keyboard.clear();
        this.mode = 'match';
      },
      onOver: () => this.finishMatch(),
      onFail: (reason) => {
        this.net = null;
        this.notice = FAILURE_TEXT[reason];
        this.showGarage();
      },
      onReconnecting: (active) => {
        if (this.hud) this.hud.notice = active ? 'Connection lost. Reconnecting…' : '';
      },
    });
    this.net.connect();
  }

  private togglePause(): void {
    if (this.net && this.mode === 'match') {
      // Online the menu is only an overlay, because the match carries on for everyone else.
      const open = this.ui.querySelector('.screen-pause');
      if (open) open.remove();
      else this.ui.appendChild(pauseScreen(true, () => this.togglePause(), () => this.showGarage(), this.settings.bindings));
      return;
    }
    if (this.mode === 'match') {
      this.mode = 'paused';
      this.sfx.setLoops(-1, false);
      const overlay = pauseScreen(false, () => this.togglePause(), () => this.showGarage(), this.settings.bindings);
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
    this.endTutorial();
    this.sfx.setLoops(-1, false);
    const standings = match.standings();
    const mine = standings.find((s) => s.bot === player)!;
    // Online robots get free powerups, so the ones in the garage are left untouched.
    applyResult(this.save, mine.total, mine.place, this.net ? this.save.loadout.powerups : player.powerups);
    writeSave(this.storage, this.save);
    this.net = null;
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
      case 'beam':
        this.sfx.arc(near(event.x1, event.z1));
        break;
      case 'pulse':
        this.sfx.strike(near(event.x, event.z));
        break;
      case 'teleport':
        this.sfx.arc(near(event.x1, event.z1));
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
    this.updateFps(dt);

    switch (this.mode) {
      case 'garage':
      case 'lobby':
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

  private updateFps(dt: number): void {
    if (!this.settings.showFps) return;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < 0.5) return;
    this.fpsEl.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} FPS`;
    this.fpsFrames = 0;
    this.fpsTime = 0;
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
    const { match, player, net } = this;
    if (!match || !player) return;
    if (net) {
      net.update(dt, (input) => this.keyboard.applyTo(input));
      this.hud?.setPing(net.rttMs);
    } else {
      this.accumulator += dt;
      while (this.accumulator >= STEP) {
        this.keyboard.applyTo(player.input);
        match.step();
        this.accumulator -= STEP;
      }
    }
    this.view.rearView = this.keyboard.rearView;
    this.hud?.update(dt);
    this.updateTutorial(dt, player);
    const top = player.chassis.speed * player.speedMult;
    this.sfx.setLoops(player.alive ? Math.min(1, Math.hypot(player.vx, player.vz) / top) : -1, player.alive && player.meleeActive && ['chainsaw', 'drill', 'rollingpin'].includes(player.loadout.melee));
    // Online, the server announces the end of the match and onOver handles it.
    if (match.over && !net) {
      this.view.update(0, 1);
      this.finishMatch();
    }
  }
}

const game = new Game();
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
