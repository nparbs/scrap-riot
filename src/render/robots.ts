import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { decodeSkin, ERASED, SKIN_PANELS, SKIN_SIZE, type PanelId } from '../game/skin';
import { DEFAULT_PAINT, PAINT_COLORS, type BodyId, type ChassisId, type DefenseId, type MeleeId, type Paint, type PatternId, type TowerId, type TurretId, type WheelsId } from '../sim/data';

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
  spinAxis: 'x' | 'y' | 'z';
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
  /** How high to hold the robot so its tower rests on the floor when it's upside down. */
  rollHeight: number;
}

const steel = new THREE.MeshStandardMaterial({ color: 0x6d7379, metalness: 0.75, roughness: 0.45 });
const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.4, roughness: 0.8 });
const blade = new THREE.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 0.95, roughness: 0.2 });
const hot = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0x662200 });
const glowBlue = new THREE.MeshStandardMaterial({ color: 0x8fdcff, emissive: 0x2a9fe8, emissiveIntensity: 1.5 });
const glowRed = new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xd01a10, emissiveIntensity: 1.5 });
const shared = new Set<THREE.Material>([steel, dark, blade, hot, glowBlue, glowRed]);

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Enough sides that smooth shading doesn't show a many-sided outline up close. */
const ROUND_SIDES = 20;

/** Gives a shape flat faces with hard edges, for the few parts meant to look cut rather than round. */
function faceted(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  geometry.dispose();
  return flat;
}

function cylinder(r: number, h: number, mat: THREE.Material, sides = ROUND_SIDES): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, Math.max(sides, ROUND_SIDES)), mat);
  mesh.castShadow = true;
  return mesh;
}

function cone(r: number, h: number, mat: THREE.Material, sides = 8): THREE.Mesh {
  // Blades and spikes with only a few sides should keep their edges.
  const geometry = new THREE.ConeGeometry(r, h, sides > 6 ? ROUND_SIDES : sides);
  const mesh = new THREE.Mesh(sides > 6 ? geometry : faceted(geometry), mat);
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
function hullTexture(pattern: PatternId, primary: number, secondary: number, skin: string | undefined): THREE.CanvasTexture | null {
  const pixels = skin ? decodeSkin(skin) : null;
  if (pattern === 'solid' && !pixels) return null;
  const size = SKIN_SIZE;
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
  if (pixels) paintSkin(g, pixels);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Lays the player's painting over whatever is underneath. */
function paintSkin(g: CanvasRenderingContext2D, pixels: Uint8Array): void {
  const image = g.getImageData(0, 0, SKIN_SIZE, SKIN_SIZE);
  pixels.forEach((value, i) => {
    if (value === ERASED) return;
    const color = PAINT_COLORS[value - 1];
    image.data[i * 4] = (color >> 16) & 255;
    image.data[i * 4 + 1] = (color >> 8) & 255;
    image.data[i * 4 + 2] = color & 255;
  });
  g.putImageData(image, 0, 0);
}

/** Points each face of the hull at its panel on the flat template. The underside isn't painted. */
function mapHullToSkin(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const nx = (position.getX(i) - min.x) / (max.x - min.x);
    const ny = (position.getY(i) - min.y) / (max.y - min.y);
    const nz = (position.getZ(i) - min.z) / (max.z - min.z);
    const panel: PanelId | null =
      normal.getX(i) > 0.5 ? 'right' : normal.getX(i) < -0.5 ? 'left' : normal.getY(i) > 0.5 ? 'top' : normal.getY(i) < -0.5 ? null : normal.getZ(i) > 0.5 ? 'front' : 'back';
    if (!panel) {
      uv.setXY(i, 0, 0);
      continue;
    }
    // Unfolded around the deck, so each face's top edge meets the top panel.
    const across = { top: nx, right: 1 - ny, left: ny, front: nx, back: nx }[panel];
    const down = { top: nz, right: nz, left: nz, front: 1 - ny, back: ny }[panel];
    const { x0, y0, x1, y1 } = SKIN_PANELS[panel];
    uv.setXY(i, (x0 + across * (x1 - x0)) / SKIN_SIZE, 1 - (y0 + down * (y1 - y0)) / SKIN_SIZE);
  }
}

interface HullSpec {
  width: number;
  length: number;
  height: number;
  trackWidth: number;
  wheelRadius: number;
  wheelCount: number;
  /** Height of the nose as a share of the full height. Low makes a sharper wedge. */
  nose: number;
  /** Width of the nose as a share of the full width. */
  taper: number;
}

const HULLS: Record<ChassisId, HullSpec> = {
  scout: { width: 1.5, length: 2.3, height: 0.42, trackWidth: 0.3, wheelRadius: 0.3, wheelCount: 3, nose: 0.15, taper: 0.72 },
  ghost: { width: 1.55, length: 2.5, height: 0.5, trackWidth: 0.32, wheelRadius: 0.32, wheelCount: 3, nose: 0.2, taper: 0.62 },
  brawler: { width: 1.75, length: 2.5, height: 0.62, trackWidth: 0.38, wheelRadius: 0.36, wheelCount: 4, nose: 0.32, taper: 0.88 },
  rhino: { width: 1.95, length: 2.75, height: 0.74, trackWidth: 0.42, wheelRadius: 0.4, wheelCount: 4, nose: 0.22, taper: 0.8 },
  juggernaut: { width: 2.15, length: 2.95, height: 0.9, trackWidth: 0.46, wheelRadius: 0.42, wheelCount: 5, nose: 0.5, taper: 0.94 },
};

const TOWER_SCALE: Record<TowerId, number> = { small: 0.82, medium: 1, large: 1.25 };
/** Tyre size relative to the hull, and how many down each side. */
const WHEEL_LOOK: Record<Exclude<WheelsId, 'tracks'>, { radius: number; count: number }> = {
  small4: { radius: 1, count: 2 },
  large4: { radius: 1.3, count: 2 },
  six: { radius: 1.05, count: 3 },
};

function addTyre(root: THREE.Group, wheels: THREE.Mesh[], radius: number, width: number, x: number, z: number): void {
  // Rounded shoulders, turned on a lathe like the real thing.
  const half = width / 2;
  const profile = [[0.45, -half], [0.86, -half], [0.97, -half * 0.72], [1, -half * 0.3], [1, half * 0.3], [0.97, half * 0.72], [0.86, half], [0.45, half]];
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * radius, y)), 28), dark);
  tyre.castShadow = true;
  tyre.rotation.z = Math.PI / 2;
  tyre.position.set(x, radius, z);
  const hub = new THREE.Mesh(faceted(new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, width + 0.05, 6)), steel);
  tyre.add(hub);
  root.add(tyre);
  wheels.push(tyre);
}

/**
 * How a body shape bends the hull at a point. `u` runs across the hull from -1 to 1, and `t` along
 * it from -1 at the tail to 1 at the nose. Every shape fills the chassis's full width and length,
 * so none of them looks smaller than the hitbox it shares.
 */
function bodyShape(body: BodyId, s: HullSpec, u: number, t: number): { width: number; top: number; lean: number } {
  switch (body) {
    case 'wedge': {
      const along = (t + 1) / 2;
      return { width: 1 + (s.taper - 1) * along, top: 1 + (s.nose - 1) * along, lean: 0 };
    }
    case 'slab': {
      // A low, flat plate with its corners cut off.
      const nose = Math.max(0, (t - 0.5) / 0.5);
      const tail = Math.max(0, (-0.75 - t) / 0.25);
      return { width: 1 - nose * 0.28 - tail * 0.14, top: 0.8 * (1 - nose * 0.55 - tail * 0.3), lean: 0.2 };
    }
    case 'turtle': {
      // A rounded shell, oval from above and arched across the back.
      const arch = Math.sqrt(Math.max(0, 1 - t * t));
      return {
        width: Math.max(0.5, arch),
        top: (t > 0 ? 0.3 + 0.7 * arch : 0.45 + 0.55 * arch) * (0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - u * u))),
        lean: 0,
      };
    }
  }
}

/** The sharpest angle each body blends over, in radians. A shell is all curve, and a plate is all edges. */
const HULL_CREASE: Record<BodyId, number> = { wedge: 0.3, slab: 0.3, turtle: 1.1 };

/**
 * The armoured body: a box bent into the chosen shape. The paint template is mapped before the box
 * is bent, so painted panels stay put on the sloped faces.
 */
function hullBody(s: HullSpec, body: BodyId, paint: THREE.Material, baseY: number): THREE.Mesh {
  const hull: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(s.width, s.height, s.length, 10, 1, 16), paint);
  hull.position.y = baseY + s.height / 2;
  hull.castShadow = true;
  mapHullToSkin(hull.geometry);
  const position = hull.geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) / (s.width / 2);
    const up = position.getY(i) > 0 ? 1 : 0;
    const shape = bodyShape(body, s, u, position.getZ(i) / (s.length / 2));
    position.setX(i, position.getX(i) * shape.width * (1 - shape.lean * up));
    position.setY(i, -s.height / 2 + up * s.height * shape.top);
  }
  // The same idea as Blender's smooth by angle: gentle curves blend, and real edges stay sharp.
  const smoothed = toCreasedNormals(hull.geometry, HULL_CREASE[body]);
  hull.geometry.dispose();
  hull.geometry = smoothed;
  return hull;
}

function buildHull(root: THREE.Group, id: ChassisId, body: BodyId, paint: THREE.Material, trim: THREE.Material, wheels: THREE.Mesh[], look: WheelsId): number {
  const s = HULLS[id];
  const baseY = s.wheelRadius * 0.7;

  // A steel floor pan, with the wheels set at its sides.
  root.add(box(s.width + 0.06, 0.1, s.length - 0.1, dark, 0, baseY + 0.02, 0));
  for (const side of [-1, 1]) {
    const x = side * (s.width / 2 + s.trackWidth / 2 - 0.02);
    if (look !== 'tracks') {
      const { radius, count } = WHEEL_LOOK[look];
      const tyre = s.wheelRadius * radius;
      for (let i = 0; i < count; i++) {
        addTyre(root, wheels, tyre, s.trackWidth, x, (i / (count - 1) - 0.5) * (s.length - tyre * 1.5));
      }
    } else {
      root.add(box(s.trackWidth, s.wheelRadius * 1.5, s.length * 0.95, dark, x, s.wheelRadius, 0));
      for (let i = 0; i < s.wheelCount; i++) {
        const wheel = cylinder(s.wheelRadius * 0.72, s.trackWidth + 0.06, steel, 8);
        wheel.rotation.z = Math.PI / 2;
        const t = s.wheelCount === 1 ? 0 : i / (s.wheelCount - 1) - 0.5;
        wheel.position.set(x, s.wheelRadius, t * (s.length - s.wheelRadius * 1.8));
        root.add(wheel);
        wheels.push(wheel);
      }
    }
  }

  root.add(hullBody(s, body, paint, baseY));

  // A low steel wedge along the floor gets under the other robot, as the real ones do.
  const scoop = box(s.width * s.taper + 0.1, 0.05, 0.62, steel, 0, 0.17, s.length / 2 + 0.2);
  scoop.rotation.x = 0.42;
  root.add(scoop);

  // Armour low on the tail and flanks, which is what falls off as the robot takes damage.
  for (const side of [-1, 1]) {
    root.add(box(s.width * 0.42, s.height * 0.32, 0.12, trim, side * s.width * 0.22, baseY + s.height * 0.2, -s.length / 2 - 0.02));
    root.add(box(0.05, s.height * 0.3, s.length * 0.5, trim, side * (s.width / 2 + 0.01), baseY + s.height * 0.2, 0));
  }

  if (id === 'ghost') {
    // Long, swept side skirts.
    for (const side of [-1, 1]) {
      const skirt = box(0.08, s.height * 0.5, s.length * 0.8, trim, side * (s.width / 2 + s.trackWidth + 0.04), baseY + s.height * 0.25, 0);
      skirt.rotation.z = side * 0.3;
      root.add(skirt);
    }
  } else if (id === 'rhino') {
    // A big horn on the nose, set low to get under things.
    const horn = cone(0.2, 0.85, blade, 6);
    horn.rotation.x = Math.PI / 2 - 0.15;
    horn.position.set(0, baseY + s.height * 0.3, s.length / 2 + 0.3);
    root.add(horn);
  } else if (id === 'juggernaut') {
    // Bolted-on slabs of extra armour.
    for (const side of [-1, 1]) {
      root.add(box(0.16, s.height * 0.6, s.length * 0.6, trim, side * (s.width / 2 + 0.01), baseY + s.height * 0.32, -s.length * 0.12));
    }
  }
  return baseY + s.height;
}

/** Where the tower sits, so it rests on the hull whatever the shape below it. */
function towerSeat(s: HullSpec, body: BodyId, z: number, radius: number): number {
  const u = radius / (s.width / 2);
  const span = radius / (s.length / 2);
  const t = z / (s.length / 2);
  const lowest = Math.min(...[[-u, t], [u, t], [0, t - span], [0, t + span]].map(([a, b]) => bodyShape(body, s, a, b).top));
  return s.wheelRadius * 0.7 + s.height * lowest;
}

/** The tower is a low armoured drum, with the gun fixed to it pointing straight ahead. */
function buildTurret(pivot: THREE.Group, id: TurretId, head: THREE.Material): void {
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.5, 0.26, ROUND_SIDES * 2), head);
  tower.position.y = 0.13;
  tower.castShadow = true;
  pivot.add(tower);

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
    case 'heavyrocket':
      pivot.add(box(0.5, 0.42, 1.1, dark, 0, 0.26, 0.5));
      pivot.add(barrel(0.15, 0.1, glowRed, 0, 0.26, 1.07));
      break;
    case 'bunkerbuster':
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
      const post = cylinder(0.07, 0.4, steel, 6);
      post.position.set(0, 0.4, 0);
      pivot.add(post);
      for (const y of [0.34, 0.47, 0.6]) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22 - (y - 0.34) * 0.4, 0.05, 6, 14), glowBlue);
        coil.rotation.x = Math.PI / 2;
        coil.position.y = y;
        pivot.add(coil);
      }
      break;
    }
  }
}

/** A disc standing upright, with teeth, centered on its own group. Spins around x. */
function verticalDisc(radius: number, thickness: number, teeth: number, toothSize: number): THREE.Group {
  const disc = new THREE.Group();
  const plate = cylinder(radius, thickness, blade, 22);
  plate.rotation.z = Math.PI / 2;
  disc.add(plate);
  const hub = cylinder(radius * 0.28, thickness + 0.1, dark, 8);
  hub.rotation.z = Math.PI / 2;
  disc.add(hub);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = box(thickness + 0.03, toothSize, toothSize * 0.7, steel, 0, Math.cos(a) * (radius + toothSize * 0.25), Math.sin(a) * (radius + toothSize * 0.25));
    tooth.rotation.x = -a;
    disc.add(tooth);
  }
  return disc;
}

/** The two upright arms that carry a spinning weapon out in front of the robot. */
function weaponArms(pivot: THREE.Group, spread: number, length: number, y = 0): void {
  for (const side of [-1, 1]) pivot.add(box(0.14, 0.22, length, dark, side * spread, y, length / 2 - 0.05));
}

function buildMelee(pivot: THREE.Group, id: MeleeId, spec: HullSpec): { spinner: THREE.Object3D | null; axis: 'x' | 'y' | 'z' } {
  switch (id) {
    case 'vertdisc': {
      weaponArms(pivot, 0.2, 0.95);
      const disc = verticalDisc(0.72, 0.14, 2, 0.32);
      disc.position.set(0, 0.28, 0.95);
      pivot.add(disc);
      return { spinner: disc, axis: 'x' };
    }
    case 'vertbar': {
      weaponArms(pivot, 0.22, 1);
      const bar = new THREE.Group();
      bar.position.set(0, 0.3, 1);
      bar.add(box(0.2, 1.95, 0.3, blade));
      for (const end of [-1, 1]) bar.add(box(0.26, 0.26, 0.42, steel, 0, end * 0.92, end * 0.06));
      const hub = cylinder(0.22, 0.34, dark, 8);
      hub.rotation.z = Math.PI / 2;
      bar.add(hub);
      pivot.add(bar);
      return { spinner: bar, axis: 'x' };
    }
    case 'horizbar': {
      pivot.add(box(0.5, 0.18, 0.75, dark, 0, 0.12, 0.3));
      const bar = new THREE.Group();
      bar.position.set(0, 0.28, 0.72);
      bar.add(box(3, 0.12, 0.34, blade));
      for (const end of [-1, 1]) bar.add(box(0.5, 0.16, 0.42, steel, end * 1.3, 0, end * 0.03));
      bar.add(cylinder(0.26, 0.24, dark, 8));
      pivot.add(bar);
      return { spinner: bar, axis: 'y' };
    }
    case 'undercutter': {
      pivot.add(box(0.5, 0.14, 0.6, dark, 0, -0.08, 0.28));
      const saw = new THREE.Group();
      saw.position.set(0, -0.18, 0.8);
      saw.add(cylinder(0.85, 0.06, blade, 22));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const tooth = box(0.26, 0.08, 0.16, steel, Math.cos(a) * 0.92, 0, Math.sin(a) * 0.92);
        tooth.rotation.y = -a;
        saw.add(tooth);
      }
      pivot.add(saw);
      return { spinner: saw, axis: 'y' };
    }
    case 'drum': {
      weaponArms(pivot, spec.width * 0.42, 0.72, -0.05);
      const drum = new THREE.Group();
      drum.position.set(0, 0.02, 0.68);
      const barrelBody = cylinder(0.38, spec.width * 0.74, steel, 12);
      barrelBody.rotation.z = Math.PI / 2;
      drum.add(barrelBody);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const ridge = box(spec.width * 0.74, 0.16, 0.14, blade, 0, Math.cos(a) * 0.42, Math.sin(a) * 0.42);
        ridge.rotation.x = -a;
        drum.add(ridge);
      }
      pivot.add(drum);
      return { spinner: drum, axis: 'x' };
    }
    case 'eggbeater': {
      weaponArms(pivot, spec.width * 0.36, 0.78, 0);
      const beater = new THREE.Group();
      beater.position.set(0, 0.04, 0.76);
      const axle = cylinder(0.08, spec.width * 0.66, dark, 8);
      axle.rotation.z = Math.PI / 2;
      beater.add(axle);
      for (const turn of [0, Math.PI / 2]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 6, 14), blade);
        hoop.scale.set(spec.width * 0.66, 1, 1);
        hoop.rotation.set(turn, Math.PI / 2, 0);
        hoop.castShadow = true;
        beater.add(hoop);
      }
      pivot.add(beater);
      return { spinner: beater, axis: 'x' };
    }
    case 'shell': {
      // A heavy ring around the whole robot, centered on the hull rather than the nose.
      const ring = new THREE.Group();
      ring.position.set(0, 0, -spec.length / 2);
      const radius = Math.hypot(spec.width / 2 + spec.trackWidth, spec.length / 2) + 0.14;
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.13, 6, 28), steel);
      hoop.rotation.x = Math.PI / 2;
      hoop.castShadow = true;
      ring.add(hoop);
      for (const end of [-1, 1]) {
        ring.add(box(0.4, 0.28, 0.32, blade, end * (radius + 0.08), 0, 0));
        ring.add(box(0.3, 0.1, radius * 2, dark, end * 0.0, 0, 0));
      }
      pivot.add(ring);
      return { spinner: ring, axis: 'y' };
    }
    case 'hammersaw': {
      pivot.add(box(0.16, 0.16, 1.5, steel, 0, 0, 0.75));
      pivot.add(box(0.3, 0.3, 0.3, dark, 0, 0, 0.12));
      const saw = verticalDisc(0.6, 0.06, 10, 0.16);
      saw.position.set(0, -0.08, 1.5);
      pivot.add(saw);
      return { spinner: saw, axis: 'x' };
    }
    case 'flipper': {
      const plate = box(spec.width * 0.82, 0.07, 1.25, steel, 0, -0.14, 0.62);
      plate.rotation.x = 0.1;
      pivot.add(plate);
      pivot.add(box(spec.width * 0.82, 0.12, 0.14, dark, 0, -0.08, 0.02));
      for (const side of [-1, 1]) pivot.add(box(0.1, 0.22, 0.9, dark, side * spec.width * 0.34, -0.03, 0.5));
      return { spinner: null, axis: 'x' };
    }
    case 'crusher': {
      pivot.add(box(0.46, 0.34, 0.5, dark, 0, 0.02, 0.2));
      // A beak on a heavy arm, closing down onto a low fork.
      const arm = box(0.28, 0.2, 1.25, steel, 0, 0.42, 0.72);
      arm.rotation.x = -0.28;
      pivot.add(arm);
      const beak = cone(0.2, 0.6, blade, 5);
      beak.rotation.x = Math.PI;
      beak.position.set(0, 0.42, 1.4);
      pivot.add(beak);
      for (const side of [-1, 1]) pivot.add(box(0.14, 0.08, 1.1, steel, side * 0.26, -0.2, 0.9));
      return { spinner: null, axis: 'x' };
    }
    case 'forks': {
      pivot.add(box(spec.width * 0.7, 0.3, 0.14, dark, 0, -0.04, 0.05));
      for (const side of [-1, 1]) {
        const tine = box(0.2, 0.06, 1.35, steel, side * spec.width * 0.25, -0.2, 0.72);
        tine.rotation.x = 0.04;
        pivot.add(tine);
      }
      return { spinner: null, axis: 'x' };
    }
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

/** Only gear that does its work out at the front or sides gets a model, which keeps the deck clear. */
function buildDefenseGear(root: THREE.Group, id: DefenseId, deckY: number, spec: HullSpec): THREE.Group | null {
  const front = spec.length / 2;
  switch (id) {
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
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.hypot(spec.width / 2 + spec.trackWidth, spec.length / 2) + 0.1, 0.06, 5, 24), blade);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = deckY - spec.height * 0.5;
      ring.castShadow = true;
      root.add(ring);
      break;
    }
    default:
      break;
  }
  return null;
}

export function buildRobot(build: RobotBuild): RobotModel {
  const root = new THREE.Group();
  // Paint saved before body shapes existed doesn't name one.
  const paint = { ...DEFAULT_PAINT, primary: build.color, ...build.paint };
  const texture = hullTexture(paint.pattern, paint.primary, paint.secondary, paint.skin);
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: texture ? 0xffffff : paint.primary,
    map: texture,
    metalness: 0.35,
    roughness: 0.55,
  });
  const headMaterial = new THREE.MeshStandardMaterial({ color: paint.primary, metalness: 0.35, roughness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: paint.secondary, metalness: 0.5, roughness: 0.5 });
  const wheels: THREE.Mesh[] = [];
  const deckY = buildHull(root, build.chassis, paint.body, hullMaterial, trim, wheels, build.wheels ?? 'large4');
  const spec = HULLS[build.chassis];

  const turretPivot = new THREE.Group();
  // Set back on the deck, leaving the nose clear for the main weapon.
  const towerScale = TOWER_SCALE[build.tower ?? 'medium'];
  const towerZ = -spec.length * 0.14;
  turretPivot.position.set(0, towerSeat(spec, paint.body, towerZ, 0.35 * towerScale), towerZ);
  turretPivot.scale.setScalar(towerScale);
  buildTurret(turretPivot, build.turret, headMaterial);
  root.add(turretPivot);

  const meleePivot = new THREE.Group();
  meleePivot.position.set(0, deckY - spec.height * 0.45, build.rearMelee ? -spec.length / 2 : spec.length / 2);
  if (build.rearMelee) meleePivot.rotation.y = Math.PI;
  const { spinner, axis } = buildMelee(meleePivot, build.melee, spec);
  root.add(meleePivot);

  const blades = buildDefenseGear(root, build.defense, deckY, spec);

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
    rollHeight: turretPivot.position.y + 0.3 * towerScale,
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
