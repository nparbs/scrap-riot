import * as THREE from 'three';

const MAX_PARTICLES = 900;

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
}

/** Pooled box particles drawn as one instanced mesh. Effects are cosmetic, so Math.random is fine here. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly pool: Particle[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  /** Fraction of each burst to actually spawn, lowered by the quality setting. */
  density = 1;

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      MAX_PARTICLES,
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.mesh.setMatrixAt(i, this.hidden);
      this.mesh.setColorAt(i, this.color.set(0xffffff));
    }
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
        vx: Math.cos(a) * speed * flat,
        vy: up * speed,
        vz: Math.sin(a) * speed * flat,
        life,
        maxLife: life,
        size: o.size * (0.5 + Math.random() * 0.5),
        gravity: o.gravity ?? 14,
        r,
        g,
        b,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy *= -0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
    }
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p) {
        this.mesh.setMatrixAt(i, this.hidden);
        continue;
      }
      const s = p.size * (p.life / p.maxLife);
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
