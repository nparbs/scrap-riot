import * as THREE from 'three';
import { ARENA, sawPos } from '../sim/arena';
import { TURBO_MULT } from '../sim/data';
import { lerpAngle, type Bot, type GameEvent, type Match } from '../sim/match';
import { buildArena, type ArenaScene } from './arenaScene';
import { ArcBolts, Particles } from './fx';
import { buildRobot, disposeRobot, type RobotModel } from './robots';

const CAM_DISTANCE = 13;
const CAM_HEIGHT = 8.5;

interface BotVisual {
  model: RobotModel;
  barBack: THREE.Mesh;
  barFront: THREE.Mesh;
  label: THREE.Sprite;
  smokeT: number;
  wheelSpin: number;
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
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
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
  readonly arena: ArenaScene;
  /** Bot the camera follows. Also the point of reference for shake. */
  followId = 0;
  rearView = false;
  onEvent: ((event: GameEvent) => void) | null = null;

  private match: Match | null = null;
  private readonly visuals = new Map<number, BotVisual>();
  private readonly particles = new Particles();
  private readonly bolts = new ArcBolts();
  private readonly projectileMeshes = new Map<number, THREE.Mesh>();
  private readonly mineMeshes = new Map<number, THREE.Group>();
  private readonly oilMeshes = new Map<number, THREE.Mesh>();
  private readonly pickupMeshes = new Map<number, THREE.Group>();
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
  private readonly barGeo = new THREE.PlaneGeometry(2.4, 0.22);
  private readonly barBackMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false });

  constructor() {
    this.arena = buildArena();
    this.arena.scene.add(this.particles.mesh, this.bolts.group, this.flash);
  }

  setMatch(match: Match, followId: number): void {
    this.clearMatch();
    this.match = match;
    this.followId = followId;
    for (const bot of match.bots) this.addBot(bot);
    const bot = match.bots[followId];
    this.camHeading = bot.heading;
    this.camPos.set(bot.x - Math.sin(bot.heading) * CAM_DISTANCE, CAM_HEIGHT, bot.z - Math.cos(bot.heading) * CAM_DISTANCE);
    this.camLook.set(bot.x, 1, bot.z);
  }

  private addBot(bot: Bot): void {
    const { chassis, melee, turret, defense } = bot.loadout;
    const model = buildRobot({ chassis, melee, turret, defense, color: bot.color });
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
    this.visuals.set(bot.id, { model, barBack, barFront, label, smokeT: 0, wheelSpin: 0 });
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
    for (const map of [this.projectileMeshes, this.mineMeshes, this.oilMeshes, this.pickupMeshes]) {
      for (const obj of map.values()) scene.remove(obj);
      map.clear();
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(frameDt: number, alpha: number): void {
    const match = this.match;
    if (!match) return;
    this.spin += frameDt;
    for (const event of match.drainEvents()) this.handleEvent(event);

    match.bots.forEach((bot) => this.syncBot(bot, frameDt, alpha));
    this.syncSaws(match);
    this.syncProjectiles(match);
    this.syncMines(match);
    this.syncOil(match);
    this.syncPickups(match);
    this.particles.update(frameDt);
    this.bolts.update(frameDt);
    this.flash.intensity = Math.max(0, this.flash.intensity - frameDt * 900);
    this.updateCamera(match, frameDt, alpha);
    for (const [id, v] of this.visuals) {
      const bot = match.bots[id];
      // Labels right next to the lens would fill the screen, so they fade out up close.
      const clear = bot.alive && id !== this.followId && v.label.position.distanceTo(this.camera.position) > 10;
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
        const color = { repair: 0x5be36a, turbo: 0xff8a2a, overdrive: 0xff3a3a, emp: 0x7fe8ff }[event.kind];
        const emp = event.kind === 'emp';
        this.particles.burst(bot.x, bot.z, { count: emp ? 90 : 20, color, speed: emp ? 26 : 9, size: 0.2, life: 0.5, gravity: 0, spread: 1 });
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
    const showing = bot.alive;
    model.root.visible = showing && !(bot.invulnT > 0 && Math.floor(this.spin * 14) % 2 === 0);
    if (!showing) return;

    const x = bot.prevX + (bot.x - bot.prevX) * alpha;
    const z = bot.prevZ + (bot.z - bot.prevZ) * alpha;
    model.root.position.set(x, 0, z);
    model.root.rotation.y = lerpAngle(bot.prevHeading, bot.heading, alpha);
    model.turretPivot.rotation.y = bot.turretAngle - bot.heading;

    const forward = bot.vx * Math.sin(bot.heading) + bot.vz * Math.cos(bot.heading);
    v.wheelSpin += forward * dt * 2.5;
    for (const wheel of model.wheels) wheel.rotation.x = v.wheelSpin;

    model.hullMaterial.emissive.setHex(bot.flashT > 0 ? 0xffffff : bot.overdriveT > 0 ? 0x661111 : 0x000000);
    model.hullMaterial.emissiveIntensity = bot.flashT > 0 ? 0.12 : 0.6;
    model.shield.visible = bot.shieldT > 0;

    if (model.sawBlade) model.sawBlade.rotation.x += (bot.meleeActive ? 38 : 2) * dt;
    if (bot.loadout.melee === 'hammer') {
      // Raise during the windup, slam on the strike, then ease back to rest.
      const raised = bot.meleeWindup > 0 ? -1.15 : -0.3;
      const slam = bot.meleeSwing < 0.1 ? 0.25 : raised;
      model.meleePivot.rotation.x += (slam - model.meleePivot.rotation.x) * Math.min(1, dt * (bot.meleeSwing < 0.1 ? 40 : 10));
    } else if (bot.loadout.melee === 'ram') {
      model.meleePivot.position.z = bot.chassis.radius * 0.8 + (bot.lungeT > 0 ? 0.5 : 0);
    }

    if (bot.meleeActive) {
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
    v.smokeT -= dt;
    if (health < 0.45 && v.smokeT <= 0) {
      v.smokeT = 0.05 + health * 0.25;
      this.particles.burst(bot.x, bot.z, { count: 1, color: health < 0.2 ? 0x1c1c1c : 0x555555, speed: 1.2, size: 0.6, life: 0.9, y: 1.6, gravity: -3 });
    }
    if (bot.turboT > 0) {
      const boost = Math.hypot(bot.vx, bot.vz) / (bot.chassis.speed * TURBO_MULT);
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

  private syncSaws(match: Match): void {
    ARENA.saws.forEach((def, i) => {
      const pos = sawPos(def, match.time);
      const mesh = this.arena.saws[i];
      mesh.position.x = pos.x;
      mesh.position.z = pos.z;
      mesh.rotation.y = this.spin * 12;
    });
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
        } else {
          mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
        }
        mesh.rotation.y = Math.atan2(p.vx, p.vz);
        scene.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, 1.4, p.z);
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
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
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
        mesh = new THREE.Mesh(
          new THREE.CircleGeometry(p.r, 24),
          new THREE.MeshStandardMaterial({ color: 0x07070a, metalness: 0.9, roughness: 0.15, transparent: true, opacity: 0.85 }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(p.x, 0.03, p.z);
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
    this.camLook.lerp(new THREE.Vector3(x + fx * 4, 1, z + fz * 4), Math.min(1, dt * 12));

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
    this.camera.position.set(Math.sin(a) * 46, 26, Math.cos(a) * 46);
    this.camera.lookAt(0, 0, 0);
  }
}
