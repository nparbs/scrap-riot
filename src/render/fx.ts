import * as THREE from 'three';

const MAX_PARTICLES = 1400;
const FLOOR_Y = 0.05;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  /** Smoke swells as it drifts, where sparks and flames shrink away. */
  grow: boolean;
  r: number;
  g: number;
  b: number;
}

export interface BurstOptions {
  count: number;
  color: number;
  speed: number;
  size: number;
  life: number;
  gravity?: number;
  y?: number;
  spread?: number;
  /** Upward speed added to every particle, for something blown out of a pipe. */
  rise?: number;
  /** Swells as it ages, as smoke does, instead of shrinking. */
  grow?: boolean;
  /** Sprays along this direction instead of bursting outward. */
  dir?: { x: number; z: number; jitter: number };
}

/** Pooled box particles drawn as one instanced mesh. Effects are cosmetic, so Math.random is fine here. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly pool: Particle[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  /** Fraction of each burst to actually spawn, lowered by the quality setting. */
  density = 1;
  /** How far the floor reaches from the middle. Anything past it keeps falling. */
  floorHalf = Infinity;
  /** Whether there's floor here, for maps with holes in them or another shape. */
  floorAt: ((x: number, z: number) => boolean) | null = null;

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      MAX_PARTICLES,
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_PARTICLES; i++) this.mesh.setColorAt(i, this.color.set(0xffffff));
    this.mesh.count = 0;
  }

  burst(x: number, z: number, o: BurstOptions): void {
    this.color.set(o.color);
    const { r, g, b } = this.color;
    const count = Math.ceil(o.count * this.density);
    for (let i = 0; i < count; i++) {
      if (this.pool.length >= MAX_PARTICLES) this.pool.shift();
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const speed = o.speed * (0.3 + Math.random() * 0.7);
      const life = o.life * (0.5 + Math.random() * 0.5);
      const flat = o.spread ?? 1;
      this.pool.push({
        x,
        y: o.y ?? 0.8,
        z,
        vx: o.dir ? o.dir.x * speed + (Math.random() - 0.5) * o.dir.jitter : Math.cos(a) * speed * flat,
        vy: (o.dir ? (up - 0.5) * o.dir.jitter : up * speed) + (o.rise ?? 0),
        vz: o.dir ? o.dir.z * speed + (Math.random() - 0.5) * o.dir.jitter : Math.sin(a) * speed * flat,
        life,
        maxLife: life,
        size: o.size * (0.5 + Math.random() * 0.5),
        gravity: o.gravity ?? 14,
        grow: o.grow ?? false,
        r,
        g,
        b,
      });
    }
  }

  clear(): void {
    this.pool.length = 0;
    this.mesh.count = 0;
  }

  update(dt: number): void {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.splice(i, 1);
        continue;
      }
      // Only something coming down from above lands, so a blast below the edge stays down there.
      const above = p.y >= FLOOR_Y;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (above && p.y < FLOOR_Y && Math.abs(p.x) < this.floorHalf && Math.abs(p.z) < this.floorHalf && (this.floorAt?.(p.x, p.z) ?? true)) {
        p.y = FLOOR_Y;
        p.vy *= -0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
    }
    this.mesh.count = this.pool.length;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      const t = p.life / p.maxLife;
      const s = p.grow ? p.size * (0.6 + 0.9 * (1 - t)) * Math.min(1, t * 4) : p.size * t;
      this.matrix.makeScale(s, s, s).setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.color.setRGB(p.r, p.g, p.b));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Short-lived lightning lines for the Arc Coil. */
export class ArcBolts {
  readonly group = new THREE.Group();
  private readonly bolts: { line: THREE.Line; life: number }[] = [];
  private readonly material = new THREE.LineBasicMaterial({ color: 0x9fe6ff, toneMapped: false });

  add(points: { x: number; z: number }[]): void {
    const verts: THREE.Vector3[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      for (let s = 0; s < 8; s++) {
        const t = s / 8;
        const jitter = s === 0 ? 0 : 0.5;
        verts.push(
          new THREE.Vector3(
            a.x + (b.x - a.x) * t + (Math.random() - 0.5) * jitter,
            1.3 + (Math.random() - 0.5) * jitter,
            a.z + (b.z - a.z) * t + (Math.random() - 0.5) * jitter,
          ),
        );
      }
    }
    const end = points[points.length - 1];
    verts.push(new THREE.Vector3(end.x, 1.3, end.z));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(verts), this.material);
    line.frustumCulled = false;
    this.group.add(line);
    this.bolts.push({ line, life: 0.12 });
  }

  update(dt: number): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      bolt.life -= dt;
      if (bolt.life > 0) continue;
      this.group.remove(bolt.line);
      bolt.line.geometry.dispose();
      this.bolts.splice(i, 1);
    }
  }
}

export type DebrisShape = 'bolt' | 'panel' | 'rod' | 'chunk';

const DEBRIS_MAX = 60;
const DEBRIS_LIFE = 2.4;
const DEBRIS_GRAVITY = 24;

interface DebrisPiece {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  size: number;
  color: THREE.Color;
  /** How far its middle sits above the floor when it lies flat. */
  rest: number;
}

const DEBRIS_REST: Record<DebrisShape, number> = { bolt: 0.035, panel: 0.015, rod: 0.012, chunk: 0.09 };

/**
 * Bits knocked off robots: bolts, scraps of panel in the robot's own paint, snapped antennas and
 * rubble. Each shape is one instanced mesh, so a shower of them costs a handful of draw calls.
 */
export class Debris {
  readonly group = new THREE.Group();
  /** Fraction of each shower to actually throw, lowered by the quality setting. */
  density = 1;
  floorHalf = Infinity;
  floorAt: ((x: number, z: number) => boolean) | null = null;
  private readonly meshes = {} as Record<DebrisShape, THREE.InstancedMesh>;
  private readonly pieces: Record<DebrisShape, DebrisPiece[]> = { bolt: [], panel: [], rod: [], chunk: [] };
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor() {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.5, flatShading: true });
    const geometry: Record<DebrisShape, THREE.BufferGeometry> = {
      bolt: new THREE.CylinderGeometry(0.035, 0.035, 0.15, 6),
      panel: new THREE.BoxGeometry(0.3, 0.03, 0.22),
      rod: new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5),
      chunk: new THREE.IcosahedronGeometry(0.11, 0),
    };
    for (const shape of Object.keys(geometry) as DebrisShape[]) {
      const mesh = new THREE.InstancedMesh(geometry[shape], material, DEBRIS_MAX);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < DEBRIS_MAX; i++) mesh.setColorAt(i, new THREE.Color(0xffffff));
      mesh.count = 0;
      this.meshes[shape] = mesh;
      this.group.add(mesh);
    }
  }

  /** Throws pieces out from a point, scattering around the direction given. */
  throw(shape: DebrisShape, count: number, x: number, y: number, z: number, o: { color: number; speed: number; dirX?: number; dirZ?: number; up?: number; size?: number }): void {
    const wanted = count * this.density;
    const n = Math.floor(wanted) + (Math.random() < wanted % 1 ? 1 : 0);
    const list = this.pieces[shape];
    for (let i = 0; i < n; i++) {
      if (list.length >= DEBRIS_MAX) list.shift();
      const a = Math.random() * Math.PI * 2;
      const speed = o.speed * (0.4 + Math.random() * 0.6);
      const spread = 0.6;
      const size = (o.size ?? 1) * (0.7 + Math.random() * 0.6);
      list.push({
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(
          ((o.dirX ?? 0) + Math.cos(a) * spread) * speed,
          (o.up ?? 0.8) * speed * (0.6 + Math.random() * 0.6),
          ((o.dirZ ?? 0) + Math.sin(a) * spread) * speed,
        ),
        rotation: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22),
        life: DEBRIS_LIFE * (0.7 + Math.random() * 0.3),
        size,
        color: new THREE.Color(o.color),
        rest: DEBRIS_REST[shape] * size,
      });
    }
  }

  clear(): void {
    for (const shape of Object.keys(this.pieces) as DebrisShape[]) {
      this.pieces[shape].length = 0;
      this.meshes[shape].count = 0;
    }
  }

  update(dt: number): void {
    for (const shape of Object.keys(this.pieces) as DebrisShape[]) {
      const list = this.pieces[shape];
      const mesh = this.meshes[shape];
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        const above = p.position.y >= p.rest;
        p.velocity.y -= DEBRIS_GRAVITY * dt;
        p.position.addScaledVector(p.velocity, dt);
        const floor = Math.abs(p.position.x) < this.floorHalf && Math.abs(p.position.z) < this.floorHalf && (this.floorAt?.(p.position.x, p.position.z) ?? true);
        if (above && floor && p.position.y < p.rest) {
          // Clatters to a stop on the floor, bouncing less each time.
          p.position.y = p.rest;
          p.velocity.y = Math.abs(p.velocity.y) * 0.3;
          p.velocity.x *= 0.55;
          p.velocity.z *= 0.55;
          p.spin.multiplyScalar(0.5);
          if (p.velocity.y < 0.6) {
            p.velocity.y = 0;
            // Settles flat rather than balancing on an edge.
            p.rotation.x *= 0.8;
            p.rotation.z *= 0.8;
          }
        }
        p.rotation.x += p.spin.x * dt;
        p.rotation.y += p.spin.y * dt;
        p.rotation.z += p.spin.z * dt;
      }
      mesh.count = list.length;
      list.forEach((p, i) => {
        const fade = Math.min(1, p.life / 0.4);
        this.quaternion.setFromEuler(p.rotation);
        this.scale.setScalar(p.size * fade);
        this.matrix.compose(p.position, this.quaternion, this.scale);
        mesh.setMatrixAt(i, this.matrix);
        mesh.setColorAt(i, p.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

const SKID_MAX = 700;
const SKID_LIFE = 10;
const SKID_FADE = 3;
const SKID_Y = 0.022;

/** Rubber laid on the floor by robots skidding, turning hard or launching, which fades away after a while. */
export class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private readonly marks: { x: number; z: number; angle: number; length: number; width: number; life: number }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.material, SKID_MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
  }

  /** Dark rubber on most floors, pale scratches on ice. */
  setLook(color: number, opacity: number): void {
    this.material.color.setHex(color);
    this.material.opacity = opacity;
  }

  add(x1: number, z1: number, x2: number, z2: number, width: number): void {
    if (this.marks.length >= SKID_MAX) this.marks.shift();
    const length = Math.hypot(x2 - x1, z2 - z1);
    // A little overlap hides the joins between pieces.
    this.marks.push({ x: (x1 + x2) / 2, z: (z1 + z2) / 2, angle: Math.atan2(x2 - x1, z2 - z1), length: length + width * 0.3, width, life: SKID_LIFE });
  }

  clear(): void {
    this.marks.length = 0;
    this.mesh.count = 0;
  }

  update(dt: number): void {
    for (let i = this.marks.length - 1; i >= 0; i--) {
      this.marks[i].life -= dt;
      if (this.marks[i].life <= 0) this.marks.splice(i, 1);
    }
    this.mesh.count = this.marks.length;
    this.marks.forEach((mark, i) => {
      // Wears thinner as it fades, as rubber does.
      const fade = Math.min(1, mark.life / SKID_FADE);
      this.position.set(mark.x, SKID_Y, mark.z);
      this.quaternion.setFromAxisAngle(this.up, mark.angle);
      this.scale.set(mark.width * fade, 1, mark.length);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
