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
  /** Barrels that spin while firing. */
  gunSpinner: THREE.Object3D | null;
  /** Runs a chainsaw's teeth around its bar. */
  chain: ((travel: number) => void) | null;
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
const copper = new THREE.MeshStandardMaterial({ color: 0xc27a3f, metalness: 0.85, roughness: 0.35 });
const paintRed = new THREE.MeshStandardMaterial({ color: 0xc8261c, metalness: 0.3, roughness: 0.45 });
const warhead = new THREE.MeshStandardMaterial({ color: 0xd8c23a, metalness: 0.35, roughness: 0.5 });
const glowBlue = new THREE.MeshStandardMaterial({ color: 0x8fdcff, emissive: 0x2a9fe8, emissiveIntensity: 1.5 });
const glowRed = new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xd01a10, emissiveIntensity: 1.5 });
const shared = new Set<THREE.Material>([steel, dark, blade, hot, copper, paintRed, warhead, glowBlue, glowRed]);

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

// ---------- Shapes for building weapons. Coordinates are [along, up] in the plane they're drawn in.
type Pt = [number, number];
type Vec = [number, number, number];

/** Keeps real edges sharp and blends the rest, as Blender's smooth by angle does. */
function smoothed(geometry: THREE.BufferGeometry, angle = 0.6): THREE.BufferGeometry {
  const result = toCreasedNormals(geometry, angle);
  geometry.dispose();
  return result;
}

function outline(points: Pt[]): THREE.Shape {
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}

/** A flat shape given thickness, centered on z, with its edges slightly rounded off. */
function plate(shape: THREE.Shape, thickness: number, bevel: number, curve: number): THREE.BufferGeometry {
  const depth = Math.max(0.001, thickness - bevel * 2);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: curve, steps: 1 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function finish(geometry: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(smoothed(geometry), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Seen from the side: the shape's x runs forward along z, and its thickness runs across x. */
function sideOn(shape: THREE.Shape | Pt[], thickness: number, mat: THREE.Material, bevel = 0.015, curve = 8): THREE.Mesh {
  const geometry = plate(Array.isArray(shape) ? outline(shape) : shape, thickness, bevel, curve);
  geometry.rotateY(-Math.PI / 2);
  return finish(geometry, mat);
}

/** Seen from above: the shape's x runs across x, its y runs forward along z, and its thickness runs up. */
function topOn(shape: THREE.Shape | Pt[], thickness: number, mat: THREE.Material, bevel = 0.015, curve = 8): THREE.Mesh {
  const geometry = plate(Array.isArray(shape) ? outline(shape) : shape, thickness, bevel, curve);
  geometry.rotateX(Math.PI / 2);
  return finish(geometry, mat);
}

/** Seen from the front: the shape's x and y are x and y, and its thickness runs along z. */
function frontOn(points: Pt[], thickness: number, mat: THREE.Material, bevel = 0.015): THREE.Mesh {
  return finish(plate(outline(points), thickness, bevel, 4), mat);
}

/** Turned on a lathe around z. Points are [radius, along], from the back to the front. */
function turned(points: Pt[], mat: THREE.Material, z = 0, y = 0, x = 0, sides = ROUND_SIDES): THREE.Mesh {
  const geometry = new THREE.LatheGeometry(points.map(([r, along]) => new THREE.Vector2(Math.max(r, 0.0001), along)), sides);
  geometry.rotateX(Math.PI / 2);
  return finish(geometry, mat, x, y, z);
}

/** A round bar between two points. */
function rod(a: Vec, b: Vec, r: number, mat: THREE.Material, sides = 12): THREE.Mesh {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const length = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, sides), mat);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
  mesh.castShadow = true;
  return mesh;
}

/** A hydraulic ram: a dark cylinder with a polished rod coming out of it. */
function piston(parent: THREE.Object3D, a: Vec, b: Vec, r: number): void {
  const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  parent.add(rod(a, mid, r, dark), rod(mid, b, r * 0.55, blade));
}

/** A round bar across the robot, such as an axle or a hinge pin. */
function axle(r: number, width: number, mat: THREE.Material, y = 0, z = 0): THREE.Mesh {
  return rod([-width / 2, y, z], [width / 2, y, z], r, mat, ROUND_SIDES);
}

function tube(points: Vec[], r: number, mat: THREE.Material, closed = false, segments = 40): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, r, 8, closed), mat);
  mesh.castShadow = true;
  return mesh;
}

/** A saw blade with hooked teeth, and holes cut to lighten it. Its flat faces look along z. */
function sawBlade(radius: number, thickness: number, teeth: number, tooth: number, ports = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  shape.moveTo(radius, 0);
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    // Straight up to the tip, then a slope back down to the rim.
    shape.lineTo(Math.cos(a + step * 0.04) * (radius + tooth), Math.sin(a + step * 0.04) * (radius + tooth));
    const land = a + Math.min(step * 0.8, 0.5);
    shape.lineTo(Math.cos(land) * radius, Math.sin(land) * radius);
    if (land < a + step) shape.absarc(0, 0, radius, land, a + step, false);
  }
  shape.closePath();
  const hole = (x: number, y: number, r: number) => {
    const path = new THREE.Path();
    path.absarc(x, y, r, 0, Math.PI * 2, true);
    shape.holes.push(path);
  };
  hole(0, 0, radius * 0.14);
  for (let i = 0; i < ports; i++) {
    const a = (i / ports) * Math.PI * 2;
    hole(Math.cos(a) * radius * 0.58, Math.sin(a) * radius * 0.58, radius * 0.13);
  }
  return plate(shape, thickness, 0.008, Math.max(2, Math.ceil(16 / teeth)));
}

/** A spinning blade on its hub, turning around x (upright) or y (flat). */
function sawOnHub(axis: 'x' | 'y', radius: number, thickness: number, teeth: number, tooth: number, ports = 0): THREE.Group {
  const group = new THREE.Group();
  const geometry = sawBlade(radius, thickness, teeth, tooth, ports);
  if (axis === 'x') geometry.rotateY(Math.PI / 2);
  else geometry.rotateX(Math.PI / 2);
  group.add(finish(geometry, blade));
  const hub = rod(axis === 'x' ? [-thickness - 0.05, 0, 0] : [0, -thickness - 0.05, 0], axis === 'x' ? [thickness + 0.05, 0, 0] : [0, thickness + 0.05, 0], radius * 0.2, dark, ROUND_SIDES);
  group.add(hub);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const u = Math.cos(a) * radius * 0.14;
    const v = Math.sin(a) * radius * 0.14;
    const end = thickness + 0.07;
    group.add(axis === 'x' ? rod([-end, u, v], [end, u, v], 0.018, steel, 6) : rod([u, -end, v], [u, end, v], 0.018, steel, 6));
  }
  return group;
}

/** Two tapered arms reaching forward either side of a weapon, with a bearing at the end. */
function forkArms(pivot: THREE.Group, spread: number, length: number, y = 0): void {
  for (const side of [-1, 1]) {
    const arm = sideOn([[-0.08, -0.15], [length * 0.55, -0.11], [length + 0.08, -0.08], [length + 0.1, 0.08], [length * 0.55, 0.11], [-0.08, 0.15]], 0.12, dark, 0.012);
    arm.position.set(side * spread, y, 0);
    pivot.add(arm);
    const bearing = rod([side * spread - 0.09, y, length], [side * spread + 0.09, y, length], 0.1, steel, ROUND_SIDES);
    pivot.add(bearing);
  }
}

/** A hinge at the nose, and the rams that drive a swinging arm. */
function swingMount(pivot: THREE.Group, width: number): void {
  pivot.add(axle(0.09, width, dark, 0, 0.04));
  for (const side of [-1, 1]) pivot.add(rod([side * (width / 2 + 0.02), 0, 0.04], [side * (width / 2 + 0.04), 0, 0.04], 0.12, steel, ROUND_SIDES));
}

/** The tower is a low armoured drum, with the gun fixed to it pointing straight ahead. Returns barrels that spin when firing. */
function buildTurret(pivot: THREE.Group, id: TurretId, head: THREE.Material): THREE.Object3D | null {
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.5, 0.26, ROUND_SIDES * 2), head);
  tower.position.y = 0.13;
  tower.castShadow = true;
  pivot.add(tower);
  const y = 0.26;

  switch (id) {
    case 'minigun': {
      // Six barrels held in clamps, spun by a motor at the back, fed from a drum on the side.
      pivot.add(turned([[0, -0.15], [0.14, -0.15], [0.16, -0.1], [0.16, 0.22], [0.12, 0.3], [0, 0.3]], dark, 0, y));
      pivot.add(box(0.2, 0.05, 0.16, steel, 0, y - 0.16, 0.08));
      const drum = cylinder(0.14, 0.12, steel);
      drum.rotation.z = Math.PI / 2;
      drum.position.set(0.24, y, 0.02);
      pivot.add(drum);
      const barrels = new THREE.Group();
      barrels.position.set(0, y, 0.3);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        barrels.add(rod([Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0], [Math.cos(a) * 0.075, Math.sin(a) * 0.075, 1.05], 0.024, steel, 8));
      }
      for (const z of [0.05, 0.55, 1.0]) barrels.add(turned([[0, z - 0.03], [0.115, z - 0.03], [0.115, z + 0.03], [0, z + 0.03]], dark, 0));
      pivot.add(barrels);
      return barrels;
    }
    case 'rockets': {
      const pod = sideOn([[-0.1, y - 0.18], [0.75, y - 0.18], [0.9, y - 0.08], [0.9, y + 0.28], [0.72, y + 0.34], [-0.1, y + 0.34]], 0.82, dark, 0.03);
      pivot.add(pod);
      for (const x of [-0.2, 0.2]) {
        for (const up of [y - 0.02, y + 0.2]) {
          pivot.add(turned([[0.1, 0.88], [0.12, 0.88], [0.12, 0.93], [0.1, 0.93]], steel, 0, up, x));
          pivot.add(turned([[0.08, 0.84], [0.08, 0.92], [0.05, 0.98], [0, 1.02]], hot, 0, up, x));
        }
      }
      return null;
    }
    case 'heavyrocket':
      // A single launch tube with a flared back, and the warhead poking out of the front.
      pivot.add(turned([[0.24, -0.25], [0.16, -0.08], [0.17, 0.05], [0.17, 0.85], [0.2, 0.88], [0.2, 0.96], [0.15, 0.96]], dark, 0, y + 0.1));
      pivot.add(turned([[0.14, 0.9], [0.14, 1.02], [0.1, 1.16], [0.04, 1.28], [0, 1.31]], warhead, 0, y + 0.1));
      pivot.add(box(0.1, 0.1, 0.5, steel, 0, y - 0.07, 0.2));
      return null;
    case 'bunkerbuster':
      for (const x of [-0.27, 0.27]) {
        pivot.add(turned([[0.19, -0.2], [0.15, -0.05], [0.15, 0.88], [0.17, 0.92], [0.13, 0.92]], dark, 0, y, x));
        pivot.add(turned([[0.12, 0.88], [0.12, 1.02], [0.09, 1.22], [0.03, 1.38], [0, 1.4]], warhead, 0, y, x));
        for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
          const fin = box(0.015, 0.1, 0.16, steel, x + Math.cos(a) * 0.2, y + Math.sin(a) * 0.2, -0.12);
          fin.rotation.z = a - Math.PI / 2;
          pivot.add(fin);
        }
      }
      pivot.add(box(0.5, 0.08, 0.34, steel, 0, y - 0.1, 0.32));
      return null;
    case 'mortar': {
      // A short, fat tube on a round base, propped up by a bipod.
      pivot.add(turned([[0, 0], [0.3, 0], [0.33, 0.05], [0, 0.05]], steel, 0, y - 0.02));
      const tube3d = turned([[0.17, 0], [0.17, 0.92], [0.21, 0.95], [0.21, 1.02], [0.15, 1.02]], dark);
      tube3d.rotation.x = -0.72;
      tube3d.position.set(0, y + 0.02, -0.02);
      pivot.add(tube3d);
      pivot.add(rod([-0.28, y - 0.02, 0.5], [-0.05, y + 0.42, 0.42], 0.022, steel, 8), rod([0.28, y - 0.02, 0.5], [0.05, y + 0.42, 0.42], 0.022, steel, 8));
      return null;
    }
    case 'grenade':
      // A revolving cylinder of chambers behind a short, stepped barrel.
      pivot.add(turned([[0, -0.1], [0.23, -0.1], [0.25, -0.07], [0.25, 0.3], [0.2, 0.34], [0, 0.34]], steel, 0, y + 0.03));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        pivot.add(rod([Math.cos(a) * 0.15, y + 0.03 + Math.sin(a) * 0.15, 0.3], [Math.cos(a) * 0.15, y + 0.03 + Math.sin(a) * 0.15, 0.35], 0.05, dark, 10));
      }
      pivot.add(turned([[0.13, 0.32], [0.13, 0.85], [0.16, 0.88], [0.16, 1.02], [0.12, 1.02]], dark, 0, y + 0.03));
      return null;
    case 'flamethrower':
      // A nozzle flaring at the end of a pipe, with a fuel line and a pilot light beneath it.
      pivot.add(turned([[0.08, 0], [0.08, 0.85], [0.1, 0.92], [0.17, 1.15], [0.17, 1.2], [0.12, 1.2]], dark, 0, y));
      pivot.add(turned([[0.11, 0.28], [0.11, 0.36], [0, 0.36]], steel, 0, y), turned([[0.11, 0.62], [0.11, 0.7], [0, 0.7]], steel, 0, y));
      pivot.add(tube([[0.14, y - 0.12, -0.1], [0.14, y - 0.1, 0.4], [0.05, y - 0.08, 0.8]], 0.022, copper, false, 12));
      pivot.add(turned([[0.03, 0.8], [0.03, 1.1], [0.016, 1.16], [0, 1.18]], hot, 0, y - 0.09));
      return null;
    case 'laser':
      // A barrel lined with cooling fins, ending in a lens.
      pivot.add(turned([[0, -0.15], [0.13, -0.15], [0.15, -0.1], [0.15, 0.25], [0.1, 0.3], [0.08, 0.3], [0.08, 1.2], [0.12, 1.25], [0.12, 1.36], [0.09, 1.38]], steel, 0, y));
      for (let i = 0; i < 6; i++) {
        const z = 0.38 + i * 0.13;
        pivot.add(turned([[0.08, z], [0.15, z + 0.01], [0.15, z + 0.03], [0.08, z + 0.04]], dark, 0, y));
      }
      pivot.add(turned([[0.09, 1.34], [0.07, 1.39], [0.03, 1.42], [0, 1.43]], glowBlue, 0, y));
      return null;
    case 'discs': {
      // A flat launcher with the next blade sitting in its slot.
      for (const up of [y - 0.05, y + 0.1]) {
        const jaw = topOn([[-0.34, -0.1], [0.34, -0.1], [0.4, 0.45], [0.26, 0.95], [-0.26, 0.95], [-0.4, 0.45]], 0.05, dark, 0.012);
        jaw.position.y = up;
        pivot.add(jaw);
      }
      const saw = sawOnHub('y', 0.3, 0.035, 12, 0.05);
      saw.position.set(0, y + 0.025, 0.72);
      pivot.add(saw);
      return null;
    }
    case 'spear': {
      // A crossbow: a rail, a sprung bow, a string, and a barbed bolt ready to go.
      pivot.add(sideOn([[-0.1, y - 0.1], [1.1, y - 0.06], [1.15, y], [-0.1, y + 0.03]], 0.13, dark, 0.012));
      pivot.add(tube([[-0.62, y, 0.68], [-0.32, y, 0.9], [0, y, 0.98], [0.32, y, 0.9], [0.62, y, 0.68]], 0.024, steel, false, 16));
      pivot.add(rod([-0.62, y, 0.68], [0, y, 0.25], 0.006, dark, 4), rod([0.62, y, 0.68], [0, y, 0.25], 0.006, dark, 4));
      pivot.add(rod([0, y + 0.05, 0.2], [0, y + 0.05, 1.25], 0.018, steel, 8));
      const head = topOn([[0, 1.55], [0.07, 1.27], [0.03, 1.3], [0.02, 1.22], [-0.02, 1.22], [-0.03, 1.3], [-0.07, 1.27]], 0.02, blade, 0.005);
      head.position.y = y + 0.05;
      pivot.add(head);
      return null;
    }
    case 'arc': {
      // A short Tesla coil: an insulated stack with a polished ring on top.
      pivot.add(turned([[0, 0], [0.16, 0], [0.12, 0.08], [0.12, 0.34], [0, 0.34]], dark, 0, 0));
      const stack = new THREE.Group();
      stack.position.y = y;
      for (let i = 0; i < 4; i++) {
        const r = 0.15 - i * 0.015;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, ROUND_SIDES), copper);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = i * 0.07;
        stack.add(ring);
      }
      const post = cylinder(0.06, 0.34, steel);
      post.position.y = 0.14;
      stack.add(post);
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 10, ROUND_SIDES), glowBlue);
      crown.rotation.x = Math.PI / 2;
      crown.position.y = 0.34;
      stack.add(crown);
      pivot.add(stack);
      return null;
    }
  }
}

interface BuiltMelee {
  spinner: THREE.Object3D | null;
  axis: 'x' | 'y' | 'z';
  /** Runs a chainsaw's teeth around its bar. */
  chain?: (travel: number) => void;
}

function buildChainsaw(pivot: THREE.Group): BuiltMelee {
  // The motor, with a guard on top and a tapered guide bar running out of it.
  pivot.add(sideOn([[-0.08, -0.17], [0.4, -0.17], [0.52, -0.08], [0.52, 0.14], [0.34, 0.24], [-0.08, 0.2]], 0.34, dark, 0.03));
  pivot.add(rod([0, 0.26, -0.02], [0.0, 0.26, 0.3], 0.025, steel, 8));
  const low = -0.05;
  const start = 0.45;
  const end = 2.08;
  const rear = 0.14;
  const tip = 0.09;
  const bar = new THREE.Shape();
  bar.moveTo(start, low - rear);
  bar.lineTo(end, low - tip);
  bar.absarc(end, low, tip, -Math.PI / 2, Math.PI / 2, false);
  bar.lineTo(start, low + rear);
  bar.absarc(start, low, rear, Math.PI / 2, Math.PI * 1.5, false);
  pivot.add(sideOn(bar, 0.05, steel, 0.008, 10));

  // Teeth run on a loop just outside the bar, so they're worked out rather than spun.
  const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.07, 0.1), blade, 30);
  teeth.castShadow = true;
  teeth.frustumCulled = false;
  const length = end - start;
  const slope = (rear - tip) / length;
  const r1 = tip + 0.03;
  const r2 = rear + 0.03;
  const sides = Math.hypot(length, rear - tip);
  const total = sides * 2 + Math.PI * (r1 + r2);
  const dummy = new THREE.Object3D();
  const place = (distance: number) => {
    let d = ((distance % total) + total) % total;
    let z: number;
    let y: number;
    let angle: number;
    if (d < sides) {
      const t = d / sides;
      z = start + t * length;
      y = low - (rear + 0.03) + t * (rear - tip);
      angle = Math.atan(slope);
    } else if ((d -= sides) < Math.PI * r1) {
      const a = d / r1 - Math.PI / 2;
      z = end + Math.cos(a) * r1;
      y = low + Math.sin(a) * r1;
      angle = a + Math.PI / 2;
    } else if ((d -= Math.PI * r1) < sides) {
      const t = d / sides;
      z = end - t * length;
      y = low + (tip + 0.03) + t * (rear - tip);
      angle = Math.PI - Math.atan(slope);
    } else {
      d -= sides;
      const a = d / r2 + Math.PI / 2;
      z = start + Math.cos(a) * r2;
      y = low + Math.sin(a) * r2;
      angle = a + Math.PI / 2;
    }
    dummy.position.set(0, y, z);
    dummy.rotation.set(-angle, 0, 0);
    dummy.updateMatrix();
  };
  const chain = (travel: number) => {
    for (let i = 0; i < teeth.count; i++) {
      place(travel + (i / teeth.count) * total);
      teeth.setMatrixAt(i, dummy.matrix);
    }
    teeth.instanceMatrix.needsUpdate = true;
  };
  chain(0);
  pivot.add(teeth);
  return { spinner: null, axis: 'x', chain };
}

function buildMelee(pivot: THREE.Group, id: MeleeId, spec: HullSpec): BuiltMelee {
  switch (id) {
    case 'chainsaw':
      return buildChainsaw(pivot);
    case 'drill': {
      // A motor and chuck, then a tapered bit with two flutes winding down it to the point.
      pivot.add(turned([[0, -0.05], [0.3, -0.05], [0.34, 0], [0.34, 0.3], [0.27, 0.36], [0.27, 0.42], [0.2, 0.48], [0, 0.48]], dark));
      const bit = new THREE.Group();
      bit.position.z = 0.46;
      bit.add(turned([[0, 0], [0.2, 0], [0.22, 0.08], [0.18, 0.3], [0.12, 0.7], [0.05, 1.1], [0, 1.28]], steel));
      for (const phase of [0, Math.PI]) {
        const points: Vec[] = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const a = t * Math.PI * 5 + phase;
          const r = 0.23 * (1 - t) + 0.012;
          points.push([Math.cos(a) * r, Math.sin(a) * r, 0.04 + t * 1.22]);
        }
        bit.add(tube(points, 0.026, blade, false, 56));
      }
      pivot.add(bit);
      return { spinner: bit, axis: 'z' };
    }
    case 'dagger': {
      // A mount and crossguard, then a long double-edged spike with a dark fuller down the middle.
      pivot.add(sideOn([[-0.08, -0.14], [0.2, -0.1], [0.24, 0.1], [-0.08, 0.14]], 0.3, dark, 0.02));
      pivot.add(rod([-0.28, 0, 0.26], [0.28, 0, 0.26], 0.05, steel, 12));
      pivot.add(topOn([[-0.16, 0.26], [0.16, 0.26], [0.13, 1.1], [0, 1.72], [-0.13, 1.1]], 0.05, blade, 0.022));
      const fuller = topOn([[-0.035, 0.3], [0.035, 0.3], [0.02, 1.1], [-0.02, 1.1]], 0.075, dark, 0);
      pivot.add(fuller);
      return { spinner: null, axis: 'x' };
    }
    case 'rollingpin': {
      // A studded steel roller carried on two arms, like a compactor's drum.
      forkArms(pivot, 0.76, 0.7);
      const drum = new THREE.Group();
      drum.position.z = 0.7;
      const roller = cylinder(0.38, 1.34, steel);
      roller.rotation.z = Math.PI / 2;
      drum.add(roller);
      for (const side of [-1, 1]) {
        const flange = cylinder(0.43, 0.06, dark);
        flange.rotation.z = Math.PI / 2;
        flange.position.x = side * 0.66;
        drum.add(flange);
      }
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 8; i++) {
          const a = ((i + row * 0.5) / 8) * Math.PI * 2;
          const stud = cone(0.06, 0.13, blade, 5);
          stud.position.set((row - 1) * 0.42, Math.cos(a) * 0.42, Math.sin(a) * 0.42);
          stud.rotation.x = a;
          drum.add(stud);
        }
      }
      pivot.add(drum);
      return { spinner: drum, axis: 'x' };
    }
    case 'hammer': {
      // A piston-driven shaft and a proper sledge head, faced off to strike downward.
      swingMount(pivot, 0.34);
      pivot.add(rod([0, 0, 0.04], [0, 0, 1.85], 0.055, steel, 12));
      pivot.add(turned([[0.075, 0.1], [0.075, 0.5], [0.06, 0.52]], dark));
      piston(pivot, [0, -0.3, -0.05], [0, -0.03, 0.8], 0.05);
      const head = new THREE.Mesh(smoothed(new THREE.LatheGeometry([[0, -0.46], [0.2, -0.46], [0.25, -0.42], [0.2, -0.33], [0.2, 0.33], [0.25, 0.42], [0.2, 0.46], [0, 0.46]].map(([r, h]) => new THREE.Vector2(Math.max(r, 0.0001), h)), 8), 0.5), dark);
      head.position.z = 1.85;
      head.castShadow = true;
      pivot.add(head);
      return { spinner: null, axis: 'x' };
    }
    case 'axe': {
      // A long haft with a crescent head, its cutting edge ground thin.
      swingMount(pivot, 0.3);
      pivot.add(rod([0, 0, 0.04], [0, 0, 1.62], 0.05, steel, 12));
      piston(pivot, [0, -0.28, -0.05], [0, -0.03, 0.7], 0.045);
      const head = new THREE.Shape();
      head.moveTo(1.22, 0.12);
      head.lineTo(1.58, 0.12);
      head.lineTo(1.6, -0.06);
      head.quadraticCurveTo(1.78, -0.26, 2.02, -0.42);
      head.quadraticCurveTo(1.72, -0.74, 1.08, -0.7);
      head.quadraticCurveTo(1.3, -0.36, 1.22, -0.08);
      pivot.add(sideOn(head, 0.075, blade, 0.03, 10));
      pivot.add(topOn([[-0.06, 1.22], [0.06, 1.22], [0.06, 1.62], [-0.06, 1.62]], 0.2, dark, 0.012));
      return { spinner: null, axis: 'x' };
    }
    case 'ram': {
      // A chamfered plate on two rams, with three turned spikes.
      pivot.add(frontOn([[-0.78, -0.12], [-0.78, 0.12], [-0.6, 0.24], [0.6, 0.24], [0.78, 0.12], [0.78, -0.12], [0.6, -0.24], [-0.6, -0.24]], 0.14, steel, 0.025));
      for (const side of [-1, 1]) piston(pivot, [side * 0.45, 0, -0.45], [side * 0.45, 0, 0.0], 0.08);
      for (const x of [-0.52, 0, 0.52]) {
        pivot.add(turned([[0.17, 0.05], [0.17, 0.13], [0.11, 0.2], [0.05, 0.62], [0, 0.82]], blade, 0, 0, x));
      }
      return { spinner: null, axis: 'x' };
    }
    case 'claw': {
      // Two curved talons on pivot pins, closed by hydraulic rams.
      pivot.add(topOn([[-0.42, -0.1], [0.42, -0.1], [0.5, 0.28], [-0.5, 0.28]], 0.24, dark, 0.03));
      for (const side of [-1, 1]) {
        const talon = new THREE.Shape();
        talon.moveTo(side * 0.32, 0.12);
        talon.quadraticCurveTo(side * 1.12, 0.72, side * 0.14, 1.58);
        talon.quadraticCurveTo(side * 0.66, 0.82, side * 0.2, 0.36);
        const mesh = topOn(talon, 0.15, steel, 0.035, 12);
        pivot.add(mesh);
        pivot.add(topOn(side > 0 ? [[0.14, 1.58], [0.34, 1.26], [0.26, 1.2]] : [[-0.14, 1.58], [-0.34, 1.26], [-0.26, 1.2]], 0.1, blade, 0.02));
        pivot.add(rod([side * 0.3, -0.1, 0.22], [side * 0.3, 0.1, 0.22], 0.07, blade, 12));
        piston(pivot, [side * 0.12, 0.14, 0.05], [side * 0.62, 0.14, 0.62], 0.04);
      }
      return { spinner: null, axis: 'x' };
    }
    case 'magnet': {
      // A red horseshoe with steel pole tips, wound with coils and carried on a bracket.
      const bend = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 12, 24, Math.PI), paintRed);
      bend.rotation.x = -Math.PI / 2;
      bend.position.z = 0.56;
      bend.castShadow = true;
      pivot.add(bend);
      for (const side of [-1, 1]) {
        pivot.add(turned([[0.16, 0], [0.16, 0.42]], paintRed, 0.56, 0, side * 0.5));
        pivot.add(turned([[0.17, 0], [0.17, 0.2], [0.14, 0.24], [0, 0.24]], steel, 0.98, 0, side * 0.5));
        for (const z of [0.62, 0.72, 0.82]) pivot.add(turned([[0.175, 0], [0.175, 0.06]], copper, z, 0, side * 0.5));
      }
      pivot.add(sideOn([[-0.1, -0.1], [0.2, -0.09], [0.2, 0.09], [-0.1, 0.1]], 0.24, dark, 0.02));
      return { spinner: null, axis: 'x' };
    }
    case 'vertdisc': {
      forkArms(pivot, 0.2, 0.95);
      const disc = sawOnHub('x', 0.72, 0.13, 2, 0.32, 4);
      disc.position.set(0, 0.28, 0.95);
      for (const side of [-1, 1]) pivot.add(rod([side * 0.2, 0.05, 0.3], [side * 0.2, 0.28, 0.95], 0.05, dark, 10));
      pivot.add(disc);
      return { spinner: disc, axis: 'x' };
    }
    case 'vertbar': {
      forkArms(pivot, 0.22, 1);
      for (const side of [-1, 1]) pivot.add(rod([side * 0.22, 0.05, 0.3], [side * 0.22, 0.3, 1], 0.055, dark, 10));
      const bar = new THREE.Group();
      bar.position.set(0, 0.3, 1);
      // Thick at the hub and tapering out, with a hardened hammer block on each end.
      bar.add(sideOn([[-0.17, -0.2], [-0.13, -0.7], [-0.22, -0.96], [0.2, -1.05], [0.17, -0.25], [0.17, 0.2], [0.13, 0.7], [0.22, 0.96], [-0.2, 1.05], [-0.17, 0.25]], 0.17, steel, 0.02));
      for (const end of [-1, 1]) {
        bar.add(sideOn(end > 0 ? [[-0.2, 0.78], [0.26, 0.82], [0.28, 0.98], [-0.24, 1.08]] : [[0.2, -0.78], [-0.26, -0.82], [-0.28, -0.98], [0.24, -1.08]], 0.24, blade, 0.02));
      }
      bar.add(axle(0.2, 0.3, dark));
      pivot.add(bar);
      return { spinner: bar, axis: 'x' };
    }
    case 'horizbar': {
      pivot.add(sideOn([[-0.05, -0.1], [0.5, -0.02], [0.82, 0.08], [0.82, 0.14], [0.3, 0.22], [-0.05, 0.2]], 0.44, dark, 0.03));
      const bar = new THREE.Group();
      bar.position.set(0, 0.28, 0.72);
      bar.add(topOn([[-1.5, -0.22], [-0.4, -0.15], [0.4, -0.2], [1.5, -0.06], [1.5, 0.22], [0.4, 0.15], [-0.4, 0.2], [-1.5, 0.06]], 0.11, steel, 0.02));
      for (const end of [-1, 1]) {
        bar.add(topOn(end > 0 ? [[1.08, -0.1], [1.52, -0.08], [1.56, 0.28], [1.1, 0.22]] : [[-1.08, 0.1], [-1.52, 0.08], [-1.56, -0.28], [-1.1, -0.22]], 0.17, blade, 0.02));
      }
      const hub = cylinder(0.25, 0.24, dark);
      bar.add(hub);
      pivot.add(bar);
      return { spinner: bar, axis: 'y' };
    }
    case 'undercutter': {
      pivot.add(sideOn([[-0.05, -0.2], [0.82, -0.2], [0.82, -0.13], [0.3, -0.02], [-0.05, 0.04]], 0.42, dark, 0.02));
      const saw = sawOnHub('y', 0.84, 0.05, 8, 0.15, 4);
      saw.position.set(0, -0.18, 0.8);
      pivot.add(saw);
      return { spinner: saw, axis: 'y' };
    }
    case 'drum': {
      const width = spec.width * 0.74;
      forkArms(pivot, width / 2 + 0.08, 0.68, 0);
      const drum = new THREE.Group();
      drum.position.set(0, 0, 0.68);
      const body = new THREE.Mesh(smoothed(new THREE.LatheGeometry([[0.02, -width / 2], [0.3, -width / 2], [0.36, -width / 2 + 0.06], [0.36, width / 2 - 0.06], [0.3, width / 2], [0.02, width / 2]].map(([r, h]) => new THREE.Vector2(r, h)), ROUND_SIDES), 0.6), steel);
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      drum.add(body);
      // Hardened teeth, staggered so one is always about to bite.
      const count = 6;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const holder = new THREE.Group();
        holder.rotation.x = a;
        holder.position.x = (i % 3 - 1) * width * 0.3;
        holder.add(sideOn([[-0.1, 0.33], [0.09, 0.33], [0.15, 0.5], [0.02, 0.46], [-0.12, 0.4]], 0.18, blade, 0.015));
        drum.add(holder);
      }
      pivot.add(drum);
      return { spinner: drum, axis: 'x' };
    }
    case 'eggbeater': {
      const width = spec.width * 0.66;
      forkArms(pivot, width / 2 + 0.08, 0.76, 0);
      const beater = new THREE.Group();
      beater.position.set(0, 0.04, 0.76);
      beater.add(axle(0.06, width + 0.16, dark));
      // Two loops at right angles, bulging at the middle, with a tooth on each side.
      for (const turn of [0, Math.PI / 2]) {
        const points: Vec[] = [];
        for (let i = 0; i < 20; i++) {
          const t = (i / 20) * Math.PI * 2;
          const r = Math.sin(t) * 0.46;
          points.push([Math.cos(t) * (width / 2), Math.cos(turn) * r, Math.sin(turn) * r]);
        }
        beater.add(tube(points, 0.05, steel, true, 48));
        for (const side of [-1, 1]) {
          const holder = new THREE.Group();
          holder.rotation.x = -turn + (side > 0 ? 0 : Math.PI);
          holder.add(sideOn([[-0.11, 0.42], [0.1, 0.42], [0.16, 0.6], [0.02, 0.55], [-0.12, 0.47]], 0.13, blade, 0.012));
          beater.add(holder);
        }
      }
      pivot.add(beater);
      return { spinner: beater, axis: 'x' };
    }
    case 'shell': {
      // A heavy shell ring around the whole robot, centered on the hull rather than the nose.
      const ring = new THREE.Group();
      ring.position.set(0, 0, -spec.length / 2);
      const radius = Math.hypot(spec.width / 2 + spec.trackWidth, spec.length / 2) + 0.14;
      const band = new THREE.Mesh(
        smoothed(new THREE.LatheGeometry([[radius - 0.09, -0.15], [radius + 0.06, -0.15], [radius + 0.12, -0.05], [radius + 0.12, 0.05], [radius + 0.06, 0.15], [radius - 0.09, 0.15], [radius - 0.09, -0.15]].map(([r, h]) => new THREE.Vector2(r, h)), 40), 0.5),
        steel,
      );
      band.castShadow = true;
      ring.add(band);
      for (const end of [-1, 1]) {
        const tooth = topOn(end > 0 ? [[radius, -0.26], [radius + 0.28, -0.14], [radius + 0.22, 0.26], [radius, 0.26]] : [[-radius, 0.26], [-radius - 0.28, 0.14], [-radius - 0.22, -0.26], [-radius, -0.26]], 0.26, blade, 0.02);
        ring.add(tooth);
      }
      ring.add(box(radius * 2, 0.06, 0.2, dark));
      pivot.add(ring);
      return { spinner: ring, axis: 'y' };
    }
    case 'hammersaw': {
      // A swinging arm with a guarded circular saw on the end.
      swingMount(pivot, 0.32);
      pivot.add(sideOn([[0, -0.08], [0.7, -0.07], [1.5, -0.05], [1.5, 0.08], [0.7, 0.1], [0, 0.1]], 0.13, steel, 0.018));
      piston(pivot, [0, -0.3, -0.05], [0, -0.04, 0.75], 0.05);
      const guard = new THREE.Shape();
      guard.moveTo(1.5 - 0.72, 0);
      guard.absarc(1.5, -0.08, 0.72, Math.PI, 0.2, true);
      guard.lineTo(1.5 + 0.56, 0.05);
      guard.absarc(1.5, -0.08, 0.58, 0.2, Math.PI, false);
      pivot.add(sideOn(guard, 0.1, dark, 0.008, 12));
      const saw = sawOnHub('x', 0.56, 0.05, 14, 0.12, 5);
      saw.position.set(0, -0.08, 1.5);
      pivot.add(saw);
      return { spinner: saw, axis: 'x' };
    }
    case 'flipper': {
      // A wedge plate on a hinge, stiffened with ribs, fired by two pneumatic rams underneath.
      const w = spec.width * 0.42;
      const tilt = new THREE.Group();
      tilt.rotation.x = 0.1;
      tilt.position.y = -0.14;
      tilt.add(topOn([[-w, 0], [w, 0], [w, 0.95], [w * 0.82, 1.26], [-w * 0.82, 1.26], [-w, 0.95]], 0.07, steel, 0.015));
      for (const side of [-1, 0, 1]) {
        const rib = sideOn([[0.02, 0.03], [1.05, 0.03], [0.02, 0.1]], 0.05, dark, 0.008);
        rib.position.x = side * w * 0.6;
        tilt.add(rib);
      }
      const lip = topOn([[-w * 0.8, 1.14], [w * 0.8, 1.14], [w * 0.8, 1.26], [-w * 0.8, 1.26]], 0.085, blade, 0.012);
      tilt.add(lip);
      pivot.add(tilt);
      pivot.add(axle(0.07, w * 2, dark, -0.1, 0.02));
      for (const side of [-1, 1]) piston(pivot, [side * w * 0.45, -0.28, 0.02], [side * w * 0.45, -0.2, 0.7], 0.06);
      return { spinner: null, axis: 'x' };
    }
    case 'crusher': {
      // A hooked beak driven by one big hydraulic ram, closing onto a low forked jaw.
      pivot.add(sideOn([[-0.08, -0.18], [0.46, -0.18], [0.5, 0.05], [0.28, 0.3], [-0.08, 0.3]], 0.44, dark, 0.03));
      const beak = new THREE.Shape();
      beak.moveTo(0.2, 0.2);
      beak.quadraticCurveTo(0.9, 0.82, 1.55, 0.42);
      beak.quadraticCurveTo(1.72, 0.2, 1.62, -0.14);
      beak.quadraticCurveTo(1.4, 0.2, 1.05, 0.28);
      beak.quadraticCurveTo(0.6, 0.3, 0.3, 0.02);
      pivot.add(sideOn(beak, 0.18, steel, 0.025, 10));
      pivot.add(sideOn([[1.38, 0.33], [1.56, 0.42], [1.72, 0.2], [1.62, -0.14], [1.4, 0.2]], 0.1, blade, 0.018));
      piston(pivot, [0, 0.42, -0.1], [0, 0.42, 0.68], 0.09);
      for (const side of [-1, 1]) {
        const tine = topOn([[side * 0.2, 0.3], [side * 0.34, 0.3], [side * 0.34, 1.5], [side * 0.26, 1.72]], 0.08, steel, 0.015);
        tine.position.y = -0.2;
        pivot.add(tine);
      }
      return { spinner: null, axis: 'x' };
    }
    case 'forks': {
      // A forklift's mast and carriage, with two L-shaped tines tapering to a point.
      for (const side of [-1, 1]) {
        pivot.add(box(0.09, 0.62, 0.1, dark, side * spec.width * 0.34, 0.08, 0.03));
        const tine = sideOn([[0, -0.2], [1.3, -0.24], [1.52, -0.25], [1.3, -0.18], [0.1, -0.13], [0.06, 0.32], [-0.03, 0.32]], 0.17, steel, 0.012);
        tine.position.x = side * spec.width * 0.25;
        pivot.add(tine);
      }
      pivot.add(box(spec.width * 0.72, 0.1, 0.07, dark, 0, 0.27, 0.05), box(spec.width * 0.72, 0.1, 0.07, dark, 0, -0.1, 0.05));
      piston(pivot, [0, -0.2, -0.04], [0, 0.34, -0.04], 0.05);
      return { spinner: null, axis: 'x' };
    }
  }
}

/** Only gear that does its work out at the front or sides gets a model, which keeps the deck clear. */
function buildDefenseGear(root: THREE.Group, id: DefenseId, deckY: number, spec: HullSpec): THREE.Group | null {
  const front = spec.length / 2;
  switch (id) {
    case 'steelram': {
      // A chamfered slab of armour with a raised rib across it.
      const w = (spec.width + 0.4) / 2;
      const ram = frontOn([[-w, -0.24], [-w, 0.22], [-w + 0.2, 0.38], [w - 0.2, 0.38], [w, 0.22], [w, -0.24], [w - 0.2, -0.38], [-w + 0.2, -0.38]], 0.16, steel, 0.03);
      ram.position.set(0, deckY - spec.height * 0.45, front + 0.12);
      root.add(ram);
      root.add(box(w * 1.7, 0.1, 0.07, dark, 0, deckY - spec.height * 0.45, front + 0.22));
      break;
    }
    case 'plow': {
      // A curved blade that rolls whatever it meets up and away.
      const curve = new THREE.Shape();
      curve.moveTo(0.34, 0.02);
      curve.lineTo(0.5, 0.03);
      curve.quadraticCurveTo(0.2, 0.2, 0.24, 0.62);
      curve.lineTo(0.14, 0.62);
      curve.quadraticCurveTo(0.08, 0.24, 0.34, 0.02);
      const plow = sideOn(curve, spec.width + 0.55, blade, 0.012, 8);
      plow.position.z = front;
      root.add(plow);
      for (const side of [-1, 1]) root.add(rod([side * spec.width * 0.34, spec.wheelRadius, front - 0.1], [side * spec.width * 0.34, 0.4, front + 0.24], 0.05, dark, 10));
      break;
    }
    case 'blades': {
      const group = new THREE.Group();
      group.position.y = deckY - spec.height * 0.5;
      for (const side of [-1, 1]) {
        const saw = sawOnHub('x', 0.5, 0.04, 10, 0.1, 3);
        saw.position.x = side * (spec.width / 2 + spec.trackWidth + 0.1);
        group.add(saw);
      }
      root.add(group);
      return group;
    }
    case 'cutter': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.hypot(spec.width / 2 + spec.trackWidth, spec.length / 2) + 0.1, 0.06, 8, 32), blade);
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
  const gunSpinner = buildTurret(turretPivot, build.turret, headMaterial);
  root.add(turretPivot);

  const meleePivot = new THREE.Group();
  meleePivot.position.set(0, deckY - spec.height * 0.45, build.rearMelee ? -spec.length / 2 : spec.length / 2);
  if (build.rearMelee) meleePivot.rotation.y = Math.PI;
  const { spinner, axis, chain = null } = buildMelee(meleePivot, build.melee, spec);
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
    gunSpinner,
    chain,
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
