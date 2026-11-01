import * as THREE from 'three';
import { RAGDOLL_TIME } from '../sim/data';
import type { Ledge } from './arenaScene';

const GRAVITY = 26;
const REST_HEIGHT = 0.45;
const BOUNCE = 0.38;
const FLOOR_DRAG = 0.72;
const DEBRIS_LIFE = 0.8;
const DEBRIS_SPEED = 13;

interface Piece {
  object: THREE.Object3D;
  home: THREE.Vector3;
  /** Which way it works loose, and how far. */
  drift: THREE.Vector3;
  spin: THREE.Vector3;
  phase: number;
  velocity: THREE.Vector3;
}

export interface RagdollWorld {
  scene: THREE.Scene;
  half: number;
  walled: boolean;
  ledges: Ledge[];
  /** Whether there's floor here, for maps that aren't a plain square. */
  floorAt?: (x: number, z: number) => boolean;
}

/**
 * A destroyed robot going limp: a copy of its model tumbles under gravity with every part working
 * loose, then comes apart when it blows. Purely for show, and the rules never see it.
 */
export class Ragdoll {
  readonly root: THREE.Object3D;
  private readonly pieces: Piece[] = [];
  private readonly velocity: THREE.Vector3;
  private readonly spin: THREE.Vector3;
  private time = 0;
  private blown = false;
  private debrisLeft = DEBRIS_LIFE;

  constructor(
    source: THREE.Object3D,
    x: number,
    z: number,
    heading: number,
    vx: number,
    vz: number,
    private readonly fell: boolean,
    private readonly world: RagdollWorld,
    private readonly onBlow: (position: THREE.Vector3, fell: boolean) => void,
  ) {
    this.root = source.clone(true);
    this.root.visible = true;
    this.root.position.set(x, fell ? 0.2 : REST_HEIGHT, z);
    this.root.rotation.set(0, heading, 0);
    const random = (size: number) => (Math.random() - 0.5) * size;
    // The blast that killed it throws it up, while a robot going over the edge just drops.
    this.velocity = new THREE.Vector3(vx * 0.75, fell ? 1.5 : 7 + Math.random() * 3, vz * 0.75);
    this.spin = new THREE.Vector3(random(9), random(4), random(9));
    for (const object of this.root.children) {
      this.pieces.push({
        object,
        home: object.position.clone(),
        drift: new THREE.Vector3(random(1.6), random(1), random(1.6)),
        spin: new THREE.Vector3(random(5), random(5), random(5)),
        phase: Math.random() * Math.PI * 2,
        velocity: new THREE.Vector3(),
      });
    }
    world.scene.add(this.root);
  }

  /** Where the camera should look. */
  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Returns false once there's nothing left to draw. */
  update(dt: number): boolean {
    this.time += dt;
    if (this.blown) return this.updateDebris(dt);

    const { root, velocity, spin, world } = this;
    const fromY = root.position.y;
    velocity.y -= GRAVITY * dt;
    root.position.addScaledVector(velocity, dt);
    root.rotation.x += spin.x * dt;
    root.rotation.y += spin.y * dt;
    root.rotation.z += spin.z * dt;
    if (world.walled) {
      const limit = world.half - 1;
      if (Math.abs(root.position.x) > limit) {
        root.position.x = Math.sign(root.position.x) * limit;
        velocity.x *= -0.4;
      }
      if (Math.abs(root.position.z) > limit) {
        root.position.z = Math.sign(root.position.z) * limit;
        velocity.z *= -0.4;
      }
    }
    const ground = this.groundBelow(fromY);
    if (root.position.y < ground) {
      root.position.y = ground;
      velocity.y = Math.abs(velocity.y) * BOUNCE;
      velocity.x *= FLOOR_DRAG;
      velocity.z *= FLOOR_DRAG;
      spin.multiplyScalar(FLOOR_DRAG);
    }

    // The joints go first: everything flops about a little more each moment.
    const loose = this.time / RAGDOLL_TIME;
    for (const piece of this.pieces) {
      const wobble = Math.sin(this.time * 14 + piece.phase) * 0.12 * loose;
      piece.object.position.copy(piece.home).addScaledVector(piece.drift, loose * loose * 0.45);
      piece.object.position.y += wobble;
      piece.object.rotation.x += piece.spin.x * dt * loose;
      piece.object.rotation.z += piece.spin.z * dt * loose;
    }

    if (this.time >= RAGDOLL_TIME) this.blow();
    return true;
  }

  /** What the robot would come to rest on, given how high it was a moment ago. */
  private groundBelow(fromY: number): number {
    const { x, z } = this.root.position;
    const { half, ledges, floorAt } = this.world;
    if (!this.fell && Math.abs(x) < half && Math.abs(z) < half && (floorAt?.(x, z) ?? true)) return REST_HEIGHT;
    for (const ledge of ledges) {
      const rest = ledge.top + REST_HEIGHT;
      if (fromY >= rest && Math.abs(x - ledge.x) < ledge.w / 2 && Math.abs(z - ledge.z) < ledge.d / 2) return rest;
    }
    return -Infinity;
  }

  private blow(): void {
    this.blown = true;
    this.onBlow(this.root.position, this.fell);
    for (const piece of this.pieces) {
      this.world.scene.attach(piece.object);
      const out = piece.object.position.clone().sub(this.root.position);
      if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 1, Math.random() - 0.5);
      piece.velocity.copy(out.normalize()).multiplyScalar(DEBRIS_SPEED * (0.5 + Math.random())).add(this.velocity.clone().multiplyScalar(0.3));
      piece.velocity.y += 5;
    }
    this.world.scene.remove(this.root);
  }

  private updateDebris(dt: number): boolean {
    this.debrisLeft -= dt;
    const scale = Math.max(0.001, this.debrisLeft / DEBRIS_LIFE);
    for (const piece of this.pieces) {
      piece.velocity.y -= GRAVITY * dt;
      piece.object.position.addScaledVector(piece.velocity, dt);
      piece.object.rotation.x += piece.spin.x * 3 * dt;
      piece.object.rotation.y += piece.spin.y * 3 * dt;
      piece.object.scale.setScalar(scale);
    }
    if (this.debrisLeft > 0) return true;
    this.dispose();
    return false;
  }

  /** The geometry and materials are the live robot's, so only the copies of the nodes go. */
  dispose(): void {
    this.world.scene.remove(this.root);
    for (const piece of this.pieces) this.world.scene.remove(piece.object);
  }
}
