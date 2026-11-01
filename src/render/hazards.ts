import * as THREE from 'three';
import {
  BALL_RADIUS,
  ballHeight,
  ballPos,
  HAMMER_WARN,
  hammerClock,
  PISTON_REACH,
  pistonExtension,
  trapdoorAmount,
  trapdoorWarning,
  ventHeat,
  type ArenaDef,
  type Circle,
  type Rect,
} from '../sim/arena';
import { addMerged, buildSaw, canvasTexture, DANGER, hazardTexture, logoTexture, placedBox, sequence, type GlowBatch } from './arenaScene';

/** How a map's holes are dressed. They all still glow the colour of danger at the rim. */
export type HoleLook = 'shaft' | 'lava' | 'rock' | 'ice' | 'sea';

type P = [number, number];

/** Runs every frame with the match's clock, which all of these hazards are timed by. */
type Sync = (time: number) => void;

/** A circle as a closed path around the floor. */
export function circlePath(c: Circle, steps = 48): P[] {
  const points: P[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    points.push([c.x + Math.cos(a) * c.r, c.z + Math.sin(a) * c.r]);
  }
  return points;
}

/** A rectangle as a closed path, with enough points along each side to roughen. */
export function rectPath(r: Rect, step = 1.2): P[] {
  const points: P[] = [];
  const x0 = r.x - r.w / 2;
  const x1 = r.x + r.w / 2;
  const z0 = r.z - r.d / 2;
  const z1 = r.z + r.d / 2;
  const side = (ax: number, az: number, bx: number, bz: number) => {
    const count = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let i = 0; i < count; i++) points.push([ax + ((bx - ax) * i) / count, az + ((bz - az) * i) / count]);
  };
  side(x0, z0, x1, z0);
  side(x1, z0, x1, z1);
  side(x1, z1, x0, z1);
  side(x0, z1, x0, z0);
  return points;
}

/** The floor's outline as a closed path. */
export function deckPath(def: ArenaDef): P[] {
  const { half } = def;
  if (def.shape === 'round') return circlePath({ x: 0, z: 0, r: half }, 96);
  if (def.shape === 'plus') {
    const a = def.arm!;
    return [[a, half], [-a, half], [-a, a], [-half, a], [-half, -a], [-a, -a], [-a, -half], [a, -half], [a, -a], [half, -a], [half, a], [a, a]];
  }
  return [[half, half], [-half, half], [-half, -half], [half, -half]];
}

/** The floor, as one sheet with real holes cut in it. */
export function floorGeometry(def: ArenaDef): THREE.BufferGeometry {
  const toShape = (points: P[]) => points.map(([x, z]) => new THREE.Vector2(x, -z));
  const outline = new THREE.Shape(toShape(deckPath(def)));
  const holes = [
    ...def.pits.map((c) => circlePath(c)),
    ...def.trapdoors.map((c) => circlePath(c)),
    ...def.firePits.map((c) => circlePath(c)),
    ...def.chasms.map((c) => rectPath(c)),
  ];
  for (const hole of holes) outline.holes.push(new THREE.Path(toShape(hole)));
  const geometry = new THREE.ShapeGeometry(outline, 48);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const size = def.half * 2;
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / size + 0.5, position.getY(i) / size + 0.5);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** A wall hanging from a closed path: a shaft going down, or a glow standing up from a rim. `u` runs around it in map units. */
export function wallAround(points: P[], top: number, bottom: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  let run = 0;
  for (let i = 0; i <= points.length; i++) {
    const [x, z] = points[i % points.length];
    if (i > 0) {
      const [px, pz] = points[i - 1];
      run += Math.hypot(x - px, z - pz);
    }
    positions.push(x, top, z, x, bottom, z);
    uvs.push(run, 1, run, 0);
    if (i < points.length) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A flat band around the outside of a closed path. `rough` breaks up its outer edge, for rock and ice. */
function rimAround(points: P[], width: number, y: number, rough = 0): THREE.BufferGeometry {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cz = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const rand = sequence(Math.floor(Math.abs(cx * 31 + cz * 17)) + 5);
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  let run = 0;
  const count = points.length;
  const first = rough ? 1 + (rand() - 0.5) * rough : 1;
  for (let i = 0; i <= count; i++) {
    const [x, z] = points[i % count];
    const [ax, az] = points[(i - 1 + count) % count];
    const [bx, bz] = points[(i + 1) % count];
    let nx = bz - az;
    let nz = ax - bx;
    const length = Math.hypot(nx, nz) || 1;
    nx /= length;
    nz /= length;
    // Pointing away from the middle, whichever way round the path happens to run.
    if (nx * (x - cx) + nz * (z - cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    if (i > 0) run += Math.hypot(x - ax, z - az);
    // The join has to close, so the last point reuses the first one's roughness.
    const out = width * (rough ? (i === count ? first : i === 0 ? first : 1 + (rand() - 0.5) * rough) : 1);
    positions.push(x, y, z, x + nx * out, y, z + nz * out);
    uvs.push(run / 2, 1, run / 2, 0);
    if (i < count) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function flatFill(points: P[], y: number): THREE.BufferGeometry {
  const geometry = new THREE.ShapeGeometry(new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z))), 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

/** Fades from solid at the bottom to nothing at the top, for a glow standing up from a rim. */
let sharedRise: THREE.CanvasTexture | null = null;
function riseTexture(): THREE.CanvasTexture {
  if (sharedRise) return sharedRise;
  sharedRise = canvasTexture(4, 64, (g) => {
    const fade = g.createLinearGradient(0, 64, 0, 0);
    fade.addColorStop(0, 'rgba(255,255,255,1)');
    fade.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    fade.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 4, 64);
  });
  return sharedRise;
}

/** What a hole's walls look like, from its lip at the top of the picture down into the dark. */
function wallTexture(look: HoleLook): THREE.CanvasTexture {
  const rand = sequence(look.length * 13 + 3);
  const texture = canvasTexture(128, 256, (g) => {
    if (look === 'rock') {
      let y = 0;
      while (y < 256) {
        const band = 6 + rand() * 26;
        const light = 0.7 + rand() * 0.4;
        g.fillStyle = `rgb(${158 * light},${94 * light},${60 * light})`;
        g.fillRect(0, y, 128, band);
        y += band;
      }
    } else if (look === 'ice') {
      const ice = g.createLinearGradient(0, 0, 0, 256);
      ice.addColorStop(0, '#d8f2ff');
      ice.addColorStop(0.35, '#5fb0d8');
      ice.addColorStop(1, '#06202e');
      g.fillStyle = ice;
      g.fillRect(0, 0, 128, 256);
    } else if (look === 'lava') {
      g.fillStyle = '#2a1712';
      g.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = '#17100d';
        g.fillRect(0, i * 44, 128, 3);
      }
    } else {
      g.fillStyle = '#34383d';
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = '#1b1d20';
      for (let i = 0; i < 2; i++) g.fillRect(i * 64, 0, 3, 256);
      for (let i = 1; i < 6; i++) g.fillRect(0, i * 44, 128, 3);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 1; i < 6; i++) g.fillRect(0, i * 44 + 3, 128, 1);
    }
    // Darkening with depth, so it reads as deep however far down the walls actually go.
    const dark = g.createLinearGradient(0, 0, 0, 256);
    dark.addColorStop(0, 'rgba(0,0,0,0)');
    dark.addColorStop(look === 'rock' ? 0.4 : 0.6, 'rgba(0,0,0,0.85)');
    dark.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = dark;
    g.fillRect(0, 0, 128, 256);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(0.25, 1);
  return texture;
}

/** Molten steel: bright cracks between plates of cooling crust. */
let sharedLava: THREE.CanvasTexture | null = null;
function lavaTexture(): THREE.CanvasTexture {
  if (sharedLava) return sharedLava;
  const rand = sequence(808);
  sharedLava = canvasTexture(256, 256, (g) => {
    const size = 256;
    g.fillStyle = '#ffb030';
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 60; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 12 + rand() * 26;
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        const crust = g.createRadialGradient(x + ox, y + oy, r * 0.3, x + ox, y + oy, r);
        crust.addColorStop(0, 'rgba(70,16,6,0.95)');
        crust.addColorStop(0.75, 'rgba(150,34,6,0.7)');
        crust.addColorStop(1, 'rgba(255,90,10,0)');
        g.fillStyle = crust;
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  sharedLava.wrapS = sharedLava.wrapT = THREE.RepeatWrapping;
  return sharedLava;
}

/** Heavy bars, with the gaps left clear. */
function grateTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#26211e';
    g.fillRect(0, 0, 64, 12);
    g.fillRect(0, 0, 12, 64);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(0, 0, 64, 2);
    g.fillRect(0, 0, 2, 64);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** A trapdoor's steel leaf: riveted plate, with warning paint around the edge. */
function doorTexture(): THREE.CanvasTexture {
  const stripes = 16;
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#3b3f45';
    g.fillRect(0, 0, 256, 256);
    g.save();
    g.translate(128, 128);
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#ff7f3f' : '#141516';
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, 128, (i / stripes) * Math.PI * 2, ((i + 1) / stripes) * Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#3b3f45';
    g.beginPath();
    g.arc(0, 0, 108, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#23262a';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * 98, Math.sin(a) * 98, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });
}

/** Pale fractures spreading from the middle, for ice about to give way. */
function crackTexture(): THREE.CanvasTexture {
  const rand = sequence(61);
  return canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = '#ecfaff';
    g.lineCap = 'round';
    const crack = (x: number, y: number, a: number, depth: number) => {
      const length = 22 + rand() * 26;
      const ex = x + Math.cos(a) * length;
      const ey = y + Math.sin(a) * length;
      g.lineWidth = 1 + depth * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(ex, ey);
      g.stroke();
      if (depth <= 0) return;
      crack(ex, ey, a + (rand() - 0.5) * 0.8, depth - 1);
      if (rand() < 0.55) crack(ex, ey, a + (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.6), depth - 1);
    };
    for (let i = 0; i < 9; i++) crack(128, 128, (i / 9) * Math.PI * 2 + rand() * 0.3, 3);
  });
}

const flatMat = (options: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, ...options });

interface HoleOptions {
  look: HoleLook;
  depth: number;
  /** Where the walls start. Trapdoors leave room above for their leaves to slide. */
  top?: number;
}

/** Everything down a hole, and the rim around it. Returns the material of the glow standing up from its rim. */
function addHole(scene: THREE.Scene, points: P[], { look, depth, top = 0 }: HoleOptions, syncs: Sync[]): THREE.MeshBasicMaterial {
  scene.add(new THREE.Mesh(wallAround(points, top, -depth), new THREE.MeshBasicMaterial({ map: wallTexture(look), side: THREE.DoubleSide, fog: false, toneMapped: false })));

  // What's at the bottom. The sea has no floor, because the real sea is down there.
  if (look === 'lava') {
    const map = lavaTexture().clone();
    map.needsUpdate = true;
    const pool = new THREE.Mesh(flatFill(points, -0.7), flatMat({ map }));
    const uv = pool.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.12, uv.getY(i) * 0.12);
    scene.add(pool);
    syncs.push((time) => {
      map.offset.set(time * 0.012, time * 0.02);
      const hot = 0.85 + Math.sin(time * 2.1) * 0.1 + Math.sin(time * 5.3) * 0.05;
      (pool.material as THREE.MeshBasicMaterial).color.setRGB(hot, hot, hot);
    });
  } else if (look === 'ice') {
    const water = flatMat({ color: 0x03121c });
    scene.add(new THREE.Mesh(flatFill(points, -1.6), water));
    syncs.push((time) => water.color.setRGB(0.01, 0.07 + Math.sin(time * 1.4) * 0.015, 0.11 + Math.sin(time * 1.4) * 0.02));
  } else if (look !== 'sea') {
    // A dull red far below, so it looks bottomless rather than painted black.
    const glow = flatMat({ color: look === 'rock' ? 0x0c0403 : 0x1c0502 });
    scene.add(new THREE.Mesh(flatFill(points, -depth), glow));
    syncs.push((time) => {
      const beat = 0.5 + Math.sin(time * 1.6) * 0.5;
      if (look === 'rock') glow.color.setRGB(0.05 + beat * 0.02, 0.02, 0.015);
      else glow.color.setRGB(0.3 + beat * 0.3, 0.03 + beat * 0.03, 0.01);
    });
  }

  // A hot line just inside the lip, on every map, so anything lethal reads the same.
  scene.add(new THREE.Mesh(wallAround(points, top - 0.01, top - 0.28), flatMat({ color: DANGER, side: THREE.DoubleSide })));
  const rise = flatMat({ map: riseTexture(), color: DANGER, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(wallAround(points, 1.1, 0), rise));
  return rise;
}

/** The band around a hole, on the floor. */
function addRim(scene: THREE.Scene, points: P[], look: HoleLook, width: number): void {
  const y = 0.03;
  if (look === 'rock' || look === 'ice') {
    // Broken edges rather than anything made.
    const material = new THREE.MeshStandardMaterial({ color: look === 'rock' ? 0x5a3a26 : 0x7fa8c0, roughness: look === 'rock' ? 1 : 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const rim = new THREE.Mesh(rimAround(points, width, y, 0.9), material);
    rim.receiveShadow = true;
    scene.add(rim);
    return;
  }
  const map = hazardTexture();
  const rim = new THREE.Mesh(rimAround(points, width, y), new THREE.MeshStandardMaterial({ map, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  rim.receiveShadow = true;
  scene.add(rim);
}

/** Loose rocks along a chasm's edge, small enough to drive over without looking wrong. */
function addRubble(scene: THREE.Scene, points: P[]): void {
  const rand = sequence(Math.floor(Math.abs(points[0][0] * 7 + points[0][1] * 13)) + 9);
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z] of points) {
    if (rand() > 0.55) continue;
    const size = 0.12 + rand() * 0.2;
    parts.push(new THREE.DodecahedronGeometry(size, 0).rotateY(rand() * 6).translate(x + (rand() - 0.5) * 1.2, size * 0.5, z + (rand() - 0.5) * 1.2));
  }
  if (parts.length) addMerged(scene, parts, new THREE.MeshStandardMaterial({ color: 0x6e4a32, roughness: 1, flatShading: true })).castShadow = true;
}

function addTrapdoor(scene: THREE.Scene, door: ArenaDef['trapdoors'][number], def: ArenaDef, look: HoleLook, syncs: Sync[]): void {
  const points = circlePath(door);
  const rise = addHole(scene, points, { look, depth: look === 'sea' ? 1.6 : 22, top: -0.08 }, syncs);
  addRim(scene, points, look, look === 'ice' ? 0.35 : 0.6);

  if (look === 'ice') {
    // Thin ice: plates that break apart and sink, then rise and freeze over again.
    const count = 7;
    const material = new THREE.MeshStandardMaterial({ color: 0x48687f, roughness: 0.42, metalness: 0.2, transparent: true });
    const plates: { mesh: THREE.Mesh; tilt: number }[] = [];
    for (let i = 0; i < count; i++) {
      const a0 = (i / count) * Math.PI * 2;
      const a1 = ((i + 1) / count) * Math.PI * 2;
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), ...Array.from({ length: 7 }, (_, k) => {
        const a = a0 + ((a1 - a0) * k) / 6;
        return new THREE.Vector2(Math.cos(a) * door.r, -Math.sin(a) * door.r);
      })]);
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), material);
      mesh.position.set(door.x, -0.02, door.z);
      mesh.receiveShadow = true;
      scene.add(mesh);
      plates.push({ mesh, tilt: i % 2 ? 0.18 : -0.14 });
    }
    const cracks = new THREE.Mesh(
      new THREE.PlaneGeometry(door.r * 2.1, door.r * 2.1).rotateX(-Math.PI / 2),
      flatMat({ map: crackTexture(), transparent: true, opacity: 0, depthWrite: false }),
    );
    cracks.position.set(door.x, 0.05, door.z);
    scene.add(cracks);
    syncs.push((time) => {
      const moved = trapdoorAmount(door, time);
      const warn = trapdoorWarning(door, time);
      (cracks.material as THREE.MeshBasicMaterial).opacity = moved > 0 ? 0 : warn;
      material.opacity = 1 - moved * 0.75;
      plates.forEach(({ mesh, tilt }, i) => {
        mesh.position.y = -0.02 - moved * (1.1 + i * 0.08);
        mesh.rotation.z = tilt * moved;
        // A shiver as it starts to go.
        mesh.position.x = door.x + (moved === 0 ? Math.sin(time * 41 + i) * 0.02 * warn : 0);
      });
      rise.opacity = warn * (moved > 0 ? 0.7 : 0.35 + Math.sin(time * 14) * 0.2);
    });
    return;
  }

  // Two leaves that slide away under the floor, which hides them as they go.
  const logoHere = Math.hypot(def.logo.x - door.x, def.logo.z - door.z) < 1;
  const plate = new THREE.MeshStandardMaterial({ map: doorTexture(), metalness: 0.5, roughness: 0.55 });
  const leaves: { group: THREE.Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    // The world's x runs along the shape's x, so each half is one side of the seam.
    shape.absarc(0, 0, door.r, side > 0 ? -Math.PI / 2 : Math.PI / 2, side > 0 ? Math.PI / 2 : Math.PI * 1.5, false);
    const geometry = new THREE.ShapeGeometry(shape, 28);
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / (door.r * 2) + 0.5, position.getY(i) / (door.r * 2) + 0.5);
    const group = new THREE.Group();
    const leaf = new THREE.Mesh(geometry.clone().rotateX(-Math.PI / 2), plate);
    leaf.receiveShadow = true;
    group.add(leaf);
    if (logoHere) {
      const scale = door.r / def.logo.r;
      const mapped = geometry.clone();
      const logoUv = mapped.getAttribute('uv');
      for (let i = 0; i < position.count; i++) logoUv.setXY(i, (position.getX(i) / (door.r * 2)) * scale + 0.5, (position.getY(i) / (door.r * 2)) * scale + 0.5);
      const paint = new THREE.Mesh(mapped.rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: logoTexture(), transparent: true, opacity: 0.85, depthWrite: false, roughness: 0.8 }));
      paint.position.y = 0.012;
      group.add(paint);
    }
    group.position.set(door.x, -0.04, door.z);
    scene.add(group);
    leaves.push({ group, side });
  }
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.1, door.r * 2).rotateX(-Math.PI / 2), flatMat({ color: DANGER, transparent: true, opacity: 0 }));
  seam.position.set(door.x, 0.0, door.z);
  scene.add(seam);
  syncs.push((time) => {
    const moved = trapdoorAmount(door, time);
    const warn = trapdoorWarning(door, time);
    for (const { group, side } of leaves) group.position.x = door.x + side * moved * (door.r + 0.2);
    // It flashes faster as the moment gets closer, and the line down the middle lights up.
    const flash = warn > 0 && moved === 0 ? 0.5 + Math.sin(time * (8 + warn * 16)) * 0.5 : 0;
    rise.opacity = moved > 0 ? 0.75 : warn > 0 ? 0.2 + flash * 0.75 : 0.12;
    (seam.material as THREE.MeshBasicMaterial).opacity = moved > 0 ? 0 : flash;
  });
}

/** A grate with fire under it, and a column of flame when it erupts. */
function addVent(scene: THREE.Scene, vent: ArenaDef['firePits'][number], syncs: Sync[]): void {
  const points = circlePath(vent);
  const rise = addHole(scene, points, { look: 'lava', depth: 1.4 }, syncs);
  rise.color.set(0xff7a1a);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x241d1a, metalness: 0.5, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  scene.add(new THREE.Mesh(rimAround(points, 0.55, 0.03), rimMat));
  const grate = grateTexture();
  grate.repeat.set(vent.r * 1.1, vent.r * 1.1);
  const bars = new THREE.Mesh(new THREE.CircleGeometry(vent.r, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grate, alphaTest: 0.5, metalness: 0.5, roughness: 0.7 }));
  bars.position.set(vent.x, -0.02, vent.z);
  bars.receiveShadow = true;
  scene.add(bars);
  // Flame as tapering cones of light, a wide one and a hot core, which costs almost nothing and reads from every side.
  const flameMat = flatMat({ map: riseTexture(), color: 0xff6a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const coreMat = flatMat({ map: riseTexture(), color: 0xffd080, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(vent.r * 0.08, vent.r * 0.88, 9, 18, 1, true).translate(0, 4.5, 0), flameMat);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(vent.r * 0.04, vent.r * 0.5, 6.5, 14, 1, true).translate(0, 3.25, 0), coreMat);
  flame.add(outer, core);
  flame.position.set(vent.x, 0, vent.z);
  flame.visible = false;
  scene.add(flame);
  syncs.push((time) => {
    const heat = ventHeat(vent, time);
    rise.opacity = 0.2 + heat * 0.75 + Math.sin(time * 9 + vent.x) * 0.05;
    const roaring = heat >= 1;
    flame.visible = roaring;
    if (!roaring) return;
    flameMat.opacity = 0.62 + Math.sin(time * 33) * 0.16;
    coreMat.opacity = 0.7 + Math.sin(time * 41) * 0.2;
    flame.scale.y = 0.88 + Math.sin(time * 21) * 0.14;
    flame.rotation.y = time * 2.4;
  });
}

/** Whatever lethal thing the map has in the way of round holes. */
function addPit(scene: THREE.Scene, pit: Circle, look: HoleLook, syncs: Sync[]): void {
  const points = circlePath(pit);
  const rise = addHole(scene, points, { look, depth: look === 'lava' ? 1.4 : 26 }, syncs);
  addRim(scene, points, look, look === 'ice' ? 0.35 : 0.6);
  syncs.push((time) => {
    rise.opacity = 0.42 + Math.sin(time * 2.4 + pit.x) * 0.14;
  });
}

function addChasm(scene: THREE.Scene, chasm: Rect, syncs: Sync[]): void {
  const points = rectPath(chasm);
  const rise = addHole(scene, points, { look: 'rock', depth: 34 }, syncs);
  addRim(scene, points, 'rock', 0.7);
  addRubble(scene, points);
  // Dust hanging partway down, which is what gives a real drop its depth.
  const mist = new THREE.Mesh(flatFill(points, -16), flatMat({ color: 0xc88a60, transparent: true, opacity: 0.12, depthWrite: false }));
  scene.add(mist);
  syncs.push((time) => {
    rise.opacity = 0.2 + Math.sin(time * 2 + chasm.z) * 0.06;
  });
}

function chevronTexture(ink: string, paper: string): THREE.CanvasTexture {
  const texture = canvasTexture(128, 128, (g) => {
    g.fillStyle = paper;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = ink;
    for (const y of [-64, 0, 64]) {
      g.beginPath();
      g.moveTo(0, y + 64);
      g.lineTo(64, y);
      g.lineTo(128, y + 64);
      g.lineTo(128, y + 100);
      g.lineTo(64, y + 36);
      g.lineTo(0, y + 100);
      g.fill();
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** A belt with chevrons that really run the way it carries you, between two steel rails. */
function addConveyor(scene: THREE.Scene, belt: ArenaDef['conveyors'][number], syncs: Sync[]): void {
  const map = chevronTexture('#c8a01a', '#1e2023');
  const tile = 3.5;
  const alongX = belt.dirX !== 0;
  const length = alongX ? belt.w : belt.d;
  const width = alongX ? belt.d : belt.w;
  map.repeat.set(width / tile, length / tile);
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.75, metalness: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2), material);
  const heading = Math.atan2(belt.dirX, belt.dirZ);
  surface.rotation.y = heading + Math.PI;
  surface.position.set(belt.x, 0.022, belt.z);
  surface.receiveShadow = true;
  scene.add(surface);
  const rails: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    rails.push(alongX ? placedBox(belt.w + 0.4, 0.16, 0.22, belt.x, 0.08, belt.z + (side * belt.d) / 2) : placedBox(0.22, 0.16, belt.d + 0.4, belt.x + (side * belt.w) / 2, 0.08, belt.z));
  }
  addMerged(scene, rails, new THREE.MeshStandardMaterial({ color: 0x4a4e52, metalness: 0.7, roughness: 0.4 })).castShadow = true;
  syncs.push((time) => {
    map.offset.y = (time * belt.speed) / tile;
  });
}

/** A low steel ramp with arrows, ready to throw anything that drives up it. */
function addLauncher(scene: THREE.Scene, ramp: ArenaDef['launchers'][number], syncs: Sync[]): void {
  const map = chevronTexture('#ffb03a', '#26231f');
  map.repeat.set(1, 1.4);
  const size = ramp.r * 2;
  const heading = Math.atan2(ramp.dirX, ramp.dirZ);
  const group = new THREE.Group();
  group.position.set(ramp.x, 0, ramp.z);
  group.rotation.y = heading;
  // Rising toward the far end.
  const shape = new THREE.Shape([new THREE.Vector2(-ramp.r, 0.02), new THREE.Vector2(ramp.r, 0.02), new THREE.Vector2(ramp.r, 0.5)]);
  const wedge = new THREE.ExtrudeGeometry(shape, { depth: size, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(ramp.r, 0, 0);
  group.add(new THREE.Mesh(wedge, new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.6, roughness: 0.5 })));
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(size, Math.hypot(size, 0.48)), new THREE.MeshStandardMaterial({ map, roughness: 0.6 }));
  deck.rotation.x = -Math.PI / 2 - Math.atan2(0.48, size);
  deck.position.set(0, 0.27, 0);
  group.add(deck);
  scene.add(group);
  syncs.push((time) => {
    // The arrows run up it, faster than anything else on the map, so it looks loaded.
    map.offset.y = -time * 0.9;
  });
}

/** A drop hammer on a gantry, with the floor marked where it lands. */
function addHammer(scene: THREE.Scene, hammer: ArenaDef['hammers'][number], syncs: Sync[]): void {
  const top = 13;
  const span = hammer.r + 1.2;
  const steel = new THREE.MeshStandardMaterial({ color: 0x33373c, metalness: 0.7, roughness: 0.45 });
  const posts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) posts.push(placedBox(0.7, top + 2, 0.7, hammer.x + side * span, (top + 2) / 2, hammer.z));
  posts.push(placedBox(span * 2 + 0.7, 0.8, 1, hammer.x, top + 2, hammer.z));
  addMerged(scene, posts, steel).castShadow = true;

  // Where it lands: a dark striking plate with a warning ring, then a glow that fills in as it comes.
  const plate = new THREE.Mesh(new THREE.CircleGeometry(hammer.r, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.5, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  plate.position.set(hammer.x, 0.02, hammer.z);
  plate.receiveShadow = true;
  scene.add(plate);
  const ring = new THREE.Mesh(rimAround(circlePath({ x: hammer.x, z: hammer.z, r: hammer.r - 0.45 }), 0.45, 0.03), new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  scene.add(ring);
  const warnMat = flatMat({ color: DANGER, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const warning = new THREE.Mesh(new THREE.CircleGeometry(hammer.r - 0.5, 40).rotateX(-Math.PI / 2), warnMat);
  warning.position.set(hammer.x, 0.034, hammer.z);
  scene.add(warning);

  const head = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x3e4247, metalness: 0.8, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(hammer.r * 0.78, hammer.r * 0.86, 2.4, 28), iron);
  body.position.y = 1.2;
  body.castShadow = true;
  head.add(body);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(hammer.r * 0.72, hammer.r * 0.72, 0.3, 28), new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.9, roughness: 0.3 }));
  face.position.y = 0.1;
  head.add(face);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(hammer.r * 0.82, hammer.r * 0.82, 0.5, 28), new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 }));
  collar.position.y = 2.2;
  head.add(collar);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, top + 2, 14), new THREE.MeshStandardMaterial({ color: 0xc0c6cc, metalness: 0.9, roughness: 0.25 }));
  shaft.position.y = 2.4 + (top + 2) / 2;
  head.add(shaft);
  head.position.set(hammer.x, 0, hammer.z);
  scene.add(head);
  const raised = top - 4.6;
  syncs.push((time) => {
    const at = hammerClock(hammer, time);
    const before = hammer.period - at;
    let lift: number;
    if (at < 0.4) lift = 0;
    else if (before < 0.16) lift = (before / 0.16) ** 2;
    else if (at < 2.2) lift = ((at - 0.4) / 1.8) ** 1.5;
    else lift = 1;
    // It rears up a little just before it comes down.
    const rear = before < HAMMER_WARN && before >= 0.16 ? 0.05 * (1 - before / HAMMER_WARN) : 0;
    head.position.y = lift * raised + rear * raised;
    const warn = before < HAMMER_WARN ? 1 - before / HAMMER_WARN : 0;
    warnMat.opacity = at < 0.25 ? 0.9 * (1 - at / 0.25) : warn * (0.45 + Math.sin(time * (10 + warn * 22)) * 0.35);
  });
}

/** Saws set into a slot in the wall, with a warning strip on the floor in front of them. */
function addGrinder(scene: THREE.Scene, grinder: Rect, half: number, syncs: Sync[]): void {
  const alongX = grinder.w > grinder.d;
  const length = alongX ? grinder.w : grinder.d;
  const inward = alongX ? -Math.sign(grinder.z) : -Math.sign(grinder.x);
  const face = half - 0.02;
  const wallX = alongX ? grinder.x : Math.sign(grinder.x) * face;
  const wallZ = alongX ? Math.sign(grinder.z) * face : grinder.z;
  const slot = new THREE.Mesh(new THREE.PlaneGeometry(length, 2.2), flatMat({ color: 0x050506 }));
  slot.position.set(wallX + (alongX ? 0 : inward * 0.01), 1.1, wallZ + (alongX ? inward * 0.01 : 0));
  slot.rotation.y = alongX ? (inward > 0 ? 0 : Math.PI) : inward > 0 ? Math.PI / 2 : -Math.PI / 2;
  scene.add(slot);
  const blades: THREE.Group[] = [];
  const count = 4;
  for (let i = 0; i < count; i++) {
    const offset = ((i + 0.5) / count - 0.5) * length;
    const holder = new THREE.Group();
    holder.position.set(wallX + (alongX ? offset : inward * 0.05), 1.05, wallZ + (alongX ? inward * 0.05 : offset));
    // A saw's own axis is its local y, so this stands it up to face out of the wall.
    holder.rotation.set(alongX ? Math.PI / 2 : 0, 0, alongX ? 0 : Math.PI / 2);
    const blade = buildSaw();
    blade.scale.setScalar(0.72);
    holder.add(blade);
    scene.add(holder);
    blades.push(blade);
  }
  const strip = hazardTexture();
  strip.repeat.set(length / 3, 1);
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? length : 0.8, alongX ? 0.8 : length).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: strip, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  if (!alongX) (paint.geometry.getAttribute('uv') as THREE.BufferAttribute).applyMatrix3(new THREE.Matrix3().set(0, 1, 0, 1, 0, 0, 0, 0, 1));
  paint.position.set(alongX ? grinder.x : Math.sign(grinder.x) * (half - 1.7), 0.022, alongX ? Math.sign(grinder.z) * (half - 1.7) : grinder.z);
  scene.add(paint);
  syncs.push((time) => {
    for (const blade of blades) blade.rotation.y = time * 18;
  });
}

/** A ram in the wall. Its rod always ends at the wall, so it can't poke out behind, and it draws back before it fires. */
function addPiston(scene: THREE.Scene, piston: ArenaDef['pistons'][number], syncs: Sync[]): void {
  const heading = Math.atan2(piston.dirX, piston.dirZ);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xe8602a, metalness: 0.5, roughness: 0.45 });
  const rodMat = new THREE.MeshStandardMaterial({ color: 0xc0c6cc, metalness: 0.9, roughness: 0.25 });

  // The path it sweeps, painted on the floor.
  const lane = new THREE.MeshStandardMaterial({ color: 0xb8501c, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.34, PISTON_REACH + 1).rotateX(-Math.PI / 2), lane);
    strip.rotation.y = heading;
    const sideX = piston.dirZ * side * 2.7;
    const sideZ = -piston.dirX * side * 2.7;
    strip.position.set(piston.x + piston.dirX * (PISTON_REACH + 1) * 0.5 + sideX, 0.024, piston.z + piston.dirZ * (PISTON_REACH + 1) * 0.5 + sideZ);
    scene.add(strip);
  }

  const group = new THREE.Group();
  group.position.set(piston.x, 0, piston.z);
  group.rotation.y = heading;
  const head = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 1.2), headMat);
  head.position.set(0, 1.2, 0.6);
  head.castShadow = true;
  group.add(head);
  const hazard = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 }));
  hazard.position.set(0, 2.1, 1.21);
  group.add(hazard);
  // Built with its back end at the group's origin, then stretched to reach the wall.
  const rod = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), rodMat);
  rod.position.set(0, 1.2, 0);
  group.add(rod);
  const lamp = flatMat({ color: 0x441008 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lamp);
  bulb.position.set(0, 2.8, 0.4);
  group.add(bulb);
  scene.add(group);

  syncs.push((time) => {
    const extension = pistonExtension(piston, time);
    const until = (piston.period - ((time + piston.phase) % piston.period)) % piston.period;
    const warn = until < 0.9 && extension === 0;
    // Draws back into the wall as it charges, which is the warning.
    const back = warn ? (1 - until / 0.9) * 0.9 : 0;
    const reach = PISTON_REACH * extension - back;
    group.position.set(piston.x + piston.dirX * reach, 0, piston.z + piston.dirZ * reach);
    rod.scale.set(1, 1, Math.max(0.01, reach + 0.05));
    rod.position.z = -Math.max(0.01, reach + 0.05);
    if (warn) lamp.color.setRGB(Math.floor(time * 12) % 2 ? 1 : 0.2, 0.1, 0.03);
    else lamp.color.setRGB(extension > 0 ? 1 : 0.2, extension > 0 ? 0.3 : 0.05, 0.03);
  });
}

/** The ball and its cable, the crane that holds them, and the line it's about to come along. */
function addBall(scene: THREE.Scene, ball: ArenaDef['balls'][number], half: number, syncs: Sync[]): void {
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.75, roughness: 0.45 });
  const mesh = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 28, 20), iron);
  sphere.castShadow = true;
  mesh.add(sphere);
  const band = new THREE.Mesh(new THREE.TorusGeometry(BALL_RADIUS * 1.01, 0.16, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffb03a, roughness: 0.5 }));
  band.rotation.x = Math.PI / 2;
  mesh.add(band);
  scene.add(mesh);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 8), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 }));
  scene.add(cable);

  // A crane out past the deck's cut-away corner, well clear of any chase camera, reaching in over the middle.
  const foot = half * 0.82;
  const truss: THREE.BufferGeometry[] = [];
  const up = ball.height + 8;
  for (const [ox, oz] of [[1.5, 1.5], [1.5, -1.5], [-1.5, 1.5], [-1.5, -1.5]]) truss.push(placedBox(0.34, up + 36, 0.34, foot + ox, (up + 36) / 2 - 36, foot + oz));
  for (let y = -32; y < up; y += 4) {
    truss.push(placedBox(3.3, 0.2, 0.2, foot, y, foot + 1.5), placedBox(3.3, 0.2, 0.2, foot, y, foot - 1.5), placedBox(0.2, 0.2, 3.3, foot + 1.5, y, foot), placedBox(0.2, 0.2, 3.3, foot - 1.5, y, foot));
  }
  const boom = Math.hypot(foot, foot);
  truss.push(new THREE.BoxGeometry(0.8, 0.8, boom + 3).translate(0, 0, 0).rotateY(Math.PI / 4).translate(foot / 2, ball.height, foot / 2));
  truss.push(new THREE.BoxGeometry(1.2, 1.2, 1.2).translate(0, ball.height - 0.4, 0));
  addMerged(scene, truss, new THREE.MeshStandardMaterial({ color: 0xc89a2a, metalness: 0.4, roughness: 0.6 })).castShadow = true;

  // Its current line, drawn faintly on the deck, so the danger can be read before it arrives.
  const lineMat = flatMat({ color: DANGER, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ball.reach * 1.3, 0.28).rotateX(-Math.PI / 2), lineMat);
  line.position.y = 0.036;
  scene.add(line);

  const hang = new THREE.Vector3(0, ball.height, 0);
  const upAxis = new THREE.Vector3(0, 1, 0);
  const toHang = new THREE.Vector3();
  syncs.push((time) => {
    const at = ballPos(ball, time);
    const y = ballHeight(ball, at.along) + BALL_RADIUS;
    mesh.position.set(at.x, y, at.z);
    mesh.rotation.y = at.angle;
    mesh.rotation.z = -at.along * 0.03;
    toHang.subVectors(hang, mesh.position);
    const length = toHang.length();
    cable.scale.y = length;
    cable.position.copy(mesh.position).addScaledVector(toHang, 0.5);
    cable.quaternion.setFromUnitVectors(upAxis, toHang.normalize());
    line.rotation.y = -at.angle;
    lineMat.opacity = 0.2 + Math.max(0, 1 - Math.abs(at.along) / ball.reach) * 0.3;
  });
}

/** Timbers across a gap in a chasm, with rope either side, so it reads as the way over. */
export function addBridge(scene: THREE.Scene, bridge: Rect): void {
  const planks: THREE.BufferGeometry[] = [];
  const rand = sequence(Math.floor(Math.abs(bridge.x + bridge.z * 3)) + 2);
  const step = 0.72;
  for (let z = bridge.z - bridge.d / 2 + step / 2; z < bridge.z + bridge.d / 2; z += step) {
    planks.push(placedBox(bridge.w + 0.9 + rand() * 0.4, 0.05, step - 0.07, bridge.x + (rand() - 0.5) * 0.2, 0.024, z));
  }
  const wood = addMerged(scene, planks, new THREE.MeshStandardMaterial({ color: 0x6e4e30, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  wood.receiveShadow = true;
  const rope: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const edge = bridge.z + (side * bridge.d) / 2;
    for (const end of [-1, 1]) rope.push(new THREE.CylinderGeometry(0.1, 0.13, 1.3, 7).translate(bridge.x + (end * bridge.w) / 2 + end * 0.45, 0.65, edge));
    rope.push(placedBox(bridge.w + 0.9, 0.05, 0.05, bridge.x, 1.15, edge));
  }
  addMerged(scene, rope, new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 })).castShadow = true;
}

/** Everything on the map that can hurt or carry a robot. What it returns moves them all, by the match's clock. */
export function buildHazards(scene: THREE.Scene, def: ArenaDef, look: HoleLook, _glow: GlowBatch): Sync {
  const syncs: Sync[] = [];
  for (const pit of def.pits) addPit(scene, pit, look, syncs);
  for (const door of def.trapdoors) addTrapdoor(scene, door, def, look, syncs);
  for (const chasm of def.chasms) addChasm(scene, chasm, syncs);
  for (const vent of def.firePits) addVent(scene, vent, syncs);
  for (const belt of def.conveyors) addConveyor(scene, belt, syncs);
  for (const ramp of def.launchers) addLauncher(scene, ramp, syncs);
  for (const hammer of def.hammers) addHammer(scene, hammer, syncs);
  for (const grinder of def.grinders) addGrinder(scene, grinder, def.half, syncs);
  for (const piston of def.pistons) addPiston(scene, piston, syncs);
  for (const ball of def.balls) addBall(scene, ball, def.half, syncs);
  return (time) => {
    for (const sync of syncs) sync(time);
  };
}
