import * as THREE from 'three';
import { ARENAS, PISTON_REACH, pistonExtension, sawPos, shockerActive, TRAP_NAMES, type ArenaId } from '../sim/arena';
import { BOOST_SPEED, legibleColor, MATCH, MELEE, TRAP } from '../sim/data';
import { lerpAngle, type Bot, type GameEvent, type Match, type Trap } from '../sim/match';
import { buildArena, type ArenaScene } from './arenaScene';
import { ArcBolts, Particles } from './fx';
import { Ragdoll } from './ragdoll';
import { buildRobot, disposeRobot, poseWeapon, type RobotModel } from './robots';

const CAM_DISTANCE = 9;
const CAM_HEIGHT = 4.6;
/** How far the chase camera stays from a wall, so it never ends up behind one. */
const CAM_WALL_GAP = 0.6;
const CAM_PAST_EDGE = 1.5;
const CAM_FOV = 60;
/** The view opens up a little under boost, which sells the speed. */
const CAM_BOOST_FOV = 67;
/** Matches the height of the HUD dock, so the action is centered in what's left of the screen. */
const DOCK_HEIGHT = 136;
const SHOCKWAVE_RADIUS = 9;
const MAX_WRECKS = 12;
const WRECK_LIFE = 12;
const ENVIRONMENT_INTENSITY = 0.55;
const THROW_HEIGHT = 3.2;
const SPECTATE_HEIGHT = 25;
const SPECTATE_BACK = 18;
const DROP_HEIGHT = 34;
/** A hit this hard gets the big sparks and a kick of the camera. */
const BIG_HIT = 12;
/** How far a spear fires out, and how quickly it comes back. */
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
  /** The longest it has been thrown for in this flight, to shape the arc. */
  airPeak: number;
  /** Where the main weapon sits at rest. */
  chainTravel: number;
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
/** A warning on the ground, and for a strike the thing that's about to land on it. */
function trapVisual(trap: Trap, arena: ArenaId): { group: THREE.Group; drop: THREE.Object3D | null } {
  const group = new THREE.Group();
  const radius = trap.kind === 'strike' ? TRAP.strike.radius : TRAP.pull.radius;
  const warning = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.35, radius, 40),
    new THREE.MeshBasicMaterial({ color: trap.kind === 'strike' ? 0xff3a1a : 0x8fdcff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false }),
  );
  warning.rotation.x = -Math.PI / 2;
  group.add(warning);
  if (trap.kind !== 'strike') return { group, drop: null };
  const look = TRAP_NAMES[arena].drop;
  const material = new THREE.MeshStandardMaterial({
    color: { anvil: 0x2a2c30, rock: 0x8c5a38, icicle: 0xcfeeff, hammer: 0x55595f, bolt: 0xbfe6ff, lava: 0xff6a1a }[look],
    emissive: look === 'bolt' || look === 'lava' ? (look === 'bolt' ? 0x7fd0ff : 0xd03a00) : 0x000000,
    emissiveIntensity: 1.4,
    metalness: look === 'anvil' || look === 'hammer' ? 0.7 : 0.1,
    roughness: 0.5,
  });
  const geometry = {
    // Wide top, narrow waist and a broad foot.
    anvil: () => new THREE.LatheGeometry([[0, 0], [1.5, 0], [1.5, 0.5], [0.7, 0.9], [0.7, 1.3], [1.8, 1.8], [1.8, 2.3], [0, 2.3]].map(([r, h]) => new THREE.Vector2(r, h)), 6),
    rock: () => new THREE.IcosahedronGeometry(2.2, 0),
    icicle: () => new THREE.ConeGeometry(1.5, 7, 8).rotateX(Math.PI).translate(0, 3.5, 0),
    hammer: () => new THREE.CylinderGeometry(2.3, 2.3, 2.6, 16).translate(0, 1.3, 0),
    bolt: () => new THREE.CylinderGeometry(0.35, 0.1, 30, 6).translate(0, 15, 0),
    lava: () => new THREE.SphereGeometry(1.7, 14, 10),
  }[look]();
  const drop = new THREE.Mesh(geometry, material);
  drop.position.y = DROP_HEIGHT;
  drop.castShadow = true;
  group.add(drop);
  return { group, drop };
}

export class MatchView {
  readonly camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 300);
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
  private readonly ragdolls = new Map<number, Ragdoll>();
  /** Holds the camera on a robot that's just died, before it moves on to spectating. */
  private deathHold = 0;
  private dockHeight = DOCK_HEIGHT;
  private readonly mineMeshes = new Map<number, THREE.Group>();
  private readonly oilMeshes = new Map<number, THREE.Mesh>();
  private readonly pickupMeshes = new Map<number, THREE.Group>();
  private readonly wrecks: { group: THREE.Group; life: number; scorch: THREE.MeshStandardMaterial }[] = [];
  private readonly flash = new THREE.PointLight(0xffa050, 0, 30);
  private camHeading = 0;
  private camPos = new THREE.Vector3(0, 40, 40);
  private camLook = new THREE.Vector3();
  private shake = 0;
  private trapMarker: THREE.Group | null = null;
  private readonly trapVisuals = new Map<number, { group: THREE.Group; drop: THREE.Object3D | null }>();
  private spin = 0;

  private readonly nailGeo = new THREE.ConeGeometry(0.07, 0.28, 4);
  private readonly nailMat = new THREE.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 0.95, roughness: 0.2, flatShading: true });
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
    this.particles.floorHalf = match.arena.walled ? Infinity : match.arena.half;
    this.arena.hill.visible = match.mode === 'koth';
    this.match = match;
    this.followId = followId;
    for (const bot of match.bots) this.addBot(bot);
    if (!this.reflections) this.dullMetal(this.arena.scene);
    const bot = match.bots[followId];
    this.camHeading = bot.heading;
    this.camPos.copy(this.keepInsideWalls(new THREE.Vector3(bot.x - Math.sin(bot.heading) * CAM_DISTANCE, CAM_HEIGHT, bot.z - Math.cos(bot.heading) * CAM_DISTANCE)));
    this.camLook.set(bot.x, 1, bot.z);
  }

  private keepInsideWalls(position: THREE.Vector3): THREE.Vector3 {
    const { walled, half } = this.arena.def;
    if (!walled) return position;
    const limit = half - CAM_WALL_GAP;
    position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
    position.z = THREE.MathUtils.clamp(position.z, -limit, limit);
    return position;
  }

  private addBot(bot: Bot): void {
    const { chassis, melee, defense, paint, rearMelee, tower, wheels } = bot.loadout;
    const model = buildRobot({ chassis, melee, defense, paint, rearMelee, tower, wheels, color: bot.color });
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
    this.visuals.set(bot.id, { model, barBack, barFront, label, smokeT: 0, wheelSpin: 0, airPeak: 0, chainTravel: 0, flipPeak: 0, roll: 0, platesLost: 0 });
  }

  private clearMatch(): void {
    const scene = this.arena.scene;
    for (const ragdoll of this.ragdolls.values()) ragdoll.dispose();
    this.ragdolls.clear();
    this.deathHold = 0;
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
    for (const map of [this.mineMeshes, this.oilMeshes, this.pickupMeshes, this.droneMeshes]) {
      for (const obj of map.values()) scene.remove(obj);
      map.clear();
    }
  }

  setParticleDensity(density: number): void {
    this.particles.density = density;
  }

  /** The marker a spectator steers, and whatever their traps are doing, which everyone can see. */
  private syncTraps(match: Match, dt: number): void {
    const { scene } = this.arena;
    const viewer = match.bots[this.followId];
    const spectating = viewer.out && match.mode === 'lms';
    if (spectating && this.trapMarker?.parent !== scene) {
      this.trapMarker = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(TRAP.strike.radius - 0.2, TRAP.strike.radius, 40), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), ring.material);
      dot.rotation.x = -Math.PI / 2;
      this.trapMarker.add(ring, dot);
      this.trapMarker.position.set(viewer.trapX, 0.14, viewer.trapZ);
      scene.add(this.trapMarker);
    }
    if (this.trapMarker) {
      this.trapMarker.visible = spectating;
      this.trapMarker.position.x += (viewer.trapX - this.trapMarker.position.x) * Math.min(1, dt * 22);
      this.trapMarker.position.z += (viewer.trapZ - this.trapMarker.position.z) * Math.min(1, dt * 22);
    }

    const seen = new Set<number>();
    for (const trap of match.traps) {
      seen.add(trap.id);
      let visual = this.trapVisuals.get(trap.id);
      if (visual && visual.group.parent !== scene) visual = undefined;
      if (!visual) {
        visual = trapVisual(trap, match.arena.id);
        visual.group.position.set(trap.x, 0.12, trap.z);
        scene.add(visual.group);
        this.trapVisuals.set(trap.id, visual);
      }
      if (trap.kind === 'strike') {
        // Falls faster and faster, landing just as the warning runs out.
        if (visual.drop) visual.drop.position.y = DROP_HEIGHT * (trap.t / TRAP.strike.warning) ** 2;
      } else {
        visual.group.rotation.y += dt * 6;
        const a = Math.random() * Math.PI * 2;
        const r = TRAP.pull.radius * Math.random();
        this.particles.burst(trap.x + Math.cos(a) * r, trap.z + Math.sin(a) * r, { count: 1, color: 0xcfe6ff, speed: 3, size: 0.22, life: 0.4, y: 0.8, gravity: 0 });
      }
    }
    for (const [id, visual] of this.trapVisuals) {
      if (seen.has(id)) continue;
      visual.group.removeFromParent();
      visual.group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          (node.material as THREE.Material).dispose();
        }
      });
      this.trapVisuals.delete(id);
    }
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
    this.camera.setViewOffset(width, height, 0, this.dockHeight / 2, width, height);
    this.camera.updateProjectionMatrix();
  }

  /** Touch screens have a much smaller dock, so the action sits lower down. */
  setDockHeight(height: number): void {
    this.dockHeight = height;
    this.resize(window.innerWidth, window.innerHeight);
  }

  update(frameDt: number, alpha: number): void {
    const match = this.match;
    if (!match) return;
    this.spin += frameDt;
    for (const event of match.drainEvents()) this.handleEvent(event);

    match.bots.forEach((bot) => this.syncBot(bot, frameDt, alpha));
    this.syncHazards(match, frameDt);
    this.arena.animate(this.spin);
    this.syncMines(match);
    this.syncOil(match);
    this.syncDrones(match);
    this.syncTraps(match, frameDt);
    this.updateTransients(frameDt);
    this.updateRagdolls(frameDt);
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
        } else if (event.amount >= BIG_HIT) {
          // A weapon landing properly should feel like an event, for both robots.
          const color = event.shielded ? 0x7fe8ff : 0xffb040;
          this.particles.burst(event.x, event.z, { count: 18, color, speed: 17, size: 0.2, life: 0.4, y: 1 });
          this.particles.burst(event.x, event.z, { count: 8, color: 0xfff4c8, speed: 24, size: 0.12, life: 0.22, y: 1 });
          this.flash.position.set(event.x, 2, event.z);
          this.flash.intensity = Math.max(this.flash.intensity, 90);
          if (event.source === this.followId) this.shake = Math.min(1, this.shake + 0.35);
        } else if (event.amount >= 1 || Math.random() < 0.25) {
          const color = event.shielded ? 0x7fe8ff : 0xffb040;
          this.particles.burst(event.x, event.z, { count: 5, color, speed: 11, size: 0.16, life: 0.35, y: 1 });
        }
        if (event.target === this.followId) this.shake = Math.min(1, this.shake + event.amount * 0.03);
        break;
      case 'explosion': {
        this.explosionFx(event.x, 1, event.z, event.big, event.big);
        const dist = Math.hypot(event.x - follow.x, event.z - follow.z);
        this.shake = Math.min(1, this.shake + Math.max(0, 1 - dist / 22) * (event.big ? 0.8 : 0.4));
        break;
      }
      case 'arc':
        this.bolts.add(event.points);
        break;
      case 'strike':
        this.particles.burst(event.x, event.z, { count: 16, color: 0xdfe5ea, speed: 13, size: 0.2, life: 0.3, y: 0.6 });
        if (event.owner === this.followId) this.shake = Math.min(1, this.shake + 0.1);
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
      case 'pulse':
        this.addPulse(event.x, event.z, event.radius, event.color);
        break;
      case 'teleport':
        for (const [x, z] of [[event.x1, event.z1], [event.x2, event.z2]]) {
          this.particles.burst(x, z, { count: 26, color: 0x8fdcff, speed: 9, size: 0.2, life: 0.5, gravity: -6 });
        }
        break;
      case 'kill':
        this.startRagdoll(event.victim, event.x, event.z, event.vx, event.vz, event.fell);
        break;
      default:
        break;
    }
  }

  /** Fire, smoke and a shockwave. Anywhere the floor is, it leaves a scorch mark and scrap behind. */
  private explosionFx(x: number, y: number, z: number, big: boolean, wreck: boolean): void {
    const n = big ? 2 : 1;
    this.particles.burst(x, z, { count: 26 * n, color: 0xff8a2a, speed: 15, size: 0.42, life: 0.55, y });
    this.particles.burst(x, z, { count: 14 * n, color: 0xffe08a, speed: 21, size: 0.2, life: 0.35, y });
    this.particles.burst(x, z, { count: 16 * n, color: 0x3a3a3a, speed: 5, size: 0.8, life: 1.1, y, gravity: -3 });
    if (big) {
      this.particles.burst(x, z, { count: 14, color: 0x6d7379, speed: 16, size: 0.4, life: 1.4, y });
      // Sits on the floor, unless the blast is down below it.
      this.addPulse(x, z, SHOCKWAVE_RADIUS, 0xffb070, y < 0 ? y - 0.4 : Math.max(0.3, y - 0.7));
    }
    if (wreck) this.addWreck(x, z);
    this.flash.position.set(x, y + 2, z);
    this.flash.intensity = big ? 500 : 250;
  }

  /** The robot goes limp and tumbles, and only blows once it has finished. */
  private startRagdoll(id: number, x: number, z: number, vx: number, vz: number, fell: boolean): void {
    const v = this.visuals.get(id);
    const bot = this.match?.bots[id];
    if (!v || !bot) return;
    this.setCloakLook(v.model, false);
    v.model.shield.visible = false;
    // Scorched, with its armour gone, as it was in its last moment. The copy shares these materials.
    this.showDamage(bot, v, 0);
    this.ragdolls.get(id)?.dispose();
    const { half, walled } = this.arena.def;
    this.ragdolls.set(id, new Ragdoll(v.model.root, x, z, v.model.root.rotation.y, vx, vz, fell, { scene: this.arena.scene, half, walled, ledges: this.arena.ledges }, (position, overEdge) => {
      // Over a pit the robot has sunk out of sight, so the blast comes up out of the hole.
      const overFloor = Math.abs(position.x) < half && Math.abs(position.z) < half;
      const y = overEdge && overFloor ? 0.6 : position.y;
      this.explosionFx(position.x, y, position.z, true, !overEdge && overFloor);
      // The sound comes from the same place as every other explosion.
      this.onEvent?.({ type: 'explosion', x: position.x, z: position.z, big: true });
      const follow = this.match!.bots[this.followId];
      const dist = Math.hypot(position.x - follow.x, position.z - follow.z);
      this.shake = Math.min(1, this.shake + Math.max(0, 1 - dist / 22) * 0.8);
    }));
    if (id === this.followId) this.deathHold = MATCH.respawnTime;
  }

  private updateRagdolls(dt: number): void {
    this.deathHold = Math.max(0, this.deathHold - dt);
    for (const [id, ragdoll] of this.ragdolls) {
      if (ragdoll.update(dt)) {
        if (Math.random() < 0.35) {
          const { x, y, z } = ragdoll.position;
          if (y > -6) this.particles.burst(x, z, { count: 1, color: 0x2a2a2a, speed: 1.2, size: 0.55, life: 0.7, y, gravity: -3 });
        }
        continue;
      }
      this.ragdolls.delete(id);
    }
  }

  private syncBot(bot: Bot, dt: number, alpha: number): void {
    const v = this.visuals.get(bot.id);
    if (!v) return;
    const { model } = v;
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
    if (forward !== 0) model.tread?.(v.wheelSpin / 2.5);

    model.hullMaterial.emissive.setHex(bot.flashT > 0 ? 0xffffff : bot.rageT > 0 ? 0x661111 : 0x000000);
    model.hullMaterial.emissiveIntensity = bot.flashT > 0 ? 0.12 : 0.6;
    model.shield.visible = bot.shieldT > 0 || bot.megaT > 0;

    const melee = MELEE[bot.loadout.melee];
    if (model.spinner) {
      const firing = bot.meleeActive || (melee.chain !== undefined && bot.meleeSwing < 0.5);
      const rate = melee.kind === 'spinner' ? 2 + bot.meleeCharge * 70 : firing ? 38 : 2;
      model.spinner.rotation[model.spinAxis] += rate * dt;
    }
    if (model.chain && (bot.meleeActive || bot.meleeCd > 0)) {
      v.chainTravel += (bot.meleeActive ? 9 : 1) * dt;
      model.chain(v.chainTravel);
    }
    if (model.blades && bot.bladesT > 0) {
      for (const disc of model.blades.children) disc.rotation.x += 30 * dt;
      this.particles.burst(bot.x, bot.z, { count: 1, color: 0xffc860, speed: 8, size: 0.08, life: 0.2, y: 0.6 });
    }
    if (bot.meleeActive && melee.burns) {
      const toward = bot.loadout.rearMelee ? bot.heading + Math.PI : bot.heading;
      const dx = Math.sin(toward);
      const dz = Math.cos(toward);
      const reach = model.muzzle.reach * bot.size;
      this.particles.burst(bot.x + dx * reach, bot.z + dz * reach, {
        count: 3, color: Math.random() < 0.5 ? 0xff8a2a : 0xffd24a, speed: 18, size: 0.4, life: 0.45, y: model.muzzle.height * bot.size, gravity: -3, dir: { x: dx, z: dz, jitter: 5 },
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
    poseWeapon(model, bot.loadout.melee, {
      windingUp: bot.meleeWindup > 0,
      swing: bot.meleeSwing,
      active: bot.meleeActive,
      pressed: bot.input.melee,
      cooling: bot.meleeCd > 0,
      lunging: bot.lungeT > 0,
      radius: bot.chassis.radius,
      rear: !!bot.loadout.rearMelee,
      speed: Math.max(0, Math.min(1, forward / bot.chassis.speed)),
      time: this.spin,
    }, dt);

    if (bot.meleeActive && melee.kind === 'held' && !melee.passive && !melee.burns) {
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

  private addPulse(x: number, z: number, radius: number, color: number, y = 0.3): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
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
            const nail = new THREE.Mesh(this.nailGeo, this.nailMat);
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

  /** Whoever's out watches from above, with the marker they steer in the middle of the view. */
  private spectateCamera(match: Match, bot: Bot, dt: number): void {
    const { half, walled } = match.arena;
    // Scenery stands outside a walled map, so the camera stays in.
    const back = bot.trapZ - SPECTATE_BACK;
    const target = new THREE.Vector3(bot.trapX, SPECTATE_HEIGHT, walled ? Math.max(back, -half + 1) : back);
    this.camPos.lerp(target, Math.min(1, dt * 5));
    this.camLook.lerp(new THREE.Vector3(bot.trapX, 0, bot.trapZ + 2), Math.min(1, dt * 7));
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const kick = this.shake * this.shake * 0.8;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * kick, this.camPos.y + (Math.random() - 0.5) * kick, this.camPos.z + (Math.random() - 0.5) * kick);
    this.camera.lookAt(this.camLook);
  }

  /** The floor would hide a robot falling past the edge, so the camera leans out after it. */
  private leanPastEdge(position: THREE.Vector3, doll: THREE.Vector3): void {
    const { walled, half } = this.arena.def;
    if (walled) return;
    if (Math.abs(doll.x) > half) position.x = Math.sign(doll.x) * (half + CAM_PAST_EDGE);
    if (Math.abs(doll.z) > half) position.z = Math.sign(doll.z) * (half + CAM_PAST_EDGE);
  }

  private updateCamera(match: Match, dt: number, alpha: number): void {
    const bot = match.bots[this.followId];
    if (bot.out && match.mode === 'lms' && this.deathHold <= 0) {
      this.spectateCamera(match, bot, dt);
      return;
    }
    const fov = bot.boostT > 0 ? CAM_BOOST_FOV : CAM_FOV;
    if (Math.abs(this.camera.fov - fov) > 0.02) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
    const x = bot.prevX + (bot.x - bot.prevX) * alpha;
    const z = bot.prevZ + (bot.z - bot.prevZ) * alpha;
    const facing = this.rearView ? bot.heading + Math.PI : bot.heading;
    // Snap when flipping to the rear view; otherwise trail the hull's turning.
    const rate = this.rearView ? 18 : 4.5;
    this.camHeading = lerpAngle(this.camHeading, facing, Math.min(1, dt * rate));

    const fx = Math.sin(this.camHeading);
    const fz = Math.cos(this.camHeading);
    const target = this.keepInsideWalls(new THREE.Vector3(x - fx * CAM_DISTANCE, CAM_HEIGHT, z - fz * CAM_DISTANCE));
    // A robot that's just died gets watched all the way down.
    const doll = this.ragdolls.get(this.followId);
    if (doll) this.leanPastEdge(target, doll.position);
    this.camPos.lerp(target, Math.min(1, dt * 9));
    if (doll) this.camLook.lerp(doll.position, Math.min(1, dt * 7));
    else this.camLook.lerp(new THREE.Vector3(x + fx * 5, 1.6, z + fz * 5), Math.min(1, dt * 12));

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
