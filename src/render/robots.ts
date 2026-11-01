import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { decodeSkin, ERASED, SKIN_PANELS, SKIN_SIZE, type PanelId } from '../game/skin';
import { DEFAULT_PAINT, MELEE, PAINT_COLORS, type BodyId, type ChassisId, type DefenseId, type MeleeId, type Paint, type PatternId, type TowerId, type WheelsId } from '../sim/data';

export interface RobotBuild {
  chassis: ChassisId;
  melee: MeleeId;
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
  /** Runs a chainsaw's teeth around its bar. */
  chain: ((travel: number) => void) | null;
  /** Runs tank tracks around their wheels. Null on anything with tyres. */
  tread: ((travel: number) => void) | null;
  meleePivot: THREE.Group;
  /** Where the weapon sits when nothing is moving it. */
  meleeRest: THREE.Vector3;
  /** How open a gripping weapon is right now, eased from frame to frame. */
  grip: number;
  /** Moves the parts of a weapon that work on their own, such as a claw's talons. */
  animate: ((pose: WeaponParts) => void) | null;
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
  /** Where a flame starts, as a height and a distance out from the middle of the robot. */
  muzzle: { height: number; reach: number };
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
const glowGreen = new THREE.MeshStandardMaterial({ color: 0x8ff0a0, emissive: 0x1fbf4a, emissiveIntensity: 1.3 });
const glowViolet = new THREE.MeshStandardMaterial({ color: 0xc9a2ff, emissive: 0x7a2fe8, emissiveIntensity: 1.5 });
const glowWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 1.4 });
const oilBlack = new THREE.MeshStandardMaterial({ color: 0x0b0b10, metalness: 0.9, roughness: 0.2 });
const oilTip = new THREE.MeshStandardMaterial({ color: 0xf06a24, metalness: 0.4, roughness: 0.4 });
const glueTank = new THREE.MeshStandardMaterial({ color: 0xc99a2e, metalness: 0.15, roughness: 0.4 });
const glueTip = new THREE.MeshStandardMaterial({ color: 0xffdb3a, metalness: 0.2, roughness: 0.35 });
const tyreBlock = new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.1, roughness: 0.95 });
const trackLink = new THREE.MeshStandardMaterial({ color: 0x34383d, metalness: 0.7, roughness: 0.6 });
const shared = new Set<THREE.Material>([steel, dark, blade, hot, copper, paintRed, warhead, glowBlue, glowRed, glowGreen, glowViolet, glowWhite, oilBlack, oilTip, glueTank, glueTip, tyreBlock, trackLink]);

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
  // Chunky tread blocks, staggered across the tyre, which also show it turning.
  const lugs: THREE.BufferGeometry[] = [];
  const lugCount = 16;
  for (let i = 0; i < lugCount; i++) {
    const a = (i / lugCount) * Math.PI * 2;
    const lug = new THREE.BoxGeometry(radius * 0.12, width * 0.46, radius * 0.2);
    lug.rotateY(-a);
    lug.translate(Math.cos(a) * radius, (i % 2 ? 1 : -1) * width * 0.24, Math.sin(a) * radius);
    lugs.push(lug);
  }
  tyre.add(new THREE.Mesh(mergeGeometries(lugs), tyreBlock));
  for (const lug of lugs) lug.dispose();
  // A dished steel rim with a dark centre and a ring of bolts.
  tyre.add(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.03, 20), steel));
  tyre.add(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.36, width + 0.07, 16), dark));
  const bolts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const bolt = new THREE.CylinderGeometry(radius * 0.055, radius * 0.055, width + 0.075, 6);
    bolt.translate(Math.cos(a) * radius * 0.44, 0, Math.sin(a) * radius * 0.44);
    bolts.push(bolt);
  }
  tyre.add(new THREE.Mesh(mergeGeometries(bolts), blade));
  for (const bolt of bolts) bolt.dispose();
  root.add(tyre);
  wheels.push(tyre);
}

/** A wheel inside a track. A sprocket has teeth that mesh with the links. */
function addTrackWheel(root: THREE.Group, wheels: THREE.Mesh[], radius: number, width: number, x: number, y: number, z: number, teeth: number): void {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), steel);
  wheel.castShadow = true;
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, y, z);
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, width + 0.05, 6)];
  for (let i = 0; i < 6; i++) {
    // Holes around the rim, so the turning shows.
    const a = (i / 6) * Math.PI * 2;
    const hole = new THREE.CylinderGeometry(radius * 0.13, radius * 0.13, width + 0.02, 8);
    hole.translate(Math.cos(a) * radius * 0.68, 0, Math.sin(a) * radius * 0.68);
    parts.push(hole);
  }
  wheel.add(new THREE.Mesh(mergeGeometries(parts), dark));
  for (const part of parts) part.dispose();
  if (teeth > 0) {
    const cogs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const cog = new THREE.BoxGeometry(radius * 0.26, width * 0.5, radius * 0.24);
      cog.rotateY(-a);
      cog.translate(Math.cos(a) * radius * 1.06, 0, Math.sin(a) * radius * 1.06);
      cogs.push(cog);
    }
    wheel.add(new THREE.Mesh(mergeGeometries(cogs), blade));
    for (const cog of cogs) cog.dispose();
  }
  root.add(wheel);
  wheels.push(wheel);
}

/** How far apart the links of a track sit. */
const TRACK_PITCH = 0.17;
/** From the belt's line to the outside of a link, tread included. */
const LINK_DEPTH = 0.06;

/**
 * A tank track on one side: a driven sprocket at the back, an idler at the front, road wheels between
 * them, and links that really run around all of it. Returns what moves the links along.
 */
function addTrack(root: THREE.Group, wheels: THREE.Mesh[], s: HullSpec, x: number): (travel: number) => void {
  const outer = s.wheelRadius * 0.92;
  const bend = outer - LINK_DEPTH;
  const run = s.length * 0.475 - outer;
  const width = s.trackWidth;

  addTrackWheel(root, wheels, bend - 0.03, width * 0.62, x, outer, -run, 8);
  addTrackWheel(root, wheels, bend - 0.03, width * 0.62, x, outer, run, 0);
  const roadRadius = bend * 0.66;
  for (let i = 0; i < s.wheelCount; i++) {
    const z = ((i + 0.5) / s.wheelCount - 0.5) * (run * 2 - bend);
    addTrackWheel(root, wheels, roadRadius, width * 0.7, x, roadRadius + LINK_DEPTH + 0.025, z, 0);
  }

  // A steel frame carrying the wheels, and a mudguard over the top run with its ends bent down.
  root.add(box(width * 0.3, outer * 0.62, run * 2, dark, x, outer * 1.02, 0));
  const guardY = outer * 2 + 0.03;
  root.add(box(width + 0.05, 0.03, run * 2 + 0.1, steel, x, guardY, 0));
  for (const end of [-1, 1]) {
    const lip = box(width + 0.05, 0.03, outer * 0.62, steel, x, guardY - outer * 0.15, end * (run + 0.05 + outer * 0.27));
    lip.rotation.x = end * 0.55;
    root.add(lip);
  }

  const parts = [
    new THREE.BoxGeometry(width, 0.035, TRACK_PITCH * 0.84),
    // The bar that grips the floor.
    new THREE.BoxGeometry(width * 0.94, 0.035, TRACK_PITCH * 0.26).translate(0, 0.03, 0),
    // The horn that runs between the wheels and keeps it on them.
    new THREE.BoxGeometry(width * 0.14, 0.05, TRACK_PITCH * 0.34).translate(0, -0.04, 0),
  ];
  const perimeter = run * 4 + Math.PI * 2 * bend;
  const count = Math.round(perimeter / TRACK_PITCH);
  const links = new THREE.InstancedMesh(mergeGeometries(parts), trackLink, count);
  for (const part of parts) part.dispose();
  links.castShadow = true;
  links.frustumCulled = false;
  const dummy = new THREE.Object3D();
  dummy.position.x = x;
  const straight = run * 2;
  const arc = Math.PI * bend;
  const tread = (travel: number) => {
    for (let i = 0; i < count; i++) {
      let d = ((travel + (i / count) * perimeter) % perimeter + perimeter) % perimeter;
      let z: number;
      let angle: number;
      // Along the floor to the back, up around the sprocket, over the top, and down around the idler.
      if (d < straight) {
        z = run - d;
        angle = Math.PI;
      } else if ((d -= straight) < arc) {
        z = -run;
        angle = Math.PI + d / bend;
      } else if ((d -= arc) < straight) {
        z = -run + d;
        angle = 0;
      } else {
        d -= straight;
        z = run;
        angle = d / bend;
      }
      dummy.position.y = outer + Math.cos(angle) * bend;
      dummy.position.z = z + Math.sin(angle) * bend;
      dummy.rotation.x = angle;
      dummy.updateMatrix();
      links.setMatrixAt(i, dummy.matrix);
    }
    links.instanceMatrix.needsUpdate = true;
  };
  tread(0);
  root.add(links);
  return tread;
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

function buildHull(root: THREE.Group, id: ChassisId, body: BodyId, paint: THREE.Material, trim: THREE.Material, wheels: THREE.Mesh[], treads: ((travel: number) => void)[], look: WheelsId): number {
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
      treads.push(addTrack(root, wheels, s, x));
    }
  }

  root.add(hullBody(s, body, paint, baseY));

  // A low steel wedge along the floor gets under the other robot, as the real ones do.
  const scoopWidth = (s.width * s.taper + 0.1) / 2;
  const scoop = new THREE.Group();
  scoop.position.set(0, 0.17, s.length / 2 + 0.2);
  scoop.rotation.x = 0.42;
  scoop.add(topOn([[-scoopWidth, -0.31], [scoopWidth, -0.31], [scoopWidth, 0.1], [scoopWidth - 0.14, 0.31], [-scoopWidth + 0.14, 0.31], [-scoopWidth, 0.1]], 0.05, steel, 0.012));
  // A hardened edge along the front, and ribs behind it.
  scoop.add(topOn([[-scoopWidth + 0.14, 0.2], [scoopWidth - 0.14, 0.2], [scoopWidth - 0.14, 0.33], [-scoopWidth + 0.14, 0.33]], 0.055, blade, 0.01));
  for (const side of [-1, 0, 1]) scoop.add(box(0.07, 0.035, 0.42, dark, side * scoopWidth * 0.62, 0.035, -0.08));
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

/** The tower is a low armoured drum with a hatch and a sensor mast. */
function buildTower(pivot: THREE.Group, head: THREE.Material): void {
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.5, 0.26, ROUND_SIDES * 2), head);
  tower.position.y = 0.13;
  tower.castShadow = true;
  pivot.add(tower);
  const y = 0.26;
  pivot.add(turned([[0, 0], [0.24, 0], [0.26, 0.02], [0.24, 0.06], [0, 0.07]], dark, 0, y));
  pivot.add(box(0.2, 0.025, 0.04, steel, 0, y + 0.08, -0.08));
  pivot.add(rod([0.2, y - 0.02, -0.18], [0.2, y + 0.42, -0.2], 0.012, steel, 6));
  pivot.add(turned([[0, -0.025], [0.022, 0], [0, 0.025]], glowRed, y + 0.44, -0.2, 0.2, 8));
}

interface BuiltMelee {
  spinner: THREE.Object3D | null;
  axis: 'x' | 'y' | 'z';
  /** Runs a chainsaw's teeth around its bar. */
  chain?: (travel: number) => void;
  animate?: (pose: WeaponParts) => void;
}

/** What a weapon's own moving parts go by. */
export interface WeaponParts {
  /** 1 is wide open or lowered, and 0 is shut on something or lifted. */
  grip: number;
  active: boolean;
  time: number;
  /** Seconds since it last struck. */
  swing: number;
  /** How fast the robot is rolling forward, from 0 to 1. */
  speed: number;
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

/** Where gun-style weapons bolt onto the tower, and how far they stand above it, both in the tower's own size. */
const TOWER_MOUNTS: Partial<Record<MeleeId, { y: number; z: number; top: number; muzzle: number }>> = {
  flamethrower: { y: 0.34, z: 0.06, top: 0.25, muzzle: 1.5 },
  tesla: { y: 0.3, z: -0.28, top: 1, muzzle: 0 },
  spear: { y: 0.36, z: 0.08, top: 0.25, muzzle: 1.75 },
};

/** How far a Pneumatic Spear's spike shoots out, and how long it takes to come back. */
const SPEAR_THRUST = 1.5;
const SPEAR_RETURN = 0.28;

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
    case 'flamethrower':
      // A nozzle flaring at the end of a pipe, with a fuel line and a pilot light beneath it.
      pivot.add(sideOn([[-0.08, -0.14], [0.2, -0.1], [0.24, 0.1], [-0.08, 0.14]], 0.34, dark, 0.02));
      // Closed at both ends, with a shallow bore inside the mouth, or you'd see straight through it.
      pivot.add(turned([[0, 0], [0.09, 0], [0.09, 1.15], [0.11, 1.22], [0.19, 1.45], [0.19, 1.5], [0.13, 1.5], [0.08, 1.34], [0, 1.34]], dark, 0, 0.06));
      pivot.add(turned([[0.12, 0.28], [0.12, 0.36], [0, 0.36]], steel, 0, 0.06), turned([[0.12, 0.8], [0.12, 0.88], [0, 0.88]], steel, 0, 0.06));
      pivot.add(tube([[0.15, -0.06, -0.05], [0.15, -0.05, 0.5], [0.05, -0.04, 1.1]], 0.022, copper, false, 12));
      {
        const pilot = turned([[0, -0.06], [0.03, -0.06], [0.03, 0.02], [0.016, 0.08], [0, 0.1]], hot, 1.38, 0.06);
        pivot.add(pilot);
        return {
          spinner: null,
          axis: 'x',
          animate: ({ active, time }) => {
            // The pilot light flickers, and roars when the fuel is on.
            const flicker = 1 + Math.sin(time * 31) * 0.14 + Math.sin(time * 47) * 0.1;
            pilot.scale.set(flicker * (active ? 1.9 : 1), flicker * (active ? 1.9 : 1), flicker * (active ? 2.4 : 1));
          },
        };
      }
    case 'tesla': {
      // An insulated stack on the nose, with a polished ring on top.
      pivot.add(turned([[0, 0], [0.24, 0], [0.18, 0.08], [0.18, 0.2], [0, 0.2]], dark, 0.28, 0));
      const stack = new THREE.Group();
      stack.position.set(0, 0.2, 0.28);
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.02, 0.035, 8, ROUND_SIDES), copper);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = i * 0.09;
        stack.add(ring);
      }
      const post = cylinder(0.07, 0.46, steel);
      post.position.y = 0.2;
      stack.add(post);
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.07, 10, ROUND_SIDES), glowBlue);
      crown.rotation.x = Math.PI / 2;
      crown.position.y = 0.46;
      stack.add(crown);
      pivot.add(stack);
      return {
        spinner: stack,
        axis: 'y',
        animate: ({ swing, time }) => {
          // The crown swells as the bolt goes, and hums a little the rest of the time.
          const kick = Math.exp(-swing * 7);
          const size = 1 + kick * 0.5 + Math.sin(time * 9) * 0.03;
          crown.scale.set(size, size, 1 + kick * 0.3);
          crown.position.y = 0.46 + kick * 0.09;
        },
      };
    }
    case 'spear':
      // A pneumatic cylinder with a long barbed spike that fires out of it.
      pivot.add(turned([[0, -0.1], [0.18, -0.1], [0.2, -0.06], [0.2, 0.42], [0.15, 0.46], [0, 0.46]], dark));
      {
        // It telescopes: a sleeve comes part of the way, and the spike runs out through it.
        const sleeve = turned([[0.1, -0.08], [0.1, 0.92], [0.08, 0.95], [0, 0.95]], dark);
        pivot.add(sleeve);
        const spike = new THREE.Group();
        spike.add(turned([[0.06, -0.1], [0.06, 1.25], [0, 1.27]], steel));
        spike.add(topOn([[0, 1.75], [0.13, 1.25], [0.05, 1.3], [0.04, 1.2], [-0.04, 1.2], [-0.05, 1.3], [-0.13, 1.25]], 0.03, blade, 0.006));
        pivot.add(spike);
        return {
          spinner: null,
          axis: 'x',
          animate: ({ swing }) => {
            const out = Math.max(0, 1 - swing / SPEAR_RETURN) * SPEAR_THRUST;
            spike.position.z = out;
            sleeve.position.z = out * 0.35;
          },
        };
      }
    case 'dagger': {
      // A mount and crossguard, then a long double-edged spike with a dark fuller down the middle.
      pivot.add(sideOn([[-0.08, -0.14], [0.2, -0.1], [0.24, 0.1], [-0.08, 0.14]], 0.3, dark, 0.02));
      const spike = new THREE.Group();
      spike.add(rod([-0.28, 0, 0.26], [0.28, 0, 0.26], 0.05, steel, 12));
      spike.add(topOn([[-0.16, 0.26], [0.16, 0.26], [0.13, 1.1], [0, 1.72], [-0.13, 1.1]], 0.05, blade, 0.022));
      const fuller = topOn([[-0.035, 0.3], [0.035, 0.3], [0.02, 1.1], [-0.02, 1.1]], 0.075, dark, 0);
      spike.add(fuller);
      pivot.add(spike);
      // Sprung, so it pushes out as the robot charges. Reach in the rules doesn't change.
      return {
        spinner: null,
        axis: 'x',
        animate: ({ speed }) => {
          spike.position.z = speed * 0.2 - 0.1;
        },
      };
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
      const hinges: { hinge: THREE.Group; side: number }[] = [];
      for (const side of [-1, 1]) {
        const talon = new THREE.Shape();
        talon.moveTo(side * 0.32, 0.12);
        talon.quadraticCurveTo(side * 1.12, 0.72, side * 0.14, 1.58);
        talon.quadraticCurveTo(side * 0.66, 0.82, side * 0.2, 0.36);
        // Each talon turns on its own pin, so its parts are placed around that.
        const hinge = new THREE.Group();
        hinge.position.set(side * 0.3, 0, 0.22);
        const arm = new THREE.Group();
        arm.position.set(side * -0.3, 0, -0.22);
        arm.add(topOn(talon, 0.15, steel, 0.035, 12));
        arm.add(topOn(side > 0 ? [[0.14, 1.58], [0.34, 1.26], [0.26, 1.2]] : [[-0.14, 1.58], [-0.34, 1.26], [-0.26, 1.2]], 0.1, blade, 0.02));
        piston(arm, [side * 0.12, 0.14, 0.05], [side * 0.62, 0.14, 0.62], 0.04);
        hinge.add(arm);
        pivot.add(hinge);
        pivot.add(rod([side * 0.3, -0.1, 0.22], [side * 0.3, 0.1, 0.22], 0.07, blade, 12));
        hinges.push({ hinge, side });
      }
      return {
        spinner: null,
        axis: 'x',
        animate: ({ grip }) => {
          for (const { hinge, side } of hinges) hinge.rotation.y = side * grip * 0.62;
        },
      };
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
      // Rings of force drawn in toward the poles while it's on.
      const rings: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.022, 6, 28), glowRed);
        ring.visible = false;
        rings.push(ring);
        pivot.add(ring);
      }
      return {
        spinner: null,
        axis: 'x',
        animate: ({ active, time }) => {
          rings.forEach((ring, i) => {
            ring.visible = active;
            if (!active) return;
            const t = (time * 1.5 + i / rings.length) % 1;
            ring.position.z = 3.5 - t * 2.3;
            ring.scale.setScalar(1.7 - t);
          });
        },
      };
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
      // The whole upper jaw swings on a pin at the back of the block.
      const hinge = new THREE.Group();
      hinge.position.set(0, 0.2, 0.2);
      const jaw = new THREE.Group();
      jaw.position.set(0, -0.2, -0.2);
      jaw.add(sideOn(beak, 0.18, steel, 0.025, 10));
      jaw.add(sideOn([[1.38, 0.33], [1.56, 0.42], [1.72, 0.2], [1.62, -0.14], [1.4, 0.2]], 0.1, blade, 0.018));
      piston(jaw, [0, 0.42, -0.1], [0, 0.42, 0.68], 0.09);
      hinge.add(jaw);
      pivot.add(hinge);
      pivot.add(axle(0.07, 0.5, blade, 0.2, 0.2));
      for (const side of [-1, 1]) {
        const tine = topOn([[side * 0.2, 0.3], [side * 0.34, 0.3], [side * 0.34, 1.5], [side * 0.26, 1.72]], 0.08, steel, 0.015);
        tine.position.y = -0.2;
        pivot.add(tine);
      }
      return {
        spinner: null,
        axis: 'x',
        animate: ({ grip, active, time }) => {
          // Shut on something, the jaw keeps grinding down.
          hinge.rotation.x = -grip * 0.62 - (active ? (Math.sin(time * 26) + 1) * 0.025 : 0);
        },
      };
    }
    case 'forks': {
      // A forklift's mast and carriage, with two L-shaped tines tapering to a point.
      // Only the carriage rides up the mast, tilting back so a load stays on.
      const carriage = new THREE.Group();
      for (const side of [-1, 1]) {
        pivot.add(box(0.09, 0.62, 0.1, dark, side * spec.width * 0.34, 0.08, 0.03));
        const tine = sideOn([[0, -0.2], [1.3, -0.24], [1.52, -0.25], [1.3, -0.18], [0.1, -0.13], [0.06, 0.32], [-0.03, 0.32]], 0.17, steel, 0.012);
        tine.position.x = side * spec.width * 0.25;
        carriage.add(tine);
      }
      carriage.add(box(spec.width * 0.72, 0.1, 0.07, dark, 0, 0.27, 0.05), box(spec.width * 0.72, 0.1, 0.07, dark, 0, -0.1, 0.05));
      pivot.add(carriage);
      piston(pivot, [0, -0.2, -0.04], [0, 0.34, -0.04], 0.05);
      return {
        spinner: null,
        axis: 'x',
        animate: ({ grip }) => {
          carriage.position.y = (1 - grip) * 0.4;
          carriage.rotation.x = (1 - grip) * -0.16;
        },
      };
    }
  }
}

/**
 * Only gear that does its work out at the ends or sides gets a model, which keeps the deck clear.
 * It's all drawn at the nose, and the caller turns it to the side opposite the main weapon.
 */
function placed(mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  mesh.position.set(x, y, z);
  return mesh;
}

/** A vertical ring, or with `across` one that wraps around a bar running side to side. */
function ring(radius: number, thick: number, mat: THREE.Material, x: number, y: number, z: number, across = false): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thick, 8, ROUND_SIDES), mat);
  mesh.rotation[across ? 'y' : 'x'] = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** A bar running side to side. */
function crossBar(r: number, length: number, mat: THREE.Material, y: number, z: number): THREE.Mesh {
  const mesh = cylinder(r, length, mat);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(0, y, z);
  return mesh;
}

function ball(r: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, ROUND_SIDES, 10), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** A tank across the back with a coloured nozzle at each end, pointing down at the floor it's about to coat. */
function spreader(root: THREE.Group, y: number, back: number, width: number, tank: THREE.Material, tip: THREE.Material): void {
  root.add(crossBar(0.16, width, tank, y, back + 0.2));
  for (const side of [-1, 1]) {
    const x = side * width * 0.36;
    const band = cylinder(0.175, 0.05, steel);
    band.rotation.z = Math.PI / 2;
    root.add(placed(band, x, y, back + 0.2));
    root.add(rod([x, y - 0.06, back + 0.26], [x, y - 0.2, back + 0.42], 0.04, dark, 10));
    const nozzle = turned([[0, 0], [0.05, 0], [0.11, 0.13], [0.11, 0.16], [0.06, 0.16], [0, 0.1]], tip, back + 0.4, y - 0.22, x);
    root.add(nozzle);
  }
  root.add(placed(cylinder(0.05, 0.08, steel), 0, y + 0.18, back + 0.2));
}

/** Where gear on the tower goes: behind and to one side, clear of a gun on top of it and of the mast. */
const TOWER_SPOT = { x: -0.38, y: 0.2, z: 0.05 };

/**
 * Whatever a defense shows on the robot. Anything big goes on a shelf behind the hull, with `+z` here
 * facing away from the main weapon, because only the tower stands above the deck.
 */
function buildDefenseGear(root: THREE.Group, tower: THREE.Group, id: DefenseId, deckY: number, spec: HullSpec): THREE.Group | null {
  const front = spec.length / 2;
  const y = deckY - spec.height * 0.45;
  const shelfWidth = spec.width * 0.62;
  const shelf = () => {
    root.add(box(shelfWidth, 0.05, 0.5, dark, 0, y - 0.15, front + 0.22));
    for (const side of [-1, 1]) root.add(rod([side * shelfWidth * 0.4, y + 0.02, front + 0.01], [side * shelfWidth * 0.4, y - 0.14, front + 0.12], 0.03, steel, 8));
  };
  const onShelf = y - 0.125;
  const middle = front + 0.24;
  const { x: tx, y: ty, z: tz } = TOWER_SPOT;
  switch (id) {
    case 'shield': {
      // A glowing emitter ring around the tower.
      tower.add(ring(0.45, 0.022, glowBlue, 0, 0.09, 0));
      break;
    }
    case 'mines': {
      // A rack of them, stacked ready to drop, with a red arming light on each.
      shelf();
      for (const side of [-1, 1]) {
        for (const z of [-0.2, 0.2]) root.add(placed(cylinder(0.018, 0.34, steel, 8), side * 0.2, onShelf + 0.17, middle + z));
      }
      for (let i = 0; i < 3; i++) {
        const level = onShelf + 0.05 + i * 0.1;
        root.add(placed(cylinder(0.17, 0.07, dark), 0, level, middle));
        root.add(placed(cylinder(0.05, 0.03, i === 2 ? glowRed : warhead), 0, level + 0.045, middle));
      }
      break;
    }
    case 'oil':
      spreader(root, y, front, shelfWidth, oilBlack, oilTip);
      break;
    case 'glue':
      spreader(root, y, front, shelfWidth, glueTank, glueTip);
      break;
    case 'nails': {
      // A funnel of nails with the points sticking out of the top, and a spout to pour them through.
      shelf();
      const funnel = cone(0.24, 0.3, paintRed);
      funnel.rotation.x = Math.PI;
      root.add(placed(funnel, 0, onShelf + 0.17, middle));
      root.add(ring(0.24, 0.02, steel, 0, onShelf + 0.32, middle));
      for (const side of [-1, 1]) root.add(rod([side * 0.2, onShelf, middle], [side * 0.2, onShelf + 0.32, middle], 0.018, steel, 8));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = i === 0 ? 0 : 0.14;
        const nail = cone(0.022, 0.2, blade, 4);
        nail.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
        root.add(placed(nail, Math.cos(a) * r, onShelf + 0.43, middle + Math.sin(a) * r));
      }
      root.add(rod([0, onShelf + 0.04, middle + 0.24], [0, onShelf - 0.14, middle + 0.4], 0.045, paintRed, 10));
      root.add(rod([0, onShelf + 0.03, middle], [0, onShelf + 0.03, middle + 0.24], 0.04, paintRed, 10));
      break;
    }
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
    case 'teleport': {
      // An antenna on the tower, with rings stacked up it and a charged ball on top.
      tower.add(rod([tx, ty, tz], [tx, ty + 0.72, tz], 0.018, steel, 8));
      for (let i = 0; i < 3; i++) tower.add(ring(0.085 - i * 0.018, 0.016, glowViolet, tx, ty + 0.24 + i * 0.16, tz));
      tower.add(ball(0.055, glowViolet, tx, ty + 0.75, tz));
      break;
    }
    case 'flash': {
      // A big strobe in a hooded cup, up where it can be seen from every side.
      tower.add(placed(cylinder(0.11, 0.1, dark), tx, ty + 0.06, tz));
      tower.add(ball(0.095, glowWhite, tx, ty + 0.14, tz));
      tower.add(ring(0.105, 0.016, steel, tx, ty + 0.13, tz));
      break;
    }
    case 'regen': {
      // Two glowing cells of repair goo, held in a steel cradle.
      shelf();
      for (const side of [-1, 1]) {
        const x = side * 0.14;
        root.add(placed(cylinder(0.085, 0.3, glowGreen), x, onShelf + 0.16, middle));
        for (const level of [0.015, 0.31]) root.add(placed(cylinder(0.1, 0.03, steel), x, onShelf + level, middle));
      }
      root.add(box(0.46, 0.05, 0.04, dark, 0, onShelf + 0.16, middle + 0.1));
      break;
    }
    case 'cloak': {
      // Dark vanes either side of the tower, each with a violet seam.
      for (const side of [-1, 1]) {
        const vane = box(0.03, 0.26, 0.42, dark, side * 0.47, 0.18, 0);
        vane.rotation.z = side * -0.32;
        tower.add(vane);
        const seam = box(0.012, 0.035, 0.36, glowViolet, side * 0.495, 0.18, 0);
        seam.rotation.z = side * -0.32;
        tower.add(seam);
      }
      break;
    }
    case 'emp': {
      // A fat coil of copper across the back, charged up at both ends.
      shelf();
      const coilY = onShelf + 0.17;
      root.add(crossBar(0.09, shelfWidth * 0.9, steel, coilY, middle));
      const wound = shelfWidth * 0.34;
      for (let i = 0; i <= 8; i++) root.add(ring(0.13, 0.032, copper, -wound + (i / 8) * wound * 2, coilY, middle, true));
      for (const side of [-1, 1]) root.add(ball(0.075, glowBlue, side * shelfWidth * 0.46, coilY, middle));
      break;
    }
    case 'minibot': {
      // The little robot itself, riding on the back until it's sent out.
      shelf();
      const hullY = onShelf + 0.12;
      root.add(box(0.3, 0.1, 0.4, warhead, 0, hullY, middle));
      root.add(placed(cylinder(0.07, 0.07, dark), 0, hullY + 0.08, middle - 0.04));
      root.add(ball(0.028, glowRed, 0, hullY + 0.03, middle + 0.2));
      root.add(rod([0.05, hullY + 0.1, middle - 0.08], [0.05, hullY + 0.26, middle - 0.1], 0.008, steel, 6));
      for (const side of [-1, 1]) {
        for (const z of [-0.13, 0.13]) {
          const wheel = cylinder(0.07, 0.05, dark);
          wheel.rotation.z = Math.PI / 2;
          root.add(placed(wheel, side * 0.18, onShelf + 0.07, middle + z));
        }
      }
      break;
    }
    case 'remote': {
      // Sticks of charge, strapped in a row and wired to a little receiver with a blinking light.
      shelf();
      for (let i = -1; i <= 1; i++) root.add(placed(cylinder(0.06, 0.28, paintRed), i * 0.14, onShelf + 0.14, middle));
      root.add(box(0.46, 0.04, 0.14, dark, 0, onShelf + 0.17, middle));
      root.add(box(0.14, 0.1, 0.1, steel, 0.31, onShelf + 0.05, middle));
      root.add(rod([0.31, onShelf + 0.1, middle], [0.31, onShelf + 0.34, middle], 0.01, steel, 6));
      root.add(ball(0.025, glowRed, 0.31, onShelf + 0.35, middle));
      root.add(tube([[0.13, onShelf + 0.26, middle], [0.22, onShelf + 0.2, middle + 0.06], [0.28, onShelf + 0.08, middle]], 0.01, copper, false, 10));
      break;
    }
    case 'kamikaze': {
      // Exactly what it looks like: a big round bomb with the fuse already lit.
      shelf();
      const bombY = onShelf + 0.25;
      root.add(ball(0.25, oilBlack, 0, bombY, middle));
      root.add(ring(0.245, 0.018, warhead, 0, bombY, middle));
      root.add(placed(cylinder(0.05, 0.05, steel), 0, bombY + 0.26, middle));
      root.add(tube([[0, bombY + 0.28, middle], [0.04, bombY + 0.38, middle + 0.02], [0.1, bombY + 0.42, middle + 0.03]], 0.012, copper, false, 10));
      root.add(ball(0.035, glowRed, 0.1, bombY + 0.43, middle + 0.03));
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
  const treads: ((travel: number) => void)[] = [];
  const deckY = buildHull(root, build.chassis, paint.body, hullMaterial, trim, wheels, treads, build.wheels ?? 'large4');
  const spec = HULLS[build.chassis];

  const towerPivot = new THREE.Group();
  // Set back on the deck, leaving the nose clear for the main weapon.
  const towerScale = TOWER_SCALE[build.tower ?? 'medium'];
  const towerZ = -spec.length * 0.14;
  towerPivot.position.set(0, towerSeat(spec, paint.body, towerZ, 0.35 * towerScale), towerZ);
  towerPivot.scale.setScalar(towerScale);
  buildTower(towerPivot, headMaterial);
  root.add(towerPivot);

  const meleePivot = new THREE.Group();
  const facing = build.rearMelee ? -1 : 1;
  const mount = MELEE[build.melee].onTower ? TOWER_MOUNTS[build.melee] : undefined;
  if (mount) meleePivot.position.set(0, mount.y, facing * mount.z);
  else meleePivot.position.set(0, deckY - spec.height * 0.45, facing * spec.length / 2);
  if (build.rearMelee) meleePivot.rotation.y = Math.PI;
  const { spinner, axis, chain = null, animate = null } = buildMelee(meleePivot, build.melee, spec);
  (mount ? towerPivot : root).add(meleePivot);

  const gear = new THREE.Group();
  const towerGear = new THREE.Group();
  if (!build.rearMelee) {
    gear.rotation.y = Math.PI;
    towerGear.rotation.y = Math.PI;
  }
  const blades = buildDefenseGear(gear, towerGear, build.defense, deckY, spec);
  root.add(gear);
  towerPivot.add(towerGear);

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
    chain,
    tread: treads.length ? (travel) => treads.forEach((run) => run(travel)) : null,
    meleePivot,
    meleeRest: meleePivot.position.clone(),
    grip: 1,
    animate,
    spinner,
    spinAxis: axis,
    blades,
    wheels,
    shield,
    hullMaterial,
    materials,
    plates,
    baseColors: materials.map((m) => m.color.clone()),
    rollHeight: towerPivot.position.y + (0.3 + (mount?.top ?? 0)) * towerScale,
    muzzle: mount
      ? { height: towerPivot.position.y + (mount.y + 0.06) * towerScale, reach: facing * towerZ + (mount.z + mount.muzzle) * towerScale }
      : { height: 1.2, reach: spec.length / 2 + 0.7 },
  };
}

/** What decides how a weapon looks at this moment, all of which online clients know too. */
export interface WeaponState {
  windingUp: boolean;
  /** Seconds since it last struck. */
  swing: number;
  active: boolean;
  /** The key is down, whether or not it has anything to do. */
  pressed: boolean;
  cooling: boolean;
  lunging: boolean;
  /** The chassis's radius, which is where a ram rests. */
  radius: number;
  rear: boolean;
  /** How fast the robot is rolling forward, from 0 to 1. */
  speed: number;
  time: number;
}

/** Puts a weapon's moving parts where they should be. The match and the workshop preview both use this. */
export function poseWeapon(model: RobotModel, id: MeleeId, state: WeaponState, dt: number): void {
  const melee = MELEE[id];
  const pivot = model.meleePivot;
  if (id === 'flipper') {
    // The plate snaps up as it fires, then settles back down.
    const up = state.swing < 0.18 ? -1 : 0;
    pivot.rotation.x += (up - pivot.rotation.x) * Math.min(1, dt * (state.swing < 0.18 ? 45 : 6));
  } else if (melee.kind === 'strike' && !melee.chain && id !== 'spear') {
    // Raise during the windup, slam on the strike, then ease back to rest.
    const raised = state.windingUp ? -1.15 : -0.3;
    const slam = state.swing < 0.1 ? 0.25 : raised;
    pivot.rotation.x += (slam - pivot.rotation.x) * Math.min(1, dt * (state.swing < 0.1 ? 60 : 24));
  } else if (id === 'ram') {
    const reach = state.radius * 0.8 + (state.lunging ? 0.5 : 0);
    pivot.position.z = state.rear ? -reach : reach;
  }

  if (melee.kind === 'claw') {
    // Open and ready, half open while it recharges, and snapping at the air if the key's down with nothing to grab.
    const snapping = state.pressed && !state.active && !state.cooling;
    const target = state.active ? 0 : snapping ? 0.5 + Math.sin(state.time * 16) * 0.5 : state.cooling ? 0.45 : 1;
    model.grip += (target - model.grip) * Math.min(1, dt * (target < model.grip ? 26 : 5));
  }

  // Motors shake the whole weapon while they run.
  const running = state.active && (melee.kind === 'held' || melee.kind === 'magnet') && !melee.passive;
  pivot.position.y = model.meleeRest.y + (running ? Math.sin(state.time * 95) * 0.014 : 0);

  model.animate?.({ grip: model.grip, active: state.active, time: state.time, swing: state.swing, speed: state.speed });
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
