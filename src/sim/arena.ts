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

/** A hole that a timer opens and shuts. It's only lethal while it's open. */
export interface Trapdoor extends Circle {
  period: number;
  phase: number;
  /** Seconds it stays open each time round. */
  open: number;
}

/** A grate over fire. It burns anything on it, and burns far harder while it erupts, if it has a timer. */
export interface FirePit extends Circle {
  period?: number;
  phase?: number;
}

/** A lethal gap in the floor, which robots can only cross on a bridge or by jumping. */
export interface Rect {
  x: number;
  z: number;
  /** Size along x. */
  w: number;
  /** Size along z. */
  d: number;
}

/** A moving belt that carries whatever is on it. */
export interface Conveyor extends Rect {
  dirX: number;
  dirZ: number;
  speed: number;
}

/** A ramp that throws a robot driving up it, far enough to clear a chasm. */
export interface Launcher extends Circle {
  dirX: number;
  dirZ: number;
}

/** A huge hammer that slams down on a timer, showing where well before it lands. */
export interface Hammer extends Circle {
  period: number;
  phase: number;
}

/** A ball on a long cable, swinging through the middle of the map along a line that slowly turns. */
export interface WreckingBall {
  /** Height of the point it hangs from. */
  height: number;
  /** How far out along the floor it swings. */
  reach: number;
  swing: number;
  turn: number;
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
  backdrop: 'stands' | 'sea' | 'canyon' | 'foundry' | 'ice' | 'night';
}

export interface ArenaDef {
  id: ArenaId;
  name: string;
  blurb: string;
  half: number;
  /** The floor's outline, within the square that `half` describes. */
  shape: 'square' | 'round' | 'plus';
  /** On a plus, how far each arm reaches either side of its middle. */
  arm?: number;
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
  trapdoors: Trapdoor[];
  chasms: Rect[];
  /** The middles of the ways over the chasms, for bots to route through. They run along x. */
  crossings: Point[];
  firePits: FirePit[];
  shockers: Shocker[];
  pistons: Piston[];
  sentries: Sentry[];
  conveyors: Conveyor[];
  launchers: Launcher[];
  hammers: Hammer[];
  balls: WreckingBall[];
  /** Saws set into a wall, which make being shoved against it a real danger. */
  grinders: Rect[];
  spawns: Point[];
  repairSpots: Point[];
  /** Scoring zone for King of the Hill. */
  hill: Circle;
  /** Where the game's logo is painted on the floor. */
  logo: Circle;
  theme: ArenaTheme;
}

export type ArenaId = 'skyscraper' | 'pit' | 'rig' | 'furnace' | 'canyon' | 'foundry' | 'glacier';

/** How a map dresses up the spectator traps. */
export interface TrapNames {
  strike: string;
  /** What falls from the sky. */
  drop: 'anvil' | 'rock' | 'icicle' | 'hammer' | 'bolt' | 'lava';
  slick: string;
  patch: 'oil' | 'glue';
  pull: string;
}

export const TRAP_NAMES: Record<ArenaId, TrapNames> = {
  skyscraper: { strike: 'Falling Anvil', drop: 'anvil', slick: 'Roof Tar', patch: 'glue', pull: 'Helicopter Downdraft' },
  pit: { strike: 'Scrap Drop', drop: 'hammer', slick: 'Oil Slick', patch: 'oil', pull: 'Junkyard Magnet' },
  rig: { strike: 'Lightning Strike', drop: 'bolt', slick: 'Burst Pipe', patch: 'oil', pull: 'Storm Gust' },
  furnace: { strike: 'Molten Pour', drop: 'lava', slick: 'Slag Spill', patch: 'glue', pull: 'Furnace Draft' },
  canyon: { strike: 'Rockfall', drop: 'rock', slick: 'Quicksand', patch: 'glue', pull: 'Dust Devil' },
  foundry: { strike: 'Drop Hammer', drop: 'hammer', slick: 'Coolant Leak', patch: 'oil', pull: 'Crane Magnet' },
  glacier: { strike: 'Giant Icicle', drop: 'icicle', slick: 'Black Ice', patch: 'oil', pull: 'Blizzard' },
};

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
/** How much harder a vent burns while it erupts, and for how long, with a warning first. */
export const VENT_MULT = 3;
export const VENT_ERUPT = 1.8;
export const VENT_WARN = 1.3;
/** How long a trapdoor warns before it opens, and how long its leaves take to move. */
export const TRAPDOOR_WARN = 2.5;
export const TRAPDOOR_MOVE = 0.45;
export const HAMMER_WARN = 1.5;
export const HAMMER_HIT = 0.15;
export const HAMMER_DAMAGE = 34;
export const HAMMER_STUN = 0.7;
export const BALL_RADIUS = 2.4;
export const BALL_DAMAGE = 16;
export const BALL_FORCE = 30;
/** The ball only hits what it can reach, and it swings up out of the way toward the ends of its arc. */
export const BALL_HIT_HEIGHT = 3.6;
/** How long a launched robot stays in the air, and how fast it's going. Enough to clear any chasm. */
export const LAUNCH_AIR = 0.8;
export const LAUNCH_SPEED = 18;
/** Only a robot driving up the ramp gets thrown, not one crossing it sideways. */
export const LAUNCH_MIN_SPEED = 2.5;
export const GRINDER_DPS = 26;
export const GRINDER_PUSH = 40;

const ring = (d: number): Point[] => [
  { x: d, z: d }, { x: -d, z: -d }, { x: d, z: -d }, { x: -d, z: d },
  { x: 0, z: d + 1 }, { x: 0, z: -d - 1 }, { x: d + 1, z: 0 }, { x: -d - 1, z: 0 },
];

const cross = (d: number): Point[] => [
  { x: 0, z: 0 }, { x: d, z: 0 }, { x: -d, z: 0 }, { x: 0, z: d }, { x: 0, z: -d },
];

const EDGE = 30;
const FENCE = 0.4;

/** Everything a map doesn't have unless it says so. */
const PLAIN = {
  shape: 'square', pillars: [], blocks: [], saws: [], pits: [], trapdoors: [], chasms: [], crossings: [], firePits: [], shockers: [], pistons: [], sentries: [],
  conveyors: [], launchers: [], hammers: [], balls: [], grinders: [],
} satisfies Partial<ArenaDef>;

// Every map has one big idea of its own, a shape of its own, and its repairs in the places that are hardest to reach.
export const ARENAS: Record<ArenaId, ArenaDef> = {
  skyscraper: {
    ...PLAIN,
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
    hill: { x: -14, z: -16, r: 7 },
    logo: { x: 8, z: -14, r: 7 },
    theme: { floor: 0x9a9da8, wall: 0x3a3d45, sky: 0x241840, fogNear: 90, fogFar: 420, light: 0xb8c4ff, sunIntensity: 1.3, backdrop: 'night' },
  },
  pit: {
    ...PLAIN,
    id: 'pit',
    name: 'The Scrap Pit',
    blurb: 'Saws in the floor and in the walls, and a pit in the middle that opens every fifteen seconds. There is a repair kit on its doors.',
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
    trapdoors: [{ x: 0, z: 0, r: 6, period: 15, phase: 0, open: 5 }],
    grinders: [
      { x: 0, z: 31.4, w: 14, d: 1.2 }, { x: 0, z: -31.4, w: 14, d: 1.2 },
      { x: 31.4, z: 0, w: 1.2, d: 14 }, { x: -31.4, z: 0, w: 1.2, d: 14 },
    ],
    spawns: ring(26),
    repairSpots: cross(16),
    hill: { x: 0, z: 0, r: 7.6 },
    // Painted across the pit's doors, so it splits in two as they open.
    logo: { x: 0, z: 0, r: 5.6 },
    theme: { floor: 0xc4c8ce, wall: 0x2c2f33, sky: 0x101216, fogNear: 70, fogFar: 170, light: 0xf8f2e8, sunIntensity: 2.4, backdrop: 'stands' },
  },
  rig: {
    ...PLAIN,
    id: 'rig',
    name: 'The Rig',
    blurb: 'A cross-shaped deck over a stormy sea. A wrecking ball sweeps the middle, and the cargo hatches open in turn.',
    half: 30, shape: 'plus', arm: 13, walled: false, grip: 1, wallHeight: 0,
    pillars: [{ x: 10, z: 10, r: 1.8 }, { x: -10, z: 10, r: 1.8 }, { x: 10, z: -10, r: 1.8 }, { x: -10, z: -10, r: 1.8 }],
    trapdoors: [
      { x: 20, z: -6, r: 4, period: 13, phase: 0, open: 4 },
      { x: 6, z: 20, r: 4, period: 13, phase: 3.25, open: 4 },
      { x: -20, z: 6, r: 4, period: 13, phase: 6.5, open: 4 },
      { x: -6, z: -20, r: 4, period: 13, phase: 9.75, open: 4 },
    ],
    balls: [{ height: 26, reach: 20, swing: 0.85, turn: 0.13, phase: 0 }],
    spawns: [
      { x: 25, z: 10 }, { x: -25, z: -10 }, { x: -10, z: 25 }, { x: 10, z: -25 },
      { x: 25, z: -10 }, { x: -25, z: 10 }, { x: 10, z: 25 }, { x: -10, z: -25 },
    ],
    repairSpots: [{ x: 0, z: 0 }, { x: 25, z: -6 }, { x: 6, z: 25 }, { x: -25, z: 6 }, { x: -6, z: -25 }],
    hill: { x: 0, z: 0, r: 7 },
    logo: { x: 20, z: 7, r: 4.5 },
    theme: { floor: 0xa8adb8, wall: 0x3c4048, sky: 0x4a3a4a, fogNear: 90, fogFar: 330, light: 0xffc8a0, sunIntensity: 2.2, backdrop: 'sea' },
  },
  furnace: {
    ...PLAIN,
    id: 'furnace',
    name: 'The Furnace',
    blurb: 'A pool of molten steel in the middle, and vents that take turns to erupt. The repairs are on the vents.',
    half: 30, walled: true, grip: 1, wallHeight: 4,
    pillars: [{ x: 15, z: 0, r: 2.2 }, { x: -15, z: 0, r: 2.2 }],
    pits: [{ x: 0, z: 0, r: 4.2 }],
    firePits: [
      { x: 15, z: 15, r: 4.5, period: 9, phase: 0 }, { x: -15, z: 15, r: 4.5, period: 9, phase: 2.25 },
      { x: -15, z: -15, r: 4.5, period: 9, phase: 4.5 }, { x: 15, z: -15, r: 4.5, period: 9, phase: 6.75 },
    ],
    sentries: [
      { x: 28, z: 28, range: 9 }, { x: -28, z: 28, range: 9 }, { x: 28, z: -28, range: 9 }, { x: -28, z: -28, range: 9 },
    ],
    spawns: [
      { x: 0, z: 25 }, { x: 0, z: -25 }, { x: 25, z: 8 }, { x: -25, z: 8 }, { x: 25, z: -8 }, { x: -25, z: -8 },
      { x: 9, z: 25 }, { x: -9, z: -25 },
    ],
    repairSpots: [{ x: -15, z: 15 }, { x: 15, z: -15 }, { x: 22, z: 0 }, { x: -22, z: 0 }],
    // A ring around the pool, so holding it means fighting at the edge of the steel.
    hill: { x: 0, z: 0, r: 9.5 },
    logo: { x: 0, z: 22, r: 4 },
    theme: { floor: 0xb49484, wall: 0x2a1f1c, sky: 0x1c0d08, fogNear: 45, fogFar: 110, light: 0xffae78, sunIntensity: 1.8, backdrop: 'foundry' },
  },
  canyon: {
    ...PLAIN,
    id: 'canyon',
    name: 'Canyon Ledge',
    blurb: 'Two chasms split the mesa into three lanes. Cross on the bridges, or hit a ramp and jump.',
    half: 30, walled: false, grip: 0.9, wallHeight: 0,
    pillars: [{ x: 0, z: 0, r: 3 }, { x: 23, z: -2, r: 2.2 }, { x: -23, z: 2, r: 2.2 }],
    // A bridge across each, offset so the map is the same from either end, and a narrow ledge at each tip.
    chasms: [
      { x: -13, z: -17.5, w: 8, d: 15 }, { x: -13, z: 11.5, w: 8, d: 27 },
      { x: 13, z: -11.5, w: 8, d: 27 }, { x: 13, z: 17.5, w: 8, d: 15 },
    ],
    crossings: [{ x: -13, z: -6 }, { x: 13, z: 6 }],
    launchers: [
      { x: -5.5, z: 12, r: 2.4, dirX: -1, dirZ: 0 }, { x: 5.5, z: -12, r: 2.4, dirX: 1, dirZ: 0 },
      { x: -22, z: -16, r: 2.4, dirX: 1, dirZ: 0 }, { x: 22, z: 16, r: 2.4, dirX: -1, dirZ: 0 },
    ],
    spawns: [
      { x: 22, z: -20 }, { x: -22, z: 20 }, { x: 24, z: 8 }, { x: -24, z: -8 },
      { x: 0, z: 23 }, { x: 0, z: -23 }, { x: 6, z: 12 }, { x: -6, z: -12 },
    ],
    repairSpots: [{ x: -13, z: -6 }, { x: 13, z: 6 }, { x: -24, z: 18 }, { x: 24, z: -18 }],
    hill: { x: 0, z: 18, r: 6 },
    logo: { x: 0, z: -19, r: 5 },
    theme: { floor: 0xe8b084, wall: 0x7a4a2c, sky: 0xc87058, fogNear: 80, fogFar: 260, light: 0xffd2a0, sunIntensity: 2.6, backdrop: 'canyon' },
  },
  foundry: {
    ...PLAIN,
    id: 'foundry',
    name: 'Piston Foundry',
    blurb: 'Belts carry you toward the rams, and two drop hammers pound the floor. The hill is under one of them.',
    half: 30, walled: true, grip: 1, wallHeight: 5,
    pillars: [{ x: 24, z: -6, r: 2 }, { x: -24, z: 6, r: 2 }],
    saws: [{ axis: 'x', fixed: 0, amplitude: 24, speed: 0.45, phase: 0 }],
    shockers: [{ x: 22, z: 22, r: 4, period: 6, phase: 1 }, { x: -22, z: -22, r: 4, period: 6, phase: 4 }],
    pistons: [
      { x: 30, z: 11, dirX: -1, dirZ: 0, period: 4, phase: 0 },
      { x: -30, z: -11, dirX: 1, dirZ: 0, period: 4, phase: 2 },
      { x: 11, z: -30, dirX: 0, dirZ: 1, period: 5, phase: 1 },
      { x: -11, z: 30, dirX: 0, dirZ: -1, period: 5, phase: 3.5 },
    ],
    conveyors: [
      { x: 0, z: 11, w: 36, d: 7, dirX: 1, dirZ: 0, speed: 4 },
      { x: 0, z: -11, w: 36, d: 7, dirX: -1, dirZ: 0, speed: 4 },
    ],
    hammers: [{ x: 0, z: 21, r: 4.5, period: 7, phase: 0 }, { x: 0, z: -21, r: 4.5, period: 7, phase: 3.5 }],
    spawns: [
      { x: 6, z: 26 }, { x: -6, z: -26 }, { x: 26, z: 6 }, { x: -26, z: -6 },
      { x: 26, z: -20 }, { x: -26, z: 20 }, { x: 16, z: 26 }, { x: -16, z: -26 },
    ],
    repairSpots: [{ x: 0, z: -21 }, { x: 0, z: 21 }, { x: 23, z: -20 }, { x: -23, z: 20 }],
    hill: { x: 0, z: 21, r: 6 },
    logo: { x: -21, z: 21, r: 5 },
    theme: { floor: 0xa2acba, wall: 0x23282f, sky: 0x0d1118, fogNear: 45, fogFar: 110, light: 0xc8dcff, sunIntensity: 2, backdrop: 'foundry' },
  },
  glacier: {
    ...PLAIN,
    id: 'glacier',
    name: 'Black Ice',
    blurb: 'A round frozen lake with nothing to stop you. Thin ice gives way in turn, and it takes a while to freeze again.',
    half: 31, shape: 'round', walled: false, grip: 0.3, wallHeight: 0,
    pillars: [
      { x: 10, z: 0, r: 2.4 }, { x: -10, z: 0, r: 2.4 }, { x: 0, z: 14, r: 2.4 }, { x: 0, z: -14, r: 2.4 },
    ],
    pits: [{ x: 18, z: -18, r: 3.6 }, { x: -18, z: 18, r: 3.6 }],
    trapdoors: [
      { x: 19, z: 9, r: 4, period: 12, phase: 0, open: 3.5 },
      { x: -9, z: 19, r: 4, period: 12, phase: 3, open: 3.5 },
      { x: -19, z: -9, r: 4, period: 12, phase: 6, open: 3.5 },
      { x: 9, z: -19, r: 4, period: 12, phase: 9, open: 3.5 },
    ],
    spawns: [
      { x: 24, z: 0 }, { x: -24, z: 0 }, { x: 0, z: 24 }, { x: 0, z: -24 },
      { x: 17, z: 17 }, { x: -17, z: -17 }, { x: 24, z: -9 }, { x: -24, z: 9 },
    ],
    repairSpots: [{ x: 19, z: 9 }, { x: -19, z: -9 }, { x: 0, z: 23 }, { x: 0, z: -23 }],
    hill: { x: 0, z: 0, r: 7 },
    logo: { x: -14, z: -20, r: 4.5 },
    theme: { floor: 0x86a8c4, wall: 0x3a4f66, sky: 0x123a4c, fogNear: 70, fogFar: 240, light: 0xcfe4ff, sunIntensity: 1.1, backdrop: 'ice' },
  },
};

export const ARENA_ORDER: ArenaId[] = ['skyscraper', 'pit', 'rig', 'furnace', 'canyon', 'foundry', 'glacier'];

/** True if this point is within the floor's outline. Walled maps stop robots before it matters. */
export function onDeck(arena: ArenaDef, x: number, z: number): boolean {
  if (arena.shape === 'round') return Math.hypot(x, z) <= arena.half;
  if (Math.abs(x) > arena.half || Math.abs(z) > arena.half) return false;
  if (arena.shape === 'plus') return Math.abs(x) <= arena.arm! || Math.abs(z) <= arena.arm!;
  return true;
}

export function overChasm(arena: ArenaDef, x: number, z: number): boolean {
  return arena.chasms.some((c) => Math.abs(x - c.x) < c.w / 2 && Math.abs(z - c.z) < c.d / 2);
}

/** Solid ground as far as the outline and the chasms go, which never change. */
export function solidGround(arena: ArenaDef, x: number, z: number): boolean {
  return onDeck(arena, x, z) && !overChasm(arena, x, z);
}

/** How far its leaves have moved, from 0 for shut to 1 for wide open. */
export function trapdoorAmount(door: Trapdoor, t: number): number {
  const at = (t + door.phase) % door.period;
  const start = door.period - door.open;
  if (at < start) return 0;
  return Math.min(1, (at - start) / TRAPDOOR_MOVE, (door.period - at) / TRAPDOOR_MOVE);
}

export function trapdoorOpen(door: Trapdoor, t: number): boolean {
  return trapdoorAmount(door, t) >= 0.5;
}

/** Builds from 0 to 1 over the moments before it opens, then stays at 1 until it has shut. */
export function trapdoorWarning(door: Trapdoor, t: number): number {
  const at = (t + door.phase) % door.period;
  const start = door.period - door.open;
  return at >= start ? 1 : Math.max(0, 1 - (start - at) / TRAPDOOR_WARN);
}

/** From 0 for nothing happening to 1 at the moment of eruption, and 1 throughout it. Vents without a timer never erupt. */
export function ventHeat(vent: FirePit, t: number): number {
  if (!vent.period) return 0;
  const at = (t + (vent.phase ?? 0)) % vent.period;
  if (at < VENT_ERUPT) return 1;
  return Math.max(0, 1 - (vent.period - at) / VENT_WARN);
}

export function ventErupting(vent: FirePit, t: number): boolean {
  return ventHeat(vent, t) >= 1;
}

/** Seconds since it last came down. It lands at 0 and goes round again every period. */
export function hammerClock(hammer: Hammer, t: number): number {
  return (t + hammer.phase) % hammer.period;
}

/** Where a wrecking ball is over the floor, how far along its swing, and the line it's swinging on. */
export function ballPos(ball: WreckingBall, t: number): Point & { along: number; angle: number } {
  const angle = t * ball.turn + ball.phase;
  const along = Math.sin(t * ball.swing + ball.phase) * ball.reach;
  return { x: Math.cos(angle) * along, z: Math.sin(angle) * along, along, angle };
}

/** How high the bottom of the ball is off the floor, from the length of its cable. */
export function ballHeight(ball: WreckingBall, along: number): number {
  const cable = ball.height - BALL_RADIUS - 0.5;
  return cable - Math.sqrt(Math.max(0, cable * cable - along * along));
}

/** The closest point on a block to the given point. It is the point itself when inside. */
export function closestOnBlock(b: Rect, x: number, z: number): Point {
  return {
    x: Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, x)),
    z: Math.max(b.z - b.d / 2, Math.min(b.z + b.d / 2, z)),
  };
}

export function insideBlock(b: Rect, x: number, z: number): boolean {
  return Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2;
}

/** Distance along a ray to a block, or null if it misses. */
export function rayBlock(b: Rect, x: number, z: number, dirX: number, dirZ: number): number | null {
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
