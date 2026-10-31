import * as THREE from 'three';
import { DEFAULT_PAINT, type ChassisId, type DefenseId, type MeleeId, type Paint, type PatternId, type TopperId, type TowerId, type TurretId, type WheelsId } from '../sim/data';

export interface RobotBuild {
  chassis: ChassisId;
  melee: MeleeId;
  turret: TurretId;
  defense: DefenseId;
  paint?: Paint;
  rearMelee?: boolean;
  tower?: TowerId;
  wheels?: WheelsId;
  /** Fallback main color when there is no paint job. */
  color: number;
}

export interface RobotModel {
  root: THREE.Group;
  turretPivot: THREE.Group;
  meleePivot: THREE.Group;
  /** Spins while the front weapon is active. */
  spinner: THREE.Object3D | null;
  spinAxis: 'x' | 'z';
  blades: THREE.Group | null;
  wheels: THREE.Mesh[];
  shield: THREE.Mesh;
  hullMaterial: THREE.MeshStandardMaterial;
  /** Every material whose opacity changes while cloaked. */
  materials: THREE.MeshStandardMaterial[];
  /** Armor pieces that fall off as the robot takes damage. */
  plates: THREE.Mesh[];
  /** Colors at full health, which darken with damage. */
  baseColors: THREE.Color[];
}

const steel = new THREE.MeshStandardMaterial({ color: 0x6d7379, metalness: 0.75, roughness: 0.45, flatShading: true });
const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.4, roughness: 0.8, flatShading: true });
const blade = new THREE.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 0.95, roughness: 0.2, flatShading: true });
const copper = new THREE.MeshStandardMaterial({ color: 0xc27a3f, metalness: 0.85, roughness: 0.35, flatShading: true });
const hot = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0x662200 });
const glowBlue = new THREE.MeshStandardMaterial({ color: 0x8fdcff, emissive: 0x2a9fe8, emissiveIntensity: 1.5 });
const glowRed = new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xd01a10, emissiveIntensity: 1.5 });
const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xf2f2e8 });
const shared = new Set<THREE.Material>([steel, dark, blade, copper, hot, glowBlue, glowRed, eyeWhite]);

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function cylinder(r: number, h: number, mat: THREE.Material, sides = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), mat);
  mesh.castShadow = true;
  return mesh;
}

function cone(r: number, h: number, mat: THREE.Material, sides = 8): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, sides), mat);
  mesh.castShadow = true;
  return mesh;
}

/** A barrel lying along +z. */
function barrel(r: number, length: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = cylinder(r, length, mat, 8);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Paints a hull texture. The patterns are all drawn here, so no image files are needed. */
function patternTexture(pattern: PatternId, primary: number, secondary: number): THREE.CanvasTexture | null {
  if (pattern === 'solid') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const a = css(primary);
  const b = css(secondary);
  g.fillStyle = a;
  g.fillRect(0, 0, size, size);
  g.fillStyle = b;
  // A fixed seed keeps a robot's camo and rust identical for everyone who sees it.
  let seed = (primary ^ secondary) >>> 0;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  switch (pattern) {
    case 'stripes':
      g.fillRect(size * 0.3, 0, size * 0.14, size);
      g.fillRect(size * 0.56, 0, size * 0.14, size);
      break;
    case 'hazard':
      for (let x = -size; x < size * 2; x += 36) {
        g.beginPath();
        g.moveTo(x, size);
        g.lineTo(x + 18, size);
        g.lineTo(x + 18 + size, 0);
        g.lineTo(x + size, 0);
        g.fill();
      }
      break;
    case 'flames':
      for (let i = 0; i < 5; i++) {
        const x = (i + 0.5) * (size / 5);
        g.beginPath();
        g.moveTo(x - 13, size);
        g.quadraticCurveTo(x - 16, size * 0.55, x, size * (0.12 + (i % 2) * 0.2));
        g.quadraticCurveTo(x + 16, size * 0.55, x + 13, size);
        g.fill();
      }
      break;
    case 'camo':
      for (let i = 0; i < 16; i++) {
        g.beginPath();
        g.ellipse(rand() * size, rand() * size, 8 + rand() * 16, 5 + rand() * 11, rand() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'checker':
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          if ((x + y) % 2 === 0) g.fillRect((x * size) / 4, (y * size) / 4, size / 4, size / 4);
        }
      }
      break;
    case 'bolt':
      g.beginPath();
      for (const [x, y] of [[0.62, 0], [0.3, 0.55], [0.5, 0.55], [0.36, 1], [0.74, 0.4], [0.52, 0.4]]) g.lineTo(x * size, y * size);
      g.closePath();
      g.fill();
      break;
    case 'rust':
      for (let i = 0; i < 40; i++) {
        g.globalAlpha = 0.35 + rand() * 0.5;
        g.beginPath();
        g.arc(rand() * size, rand() * size, 2 + rand() * 9, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      break;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface HullSpec {
  width: number;
  length: number;
  height: number;
  trackWidth: number;
  wheelRadius: number;
  wheelCount: number;
}

const HULLS: Record<ChassisId, HullSpec> = {
  scout: { width: 1.3, length: 2.1, height: 0.45, trackWidth: 0.34, wheelRadius: 0.32, wheelCount: 3 },
  ghost: { width: 1.35, length: 2.3, height: 0.55, trackWidth: 0.36, wheelRadius: 0.34, wheelCount: 3 },
  brawler: { width: 1.6, length: 2.4, height: 0.7, trackWidth: 0.42, wheelRadius: 0.38, wheelCount: 4 },
  rhino: { width: 1.85, length: 2.7, height: 0.85, trackWidth: 0.5, wheelRadius: 0.42, wheelCount: 4 },
  juggernaut: { width: 2.0, length: 2.9, height: 1.0, trackWidth: 0.55, wheelRadius: 0.44, wheelCount: 5 },
};

const TOWER_SCALE: Record<TowerId, number> = { small: 0.8, medium: 1, large: 1.25 };
/** Tyre size relative to the hull, and how many down each side. */
const WHEEL_LOOK: Record<Exclude<WheelsId, 'tracks'>, { radius: number; count: number }> = {
  small4: { radius: 1, count: 2 },
  large4: { radius: 1.45, count: 2 },
  six: { radius: 1.15, count: 3 },
};

function addTyre(root: THREE.Group, wheels: THREE.Mesh[], radius: number, width: number, x: number, z: number): void {
  const tyre = cylinder(radius, width, dark, 12);
  tyre.rotation.z = Math.PI / 2;
  tyre.position.set(x, radius, z);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.04, 6), steel);
  tyre.add(hub);
  root.add(tyre);
  wheels.push(tyre);
}

function buildHull(root: THREE.Group, id: ChassisId, paint: THREE.Material, trim: THREE.Material, wheels: THREE.Mesh[], look: WheelsId): number {
  const s = HULLS[id];
  const baseY = s.wheelRadius + 0.1;

  for (const side of [-1, 1]) {
    const x = side * (s.width / 2 + s.trackWidth / 2);
    if (look !== 'tracks') {
      const { radius, count } = WHEEL_LOOK[look];
      const tyre = s.wheelRadius * radius;
      for (let i = 0; i < count; i++) {
        addTyre(root, wheels, tyre, s.trackWidth + 0.08, x, (i / (count - 1) - 0.5) * (s.length - tyre * 0.9));
      }
      continue;
    }
    root.add(box(s.trackWidth, s.wheelRadius * 1.5, s.length, dark, x, s.wheelRadius, 0));
    for (let i = 0; i < s.wheelCount; i++) {
      const wheel = cylinder(s.wheelRadius * 0.72, s.trackWidth + 0.06, steel, 8);
      wheel.rotation.z = Math.PI / 2;
      const t = s.wheelCount === 1 ? 0 : i / (s.wheelCount - 1) - 0.5;
      wheel.position.set(x, s.wheelRadius, t * (s.length - s.wheelRadius * 1.6));
      root.add(wheel);
      wheels.push(wheel);
    }
  }

  // Every robot glares at whatever it's about to run over.
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), eyeWhite);
    white.scale.set(1, 0.72, 0.5);
    white.rotation.z = side * 0.4;
    white.position.set(side * s.width * 0.24, baseY + s.height * 0.76, s.length / 2);
    root.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), dark);
    pupil.position.set(side * s.width * 0.21, baseY + s.height * 0.74, s.length / 2 + 0.09);
    root.add(pupil);
  }

  root.add(box(s.width, s.height, s.length, paint, 0, baseY + s.height / 2, 0));

  if (id === 'scout') {
    // A sloped wedge nose and a tail fin.
    const wedge = box(s.width * 0.92, 0.14, s.length * 0.55, trim, 0, baseY + s.height + 0.02, s.length * 0.26);
    wedge.rotation.x = 0.28;
    root.add(wedge);
    root.add(box(0.08, 0.5, 0.55, trim, 0, baseY + s.height + 0.25, -s.length * 0.42));
  } else if (id === 'ghost') {
    // Low, swept side skirts.
    for (const side of [-1, 1]) {
      const skirt = box(0.12, s.height * 0.8, s.length * 0.9, trim, side * (s.width / 2 + 0.02), baseY + s.height * 0.45, 0);
      skirt.rotation.z = side * 0.3;
      root.add(skirt);
    }
    root.add(box(s.width * 0.6, 0.08, s.length * 0.5, trim, 0, baseY + s.height + 0.04, -0.1));
  } else if (id === 'brawler') {
    root.add(box(s.width + 0.08, 0.14, 0.34, trim, 0, baseY + s.height * 0.5, s.length / 2));
    root.add(box(s.width * 0.7, 0.1, s.length * 0.6, trim, 0, baseY + s.height + 0.05, -0.1));
  } else if (id === 'rhino') {
    // A big nose plate with one horn on it.
    const nose = box(s.width * 0.96, s.height * 0.9, 0.5, trim, 0, baseY + s.height * 0.5, s.length / 2 - 0.05);
    nose.rotation.x = -0.35;
    root.add(nose);
    const horn = cone(0.2, 0.75, blade, 6);
    horn.rotation.x = Math.PI / 2 - 0.3;
    horn.position.set(0, baseY + s.height * 0.85, s.length / 2 + 0.25);
    root.add(horn);
    root.add(box(s.width * 0.75, 0.14, s.length * 0.55, trim, 0, baseY + s.height + 0.07, -0.2));
  } else {
    // Bolted-on slabs of extra armor.
    for (const side of [-1, 1]) {
      root.add(box(0.2, s.height * 0.9, s.length * 0.82, trim, side * (s.width / 2 + 0.02), baseY + s.height * 0.55, 0));
    }
    root.add(box(s.width * 1.05, s.height * 0.75, 0.4, trim, 0, baseY + s.height * 0.5, s.length / 2));
    root.add(box(s.width * 0.8, 0.18, s.length * 0.7, trim, 0, baseY + s.height + 0.09, -0.1));
    for (const side of [-1, 1]) {
      const pipe = cylinder(0.1, 0.8, dark, 8);
      pipe.position.set(side * s.width * 0.3, baseY + s.height + 0.4, -s.length * 0.4);
      root.add(pipe);
    }
  }
  return baseY + s.height;
}

function buildTurret(pivot: THREE.Group, id: TurretId, head: THREE.Material, eye: THREE.Material): void {
  // The domed head with one glowing eye gives every robot its face.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), head);
  dome.castShadow = true;
  pivot.add(dome);
  const eyeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), eye);
  eyeMesh.position.set(0, 0.26, 0.42);
  pivot.add(eyeMesh);

  switch (id) {
    case 'minigun':
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        pivot.add(barrel(0.05, 1.2, dark, Math.cos(a) * 0.1, 0.2 + Math.sin(a) * 0.1, 0.9));
      }
      break;
    case 'rockets':
      pivot.add(box(0.8, 0.45, 0.9, dark, 0, 0.25, 0.45));
      for (const x of [-0.2, 0.2]) {
        for (const y of [0.15, 0.36]) pivot.add(barrel(0.08, 0.1, hot, x, y, 0.92));
      }
      break;
    case 'guided':
      pivot.add(box(0.5, 0.42, 1.1, dark, 0, 0.26, 0.5));
      pivot.add(barrel(0.15, 0.1, glowRed, 0, 0.26, 1.07));
      pivot.add(box(0.06, 0.4, 0.3, steel, 0, 0.62, 0.1));
      break;
    case 'seeker':
      for (const x of [-0.3, 0.3]) {
        pivot.add(barrel(0.15, 1.2, dark, x, 0.24, 0.5));
        const tip = cone(0.15, 0.3, glowRed);
        tip.rotation.x = Math.PI / 2;
        tip.position.set(x, 0.24, 1.2);
        pivot.add(tip);
      }
      break;
    case 'mortar': {
      const tube = cylinder(0.24, 1.1, dark, 10);
      tube.rotation.x = 0.85;
      tube.position.set(0, 0.5, 0.35);
      pivot.add(tube);
      break;
    }
    case 'grenade':
      pivot.add(barrel(0.2, 1.1, steel, 0, 0.22, 0.7));
      pivot.add(cylinder(0.3, 0.32, dark, 8));
      break;
    case 'flamethrower':
      pivot.add(barrel(0.1, 1, dark, 0, 0.22, 0.75));
      pivot.add(barrel(0.15, 0.16, hot, 0, 0.22, 1.25));
      for (const x of [-0.42, 0.42]) {
        const tank = cylinder(0.14, 0.6, glowRed, 8);
        tank.position.set(x, 0.3, -0.2);
        pivot.add(tank);
      }
      break;
    case 'laser':
      pivot.add(box(0.2, 0.2, 1.5, steel, 0, 0.26, 0.85));
      for (const z of [0.5, 0.95, 1.4]) pivot.add(box(0.32, 0.32, 0.07, glowBlue, 0, 0.26, z));
      break;
    case 'discs': {
      pivot.add(box(0.75, 0.2, 0.9, dark, 0, 0.26, 0.5));
      const disc = cylinder(0.32, 0.05, blade, 12);
      disc.position.set(0, 0.4, 0.55);
      pivot.add(disc);
      break;
    }
    case 'spear': {
      for (const side of [-1, 1]) {
        const arm = box(0.55, 0.06, 0.08, steel, side * 0.3, 0.26, 0.8);
        arm.rotation.y = side * 0.5;
        pivot.add(arm);
      }
      pivot.add(barrel(0.04, 1.5, blade, 0, 0.26, 0.85));
      break;
    }
    case 'arc': {
      const post = cylinder(0.07, 0.9, steel, 6);
      post.position.set(0, 0.85, 0);
      pivot.add(post);
      for (const y of [0.65, 0.9, 1.15]) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22 - (y - 0.65) * 0.2, 0.05, 6, 14), glowBlue);
        coil.rotation.x = Math.PI / 2;
        coil.position.y = y;
        pivot.add(coil);
      }
      break;
    }
  }
}

function buildMelee(pivot: THREE.Group, id: MeleeId): { spinner: THREE.Object3D | null; axis: 'x' | 'z' } {
  switch (id) {
    case 'chainsaw': {
      pivot.add(box(0.26, 0.26, 0.5, dark, 0, 0, 0.2));
      const disc = new THREE.Group();
      disc.position.set(0, 0, 1.3);
      const plate = cylinder(0.85, 0.06, blade, 18);
      plate.rotation.z = Math.PI / 2;
      disc.add(plate);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const tooth = box(0.06, 0.26, 0.14, blade, 0, Math.cos(a) * 0.92, Math.sin(a) * 0.92);
        tooth.rotation.x = -a;
        disc.add(tooth);
      }
      pivot.add(disc);
      return { spinner: disc, axis: 'x' };
    }
    case 'drill': {
      pivot.add(box(0.5, 0.5, 0.4, dark, 0, 0, 0.1));
      const bit = new THREE.Group();
      bit.position.z = 0.3;
      const tip = cone(0.34, 1.5, steel, 6);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.75;
      bit.add(tip);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28 - i * 0.08, 0.04, 5, 8), blade);
        ring.position.z = 0.25 + i * 0.4;
        bit.add(ring);
      }
      pivot.add(bit);
      return { spinner: bit, axis: 'z' };
    }
    case 'dagger': {
      pivot.add(box(0.5, 0.22, 0.2, dark, 0, 0, 0.1));
      const edge = box(0.28, 0.06, 1.1, blade, 0, 0, 0.75);
      pivot.add(edge);
      const tip = cone(0.2, 0.34, blade, 4);
      tip.rotation.x = Math.PI / 2;
      tip.scale.y = 1;
      tip.position.z = 1.42;
      pivot.add(tip);
      return { spinner: null, axis: 'x' };
    }
    case 'rollingpin': {
      for (const x of [-0.75, 0.75]) pivot.add(box(0.08, 0.14, 0.7, steel, x, 0, 0.3));
      const drum = new THREE.Group();
      drum.position.z = 0.7;
      const roller = cylinder(0.42, 1.4, steel, 10);
      roller.rotation.z = Math.PI / 2;
      drum.add(roller);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        drum.add(box(1.4, 0.1, 0.1, dark, 0, Math.cos(a) * 0.44, Math.sin(a) * 0.44));
      }
      pivot.add(drum);
      return { spinner: drum, axis: 'x' };
    }
    case 'hammer':
      pivot.add(box(0.14, 0.14, 1.8, steel, 0, 0, 0.9));
      pivot.add(box(0.9, 0.55, 0.55, dark, 0, 0, 1.85));
      return { spinner: null, axis: 'x' };
    case 'axe': {
      pivot.add(box(0.12, 0.12, 1.5, steel, 0, 0, 0.75));
      const head = box(0.1, 0.85, 0.5, blade, 0, 0.1, 1.45);
      pivot.add(head);
      return { spinner: null, axis: 'x' };
    }
    case 'ram':
      pivot.add(box(1.5, 0.35, 0.15, steel, 0, 0, 0.1));
      for (const x of [-0.5, 0, 0.5]) {
        const spike = cone(0.16, 0.8, blade, 6);
        spike.rotation.x = Math.PI / 2;
        spike.position.set(x, 0, 0.55);
        pivot.add(spike);
      }
      return { spinner: null, axis: 'x' };
    case 'claw':
      pivot.add(box(0.4, 0.3, 0.5, dark, 0, 0, 0.2));
      for (const side of [-1, 1]) {
        const upper = box(0.12, 0.14, 0.9, steel, side * 0.3, 0, 0.75);
        upper.rotation.y = -side * 0.5;
        pivot.add(upper);
        const lower = box(0.12, 0.14, 0.7, blade, side * 0.34, 0, 1.3);
        lower.rotation.y = side * 0.65;
        pivot.add(lower);
      }
      return { spinner: null, axis: 'x' };
    case 'magnet': {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.15, 8, 14, Math.PI), glowRed);
      arc.rotation.x = Math.PI;
      arc.position.z = 0.6;
      arc.castShadow = true;
      pivot.add(arc);
      for (const x of [-0.55, 0.55]) pivot.add(box(0.3, 0.28, 0.24, steel, x, 0, 0.6));
      pivot.add(box(0.2, 0.2, 0.6, dark, 0, -0.2, 0.25));
      return { spinner: null, axis: 'x' };
    }
  }
}

function buildDefenseGear(root: THREE.Group, id: DefenseId, deckY: number, spec: HullSpec): THREE.Group | null {
  const z = -spec.length / 2 + 0.25;
  const front = spec.length / 2;
  switch (id) {
    case 'shield': {
      const dish = cylinder(0.26, 0.08, glowBlue, 10);
      dish.position.set(0.42, deckY + 0.08, z);
      root.add(dish);
      break;
    }
    case 'mines':
    case 'remote':
    case 'minibot':
      root.add(box(0.7, 0.3, 0.4, dark, 0, deckY + 0.15, z));
      root.add(box(0.2, 0.08, 0.2, id === 'remote' ? glowBlue : glowRed, 0, deckY + 0.34, z));
      break;
    case 'oil':
    case 'glue':
    case 'nails': {
      const tank = cylinder(0.2, 0.9, id === 'glue' ? copper : steel, 10);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(0, deckY + 0.2, z);
      root.add(tank);
      break;
    }
    case 'steelram':
      root.add(box(spec.width + 0.4, 0.75, 0.18, steel, 0, deckY - spec.height * 0.45, front + 0.12));
      break;
    case 'plow': {
      const plate = box(spec.width + 0.55, 0.55, 0.12, blade, 0, spec.wheelRadius * 0.9, front + 0.3);
      plate.rotation.x = -0.45;
      root.add(plate);
      break;
    }
    case 'blades': {
      const group = new THREE.Group();
      group.position.y = deckY - spec.height * 0.5;
      for (const side of [-1, 1]) {
        const disc = cylinder(0.55, 0.05, blade, 10);
        disc.rotation.z = Math.PI / 2;
        disc.position.x = side * (spec.width / 2 + spec.trackWidth + 0.1);
        group.add(disc);
      }
      root.add(group);
      return group;
    }
    case 'cutter': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.width * 0.62, 0.06, 5, 16), blade);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = deckY + 0.05;
      ring.castShadow = true;
      root.add(ring);
      break;
    }
    case 'teleport':
      for (const x of [-0.45, 0.45]) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12), glowBlue);
        coil.position.set(x, deckY + 0.25, z);
        root.add(coil);
      }
      break;
    case 'flash': {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 }));
      lamp.position.set(0.42, deckY + 0.16, z);
      root.add(lamp);
      break;
    }
    case 'regen':
      root.add(box(0.5, 0.26, 0.3, dark, -0.4, deckY + 0.13, z));
      root.add(box(0.18, 0.06, 0.06, new THREE.MeshStandardMaterial({ color: 0x5be36a, emissive: 0x1fbf3a }), -0.4, deckY + 0.3, z));
      break;
    case 'cloak':
      root.add(box(0.45, 0.1, 0.45, glowBlue, -0.42, deckY + 0.05, z));
      break;
    case 'emp': {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glowBlue);
      ball.position.set(0, deckY + 0.3, z);
      root.add(ball);
      break;
    }
    case 'kamikaze': {
      const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), dark);
      bomb.position.set(0, deckY + 0.28, z);
      bomb.castShadow = true;
      root.add(bomb);
      root.add(box(0.1, 0.1, 0.1, glowRed, 0, deckY + 0.58, z));
      break;
    }
  }
  return null;
}

function buildTopper(root: THREE.Group, id: TopperId, y: number, trim: THREE.Material, eye: THREE.Material, spec: HullSpec): void {
  const back = -spec.length / 2 + 0.3;
  switch (id) {
    case 'none':
      break;
    case 'antenna': {
      const rod = cylinder(0.025, 1.2, steel, 5);
      rod.position.set(-0.45, y + 0.6, back);
      root.add(rod);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), eye);
      tip.position.set(-0.45, y + 1.22, back);
      root.add(tip);
      break;
    }
    case 'horns':
      for (const side of [-1, 1]) {
        const horn = cone(0.12, 0.6, blade, 6);
        horn.rotation.z = -side * 0.5;
        horn.position.set(side * 0.5, y + 0.3, 0.2);
        root.add(horn);
      }
      break;
    case 'siren': {
      const light = cylinder(0.14, 0.2, glowRed, 10);
      light.position.set(-0.42, y + 0.1, back);
      root.add(light);
      break;
    }
    case 'spoiler': {
      root.add(box(spec.width * 0.95, 0.06, 0.32, trim, 0, y + 0.4, -spec.length / 2 + 0.05));
      for (const side of [-1, 1]) root.add(box(0.06, 0.4, 0.14, steel, side * spec.width * 0.35, y + 0.2, -spec.length / 2 + 0.05));
      break;
    }
    case 'crest':
      for (let i = 0; i < 4; i++) {
        const fin = cone(0.1, 0.42 - i * 0.05, trim, 4);
        fin.position.set(0, y + 0.2, -0.2 - i * 0.28);
        root.add(fin);
      }
      break;
    case 'crown':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const point = cone(0.07, 0.24, copper, 4);
        point.position.set(Math.cos(a) * 0.22, y + 0.72, Math.sin(a) * 0.22);
        root.add(point);
      }
      break;
    case 'flag': {
      const pole = cylinder(0.025, 1.3, steel, 5);
      pole.position.set(0.5, y + 0.65, back);
      root.add(pole);
      root.add(box(0.03, 0.34, 0.55, trim, 0.5, y + 1.14, back - 0.28));
      break;
    }
  }
}

export function buildRobot(build: RobotBuild): RobotModel {
  const root = new THREE.Group();
  const paint = build.paint ?? { ...DEFAULT_PAINT, primary: build.color };
  const texture = patternTexture(paint.pattern, paint.primary, paint.secondary);
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: texture ? 0xffffff : paint.primary,
    map: texture,
    metalness: 0.35,
    roughness: 0.55,
    flatShading: true,
  });
  const headMaterial = new THREE.MeshStandardMaterial({ color: paint.primary, metalness: 0.35, roughness: 0.5, flatShading: true });
  const trim = new THREE.MeshStandardMaterial({ color: paint.secondary, metalness: 0.5, roughness: 0.5, flatShading: true });
  const eye = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: paint.eye, emissiveIntensity: 2.5 });
  const wheels: THREE.Mesh[] = [];
  const deckY = buildHull(root, build.chassis, hullMaterial, trim, wheels, build.wheels ?? 'large4');
  const spec = HULLS[build.chassis];

  const turretPivot = new THREE.Group();
  turretPivot.position.y = deckY + 0.05;
  turretPivot.scale.setScalar(TOWER_SCALE[build.tower ?? 'medium']);
  buildTurret(turretPivot, build.turret, headMaterial, eye);
  root.add(turretPivot);

  const meleePivot = new THREE.Group();
  meleePivot.position.set(0, deckY - spec.height * 0.45, build.rearMelee ? -spec.length / 2 : spec.length / 2);
  if (build.rearMelee) meleePivot.rotation.y = Math.PI;
  const { spinner, axis } = buildMelee(meleePivot, build.melee);
  root.add(meleePivot);

  const blades = buildDefenseGear(root, build.defense, deckY, spec);
  buildTopper(root, paint.topper, deckY, trim, eye, spec);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(spec.length * 0.95, 20, 14),
    new THREE.MeshStandardMaterial({
      color: 0x7fe8ff,
      emissive: 0x2ab8ff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    }),
  );
  shield.position.y = 0.8;
  shield.visible = false;
  root.add(shield);

  const materials = [hullMaterial, headMaterial, trim];
  const plates: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.material === trim) plates.push(node);
  });

  return {
    root,
    turretPivot,
    meleePivot,
    spinner,
    spinAxis: axis,
    blades,
    wheels,
    shield,
    hullMaterial,
    materials,
    plates,
    baseColors: materials.map((m) => m.color.clone()),
  };
}

export function disposeRobot(model: RobotModel): void {
  model.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const material = node.material as THREE.MeshStandardMaterial;
    if (shared.has(material)) return;
    material.map?.dispose();
    material.dispose();
  });
}
