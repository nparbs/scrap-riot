import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildRobot, disposeRobot, type RobotModel } from '../render/robots';
import { CHASSIS, DUEL_INTRO, MELEE } from '../sim/data';
import type { Bot } from '../sim/match';
import { escapeText } from './hud';
import { isTouchDevice } from './touch';

// The beats of the face-off, in seconds. The stylesheet's duel-intro section uses the same times.
const ENTER_START = 0.2;
const ENTER_END = 0.6;
const SLAM = 0.95;
const SHAKE_TIME = 0.32;
const EXIT = 3;
const STAGE_X = 3.5;
const STAGE_FROM = 17;
// A long lens from further back, because a wide one stretches robots out toward the sides of a wide screen.
const CAMERA_FOV = 18;
const CAMERA_Z = 21;
const CAMERA_Y = 2.7;
const SHAKE_SIZE = 0.54;
/** Below this shape the two robots wouldn't fit side by side, so the camera backs up. */
const WIDE_ENOUGH = 1.8;
/** Below this shape the VS would cover them side by side, so they stack, each by their own name. */
const TALL = 0.85;
const TALL_WIDE_ENOUGH = 1.05;
const TALL_STAGE_X = 0.6;
/** How far from the middle each one sits, as a share of the height of the view. */
const TALL_STAGE_Y = 0.215;

export type DuelBeat = 'whoosh' | 'slam';

/** Leaves a little of the slant's room spare when working out how much a name can take. */
const NAME_SLACK = 0.5;

function textWidth(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().width;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function card(bot: Bot, side: 'left' | 'right'): string {
  const paint = bot.loadout.paint?.primary ?? bot.color;
  return `<div class="di-panel di-${side}" style="--c:${hex(paint)}"><div class="di-lines"></div><div class="di-dots"></div></div>
    <div class="di-card di-card-${side}">
      <div class="di-name">${escapeText(bot.name)}</div>
      <div class="di-build">${escapeText(CHASSIS[bot.loadout.chassis].name)} · ${escapeText(MELEE[bot.loadout.melee].name)}</div>
    </div>`;
}

/**
 * The two pilots slam onto a split screen before a duel. It only covers the waiting at the start
 * of the match, so it can be skipped, and someone joining late just sees the end of it.
 */
export class DuelIntro {
  readonly root = document.createElement('div');
  done = false;
  private time: number;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
  private readonly models: { model: RobotModel; side: 1 | -1; turn: number }[] = [];
  private whooshed = false;
  private slammed = false;
  private fitted = false;
  private width = 0;
  private height = 0;
  private stageX = STAGE_X;
  private stageY = 0;

  constructor(left: Bot, right: Bot, arenaName: string, startAt: number, pixelRatio: number, private readonly onBeat: (beat: DuelBeat) => void) {
    this.time = startAt;
    this.whooshed = startAt > ENTER_START;
    this.slammed = startAt > SLAM;
    this.root.className = 'duel-intro';
    // Everything in the stylesheet starts relative to this, so a late joiner lands mid-way through.
    this.root.style.setProperty('--skip', `${-startAt}s`);
    this.root.innerHTML = `
      ${card(left, 'left')}
      ${card(right, 'right')}
      <canvas class="di-canvas"></canvas>
      <div class="di-bar di-bar-top"></div>
      <div class="di-bar di-bar-bottom"></div>
      <div class="di-vs">VS</div>
      <div class="di-where">${escapeText(arenaName)}</div>
      <div class="di-flash"></div>
      <div class="di-skip">${isTouchDevice() ? 'Tap' : 'Click'} to skip</div>`;
    this.root.addEventListener('pointerdown', () => (this.done = true));
    this.buildStage(left, right, pixelRatio);
    this.resize();
  }

  private buildStage(left: Bot, right: Bot, pixelRatio: number): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>('.di-canvas')!;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      // The names and the VS still make the moment without the robots.
      return;
    }
    const { renderer, scene } = this;
    renderer.setPixelRatio(pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2622, 1.4));
    const key = new THREE.DirectionalLight(0xfff0e0, 2.6);
    key.position.set(0, 8, 9);
    scene.add(key);

    const place = (bot: Bot, side: 1 | -1) => {
      const { chassis, melee, defense, paint, rearMelee, tower, wheels } = bot.loadout;
      const model = buildRobot({ chassis, melee, defense, paint, rearMelee, tower, wheels, color: bot.color });
      // Turned most of the way toward the other robot, with the main weapon leading.
      const turn = -side * 1.05 + (rearMelee ? Math.PI : 0);
      model.root.scale.setScalar(1.25);
      scene.add(model.root);
      this.models.push({ model, side, turn });
      // A coloured edge from behind, in the robot's own paint.
      const rim = new THREE.DirectionalLight(bot.loadout.paint?.primary ?? bot.color, 3);
      rim.position.set(side * 8, 4, -7);
      scene.add(rim);
    };
    place(left, -1);
    place(right, 1);
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.width = width;
    this.height = height;
    this.renderer?.setSize(width, height, false);
    const aspect = width / height;
    const tall = aspect < TALL;
    const distance = CAMERA_Z * Math.max(1, (tall ? TALL_WIDE_ENOUGH : WIDE_ENOUGH) / aspect);
    const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.stageX = tall ? TALL_STAGE_X : STAGE_X;
    this.stageY = tall ? TALL_STAGE_Y * viewHeight : 0;
    this.camera.aspect = aspect;
    this.camera.position.set(0, CAMERA_Y, distance);
    this.camera.lookAt(0, 0.7, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Long names shrink to fit their side of the screen. It needs measuring, so it waits until the page shows it. */
  private fitNames(): void {
    for (const name of this.root.querySelectorAll<HTMLElement>('.di-name')) {
      name.style.fontSize = '';
      const padding = parseFloat(getComputedStyle(name).paddingLeft) * 2;
      const room = (name.parentElement?.clientWidth ?? 0) - padding * NAME_SLACK;
      const needs = textWidth(name);
      if (needs > room && room > 0) name.style.fontSize = `${Math.floor(parseFloat(getComputedStyle(name).fontSize) * (room / needs))}px`;
    }
  }

  update(dt: number): void {
    if (!this.fitted) {
      this.fitted = true;
      this.fitNames();
      // The display font may still be on its way, and it's wider than the fallback.
      void document.fonts?.ready.then(() => this.fitNames());
    }
    // Tapping into a fight is when a phone goes full screen and turns sideways, so this can change right after it starts.
    if (window.innerWidth !== this.width || window.innerHeight !== this.height) {
      this.resize();
      this.fitNames();
    }
    this.time += dt;
    const t = this.time;
    if (t >= DUEL_INTRO) this.done = true;
    if (!this.whooshed && t >= ENTER_START) {
      this.whooshed = true;
      this.onBeat('whoosh');
    }
    if (!this.slammed && t >= SLAM) {
      this.slammed = true;
      this.onBeat('slam');
    }
    if (!this.renderer) return;

    const arrive = THREE.MathUtils.clamp((t - ENTER_START) / (ENTER_END - ENTER_START), 0, 1);
    const eased = 1 - (1 - arrive) ** 3;
    const leaving = Math.max(0, t - EXIT);
    for (const { model, side, turn } of this.models) {
      const drift = Math.max(0, t - ENTER_END) * 0.14;
      model.root.position.x = side * (this.stageX + STAGE_FROM * (1 - eased) - drift + leaving * leaving * 90);
      model.root.position.y = side * this.stageY + 0.05 * Math.sin(t * 9 + side);
      model.root.rotation.y = turn + side * 0.08 * Math.sin(t * 1.6);
      if (model.spinner) model.spinner.rotation[model.spinAxis] += dt * 34;
      for (const wheel of model.wheels) wheel.rotation.x += dt * (arrive < 1 ? 26 : 1.5);
    }
    // Screen shake when the VS lands.
    const shake = t >= SLAM && t < SLAM + SHAKE_TIME ? (1 - (t - SLAM) / SHAKE_TIME) * SHAKE_SIZE : 0;
    this.camera.position.x = (Math.random() - 0.5) * shake;
    this.camera.position.y = CAMERA_Y + (Math.random() - 0.5) * shake;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const { model } of this.models) disposeRobot(model);
    this.scene.environment?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.root.remove();
  }
}
