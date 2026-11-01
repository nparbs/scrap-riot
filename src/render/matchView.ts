import * as THREE from 'three';
import { ARENAS, PISTON_REACH, pistonExtension, sawPos, shockerActive, type ArenaId } from '../sim/arena';
import { BOOST_SPEED, legibleColor, MELEE, TURRETS } from '../sim/data';
import { lerpAngle, type Bot, type GameEvent, type Match } from '../sim/match';
import { buildArena, type ArenaScene } from './arenaScene';
import { ArcBolts, Particles } from './fx';
import { buildRobot, disposeRobot, type RobotModel } from './robots';

const CAM_DISTANCE = 9;
const CAM_HEIGHT = 4.6;
/** Matches the height of the HUD dock, so the action is centered in what's left of the screen. */
const DOCK_HEIGHT = 136;
const MAX_WRECKS = 12;
const WRECK_LIFE = 12;
const FALL_TIME = 1;
const ENVIRONMENT_INTENSITY = 0.55;
const THROW_HEIGHT = 3.2;
/** How long a flipped robot takes to roll onto its back, and to roll back onto its wheels. */
const ROLL_OVER_TIME = 0.4;
const RIGHTING_TIME = 0.5;
const MATTE_METALNESS = 0.15;
const FILL_LIGHT = 1.3;

interface BotVisual {
  model: RobotModel;
  barBack: THREE.Mesh;
  barFront: THREE.Mesh;
  label: THREE.Sprite;
  smokeT: number;
  wheelSpin: number;
  /** Counts down while the robot drops off a ledge or into a pit. */
  fallT: number;
  /** The longest it has been thrown for in this flight, to shape the arc. */
  airPeak: number;
  flipPeak: number;
  /** How far round the robot has rolled: half a turn is upside down, and a full turn is back on its wheels. */
  roll: number;
  /** How many armor plates have come off so far. */
  platesLost: number;
}

/** Brief effects such as beams and shockwaves. */
interface Transient {
  object: THREE.Object3D;
  life: number;
  maxLife: number;
  update: (t: number) => void;
}

function nameSprite(name: string, color: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const g = canvas.getContext('2d')!;
  g.font = 'bold 30px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(name, 128, 24);
  g.fillStyle = `#${legibleColor(color).toString(16).padStart(6, '0')}`;
  g.fillText(name, 128, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(3.6, 0.68, 1);
  return sprite;
}

/** Everything cosmetic for one match. It reads the sim and never writes to it. */
export class MatchView {
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  arena: ArenaScene;
  /** Bot the camera follows. Also the point of reference for shake. */
  followId = 0;
  rearView = false;
  onEvent: ((event: GameEvent) => void) | null = null;

  private match: Match | null = null;
  private readonly scenes = new Map<ArenaId, ArenaScene>();
  private environment: THREE.Texture | null = null;
  private reflections = true;
  private readonly transients: Transient[] = [];
  private readonly droneMeshes = new Map<number, THREE.Group>();
  private readonly visuals = new Map<number, BotVisual>();
  private readonly particles = new Particles();
  private readonly bolts = new ArcBolts();
  private readonly projectileMeshes = new Map<number, THREE.Mesh>();
  private readonly mineMeshes = new Map<number, THREE.Group>();
  private readonly oilMeshes = new Map<number, THREE.Mesh>();
  private readonly pickupMeshes = new Map<number, THREE.Group>();
  private readonly wrecks: { group: THREE.Group; life: number; scorch: THREE.MeshStandardMaterial }[] = [];
  private readonly flash = new THREE.PointLight(0xffa050, 0, 30);
  private camHeading = 0;
  private camPos = new THREE.Vector3(0, 40, 40);
  private camLook = new THREE.Vector3();
  private shake = 0;
  private spin = 0;

  private readonly bulletGeo = new THREE.BoxGeometry(0.1, 0.1, 0.6);
  private readonly bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false });
  private readonly rocketGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.9, 8);
  private readonly rocketMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xff5a1a, emissiveIntensity: 1.5 });
  private readonly shellGeo = new THREE.SphereGeometry(0.28, 10, 8);
  private readonly shellMat = new THREE.MeshStandardMaterial({ color: 0x2b2d30, emissive: 0xff5a1a, emissiveIntensity: 0.5 });
  private readonly discGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.05, 8);
  private readonly discMat = new THREE.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 0.95, roughness: 0.2, flatShading: true });
  private readonly spearGeo = new THREE.BoxGeometry(0.07, 0.07, 1.6);
  private readonly nailGeo = new THREE.ConeGeometry(0.07, 0.28, 4);
  private readonly wreckMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2d, metalness: 0.6, roughness: 0.8, flatShading: true });
  private readonly barGeo = new THREE.PlaneGeometry(2.4, 0.22);
  private readonly barBackMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false });

  constructor() {
    this.arena = this.sceneFor('pit');
    this.arena.scene.add(this.particles.mesh, this.bolts.group, this.flash);
  }

  /** Scenes are built once and reused, since each one is expensive to create. */
  private sceneFor(id: ArenaId): ArenaScene {
    let scene = this.scenes.get(id);
    if (!scene) {
      scene = buildArena(ARENAS[id]);
      scene.scene.environmentIntensity = ENVIRONMENT_INTENSITY;
      this.scenes.set(id, scene);
      if (!this.reflections) this.applyDetail(scene);
      else scene.scene.environment = this.environment;
    }
    return scene;
  }

  setEnvironment(texture: THREE.Texture): void {
    this.environment = texture;
    for (const scene of this.scenes.values()) scene.scene.environment = this.reflections ? texture : null;
  }

  /** Without reflections, shiny metal has nothing to show and renders black, so it goes matte. */
  private dullMetal(scene: THREE.Scene): void {
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const material = node.material;
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      material.userData.metalness ??= material.metalness;
      material.metalness = this.reflections ? material.userData.metalness : Math.min(material.userData.metalness, MATTE_METALNESS);
      material.needsUpdate = true;
    });
  }

  private applyDetail(scene: ArenaScene): void {
    scene.scene.environment = this.reflections ? this.environment : null;
    scene.fill.intensity = this.reflections ? 0 : FILL_LIGHT;
    this.dullMetal(scene.scene);
  }

  /** Materials compile with or without reflections and shadows, so they all rebuild when those change. */
  setDetail(reflections: boolean): void {
    this.reflections = reflections;
    for (const scene of this.scenes.values()) this.applyDetail(scene);
  }

  setMatch(match: Match, followId: number): void {
    this.clearMatch();
    this.arena = this.sceneFor(match.arena.id);
    this.arena.scene.add(this.particles.mesh, this.bolts.group, this.flash);
    this.arena.hill.visible = match.mode === 'koth';
    this.match = match;
    this.followId = followId;
    for (const bot of match.bots) this.addBot(bot);
    if (!this.reflections) this.dullMetal(this.arena.scene);
    const bot = match.bots[followId];
    this.camHeading = bot.heading;
    this.camPos.set(bot.x - Math.sin(bot.heading) * CAM_DISTANCE, CAM_HEIGHT, bot.z - Math.cos(bot.heading) * CAM_DISTANCE);
    this.camLook.set(bot.x, 1, bot.z);
  }

  private addBot(bot: Bot): void {
    const { chassis, melee, turret, defense, paint, rearMelee, tower, wheels } = bot.loadout;
    const model = buildRobot({ chassis, melee, turret, defense, paint, rearMelee, tower, wheels, color: bot.color });
    model.root.scale.setScalar(bot.size);
    const barBack = new THREE.Mesh(this.barGeo, this.barBackMat);
    const barFront = new THREE.Mesh(
      this.barGeo,
      new THREE.MeshBasicMaterial({ color: 0x5be36a, depthTest: false, toneMapped: false }),
    );
    barBack.renderOrder = 10;
    barFront.renderOrder = 11;
    const label = nameSprite(bot.name, bot.color);
    label.renderOrder = 12;
    this.arena.scene.add(model.root, barBack, barFront, label);
    this.visuals.set(bot.id, { model, barBack, barFront, label, smokeT: 0, wheelSpin: 0, fallT: 0, airPeak: 0, flipPeak: 0, roll: 0, platesLost: 0 });
  }

  private clearMatch(): void {
    const scene = this.arena.scene;
    for (const v of this.visuals.values()) {
      scene.remove(v.model.root, v.barBack, v.barFront, v.label);
      disposeRobot(v.model);
      (v.barFront.material as THREE.Material).dispose();
      v.label.material.map?.dispose();
      v.label.material.dispose();
    }
    this.visuals.clear();
    for (const wreck of this.wrecks.splice(0)) this.removeWreck(wreck);
    for (const transient of this.transients.splice(0)) scene.remove(transient.object);
    for (const map of [this.projectileMeshes, this.mineMeshes, this.oilMeshes, this.pickupMeshes, this.droneMeshes]) {
      for (const obj of map.values()) scene.remove(obj);
      map.clear();
    }
  }

  setParticleDensity(density: number): void {
    this.particles.density = density;
  }

  /** A scorch mark and scattered scrap where a robot died, fading after a while. */
  private addWreck(x: number, z: number): void {
    if (this.wrecks.length >= MAX_WRECKS) this.removeWreck(this.wrecks.shift()!);
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const scorch = new THREE.MeshStandardMaterial({ color: 0x050505, transparent: true, opacity: 0.8, roughness: 1, depthWrite: false });
    const mark = new THREE.Mesh(new THREE.CircleGeometry(2.6, 18), scorch);
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.04;
    group.add(mark);
    for (let i = 0; i < 6; i++) {
      const size = 0.2 + Math.random() * 0.45;
      const scrap = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.5, size * 1.4), this.wreckMat);
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 2;
      scrap.position.set(Math.cos(a) * r, size * 0.25, Math.sin(a) * r);
      scrap.rotation.y = Math.random() * Math.PI;
      scrap.castShadow = true;
      group.add(scrap);
    }
    this.arena.scene.add(group);
    this.wrecks.push({ group, life: WRECK_LIFE, scorch });
  }

  private removeWreck(wreck: { group: THREE.Group; scorch: THREE.MeshStandardMaterial }): void {
    this.arena.scene.remove(wreck.group);
    wreck.group.traverse((node) => {
      if (node instanceof THREE.Mesh) node.geometry.dispose();
    });
    wreck.scorch.dispose();
  }

  private updateWrecks(dt: number): void {
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const wreck = this.wrecks[i];
      wreck.life -= dt;
      if (wreck.life <= 0) {
        this.removeWreck(wreck);
        this.wrecks.splice(i, 1);
      } else if (wreck.life < 2) {
        wreck.scorch.opacity = 0.8 * (wreck.life / 2);
        const sink = wreck.life / 2;
        wreck.group.position.y = -0.4 * (1 - sink);
      }
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.setViewOffset(width, height, 0, DOCK_HEIGHT / 2, width, height);
    this.camera.updateProjectionMatrix();
  }

  update(frameDt: number, alpha: number): void {
    const match = this.match;
    if (!match) return;
    this.spin += frameDt;
    for (const event of match.drainEvents()) this.handleEvent(event);

    match.bots.forEach((bot) => this.syncBot(bot, frameDt, alpha));
    this.syncHazards(match, frameDt);
    this.syncProjectiles(match);
    this.syncMines(match);
    this.syncOil(match);
    this.syncDrones(match);
    this.updateTransients(frameDt);
    this.syncPickups(match);
    this.particles.update(frameDt);
    this.bolts.update(frameDt);
    this.updateWrecks(frameDt);
    this.flash.intensity = Math.max(0, this.flash.intensity - frameDt * 900);
    this.updateCamera(match, frameDt, alpha);
    for (const [id, v] of this.visuals) {
      const bot = match.bots[id];
      // Labels right next to the lens would fill the screen, so they fade out up close.
      const seen = bot.cloakT <= 0 || match.bots[this.followId].xrayT > 0;
      const clear = bot.alive && seen && id !== this.followId && v.label.position.distanceTo(this.camera.position) > 10;
      v.barBack.visible = v.barFront.visible = v.label.visible = clear;
    }
  }

  private handleEvent(event: GameEvent): void {
    this.onEvent?.(event);
    const follow = this.match!.bots[this.followId];
    switch (event.type) {
      case 'hit':
        if (event.source < 0) {
          this.particles.burst(event.x, event.z, { count: 2, color: 0xffc040, speed: 10, size: 0.14, life: 0.3 });
        } else if (event.amount >= 1 || Math.random() < 0.25) {
          const color = event.shielded ? 0x7fe8ff : 0xffb040;
          this.particles.burst(event.x, event.z, { count: 5, color, speed: 11, size: 0.16, life: 0.35, y: 1 });
        }
        if (event.target === this.followId) this.shake = Math.min(1, this.shake + event.amount * 0.03);
        break;
      case 'explosion': {
        const n = event.big ? 2 : 1;
        this.particles.burst(event.x, event.z, { count: 26 * n, color: 0xff8a2a, speed: 15, size: 0.42, life: 0.55, y: 1 });
        this.particles.burst(event.x, event.z, { count: 14 * n, color: 0xffe08a, speed: 21, size: 0.2, life: 0.35, y: 1 });
        this.particles.burst(event.x, event.z, { count: 16 * n, color: 0x3a3a3a, speed: 5, size: 0.8, life: 1.1, y: 1, gravity: -3 });
        if (event.big) {
          this.particles.burst(event.x, event.z, { count: 14, color: 0x6d7379, speed: 16, size: 0.4, life: 1.4, y: 1 });
          this.addWreck(event.x, event.z);
        }
        this.flash.position.set(event.x, 3, event.z);
        this.flash.intensity = event.big ? 500 : 250;
        const dist = Math.hypot(event.x - follow.x, event.z - follow.z);
        this.shake = Math.min(1, this.shake + Math.max(0, 1 - dist / 22) * (event.big ? 0.8 : 0.4));
        break;
      }
      case 'shot':
        this.particles.burst(event.x, event.z, { count: 1, color: 0xffe08a, speed: 4, size: 0.2, life: 0.08, y: 1.5 });
        break;
      case 'arc':
        this.bolts.add(event.points);
        break;
      case 'strike':
        this.particles.burst(event.x, event.z, { count: 10, color: 0xdfe5ea, speed: 9, size: 0.2, life: 0.3, y: 0.6 });
        break;
      case 'pickup':
        this.particles.burst(event.x, event.z, {
          count: 14,
          color: event.kind === 'repair' ? 0x5be36a : 0xffd24a,
          speed: 8,
          size: 0.2,
          life: 0.5,
          gravity: 4,
        });
        break;
      case 'powerup': {
        const bot = this.match!.bots[event.bot];
        const color = { repair: 0x5be36a, battery: 0xd8d84a, rage: 0xff3a3a, megashield: 0xffd23a, cloaking: 0x9fb8d0, xray: 0x7fe8ff }[event.kind];
        this.particles.burst(bot.x, bot.z, { count: 20, color, speed: 9, size: 0.2, life: 0.5, gravity: 0, spread: 1 });
        break;
      }
      case 'beam':
        this.addBeam(event.x1, event.z1, event.x2, event.z2);
        this.particles.burst(event.x2, event.z2, { count: 6, color: 0xff6a5a, speed: 8, size: 0.14, life: 0.25, y: 1.4 });
        break;
      case 'pulse':
        this.addPulse(event.x, event.z, event.radius, event.color);
        break;
      case 'teleport':
        for (const [x, z] of [[event.x1, event.z1], [event.x2, event.z2]]) {
          this.particles.burst(x, z, { count: 26, color: 0x8fdcff, speed: 9, size: 0.2, life: 0.5, gravity: -6 });
        }
        break;
      case 'kill': {
        const v = this.visuals.get(event.victim);
        if (event.fell && v) v.fallT = FALL_TIME;
        break;
      }
      default:
        break;
    }
  }

  private syncBot(bot: Bot, dt: number, alpha: number): void {
    const v = this.visuals.get(bot.id);
    if (!v) return;
    const { model } = v;
    if (!bot.alive && v.fallT > 0) {
      // Keep drawing a falling robot until it has dropped out of sight.
      v.fallT -= dt;
      const t = 1 - v.fallT / FALL_TIME;
      model.root.visible = true;
      model.root.position.y = -22 * t * t;
      model.root.rotation.x += dt * 2.5;
      model.shield.visible = false;
      return;
    }
    model.root.rotation.x = 0;
    const showing = bot.alive;
    const viewer = this.match!.bots[this.followId];
    const self = bot === viewer;
    const hidden = bot.cloakT > 0 && !self && viewer.xrayT <= 0;
    model.root.visible = showing && !hidden && !(bot.invulnT > 0 && Math.floor(this.spin * 14) % 2 === 0);
    if (!showing) {
      v.roll = 0;
      return;
    }
    this.setCloakLook(model, bot.cloakT > 0);

    const x = bot.prevX + (bot.x - bot.prevX) * alpha;
    const z = bot.prevZ + (bot.z - bot.prevZ) * alpha;
    v.airPeak = bot.airT > 0 ? Math.max(v.airPeak, bot.airT) : 0;
    const flight = v.airPeak > 0 ? Math.sin(Math.PI * (1 - bot.airT / v.airPeak)) : 0;
    // Snapshots only arrive 20 times a second online, so the roll eases toward where it should be.
    let rollTo = v.roll > 0 ? Math.PI * 2 : 0;
    if (bot.flipT > 0) {
      v.flipPeak = Math.max(v.flipPeak, bot.flipT);
      rollTo = bot.flipT < RIGHTING_TIME ? Math.PI * (2 - bot.flipT / RIGHTING_TIME) : Math.PI * Math.min(1, (v.flipPeak - bot.flipT) / ROLL_OVER_TIME);
    } else {
      v.flipPeak = 0;
    }
    v.roll += (rollTo - v.roll) * Math.min(1, dt * 14);
    if (bot.flipT <= 0 && v.roll > Math.PI * 1.98) v.roll = 0;
    model.root.position.set(x, THROW_HEIGHT * flight + model.rollHeight * Math.sin(v.roll / 2), z);
    model.root.rotation.z = v.roll;
    model.root.rotation.y = lerpAngle(bot.prevHeading, bot.heading, alpha);
    model.root.rotation.x = -0.5 * flight;

    const forward = bot.vx * Math.sin(bot.heading) + bot.vz * Math.cos(bot.heading);
    v.wheelSpin += forward * dt * 2.5;
    for (const wheel of model.wheels) wheel.rotation.x = v.wheelSpin;

    model.hullMaterial.emissive.setHex(bot.flashT > 0 ? 0xffffff : bot.rageT > 0 ? 0x661111 : 0x000000);
    model.hullMaterial.emissiveIntensity = bot.flashT > 0 ? 0.12 : 0.6;
    model.shield.visible = bot.shieldT > 0 || bot.megaT > 0;

    const melee = MELEE[bot.loadout.melee];
    if (model.spinner) {
      const rate = melee.kind === 'spinner' ? 2 + bot.meleeCharge * 70 : bot.meleeActive ? 38 : 2;
      model.spinner.rotation[model.spinAxis] += rate * dt;
    }
    if (model.blades && bot.bladesT > 0) {
      for (const disc of model.blades.children) disc.rotation.x += 30 * dt;
      this.particles.burst(bot.x, bot.z, { count: 1, color: 0xffc860, speed: 8, size: 0.08, life: 0.2, y: 0.6 });
    }
    if (bot.turretFiring && TURRETS[bot.loadout.turret].kind === 'flame') {
      const dx = Math.sin(bot.heading);
      const dz = Math.cos(bot.heading);
      this.particles.burst(bot.x + dx * (bot.radius + 0.7), bot.z + dz * (bot.radius + 0.7), {
        count: 3, color: Math.random() < 0.5 ? 0xff8a2a : 0xffd24a, speed: 18, size: 0.4, life: 0.45, y: 1.2, gravity: -3, dir: { x: dx, z: dz, jitter: 5 },
      });
    }
    if (bot.burnT > 0 && Math.random() < 0.5) {
      this.particles.burst(bot.x, bot.z, { count: 1, color: 0xff8a2a, speed: 2, size: 0.3, life: 0.35, y: 1.2, gravity: -5 });
    }
    if (bot.regenT > 0 && Math.random() < 0.4) {
      this.particles.burst(bot.x, bot.z, { count: 1, color: 0x5be36a, speed: 2, size: 0.14, life: 0.5, y: 0.6, gravity: -6 });
    }
    if (bot.kamikazeT > 0) {
      this.particles.burst(bot.x, bot.z, { count: 1, color: 0xff2a1a, speed: 5, size: 0.2, life: 0.2, y: 1.5, gravity: 0 });
    }
    if (melee.kind === 'magnet' && bot.meleeActive) {
      const dx = Math.sin(bot.heading);
      const dz = Math.cos(bot.heading);
      this.particles.burst(bot.x + dx * 10, bot.z + dz * 10, {
        count: 1, color: 0xff6a5a, speed: 18, size: 0.1, life: 0.5, y: 1, gravity: 0, dir: { x: -dx, z: -dz, jitter: 3 },
      });
    }
    if (bot.loadout.melee === 'flipper') {
      // The plate snaps up as it fires, then settles back down.
      const up = bot.meleeSwing < 0.18 ? -1 : 0;
      model.meleePivot.rotation.x += (up - model.meleePivot.rotation.x) * Math.min(1, dt * (bot.meleeSwing < 0.18 ? 45 : 6));
    } else if (melee.kind === 'strike') {
      // Raise during the windup, slam on the strike, then ease back to rest.
      const raised = bot.meleeWindup > 0 ? -1.15 : -0.3;
      const slam = bot.meleeSwing < 0.1 ? 0.25 : raised;
      model.meleePivot.rotation.x += (slam - model.meleePivot.rotation.x) * Math.min(1, dt * (bot.meleeSwing < 0.1 ? 40 : 10));
    } else if (bot.loadout.melee === 'ram') {
      const reach = bot.chassis.radius * 0.8 + (bot.lungeT > 0 ? 0.5 : 0);
      model.meleePivot.position.z = bot.loadout.rearMelee ? -reach : reach;
    }

    if (bot.meleeActive && melee.kind === 'held' && !melee.passive) {
      const fx = Math.sin(bot.heading);
      const fz = Math.cos(bot.heading);
      this.particles.burst(bot.x + fx * (bot.radius + 1.6), bot.z + fz * (bot.radius + 1.6), {
        count: 1,
        color: 0xffc860,
        speed: 7,
        size: 0.08,
        life: 0.22,
        y: 0.6,
      });
    }

    const health = bot.hp / bot.maxHp;
    this.showDamage(bot, v, health);
    v.smokeT -= dt;
    if (health < 0.45 && v.smokeT <= 0) {
      v.smokeT = 0.05 + health * 0.25;
      this.particles.burst(bot.x, bot.z, { count: 1, color: health < 0.2 ? 0x1c1c1c : 0x555555, speed: 1.2, size: 0.6, life: 0.9, y: 1.6, gravity: -3 });
    }
    if (bot.boostT > 0) {
      const boost = Math.hypot(bot.vx, bot.vz) / (bot.chassis.speed * BOOST_SPEED);
      this.particles.burst(bot.x - Math.sin(bot.heading) * bot.radius, bot.z - Math.cos(bot.heading) * bot.radius, {
        count: 1,
        color: 0xff8a2a,
        speed: 3,
        size: 0.3 * Math.max(boost, 0.4),
        life: 0.25,
        y: 0.6,
        gravity: 0,
      });
    }
    if (bot.stunT > 0 && Math.random() < 0.3) {
      this.particles.burst(bot.x, bot.z, { count: 1, color: 0x9fe6ff, speed: 4, size: 0.12, life: 0.25, y: 1.8, gravity: 0 });
    }

    const barY = 3.1;
    v.barBack.position.set(x, barY, z);
    v.barFront.position.set(x, barY, z);
    v.barBack.quaternion.copy(this.camera.quaternion);
    v.barFront.quaternion.copy(this.camera.quaternion);
    v.barFront.scale.x = Math.max(0.001, health);
    v.barFront.translateX(-1.2 * (1 - health));
    const color = health > 0.5 ? 0x5be36a : health > 0.25 ? 0xf2c037 : 0xe84a3a;
    (v.barFront.material as THREE.MeshBasicMaterial).color.setHex(color);
    v.label.position.set(x, barY + 0.55, z);
  }

  /** The paint scorches and armor plates break off as a robot takes damage. */
  private showDamage(bot: Bot, v: BotVisual, health: number): void {
    const { model } = v;
    const shade = 0.4 + 0.6 * health;
    model.materials.forEach((material, i) => material.color.copy(model.baseColors[i]).multiplyScalar(shade));

    // Health can round to just above full on its way over the network.
    const lost = Math.floor(Math.max(0, 1 - health) * 1.4 * model.plates.length);
    const target = Math.min(lost, model.plates.length);
    if (target < v.platesLost) {
      // Healing bolts the armor back on.
      for (let i = target; i < v.platesLost; i++) model.plates[i].visible = true;
      v.platesLost = target;
    }
    while (v.platesLost < target) {
      model.plates[v.platesLost++].visible = false;
      this.particles.burst(bot.x, bot.z, { count: 7, color: 0x6d7379, speed: 9, size: 0.3, life: 0.9, y: 1.2 });
    }
  }

  private setCloakLook(model: RobotModel, cloaked: boolean): void {
    for (const material of model.materials) {
      if (material.transparent === cloaked) continue;
      material.transparent = cloaked;
      material.opacity = cloaked ? 0.35 : 1;
      material.needsUpdate = true;
    }
  }

  private syncHazards(match: Match, dt: number): void {
    const { arena } = this;
    const { def } = arena;
    def.saws.forEach((saw, i) => {
      const pos = sawPos(saw, match.time);
      const mesh = arena.saws[i];
      mesh.position.x = pos.x;
      mesh.position.z = pos.z;
      mesh.rotation.y = this.spin * 12;
    });
    arena.fire.emissiveIntensity = 0.8 + Math.sin(this.spin * 9) * 0.25;
    for (const fire of def.firePits) {
      if (Math.random() > dt * 22) continue;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * fire.r;
      this.particles.burst(fire.x + Math.cos(a) * r, fire.z + Math.sin(a) * r, {
        count: 1, color: Math.random() < 0.5 ? 0xff7a1a : 0xffc23a, speed: 2, size: 0.5, life: 0.7, y: 0.2, gravity: -5,
      });
    }
    def.shockers.forEach((coil, i) => {
      const on = shockerActive(coil, match.time);
      // Glows just before firing, so there's time to react.
      const warning = !on && shockerActive(coil, match.time + 0.8);
      arena.shockers[i].emissiveIntensity = on ? 2.4 + Math.random() : warning ? 0.8 : 0.1;
      if (on && Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        this.particles.burst(coil.x + Math.cos(a) * coil.r * 0.8, coil.z + Math.sin(a) * coil.r * 0.8, {
          count: 2, color: 0x9fe6ff, speed: 7, size: 0.12, life: 0.2, y: 0.3,
        });
      }
    });
    def.pistons.forEach((piston, i) => {
      const reach = PISTON_REACH * pistonExtension(piston, match.time);
      arena.pistons[i].position.set(piston.x + piston.dirX * reach, 0, piston.z + piston.dirZ * reach);
    });
    for (const sentry of def.sentries) {
      for (const bot of match.bots) {
        if (!bot.alive || Math.hypot(bot.x - sentry.x, bot.z - sentry.z) >= sentry.range) continue;
        const dist = Math.hypot(bot.x - sentry.x, bot.z - sentry.z) || 1;
        this.particles.burst(sentry.x, sentry.z, {
          count: 2, color: Math.random() < 0.5 ? 0xff8a2a : 0xffd24a, speed: dist * 2.2, size: 0.4, life: 0.45, y: 2.8, gravity: 2,
          dir: { x: (bot.x - sentry.x) / dist, z: (bot.z - sentry.z) / dist, jitter: 3 },
        });
      }
    }
  }

  private addBeam(x1: number, z1: number, x2: number, z2: number): void {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const material = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, toneMapped: false });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, length), material);
    beam.position.set((x1 + x2) / 2, 1.4, (z1 + z2) / 2);
    beam.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    this.arena.scene.add(beam);
    this.transients.push({ object: beam, life: 0.14, maxLife: 0.14, update: (t) => (material.opacity = t) });
  }

  private addPulse(x: number, z: number, radius: number, color: number): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.3, z);
    this.arena.scene.add(ring);
    this.transients.push({
      object: ring, life: 0.35, maxLife: 0.35,
      update: (t) => {
        const size = radius * (1 - t * t);
        ring.scale.set(size, size, 1);
        material.opacity = t;
      },
    });
  }

  private updateTransients(dt: number): void {
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const item = this.transients[i];
      item.life -= dt;
      if (item.life <= 0) {
        this.arena.scene.remove(item.object);
        const mesh = item.object as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.transients.splice(i, 1);
      } else {
        item.update(item.life / item.maxLife);
      }
    }
  }

  private syncDrones(match: Match): void {
    const scene = this.arena.scene;
    const live = new Set<number>();
    for (const d of match.drones) {
      live.add(d.id);
      let group = this.droneMeshes.get(d.id);
      if (!group) {
        group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 1), this.wreckMat);
        body.position.y = 0.35;
        body.castShadow = true;
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
        eye.position.set(0, 0.6, 0.3);
        group.add(body, eye);
        scene.add(group);
        this.droneMeshes.set(d.id, group);
      }
      group.position.set(d.x, 0, d.z);
      group.rotation.y = d.heading;
    }
    for (const [id, group] of this.droneMeshes) {
      if (live.has(id)) continue;
      scene.remove(group);
      this.droneMeshes.delete(id);
    }
  }

  private syncProjectiles(match: Match): void {
    const scene = this.arena.scene;
    const live = new Set<number>();
    for (const p of match.projectiles) {
      live.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        if (p.kind === 'rocket') {
          mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
          mesh.rotation.order = 'YXZ';
          mesh.rotation.x = Math.PI / 2;
        } else if (p.kind === 'mortar' || p.kind === 'grenade') {
          mesh = new THREE.Mesh(this.shellGeo, this.shellMat);
        } else if (p.kind === 'disc') {
          mesh = new THREE.Mesh(this.discGeo, this.discMat);
        } else if (p.kind === 'spear') {
          mesh = new THREE.Mesh(this.spearGeo, this.discMat);
        } else {
          mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
        }
        scene.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }
      if (p.kind === 'disc') mesh.rotation.y += 0.5;
      else mesh.rotation.y = Math.atan2(p.vx, p.vz);
      let y = p.kind === 'disc' ? 1.1 : p.kind === 'grenade' ? 0.6 : 1.4;
      if (p.flight > 0) {
        // A lobbed shell follows an arc, peaking halfway through its flight.
        const t = 1 - p.life / p.flight;
        y = 1.4 + 48 * t * (1 - t);
      }
      mesh.position.set(p.x, y, p.z);
      if (p.kind === 'rocket' && Math.random() < 0.8) {
        this.particles.burst(p.x, p.z, { count: 1, color: 0xaaaaaa, speed: 0.8, size: 0.35, life: 0.45, y: 1.4, gravity: -1 });
      }
    }
    for (const [id, mesh] of this.projectileMeshes) {
      if (live.has(id)) continue;
      scene.remove(mesh);
      this.projectileMeshes.delete(id);
    }
  }

  private syncMines(match: Match): void {
    const scene = this.arena.scene;
    const live = new Set<number>();
    for (const m of match.mines) {
      live.add(m.id);
      let group = this.mineMeshes.get(m.id);
      if (!group) {
        group = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.65, 0.22, 10),
          new THREE.MeshStandardMaterial({ color: 0x22252a, metalness: 0.5, roughness: 0.6 }),
        );
        body.position.y = 0.11;
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: m.kind === 'charge' ? 0x3ab0ff : 0xff2a2a, toneMapped: false }));
        lamp.position.y = 0.27;
        lamp.name = 'lamp';
        group.add(body, lamp);
        scene.add(group);
        this.mineMeshes.set(m.id, group);
      }
      group.position.set(m.x, 0, m.z);
      group.getObjectByName('lamp')!.visible = m.armT <= 0 && Math.floor(this.spin * 4) % 2 === 0;
    }
    for (const [id, group] of this.mineMeshes) {
      if (live.has(id)) continue;
      scene.remove(group);
      this.mineMeshes.delete(id);
    }
  }

  private syncOil(match: Match): void {
    const scene = this.arena.scene;
    const live = new Set<number>();
    for (const p of match.oil) {
      live.add(p.id);
      let mesh = this.oilMeshes.get(p.id);
      if (!mesh) {
        const looks = {
          oil: { color: 0x07070a, metalness: 0.9, roughness: 0.15 },
          glue: { color: 0xc99a2e, metalness: 0.1, roughness: 0.3 },
          nails: { color: 0x2b2d30, metalness: 0.3, roughness: 0.9 },
        }[p.kind];
        mesh = new THREE.Mesh(
          new THREE.CircleGeometry(p.r, 24),
          new THREE.MeshStandardMaterial({ ...looks, transparent: true, opacity: 0.85 }),
        );
        mesh.rotation.x = -Math.PI / 2;
        if (p.kind === 'nails') {
          // Evenly spaced by the golden angle, so it looks scattered without being random.
          for (let i = 0; i < 26; i++) {
            const a = i * 2.4;
            const r = p.r * 0.92 * Math.sqrt(i / 26);
            const nail = new THREE.Mesh(this.nailGeo, this.discMat);
            nail.rotation.x = Math.PI / 2;
            nail.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.14);
            mesh.add(nail);
          }
        }
        // Each patch gets its own height, so overlapping ones don't flicker.
        mesh.position.set(p.x, 0.03 + (p.id % 16) * 0.002, p.z);
        scene.add(mesh);
        this.oilMeshes.set(p.id, mesh);
      }
      (mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(0.85, p.life);
    }
    for (const [id, mesh] of this.oilMeshes) {
      if (live.has(id)) continue;
      scene.remove(mesh);
      this.oilMeshes.delete(id);
    }
  }

  private syncPickups(match: Match): void {
    const scene = this.arena.scene;
    const live = new Set<number>();
    for (const p of match.pickups) {
      live.add(p.id);
      let group = this.pickupMeshes.get(p.id);
      if (!group) {
        group = new THREE.Group();
        if (p.kind === 'repair') {
          const mat = new THREE.MeshStandardMaterial({ color: 0x5be36a, emissive: 0x1fbf3a, emissiveIntensity: 1.2 });
          group.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.34), mat));
          group.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.34), mat));
        } else {
          const gear = new THREE.Mesh(
            new THREE.TorusGeometry(0.4, 0.17, 6, 8),
            new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xb07a10, metalness: 0.8, roughness: 0.3 }),
          );
          group.add(gear);
        }
        group.position.set(p.x, 1.1, p.z);
        scene.add(group);
        this.pickupMeshes.set(p.id, group);
      }
      group.rotation.y = this.spin * 2;
      group.position.y = 1.1 + Math.sin(this.spin * 3 + p.id) * 0.15;
    }
    for (const [id, group] of this.pickupMeshes) {
      if (live.has(id)) continue;
      scene.remove(group);
      this.pickupMeshes.delete(id);
    }
  }

  private updateCamera(match: Match, dt: number, alpha: number): void {
    const bot = match.bots[this.followId];
    const x = bot.prevX + (bot.x - bot.prevX) * alpha;
    const z = bot.prevZ + (bot.z - bot.prevZ) * alpha;
    const facing = this.rearView ? bot.heading + Math.PI : bot.heading;
    // Snap when flipping to the rear view; otherwise trail the hull's turning.
    const rate = this.rearView ? 18 : 4.5;
    this.camHeading = lerpAngle(this.camHeading, facing, Math.min(1, dt * rate));

    const fx = Math.sin(this.camHeading);
    const fz = Math.cos(this.camHeading);
    const target = new THREE.Vector3(x - fx * CAM_DISTANCE, CAM_HEIGHT, z - fz * CAM_DISTANCE);
    this.camPos.lerp(target, Math.min(1, dt * 9));
    this.camLook.lerp(new THREE.Vector3(x + fx * 5, 1.6, z + fz * 5), Math.min(1, dt * 12));

    this.shake = Math.max(0, this.shake - dt * 2.4);
    const kick = this.shake * this.shake * 0.8;
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * kick,
      this.camPos.y + (Math.random() - 0.5) * kick,
      this.camPos.z + (Math.random() - 0.5) * kick,
    );
    this.camera.lookAt(this.camLook);
  }

  /** Slow overhead orbit used behind the title screen. */
  orbitCamera(time: number): void {
    const a = time * 0.08;
    const dist = this.arena.def.half * 1.45;
    this.camera.position.set(Math.sin(a) * dist, 26, Math.cos(a) * dist);
    this.camera.lookAt(0, 0, 0);
  }

  /** Circles inside the map rather than around it, because the scenery outside hides walled maps. */
  overviewCamera(time: number): void {
    const a = time * 0.08;
    const { half } = this.arena.def;
    this.camera.position.set(Math.sin(a) * half * 0.75, half * 0.8, Math.cos(a) * half * 0.75);
    this.camera.lookAt(0, 0, 0);
  }
}
