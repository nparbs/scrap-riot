export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** A round obstacle. Its look is just a prop, so it plays like any other pillar. */
export interface Pillar extends Circle {
  prop?: 'barrel' | 'pole';
}

/** A rectangular obstacle. Shots fly through fences, and everything else stops them. */
export interface Block {
  x: number;
  z: number;
  /** Size along x. */
  w: number;
  /** Size along z. */
  d: number;
  kind: 'fence' | 'bunker' | 'skylight' | 'shed';
}

export interface Saw {
  /** Which axis the saw slides along. */
  axis: 'x' | 'z';
  fixed: number;
  amplitude: number;
  speed: number;
  phase: number;
}

/** Floor coil that shocks and stuns anything on it while charged. */
export interface Shocker extends Circle {
  period: number;
  phase: number;
}

/** Wall ram that punches out on a timer, flinging robots in its direction. */
export interface Piston {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  period: number;
  phase: number;
}

/** Fixed flame turret that burns any robot that comes too close. */
export interface Sentry {
  x: number;
  z: number;
  range: number;
}

export interface Point {
  x: number;
  z: number;
}

export interface ArenaTheme {
  floor: number;
  wall: number;
  sky: number;
  fogNear: number;
  fogFar: number;
  light: number;
  sunIntensity: number;
  /** Scenery past the arena edge. */
  backdrop: 'stands' | 'city' | 'canyon' | 'foundry' | 'ice' | 'night';
}

export interface ArenaDef {
  id: ArenaId;
  name: string;
  blurb: string;
  half: number;
  /** Without walls, driving or being knocked past the edge destroys the robot. */
  walled: boolean;
  /** Below 1, robots slide around. */
  grip: number;
  wallHeight: number;
  pillars: Pillar[];
  blocks: Block[];
  saws: Saw[];
  /** Holes that destroy any robot falling in. */
  pits: Circle[];
  firePits: Circle[];
  shockers: Shocker[];
  pistons: Piston[];
  sentries: Sentry[];
  spawns: Point[];
  repairSpots: Point[];
  /** Scoring zone for King of the Hill. */
  hill: Circle;
  /** Where the game's logo is painted on the floor. */
  logo: Circle;
  theme: ArenaTheme;
}

export type ArenaId = 'skyscraper' | 'pit' | 'rooftop' | 'furnace' | 'canyon' | 'foundry' | 'glacier';

export const SAW_RADIUS = 1.7;
export const SAW_DPS = 30;
export const SAW_KNOCK = 14;
export const FIRE_DPS = 14;
export const SHOCK_DPS = 20;
export const SHOCK_STUN = 0.5;
export const SHOCK_ON = 1.2;
export const PISTON_REACH = 7;
export const PISTON_RADIUS = 3;
export const PISTON_FORCE = 32;
export const PISTON_DAMAGE = 12;
export const PISTON_ACTIVE = 0.35;
export const SENTRY_DPS = 12;

const ring = (d: number): Point[] => [
  { x: d, z: d }, { x: -d, z: -d }, { x: d, z: -d }, { x: -d, z: d },
  { x: 0, z: d + 1 }, { x: 0, z: -d - 1 }, { x: d + 1, z: 0 }, { x: -d - 1, z: 0 },
];

const cross = (d: number): Point[] => [
  { x: 0, z: 0 }, { x: d, z: 0 }, { x: -d, z: 0 }, { x: 0, z: d }, { x: 0, z: -d },
];

const EDGE = 30;
const FENCE = 0.4;

export const ARENAS: Record<ArenaId, ArenaDef> = {
  skyscraper: {
    id: 'skyscraper',
    name: 'The Skyscraper',
    blurb: 'The roof of a tower in a dark city. The edges are open, and it is a long way down.',
    half: EDGE, walled: false, grip: 1, wallHeight: 0,
    pillars: [
      { x: -11, z: 24, r: 0.9, prop: 'barrel' }, { x: -9, z: 25.5, r: 0.9, prop: 'barrel' },
      { x: 19, z: -9, r: 0.9, prop: 'barrel' },
      { x: -16, z: 26, r: 0.3, prop: 'pole' }, { x: -5, z: 27, r: 0.3, prop: 'pole' },
      { x: -22, z: 23, r: 0.3, prop: 'pole' }, { x: 1, z: 25, r: 0.3, prop: 'pole' },
    ],
    saws: [],
    pits: [],
    firePits: [], shockers: [], pistons: [], sentries: [],
    blocks: [
      { x: -3, z: 0, w: 13, d: 6, kind: 'skylight' },
      { x: 8, z: 7, w: 7, d: 5, kind: 'bunker' },
      { x: 17, z: 20, w: 20, d: 9, kind: 'shed' },
      // Fence along the back corner only. Everywhere else is a clear drop.
      { x: -13, z: EDGE - FENCE / 2, w: 34, d: FENCE, kind: 'fence' },
      { x: -EDGE + FENCE / 2, z: 16, w: FENCE, d: 28, kind: 'fence' },
    ],
    spawns: [
      { x: 14, z: -20 }, { x: -16, z: 14 }, { x: -24, z: -8 }, { x: 24, z: 6 },
      { x: -4, z: 20 }, { x: -20, z: -24 }, { x: 4, z: -24 }, { x: 24, z: -22 },
    ],
    repairSpots: [{ x: -3, z: -13 }, { x: 20, z: 3 }, { x: -22, z: -3 }, { x: -6, z: 12 }],
    hill: { x: -3, z: -13, r: 7 },
    logo: { x: 8, z: -14, r: 7 },
    theme: { floor: 0xa2a28c, wall: 0x45433a, sky: 0x1c1a2c, fogNear: 90, fogFar: 420, light: 0xc4c8ff, sunIntensity: 1.1, backdrop: 'night' },
  },
  pit: {
    id: 'pit',
    name: 'The Scrap Pit',
    blurb: 'Walled in, with saws sliding through the floor.',
    half: 32, walled: true, grip: 1, wallHeight: 3,
    pillars: [
      { x: 12, z: 12, r: 2.5 }, { x: -12, z: 12, r: 2.5 }, { x: 12, z: -12, r: 2.5 }, { x: -12, z: -12, r: 2.5 },
    ],
    saws: [
      { axis: 'z', fixed: 22, amplitude: 18, speed: 0.7, phase: 0 },
      { axis: 'z', fixed: -22, amplitude: 18, speed: 0.7, phase: Math.PI },
      { axis: 'x', fixed: 22, amplitude: 18, speed: 0.55, phase: Math.PI / 2 },
      { axis: 'x', fixed: -22, amplitude: 18, speed: 0.55, phase: -Math.PI / 2 },
    ],
    pits: [], firePits: [], shockers: [], pistons: [], sentries: [],
    blocks: [],
    spawns: ring(26),
    repairSpots: cross(16),
    hill: { x: 0, z: 0, r: 7 },
    logo: { x: 0, z: 0, r: 8 },
    theme: { floor: 0xffffff, wall: 0x4a4e52, sky: 0x101216, fogNear: 55, fogFar: 130, light: 0xfff0d8, sunIntensity: 2.4, backdrop: 'stands' },
  },
  rooftop: {
    id: 'rooftop',
    name: 'Rooftop Rumble',
    blurb: 'No walls, and a long drop. Shove them off the edge.',
    half: 28, walled: false, grip: 1, wallHeight: 0,
    pillars: [
      { x: 9, z: 9, r: 2 }, { x: -9, z: -9, r: 2 }, { x: 9, z: -9, r: 1.6 }, { x: -9, z: 9, r: 1.6 },
    ],
    saws: [],
    pits: [{ x: 0, z: 0, r: 4 }],
    firePits: [], shockers: [], pistons: [], sentries: [],
    blocks: [],
    spawns: ring(20),
    repairSpots: [{ x: 16, z: 0 }, { x: -16, z: 0 }, { x: 0, z: 16 }, { x: 0, z: -16 }],
    hill: { x: 15, z: 15, r: 6 },
    logo: { x: -14, z: 14, r: 5 },
    theme: { floor: 0xb9c0cc, wall: 0x5d6470, sky: 0x24344f, fogNear: 70, fogFar: 240, light: 0xffd9b0, sunIntensity: 2.6, backdrop: 'city' },
  },
  furnace: {
    id: 'furnace',
    name: 'The Furnace',
    blurb: 'Fire pits, flame sentries, and a shock coil in the middle.',
    half: 30, walled: true, grip: 1, wallHeight: 4,
    pillars: [{ x: 15, z: 0, r: 2.2 }, { x: -15, z: 0, r: 2.2 }],
    saws: [],
    pits: [],
    firePits: [
      { x: 14, z: 14, r: 4.5 }, { x: -14, z: 14, r: 4.5 }, { x: 14, z: -14, r: 4.5 }, { x: -14, z: -14, r: 4.5 },
    ],
    shockers: [{ x: 0, z: 0, r: 6, period: 5, phase: 0 }],
    pistons: [],
    sentries: [
      { x: 28, z: 28, range: 10 }, { x: -28, z: 28, range: 10 }, { x: 28, z: -28, range: 10 }, { x: -28, z: -28, range: 10 },
    ],
    blocks: [],
    spawns: [
      { x: 0, z: 25 }, { x: 0, z: -25 }, { x: 25, z: 8 }, { x: -25, z: 8 }, { x: 25, z: -8 }, { x: -25, z: -8 },
      { x: 9, z: 25 }, { x: -9, z: -25 },
    ],
    repairSpots: [{ x: 0, z: 14 }, { x: 0, z: -14 }, { x: 22, z: 0 }, { x: -22, z: 0 }],
    hill: { x: 0, z: 0, r: 8 },
    logo: { x: 0, z: 22, r: 4 },
    theme: { floor: 0xc8a48e, wall: 0x3f2b24, sky: 0x1c0d08, fogNear: 45, fogFar: 110, light: 0xffb27a, sunIntensity: 1.8, backdrop: 'foundry' },
  },
  canyon: {
    id: 'canyon',
    name: 'Canyon Ledge',
    blurb: 'Open edges and two chasms split the mesa into three lanes.',
    half: 30, walled: false, grip: 0.9, wallHeight: 0,
    pillars: [{ x: 0, z: 0, r: 3 }, { x: 20, z: 20, r: 2.5 }, { x: -20, z: -20, r: 2.5 }],
    saws: [],
    pits: [
      { x: 13, z: -9, r: 5.5 }, { x: 13, z: 1, r: 4.5 }, { x: -13, z: 9, r: 5.5 }, { x: -13, z: -1, r: 4.5 },
    ],
    firePits: [], shockers: [], pistons: [], sentries: [],
    blocks: [],
    spawns: [
      { x: 22, z: -20 }, { x: -22, z: 20 }, { x: 24, z: 9 }, { x: -24, z: -9 },
      { x: 0, z: 22 }, { x: 0, z: -22 }, { x: 6, z: 12 }, { x: -6, z: -12 },
    ],
    repairSpots: [{ x: 0, z: 12 }, { x: 0, z: -12 }, { x: 24, z: 0 }, { x: -24, z: 0 }],
    hill: { x: 0, z: 18, r: 6 },
    logo: { x: 0, z: -19, r: 5 },
    theme: { floor: 0xe0a877, wall: 0x7a4a2c, sky: 0xd98b57, fogNear: 70, fogFar: 220, light: 0xffe2b8, sunIntensity: 2.8, backdrop: 'canyon' },
  },
  foundry: {
    id: 'foundry',
    name: 'Piston Foundry',
    blurb: 'Timed rams in the walls fling robots across the floor.',
    half: 30, walled: true, grip: 1, wallHeight: 5,
    pillars: [{ x: 8, z: 8, r: 2 }, { x: -8, z: -8, r: 2 }],
    saws: [
      { axis: 'x', fixed: 0, amplitude: 24, speed: 0.45, phase: 0 },
    ],
    pits: [],
    firePits: [],
    shockers: [{ x: 18, z: 18, r: 4, period: 6, phase: 1 }, { x: -18, z: -18, r: 4, period: 6, phase: 4 }],
    pistons: [
      { x: 30, z: 12, dirX: -1, dirZ: 0, period: 4, phase: 0 },
      { x: -30, z: -12, dirX: 1, dirZ: 0, period: 4, phase: 2 },
      { x: 12, z: -30, dirX: 0, dirZ: 1, period: 5, phase: 1 },
      { x: -12, z: 30, dirX: 0, dirZ: -1, period: 5, phase: 3.5 },
    ],
    sentries: [],
    blocks: [],
    spawns: ring(24),
    repairSpots: [{ x: 16, z: -14 }, { x: -16, z: 14 }, { x: 0, z: 18 }, { x: 0, z: -18 }],
    hill: { x: 0, z: 10, r: 6 },
    logo: { x: -14, z: 7, r: 5 },
    theme: { floor: 0xa9b4c0, wall: 0x2f3640, sky: 0x0d1118, fogNear: 45, fogFar: 110, light: 0xc8dcff, sunIntensity: 2, backdrop: 'foundry' },
  },
  glacier: {
    id: 'glacier',
    name: 'Black Ice',
    blurb: 'A slick frozen lake. Momentum decides everything.',
    half: 30, walled: false, grip: 0.3, wallHeight: 0,
    pillars: [
      { x: 10, z: 0, r: 2.4 }, { x: -10, z: 0, r: 2.4 }, { x: 0, z: 14, r: 2.4 }, { x: 0, z: -14, r: 2.4 },
    ],
    saws: [],
    pits: [{ x: 19, z: 19, r: 4.5 }, { x: -19, z: -19, r: 4.5 }],
    firePits: [], shockers: [], pistons: [], sentries: [],
    blocks: [],
    spawns: [
      { x: 20, z: -14 }, { x: -20, z: 14 }, { x: 6, z: 22 }, { x: -6, z: -22 },
      { x: 22, z: 4 }, { x: -22, z: -4 }, { x: -14, z: 22 }, { x: 14, z: -22 },
    ],
    repairSpots: cross(19).slice(1),
    hill: { x: 0, z: 0, r: 7 },
    logo: { x: 0, z: 0, r: 7 },
    theme: { floor: 0xcfe6ff, wall: 0x6f8aa8, sky: 0x9fc2e0, fogNear: 60, fogFar: 200, light: 0xeaf5ff, sunIntensity: 2.4, backdrop: 'ice' },
  },
};

export const ARENA_ORDER: ArenaId[] = ['skyscraper', 'pit', 'rooftop', 'furnace', 'canyon', 'foundry', 'glacier'];

/** The closest point on a block to the given point. It is the point itself when inside. */
export function closestOnBlock(b: Block, x: number, z: number): Point {
  return {
    x: Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, x)),
    z: Math.max(b.z - b.d / 2, Math.min(b.z + b.d / 2, z)),
  };
}

export function insideBlock(b: Block, x: number, z: number): boolean {
  return Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2;
}

/** Distance along a ray to a block, or null if it misses. */
export function rayBlock(b: Block, x: number, z: number, dirX: number, dirZ: number): number | null {
  let near = 0;
  let far = Infinity;
  for (const [origin, dir, center, half] of [[x, dirX, b.x, b.w / 2], [z, dirZ, b.z, b.d / 2]]) {
    if (Math.abs(dir) < 1e-9) {
      if (Math.abs(origin - center) > half) return null;
      continue;
    }
    const t1 = (center - half - origin) / dir;
    const t2 = (center + half - origin) / dir;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
  }
  return near <= far ? near : null;
}

export function sawPos(saw: Saw, t: number): Point {
  const slide = Math.sin(t * saw.speed + saw.phase) * saw.amplitude;
  return saw.axis === 'z' ? { x: saw.fixed, z: slide } : { x: slide, z: saw.fixed };
}

export function shockerActive(s: Shocker, t: number): boolean {
  return (t + s.phase) % s.period < SHOCK_ON;
}

/** 0 when retracted, 1 at full reach. */
export function pistonExtension(p: Piston, t: number): number {
  const phase = (t + p.phase) % p.period;
  if (phase < PISTON_ACTIVE) return phase / PISTON_ACTIVE;
  if (phase < PISTON_ACTIVE + 1) return 1 - (phase - PISTON_ACTIVE);
  return 0;
}

export function isArenaId(value: unknown): value is ArenaId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ARENAS, value);
}
