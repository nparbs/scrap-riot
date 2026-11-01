import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sfx } from './audio';
import { applyResult, buyOrEquip, buyPowerup, buyUpgrade, loadSave, makeRivals, newSave, sellPart, setArmour, writeSave, type Save, type Slot } from './game/progress';
import { awardMedal, careerResult, fightSetups, loadCareer, writeCareer, type Fight } from './game/career';
import { activeLevel, AutoQuality, DEFAULT_BINDINGS, loadSettings, QUALITY, rebind, writeSettings, type Action } from './game/settings';
import { Tutorial } from './game/tutorial';
import { Keyboard } from './input';
import { Api, ApiError } from './net/api';
import { NetClient, type NetFailure } from './net/client';
import { sanitizeName, type GarageAction, type HistoryEntry, type LeaderboardEntry, type Profile } from './net/protocol';
import { GarageView } from './render/garageView';
import { installLogoIcon } from './render/logo';
import { MatchView } from './render/matchView';
import { DEFAULT_PAINT, MELEE, POWERUP_CAP, TURRETS } from './sim/data';
import { emptyInput, Match, STEP, type Bot, type BotSetup, type GameEvent } from './sim/match';
import { renderGoogleButton } from './ui/google';
import { Hud } from './ui/hud';
import { Painter } from './ui/painter';
import { garageScreen, introScreen, lobbyScreen, menuScreen, nameScreen, pauseScreen, resultsScreen, settingsScreen, type BuyCategory, type GarageTab, type SideTab } from './ui/screens';

type Mode = 'intro' | 'menu' | 'garage' | 'lobby' | 'match' | 'paused' | 'results';

/** Without a configured server, the build simply offers no online mode. */
const SERVER_URL: string = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? 'ws://localhost:8787' : '');

/** Shows between the workshop's panels. */
const WORKSHOP_METAL = 0x4d696b;
const SKIN_SAVE_DELAY_MS = 700;
const TRAINING_SECONDS = 30 * 60;
/** How far away another robot's continuous sounds can be heard. */
const SOUND_RANGE = 40;

const FAILURE_TEXT: Record<NetFailure, string> = {
  unreachable: "Couldn't reach the game server. It may be offline, so try Offline vs Bots for now.",
  lost: 'Lost the connection to the game server.',
  expired: 'That match is no longer available.',
  full: 'The game server is full right now. Please try again shortly.',
  outdated: 'This page is out of date. Refresh to get the latest version.',
  'bad-request': 'The server rejected that request. Refreshing may help.',
  'sign-in': 'Your session has expired. Refresh the page to sign back in.',
  'in-match': 'This account is already in a match, possibly in another tab.',
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
  private readonly storage = safeStorage();
  private readonly settings = loadSettings(this.storage);
  // Antialiasing can't change once the page has started, so it follows the level at load.
  // Without the preference, laptops with two graphics chips can pick the slower one.
  private readonly renderer = new THREE.WebGLRenderer({ antialias: QUALITY[activeLevel(this.settings)].reflections, powerPreference: 'high-performance' });
  private autoQuality = new AutoQuality();
  private save: Save = loadSave(this.storage);
  /** The server's copy of this player, when connected. It then replaces the local save. */
  private profile: Profile | null = null;
  private readonly api: Api | null = SERVER_URL ? new Api(SERVER_URL, this.storage) : null;
  private connecting = false;
  private googleClientId: string | null = null;
  private history: HistoryEntry[] = [];
  private leaderboard: LeaderboardEntry[] = [];
  private confirmDelete = false;
  private readonly career = loadCareer(this.storage);
  private careerFight: Fight | null = null;
  private readonly view = new MatchView();
  private readonly garage = new GarageView();
  private readonly keyboard = new Keyboard(this.settings.bindings);
  private readonly sfx = new Sfx();
  private mode: Mode = 'intro';
  private match: Match | null = null;
  private player: Bot | null = null;
  private hud: Hud | null = null;
  private net: NetClient | null = null;
  private notice = '';
  private softwareWarning = '';
  private garageTab: GarageTab = 'workshop';
  private sideTab: SideTab = 'preview';
  private buyCategory: BuyCategory = 'chassis';
  private shelf: Slot | null = null;
  private readonly painter = new Painter();
  /** A new paint job is waiting to be saved. */
  private skinDirty = false;
  private skinTimer = 0;
  private skinSave: Promise<void> | null = null;
  private wasFiring = false;
  /** This match is the Training session, which isn't a real fight and doesn't count for anything. */
  private training = false;
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
    this.checkForSoftwareRendering();
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
    this.painter.onChange = (skin, done) => this.onSkinChange(skin, done);

    this.sfx.setMusicEnabled(this.settings.music);
    this.setScreen(introScreen(() => this.afterIntro()));
    requestAnimationFrame((t) => this.frame(t));
  }

  /** With hardware acceleration off nothing else will help much, so the player needs to know. */
  private checkForSoftwareRendering(): void {
    const gl = this.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    if (!/swiftshader|llvmpipe|software|basic render/i.test(name)) return;
    this.settings.autoLevel = 'lowest';
    this.softwareWarning = "Your browser isn't using your graphics card, so the game will run slowly. Turn on hardware acceleration in your browser's settings.";
  }

  /** A new player chooses a name before anything else. */
  private afterIntro(): void {
    this.sfx.setTrack('menu');
    if (this.settings.pilotName) {
      this.save.name = this.settings.pilotName;
      this.showMenu();
      return;
    }
    this.setScreen(
      nameScreen((name) => {
        this.sfx.click();
        this.settings.pilotName = name;
        writeSettings(this.storage, this.settings);
        this.save.name = name;
        writeSave(this.storage, this.save);
        this.showMenu();
      }),
    );
    this.ui.querySelector<HTMLInputElement>('[data-pilot-name]')?.focus();
  }

  private applyQuality(): void {
    const quality = QUALITY[activeLevel(this.settings)];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    this.renderer.shadowMap.enabled = quality.shadows;
    this.view.setParticleDensity(quality.particles);
    this.view.setDetail(quality.reflections);
    this.garage.scene.traverse((node) => {
      if (node instanceof THREE.Mesh) (node.material as THREE.Material).needsUpdate = true;
    });
    this.resize();
  }

  private updateAutoQuality(dt: number): void {
    if (this.settings.quality !== 'auto' || (this.mode !== 'match' && this.mode !== 'menu')) return;
    const next = this.autoQuality.sample(dt, this.settings.autoLevel);
    if (!next) return;
    this.settings.autoLevel = next;
    writeSettings(this.storage, this.settings);
    this.applyQuality();
  }

  private openSettings(back: () => void): void {
    let waiting: Action | null = null;
    const save = () => writeSettings(this.storage, this.settings);
    const render = () => {
      this.setScreen(
        settingsScreen(this.settings, waiting, {
          onQuality: (quality) => {
            this.settings.quality = quality;
            // Choosing Auto again gives this device a fresh start.
            if (quality === 'auto') {
              this.settings.autoLevel = 'high';
              this.autoQuality = new AutoQuality();
            }
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
          onMusic: () => {
            this.settings.music = !this.settings.music;
            this.sfx.setMusicEnabled(this.settings.music);
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
    // Training always shows the controls. Elsewhere they're for a player's first match.
    this.tutorial = this.settings.tutorialDone && !this.training ? null : new Tutorial(this.settings.bindings);
  }

  private endTutorial(): void {
    this.tutorial = null;
    if (this.settings.tutorialDone) return;
    this.settings.tutorialDone = true;
    writeSettings(this.storage, this.settings);
  }

  private updateTutorial(dt: number): void {
    const { tutorial, tutorialInput: input } = this;
    if (!tutorial) return;
    this.keyboard.peek(input);
    tutorial.update(dt, input);
    this.hud?.setTutorialPrompt(tutorial.prompt);
    if (tutorial.finished) this.endTutorial();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.view.resize(w, h);
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
    this.match = new Match(makeRivals(null, 4, seed), { seed, arena: 'skyscraper' });
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
    this.sfx.silence();
    this.sfx.setTrack('menu');
    this.refreshGarage();
    void this.connectAccount();
  }

  private setProfile(profile: Profile): void {
    // A reply from before the latest brush stroke mustn't overwrite it.
    const skin = this.save.loadout.paint?.skin;
    const saving = this.skinDirty || this.skinSave !== null;
    this.profile = profile;
    this.save = profile.save;
    if (saving) this.save.loadout.paint = { ...(this.save.loadout.paint ?? DEFAULT_PAINT), skin };
  }

  /** The preview updates as you paint, and saving waits for a pause so a burst of strokes is one request. */
  private onSkinChange(skin: string, done: boolean): void {
    this.save.loadout.paint = { ...(this.save.loadout.paint ?? DEFAULT_PAINT), skin };
    this.previewRobot();
    if (!done) return;
    this.skinDirty = true;
    window.clearTimeout(this.skinTimer);
    this.skinTimer = window.setTimeout(() => void this.flushSkin(), SKIN_SAVE_DELAY_MS);
  }

  /** Resolves once the paint job on screen is the one that's saved. */
  private flushSkin(): Promise<void> {
    window.clearTimeout(this.skinTimer);
    if (!this.skinDirty && !this.skinSave) return Promise.resolve();
    this.skinSave ??= this.saveSkins();
    return this.skinSave;
  }

  private async saveSkins(): Promise<void> {
    try {
      while (this.skinDirty) {
        this.skinDirty = false;
        const skin = this.save.loadout.paint?.skin ?? '';
        if (this.api && this.profile) this.setProfile(await this.api.garage({ type: 'paint', paint: { skin } }));
        else writeSave(this.storage, this.save);
      }
    } catch {
      this.notice = "Couldn't save your paint job. It will be saved with your next brush stroke.";
      if (this.mode === 'garage') this.refreshGarage();
    } finally {
      this.skinSave = null;
    }
  }

  private previewRobot(): void {
    const { chassis, melee, turret, defense, paint = DEFAULT_PAINT, rearMelee, tower, wheels } = this.save.loadout;
    this.garage.setBuild({ chassis, melee, turret, defense, paint, rearMelee, tower, wheels, color: paint.primary });
  }

  /** The drawing tools live on across page refreshes, and are slotted back into the new page. */
  private mountPainter(): void {
    const paint = this.save.loadout.paint ?? DEFAULT_PAINT;
    if (!this.skinDirty && !this.skinSave && (paint.skin ?? '') !== this.painter.encoded) this.painter.load(paint.skin);
    this.painter.setBase(paint.primary);
    this.ui.querySelector('[data-painter-bar]')?.replaceWith(this.painter.bar);
    this.ui.querySelector('[data-painter-board]')?.replaceWith(this.painter.board);
  }

  /** Signs in as this browser's account, creating a guest for a new visitor. */
  private async connectAccount(): Promise<void> {
    if (!this.api || this.profile || this.connecting) return;
    this.connecting = true;
    try {
      this.setProfile(await this.api.start());
      // The server only learns the name the player picked once there's an account to put it on.
      const { pilotName } = this.settings;
      if (pilotName && this.save.name !== pilotName) this.setProfile(await this.api.garage({ type: 'name', name: pilotName }));
      this.googleClientId = await this.api.googleClientId();
      if (this.mode === 'garage') this.refreshGarage();
    } catch (error) {
      // A 404 means a server without accounts. Anything else means it can't be reached right now.
      if (!(error instanceof ApiError && error.status === 404) && this.mode === 'garage') {
        this.notice = "Couldn't reach the game server, so your progress is being saved on this device only.";
        this.refreshGarage();
      }
    } finally {
      this.connecting = false;
    }
  }

  private async loadProfileTab(): Promise<void> {
    if (!this.api || !this.profile) return;
    try {
      [this.history, this.leaderboard] = await Promise.all([this.api.history(), this.api.leaderboard()]);
      if (this.mode === 'garage' && (this.garageTab === 'garage' || this.sideTab === 'highscore')) this.refreshGarage();
    } catch {
      // The tab still shows the player's own stats without these.
    }
  }

  /** Runs an account action, then shows the new state. */
  private accountAction(run: () => Promise<Profile>, failure: string): void {
    run()
      .then((profile) => {
        this.setProfile(profile);
        this.history = [];
        this.confirmDelete = false;
        this.refreshGarage();
        void this.loadProfileTab();
      })
      .catch(() => {
        this.sfx.deny();
        this.notice = failure;
        this.refreshGarage();
      });
  }

  private refreshGarage(): void {
    this.previewRobot();
    const panel = this.ui.querySelector('.ws-panel');
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
    /** With an account the server decides, and the browser only shows the outcome. */
    const change = (action: GarageAction, local: () => boolean) => {
      if (!this.api || !this.profile) {
        buy(local());
        return;
      }
      this.api
        .garage(action)
        .then((profile) => {
          this.setProfile(profile);
          this.sfx.click();
          this.refreshGarage();
        })
        .catch(() => this.sfx.deny());
    };
    const notice = this.notice || this.softwareWarning;
    this.notice = '';
    this.setScreen(
      garageScreen(
        this.save,
        {
          onEquip: (slot: Slot, id: string) => change({ type: 'equip', slot, id }, () => buyOrEquip(this.save, slot, id)),
          onSell: (slot, id) => change({ type: 'sell', slot, id }, () => sellPart(this.save, slot, id)),
          onArmour: (armour) => change({ type: 'armour', armour }, () => setArmour(this.save, armour)),
          onShelf: (shelf) => {
            this.shelf = shelf;
            this.sfx.click();
            this.refreshGarage();
          },
          onSide: (side) => {
            this.sideTab = side;
            this.sfx.click();
            this.refreshGarage();
            if (side === 'highscore') void this.loadProfileTab();
          },
          onBuyCategory: (category) => {
            this.buyCategory = category;
            this.sfx.click();
            this.refreshGarage();
            this.ui.querySelector('.ws-panel')!.scrollTop = 0;
          },
          onZoom: (step) => this.garage.zoom(step),
          onQuit: () => {
            this.sfx.click();
            this.showMenu();
          },
          onPowerup: (id) => change({ type: 'powerup', id }, () => buyPowerup(this.save, id)),
          onUpgrade: (id) => change({ type: 'upgrade', id }, () => buyUpgrade(this.save, id)),
          onFight: () => this.startMatch(),
          onOnline: () => this.startOnline(),
          onTraining: () => this.startTraining(),
          onSettings: () => this.openSettings(() => this.refreshGarage()),
          onTab: (tab) => {
            this.garageTab = tab;
            this.sfx.click();
            this.refreshGarage();
            this.ui.querySelector('.ws-panel')!.scrollTop = 0;
            if (tab === 'garage') void this.loadProfileTab();
          },
          onPaint: (paint) =>
            change({ type: 'paint', paint }, () => {
              this.save.loadout.paint = { ...(this.save.loadout.paint ?? DEFAULT_PAINT), ...paint };
              return true;
            }),
          onPaintUse: (part) => {
            const color = this.painter.currentColor;
            change({ type: 'paint', paint: { [part]: color } }, () => {
              this.save.loadout.paint = { ...(this.save.loadout.paint ?? DEFAULT_PAINT), [part]: color };
              return true;
            });
          },
          onPractice: (practice) =>
            change({ type: 'practice', ...practice }, () => {
              Object.assign(this.save.practice, practice);
              return true;
            }),
          onName: (name) =>
            {
              this.settings.pilotName = sanitizeName(name);
              writeSettings(this.storage, this.settings);
              change({ type: 'name', name }, () => {
                this.save.name = this.settings.pilotName;
                return true;
              });
            },
          onCareer: (fight) => this.startMatch(fight),
          onRear: (rear) =>
            change({ type: 'rear', rear }, () => {
              this.save.loadout.rearMelee = rear;
              return true;
            }),
          onSignOut: () => this.accountAction(() => this.api!.signOut(), "Couldn't sign out. Please try again."),
          onDelete: () => {
            if (!this.confirmDelete) {
              this.confirmDelete = true;
              this.sfx.deny();
              this.refreshGarage();
              return;
            }
            this.accountAction(() => this.api!.deleteAccount(), "Couldn't delete the account. Please try again.");
          },
        },
        {
          onlineAvailable: SERVER_URL !== '',
          notice,
          keys: this.settings.bindings,
          tab: this.garageTab,
          side: this.sideTab,
          buyCategory: this.buyCategory,
          shelf: this.shelf,
          career: this.career,
          account: this.profile && {
            profile: this.profile,
            history: this.history,
            leaderboard: this.leaderboard,
            googleAvailable: this.googleClientId !== null,
            confirmDelete: this.confirmDelete,
          },
        },
      ),
    );
    const next = this.ui.querySelector('.ws-panel');
    if (next) next.scrollTop = scroll;
    this.mountPainter();
    this.mountGoogleButton();
  }

  private mountGoogleButton(): void {
    const slot = this.ui.querySelector<HTMLElement>('[data-google]');
    const { api, googleClientId } = this;
    if (!slot || !api || !googleClientId) return;
    renderGoogleButton(slot, googleClientId, (credential) => {
      this.accountAction(() => api.signInWithGoogle(credential), 'Google sign-in failed. Please try again.');
    }).catch(() => {
      slot.textContent = "Couldn't load Google sign-in. A browser extension may be blocking it.";
    });
  }

  /** Practice on the roof against a dummy that doesn't fight back, for as long as you like. */
  private startTraining(): void {
    void this.flushSkin();
    const seed = Math.floor(Math.random() * 1e9);
    const { name, loadout } = this.save;
    const full = { rage: POWERUP_CAP, megashield: POWERUP_CAP, cloaking: POWERUP_CAP, xray: POWERUP_CAP, repair: POWERUP_CAP, battery: POWERUP_CAP };
    const me: BotSetup = { name, color: (loadout.paint ?? DEFAULT_PAINT).primary, loadout: { ...loadout, powerups: full }, isAI: false };
    const dummy: BotSetup = { name: 'Practice Dummy', color: 0xaaaaaa, loadout: { ...newSave().loadout, paint: { ...DEFAULT_PAINT, primary: 0xaaaaaa } }, isAI: false };
    this.training = true;
    this.careerFight = null;
    this.match = new Match([me, dummy], { seed, arena: 'skyscraper', mode: 'ffa', duration: TRAINING_SECONDS, killTarget: Number.MAX_SAFE_INTEGER });
    this.player = this.match.bots[0];
    this.enterMatch(this.match, this.player);
  }

  private enterMatch(match: Match, player: Bot): void {
    this.hud = this.makeHud(match, player);
    this.beginTutorial();
    this.view.setMatch(match, player.id);
    this.setScreen(this.hud.root);
    this.keyboard.clear();
    this.accumulator = 0;
    this.mode = 'match';
    this.sfx.click();
    this.sfx.setTrack('battle');
  }

  private startMatch(fight: Fight | null = null): void {
    void this.flushSkin();
    this.training = false;
    const seed = Math.floor(Math.random() * 1e9);
    const { name, loadout, practice } = this.save;
    const me: BotSetup = { name, color: (loadout.paint ?? DEFAULT_PAINT).primary, loadout, isAI: false };
    this.careerFight = fight;
    this.match = fight
      ? new Match([me, ...fightSetups(fight, seed)], { seed, arena: fight.arena, mode: fight.mode, killTarget: fight.killTarget })
      : new Match([me, ...makeRivals(this.save, practice.mode === 'duel' ? 1 : 5, seed)], { seed, arena: practice.arena, mode: practice.mode });
    this.player = this.match.bots[0];
    this.enterMatch(this.match, this.player);
  }

  /** Online these go to the server. Offline there's only a bot to surrender to. */
  private makeHud(match: Match, player: Bot): Hud {
    return new Hud(match, player, this.settings.bindings, {
      onChat: (id) => {
        if (this.net) this.net.chat(id);
        else this.hud?.showChat(player.id, id);
      },
      onSurrender: () => {
        if (this.net) this.net.surrender();
        else match.forfeit(player.id);
      },
      onDraw: () => {
        if (this.net) this.net.offerDraw();
        else this.hud?.message(`${match.bots.find((bot) => bot !== player)?.name ?? 'Your rival'} refuses a draw.`);
      },
    });
  }

  private startOnline(): void {
    this.training = false;
    this.sfx.click();
    this.mode = 'lobby';
    const lobby = lobbyScreen(() => this.showGarage(), this.profile !== null);
    this.setScreen(lobby.el);
    const { name, loadout } = this.save;
    const net = new NetClient(SERVER_URL, { name, loadout, session: this.api?.token ?? undefined }, {
      onQueue: lobby.update,
      onStart: (match, player) => {
        this.match = match;
        this.player = player;
        this.hud = this.makeHud(match, player);
        this.beginTutorial();
        this.view.setMatch(match, player.id);
        this.setScreen(this.hud.root);
        this.keyboard.clear();
        this.mode = 'match';
        this.sfx.setTrack('battle');
      },
      onOver: () => this.finishMatch(),
      onChat: (bot, id) => this.hud?.showChat(bot, id),
      onDrawOffer: (bot) => this.hud?.drawOffered(bot),
      onFail: (reason) => {
        this.net = null;
        this.notice = FAILURE_TEXT[reason];
        this.showGarage();
      },
      onReconnecting: (active) => {
        if (this.hud) this.hud.notice = active ? 'Connection lost. Reconnecting…' : '';
      },
    });
    this.net = net;
    // The server reads the paint job when joining, so a brush stroke still saving goes first.
    void this.flushSkin().finally(() => {
      if (this.net === net) net.connect();
    });
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
      this.sfx.silence();
      const overlay = pauseScreen(false, () => this.togglePause(), () => this.showGarage(), this.settings.bindings, this.training ? 'Leave training' : undefined);
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
    this.sfx.silence();
    this.sfx.setTrack('menu');
    if (this.training) {
      this.training = false;
      this.showGarage();
      return;
    }
    const standings = match.standings();
    const mine = standings.find((s) => s.bot === player)!;
    if (mine.place === 1 && !match.drawn) this.sfx.win();
    else if (!match.drawn) this.sfx.lose();
    const online = this.net !== null;
    this.net = null;
    let note = '';
    const fight = this.careerFight;
    this.careerFight = null;
    if (fight) {
      const medal = careerResult(fight, standings, player.id);
      const reward = awardMedal(this.career, fight, medal);
      writeCareer(this.storage, this.career);
      note = medal ? `${medal[0].toUpperCase()}${medal.slice(1)} medal! ` : 'No medal this time. Finish higher to unlock the next fight. ';
      if (!this.profile) {
        // Without an account, career money goes into the save on this device.
        applyResult(this.save, reward, mine.place, player.powerups);
        writeSave(this.storage, this.save);
        if (reward > 0) note += `You earned $${reward}.`;
      }
    } else if (this.profile) {
      // The server already banked an online match. A practice match runs in this browser, so
      // nothing it reports can be trusted with real money.
      if (online) this.api?.me().then((profile) => this.setProfile(profile)).catch(() => {});
      else note = 'Offline, so no payout. Play Online to earn money and rating.';
    } else {
      // Online robots get free powerups, so the ones in the garage are left untouched.
      applyResult(this.save, mine.total, mine.place, online ? this.save.loadout.powerups : player.powerups);
      writeSave(this.storage, this.save);
    }
    this.setScreen(resultsScreen(standings, player.id, () => this.showGarage(), note, match.drawn));
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
        this.sfx.meleeHit('hammer', near(event.x, event.z));
        break;
      case 'teleport':
        this.sfx.arc(near(event.x1, event.z1));
        break;
      case 'hit':
        if (event.source === player.id && event.amount >= 1) this.sfx.hit(0.8, event.amount);
        else if (event.target === player.id && event.amount >= 1) this.sfx.hit(1, event.amount);
        break;
      case 'strike':
        this.sfx.meleeHit(this.match.bots[event.owner].loadout.melee, near(event.x, event.z));
        break;
      case 'kill':
        if (event.fell) this.sfx.fall(near(player.x, player.z));
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
    this.updateAutoQuality(dt);

    switch (this.mode) {
      case 'intro':
        return;
      case 'garage':
      case 'lobby':
        this.garage.update(dt);
        this.renderPreview();
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

  /** Draws the robot only in the workshop's preview window. The page's panels cover everything else. */
  private renderPreview(): void {
    const r = this.renderer;
    r.setClearColor(WORKSHOP_METAL);
    r.clear();
    const box = this.ui.querySelector('[data-preview]')?.getBoundingClientRect();
    if (!box || box.width < 1 || box.height < 1) return;
    const bottom = window.innerHeight - box.bottom;
    this.garage.setAspect(box.width / box.height);
    r.setViewport(box.left, bottom, box.width, box.height);
    r.setScissor(box.left, bottom, box.width, box.height);
    r.setScissorTest(true);
    r.render(this.garage.scene, this.garage.camera);
    r.setScissorTest(false);
    r.setViewport(0, 0, window.innerWidth, window.innerHeight);
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

  /** Continuous sounds from everyone on the map, fading with distance from the player. */
  private updateSounds(match: Match, player: Bot): void {
    const top = player.chassis.speed * player.speedMult;
    let saw = 0;
    let spinSpeed = 0;
    let spinLevel = 0;
    let flame = false;
    for (const bot of match.bots) {
      if (!bot.alive) continue;
      const level = bot === player ? 1 : Math.max(0, 1 - Math.hypot(bot.x - player.x, bot.z - player.z) / SOUND_RANGE);
      const melee = MELEE[bot.loadout.melee];
      if (melee.kind === 'spinner' && bot.meleeCharge * level > spinSpeed * spinLevel) {
        spinSpeed = bot.meleeCharge;
        spinLevel = level;
      } else if (bot.meleeActive && melee.kind === 'held' && !melee.passive) {
        saw = Math.max(saw, level);
      }
      flame ||= bot.turretFiring && level > 0.3;
    }
    this.sfx.setLoops({
      engine: player.alive ? Math.min(1, Math.hypot(player.vx, player.vz) / top) : -1,
      boosting: player.alive && player.boostT > 0,
      saw,
      spinSpeed,
      spinLevel,
      flame,
    });

    // A click when the gun won't fire, so a press with nothing left doesn't feel like a dropped key.
    this.keyboard.peek(this.tutorialInput);
    const wantsToFire = this.tutorialInput.turret;
    const gun = TURRETS[player.loadout.turret];
    if (wantsToFire && !this.wasFiring && player.alive && gun.shots > 0 && player.burstLeft === 0 && (player.shots <= 0 || player.turretCd > 0.1 || player.ammo < gun.battery)) this.sfx.dryFire();
    this.wasFiring = wantsToFire;
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
    this.updateTutorial(dt);
    this.updateSounds(match, player);
    // Online, the server announces the end of the match and onOver handles it.
    if (match.over && !net) {
      this.view.update(0, 1);
      this.finishMatch();
    }
  }
}

installLogoIcon();
const game = new Game();
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
