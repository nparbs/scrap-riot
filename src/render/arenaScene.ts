import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SAW_RADIUS, type ArenaDef, type ArenaId, type Block, type Pillar, type Rect } from '../sim/arena';
import { addBridge, buildHazards, deckPath, floorGeometry, wallAround, type HoleLook } from './hazards';
import { drawLogo } from './logo';

/** What makes each map look like itself. None of it affects play, so it lives here and not in the rules. */
interface Look {
  /** The map's light colour: edges, walls and caps. */
  accent: number;
  second: number;
  /** Colour stops from straight up (0), through the horizon (0.5), to straight down (1). */
  sky: [number, string][];
  sun?: { azimuth: number; altitude: number; size: number; color: string };
  stars?: number;
  aurora?: boolean;
  clouds?: string;
  /** How fast the sky turns, in radians a second. */
  drift?: number;
  floor: 'panels' | 'concrete' | 'rock' | 'ice';
  /** Specks in the air. A negative speed falls instead of rising. */
  motes?: { color: number; count: number; speed: number; size: number };
  /** What the holes in the floor look like, and what's down them. */
  hole: HoleLook;
  /** What stands in for a plain pillar here. Each map's are a landmark of its own, at the same size. */
  pillar: PillarLook;
  /** Where a chasm has a bridge over it. Only for show, because the gap in the chasm is what makes it passable. */
  bridges?: Rect[];
}

type PillarLook = 'scrap' | 'tank' | 'chimney' | 'rock' | 'column' | 'ice';

const LOOKS: Record<ArenaId, Look> = {
  skyscraper: {
    hole: 'shaft', pillar: 'column', accent: 0x38e8ff, second: 0xff3d9a, floor: 'concrete', stars: 700, drift: 0.002,
    sky: [[0, '#05061a'], [0.3, '#12123e'], [0.43, '#47206a'], [0.49, '#c8487c'], [0.51, '#2a1830'], [1, '#07070e']],
  },
  pit: {
    hole: 'shaft', pillar: 'scrap', accent: 0xff7f3f, second: 0xf2eadb, floor: 'panels',
    sky: [[0, '#050608'], [0.46, '#101216'], [0.5, '#1a1c21'], [1, '#050608']],
  },
  rig: {
    hole: 'sea', pillar: 'tank', accent: 0xffc23a, second: 0xff5a2a, floor: 'panels', clouds: '#4a3a4e',
    sun: { azimuth: 2.4, altitude: 0.04, size: 170, color: '#ffd8a0' },
    motes: { color: 0xcfe0ec, count: 160, speed: -6, size: 0.07 },
    sky: [[0, '#10141f'], [0.3, '#232838'], [0.42, '#5a4a58'], [0.475, '#c8704a'], [0.5, '#ffb070'], [0.525, '#6a4a4e'], [0.6, '#1a2a38'], [1, '#04101a']],
  },
  furnace: {
    hole: 'lava', pillar: 'chimney', accent: 0xff6a1a, second: 0xffa94d, floor: 'panels',
    motes: { color: 0xff8a3a, count: 90, speed: 2.4, size: 0.16 },
    sky: [[0, '#070302'], [0.44, '#1c0a04'], [0.5, '#3a1508'], [1, '#070302']],
  },
  canyon: {
    hole: 'rock', pillar: 'rock', accent: 0xffd08a, second: 0xff7f3f, floor: 'rock', clouds: '#ffc49a',
    bridges: [{ x: -13, z: -6, w: 8, d: 8 }, { x: 13, z: 6, w: 8, d: 8 }],
    sun: { azimuth: 0.7, altitude: 0.1, size: 210, color: '#fff2cf' },
    sky: [[0, '#1c2858'], [0.34, '#754884'], [0.45, '#ee7658'], [0.495, '#ffd08a'], [0.52, '#6a3a2a'], [1, '#2a1a14']],
  },
  foundry: {
    hole: 'shaft', pillar: 'column', accent: 0x4fd0ff, second: 0xf2eadb, floor: 'panels',
    motes: { color: 0x9fe0ff, count: 45, speed: 1.2, size: 0.1 },
    sky: [[0, '#05070b'], [0.46, '#0d1219'], [0.5, '#17202c'], [1, '#05070b']],
  },
  glacier: {
    hole: 'ice', pillar: 'ice', accent: 0x7df9d8, second: 0x8f7dff, floor: 'ice', stars: 1100, aurora: true, drift: 0.006,
    motes: { color: 0xdff4ff, count: 120, speed: -1.1, size: 0.1 },
    sky: [[0, '#040818'], [0.35, '#0a1a38'], [0.47, '#123c56'], [0.495, '#2a6a7a'], [0.52, '#0a1a28'], [1, '#040810']],
  },
};

/** Lethal things glow this colour on every map, so a new map never has to be learned. */
export const DANGER = 0xff3a1e;
const WINDOWS_NIGHT = ['#9fc4d8', '#c8d8e4', '#b4ccdc', '#d8c8a8', '#7fb4d0', '#c88cb0'];

/** A fixed sequence, so every player sees the same scenery. */
export function sequence(start: number): () => number {
  let seed = start;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function canvasTexture(width: number, height: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function floorMap(paint: (g: CanvasRenderingContext2D, size: number, rand: () => number) => void, repeat: number, seed: number): THREE.CanvasTexture {
  const size = 1024;
  const texture = canvasTexture(size, size, (g) => paint(g, size, sequence(seed)));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  return texture;
}

function blots(g: CanvasRenderingContext2D, size: number, rand: () => number, count: number, radius: number, color: (rand: () => number) => string): void {
  for (let i = 0; i < count; i++) {
    g.fillStyle = color(rand);
    g.beginPath();
    g.ellipse(rand() * size, rand() * size, 1 + rand() * radius, 1 + rand() * radius * 0.6, rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
}

/** Machined deck plates: each a slightly different shade, with fine seams and tyre marks across them. */
function panelTexture(): THREE.CanvasTexture {
  return floorMap((g, size, rand) => {
    const plate = size / 4;
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const shade = 86 + rand() * 12;
        g.fillStyle = `rgb(${shade},${shade + 1},${shade + 4})`;
        g.fillRect(x * plate, y * plate, plate, plate);
      }
    }
    blots(g, size, rand, 1800, 14, (r) => `rgba(40,42,46,${0.02 + r() * 0.05})`);
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = `rgba(14,15,17,${0.05 + rand() * 0.07})`;
      g.lineWidth = 10 + rand() * 8;
      const x = rand() * size;
      const y = rand() * size;
      const turn = rand() * Math.PI * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(turn) * 200, y + Math.sin(turn) * 200, x + Math.cos(turn + 0.5) * 420, y + Math.sin(turn + 0.5) * 420);
      g.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      g.fillStyle = '#1b1d20';
      g.fillRect(i * plate - 1.5, 0, 3, size);
      g.fillRect(0, i * plate - 1.5, size, 3);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(i * plate + 1.5, 0, 1, size);
      g.fillRect(0, i * plate + 1.5, size, 1);
    }
    g.fillStyle = '#2c2e32';
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        for (const [ox, oy] of [[14, 14], [plate - 14, 14], [14, plate - 14], [plate - 14, plate - 14]]) {
          g.beginPath();
          g.arc(x * plate + ox, y * plate + oy, 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }, 3, 11);
}

/** Dark poured concrete with saw-cut joints. */
function concreteTexture(): THREE.CanvasTexture {
  return floorMap((g, size, rand) => {
    g.fillStyle = '#54565c';
    g.fillRect(0, 0, size, size);
    blots(g, size, rand, 1500, 26, (r) => `rgba(24,25,30,${0.03 + r() * 0.07})`);
    blots(g, size, rand, 3200, 6, (r) => (r() < 0.45 ? `rgba(130,134,144,${0.04 + r() * 0.1})` : `rgba(20,21,26,${0.05 + r() * 0.12})`));
    g.fillStyle = '#26272c';
    for (let i = 0; i < 2; i++) {
      g.fillRect((i * size) / 2 - 1.5, 0, 3, size);
      g.fillRect(0, (i * size) / 2 - 1.5, size, 3);
    }
  }, 1.2, 4242);
}

function rockTexture(): THREE.CanvasTexture {
  return floorMap((g, size, rand) => {
    g.fillStyle = '#7d7468';
    g.fillRect(0, 0, size, size);
    blots(g, size, rand, 1600, 40, (r) => `rgba(${60 + r() * 40},${48 + r() * 26},${36 + r() * 18},${0.05 + r() * 0.08})`);
    blots(g, size, rand, 3600, 5, (r) => (r() < 0.5 ? `rgba(190,176,150,${0.04 + r() * 0.1})` : `rgba(30,24,18,${0.06 + r() * 0.12})`));
    g.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      g.strokeStyle = `rgba(22,17,12,${0.12 + rand() * 0.16})`;
      g.lineWidth = 1 + rand() * 1.5;
      let x = rand() * size;
      let y = rand() * size;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 7; j++) {
        x += (rand() - 0.5) * 90;
        y += (rand() - 0.5) * 90;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, 2, 31);
}

/** Dark lake ice, with pale fractures running through it. */
function iceTexture(): THREE.CanvasTexture {
  return floorMap((g, size, rand) => {
    g.fillStyle = '#5c7a96';
    g.fillRect(0, 0, size, size);
    blots(g, size, rand, 2600, 90, (r) => `rgba(14,34,58,${0.006 + r() * 0.014})`);
    blots(g, size, rand, 1400, 40, (r) => `rgba(200,232,255,${0.004 + r() * 0.01})`);
    g.lineCap = 'round';
    const crack = (x: number, y: number, angle: number, depth: number) => {
      const length = 40 + rand() * 90;
      const endX = x + Math.cos(angle) * length;
      const endY = y + Math.sin(angle) * length;
      g.strokeStyle = `rgba(226,244,255,${0.16 + depth * 0.1})`;
      g.lineWidth = 0.6 + depth * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(endX, endY);
      g.stroke();
      if (depth <= 0) return;
      crack(endX, endY, angle + (rand() - 0.5) * 0.9, depth - 1);
      if (rand() < 0.5) crack(endX, endY, angle + (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.7), depth - 1);
    };
    for (let i = 0; i < 14; i++) crack(rand() * size, rand() * size, rand() * Math.PI * 2, 4);
  }, 1.5, 58);
}

const FLOORS = { panels: panelTexture, concrete: concreteTexture, rock: rockTexture, ice: iceTexture };

/** The whole sky as one panorama, so the sun and stars stay put as the camera turns. */
function skyTexture(look: Look): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const rand = sequence(97);
  const texture = canvasTexture(width, height, (g) => {
    const gradient = g.createLinearGradient(0, 0, 0, height);
    for (const [stop, color] of look.sky) gradient.addColorStop(stop, color);
    g.fillStyle = gradient;
    g.fillRect(0, 0, width, height);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < (look.stars ?? 0); i++) {
      const y = rand() * height * 0.46;
      g.fillStyle = `rgba(255,255,255,${(0.2 + rand() * 0.7) * Math.min(1, (height * 0.46 - y) / 120)})`;
      const size = rand() < 0.08 ? 2.2 : 1.2;
      g.fillRect(rand() * width, y, size, size);
    }
    if (look.aurora) {
      // Curtains of thin vertical strokes. The sines make the folds, and each column's height follows them.
      for (let x = 0; x < width; x += 3) {
        const fold = Math.sin(x * 0.006) * 0.5 + Math.sin(x * 0.017 + 1.3) * 0.3 + Math.sin(x * 0.041) * 0.2;
        const strength = Math.max(0, fold + 0.15);
        if (strength <= 0) continue;
        const bottom = height * 0.42 + Math.sin(x * 0.009) * 30;
        const top = bottom - 90 - strength * 200;
        const curtain = g.createLinearGradient(0, bottom, 0, top);
        curtain.addColorStop(0, `rgba(125,249,216,${0.42 * strength})`);
        curtain.addColorStop(0.45, `rgba(90,200,220,${0.2 * strength})`);
        curtain.addColorStop(1, 'rgba(143,125,255,0)');
        g.fillStyle = curtain;
        g.fillRect(x, top, 3, bottom - top);
      }
    }
    if (look.clouds) {
      g.fillStyle = look.clouds;
      for (let i = 0; i < 46; i++) {
        g.globalAlpha = 0.05 + rand() * 0.12;
        const cloudX = rand() * width;
        const cloudY = height * (0.36 + rand() * 0.13);
        const cloudW = 60 + rand() * 240;
        const cloudH = 2 + rand() * 7;
        // Drawn again a full turn away, so one crossing the join carries on around it.
        for (const x of [cloudX, cloudX - width, cloudX + width]) {
          g.beginPath();
          g.ellipse(x, cloudY, cloudW, cloudH, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }
    if (look.sun) {
      const { azimuth, altitude, size, color } = look.sun;
      const x = (azimuth / (Math.PI * 2)) * width;
      const y = (0.5 - altitude / Math.PI) * height;
      const glow = g.createRadialGradient(x, y, 0, x, y, size);
      glow.addColorStop(0, color);
      glow.addColorStop(0.12, color);
      glow.addColorStop(0.16, 'rgba(255,190,120,0.45)');
      glow.addColorStop(1, 'rgba(255,150,90,0)');
      g.fillStyle = glow;
      g.fillRect(x - size, y - size, size * 2, size * 2);
    }
  });
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

const WINDOW_CELLS = 16;

/** A tile of tall glass offices, some lit. The rest are dark panes with a little sky in them. */
function windowTexture(lit: string[], seed: number): THREE.CanvasTexture {
  const size = 1024;
  const cell = size / WINDOW_CELLS;
  const rand = sequence(seed);
  const texture = canvasTexture(size, size, (g) => {
    g.fillStyle = '#04060c';
    g.fillRect(0, 0, size, size);
    for (let y = 0; y < WINDOW_CELLS; y++) {
      // Whole floors tend to be lit together, which is what reads as offices rather than noise.
      const busy = rand() < 0.3 ? 0.6 : 0.14;
      for (let x = 0; x < WINDOW_CELLS; x++) {
        g.fillStyle = rand() < busy ? lit[Math.floor(rand() * lit.length)] : '#0c1220';
        g.fillRect(x * cell + cell * 0.08, y * cell + cell * 0.14, cell * 0.84, cell * 0.72);
      }
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** A box whose sides show windows of the given size. Its top and bottom stay black. */
function towerGeometry(w: number, h: number, d: number, x: number, y: number, z: number, cell: number): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(w, h, d);
  const uv = box.getAttribute('uv') as THREE.BufferAttribute;
  // The six faces each have four corners, in the order +x, -x, +y, -y, +z, -z.
  const across = [d, d, 0, 0, w, w];
  for (let face = 0; face < 6; face++) {
    for (let i = face * 4; i < face * 4 + 4; i++) {
      if (across[face] === 0) uv.setXY(i, 0, 0);
      else uv.setXY(i, (uv.getX(i) * across[face]) / (cell * WINDOW_CELLS) + x * 0.013, (uv.getY(i) * h) / (cell * 1.25 * WINDOW_CELLS) + z * 0.017);
    }
  }
  box.translate(x, y, z);
  return box;
}

/** Many pieces become one draw, which is what lets a map have this much scenery. */
export function addMerged(scene: THREE.Scene, parts: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeGeometries(parts), material);
  for (const part of parts) part.dispose();
  scene.add(mesh);
  return mesh;
}

export function placedBox(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

let sharedSoft: THREE.CanvasTexture | null = null;

/** Light falling away across its width, and only at the very ends along its length, so strips can be any length. */
function softTexture(): THREE.CanvasTexture {
  if (sharedSoft) return sharedSoft;
  const size = 64;
  sharedSoft = canvasTexture(size, size, (g) => {
    const image = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const across = 1 - Math.abs((y + 0.5) / size - 0.5) * 2;
        const along = Math.min(1, (1 - Math.abs((x + 0.5) / size - 0.5) * 2) * 8);
        const value = across * across * along * 255;
        image.data.set([value, value, value, 255], (y * size + x) * 4);
      }
    }
    g.putImageData(image, 0, 0);
  });
  return sharedSoft;
}

let sharedDot: THREE.CanvasTexture | null = null;

function dotTexture(): THREE.CanvasTexture {
  if (sharedDot) return sharedDot;
  sharedDot = canvasTexture(32, 32, (g) => {
    const dot = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    dot.addColorStop(0, 'rgba(255,255,255,1)');
    dot.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    dot.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = dot;
    g.fillRect(0, 0, 32, 32);
  });
  return sharedDot;
}

/**
 * Everything that glows, gathered up and drawn in a couple of calls per colour. Glow is a soft layer
 * added on top rather than a full-screen bloom pass, so it costs next to nothing on a weak graphics card.
 */
export class GlowBatch {
  private readonly solid = new Map<number, THREE.BufferGeometry[]>();
  private readonly soft = new Map<number, THREE.BufferGeometry[]>();

  private push(map: Map<number, THREE.BufferGeometry[]>, color: number, part: THREE.BufferGeometry): void {
    const parts = map.get(color);
    if (parts) parts.push(part);
    else map.set(color, [part]);
  }

  box(color: number, w: number, h: number, d: number, x: number, y: number, z: number): void {
    this.push(this.solid, color, placedBox(w, h, d, x, y, z));
  }

  part(color: number, geometry: THREE.BufferGeometry): void {
    this.push(this.solid, color, geometry);
  }

  /** A strip painted flat on the floor. */
  flat(color: number, w: number, d: number, x: number, z: number, y = 0.012): void {
    this.push(this.solid, color, new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z));
  }

  ring(color: number, inner: number, outer: number, x: number, z: number, y = 0.03): void {
    this.push(this.solid, color, new THREE.RingGeometry(inner, outer, 40).rotateX(-Math.PI / 2).translate(x, y, z));
  }

  /** Light spilling across the floor. */
  floorHalo(color: number, w: number, d: number, x: number, z: number, y = 0.04): void {
    const part = new THREE.PlaneGeometry(Math.max(w, d), Math.min(w, d)).rotateX(-Math.PI / 2);
    if (d > w) part.rotateY(Math.PI / 2);
    this.push(this.soft, color, part.translate(x, y, z));
  }

  /** Light spilling up and down a wall. `turn` swings it to face along x rather than z. */
  wallHalo(color: number, w: number, h: number, x: number, y: number, z: number, turn = 0): void {
    this.push(this.soft, color, new THREE.PlaneGeometry(w, h).rotateY(turn).translate(x, y, z));
  }

  build(scene: THREE.Scene): void {
    for (const [color, parts] of this.solid) {
      addMerged(scene, parts, new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    }
    for (const [color, parts] of this.soft) {
      addMerged(scene, parts, new THREE.MeshBasicMaterial({ map: softTexture(), color, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide }));
    }
  }
}

/** Runs once a frame, with the scene's clock in seconds. */
type Animator = (time: number) => void;

/** A strip of LED lettering that scrolls. */
function tickerTexture(color: string): THREE.CanvasTexture {
  const texture = canvasTexture(1024, 128, (g) => {
    g.fillStyle = '#07080c';
    g.fillRect(0, 0, 1024, 128);
    g.font = '400 92px Impact, Haettenschweiler, "Arial Black", sans-serif';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    for (const x of [24, 536]) {
      g.fillText('SCRAP RIOT', x, 68);
      g.beginPath();
      g.moveTo(x + 436, 34);
      g.lineTo(x + 462, 64);
      g.lineTo(x + 436, 94);
      g.lineTo(x + 420, 94);
      g.lineTo(x + 446, 64);
      g.lineTo(x + 420, 34);
      g.fill();
    }
    // Dark lines between the rows of lights.
    g.fillStyle = 'rgba(0,0,0,0.42)';
    for (let y = 0; y < 128; y += 6) g.fillRect(0, y, 1024, 2);
    for (let x = 0; x < 1024; x += 6) g.fillRect(x, 0, 2, 128);
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function addTicker(scene: THREE.Scene, animators: Animator[], color: string, width: number, x: number, y: number, z: number, turn: number): void {
  const map = tickerTexture(color);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), new THREE.MeshBasicMaterial({ map, toneMapped: false, fog: false }));
  sign.position.set(x, y, z);
  sign.rotation.y = turn;
  scene.add(sign);
  animators.push((time) => {
    map.offset.x = time * 0.035;
  });
}

let sharedLogo: THREE.CanvasTexture | null = null;

/** The game's logo, shared by every sign and floor marking. */
export function logoTexture(): THREE.CanvasTexture {
  if (sharedLogo) return sharedLogo;
  sharedLogo = canvasTexture(512, 512, (g) => drawLogo(g, 512));
  sharedLogo.anisotropy = 4;
  return sharedLogo;
}

/** Painted flat on the floor, faded as if it has been driven over a lot. */
function addFloorLogo(scene: THREE.Scene, x: number, z: number, radius: number): void {
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshStandardMaterial({ map: logoTexture(), transparent: true, opacity: 0.82, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mark.rotation.x = -Math.PI / 2;
  // Facing the way robots come at it from the middle of the map.
  mark.rotation.z = Math.PI;
  mark.position.set(x, 0.018, z);
  mark.receiveShadow = true;
  scene.add(mark);
}

function graffitiTexture(): THREE.CanvasTexture {
  const rand = sequence(9);
  return canvasTexture(512, 128, (g) => {
    g.fillStyle = '#1d2024';
    g.fillRect(0, 0, 512, 128);
    const inks = ['#38e8ff', '#ff3d9a', '#ff7f3f', '#f2eadb', '#8f7dff'];
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = inks[Math.floor(rand() * inks.length)];
      g.lineWidth = 3 + rand() * 7;
      let x = rand() * 512;
      let y = 50 + rand() * 70;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (rand() - 0.5) * 60;
        y = Math.max(46, Math.min(124, y + (rand() - 0.5) * 50));
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

/** Chain link, drawn with transparent gaps. */
function chainLinkTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(64, 64, (g) => {
    g.strokeStyle = '#8c9096';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 32);
    g.lineTo(32, 0);
    g.lineTo(64, 32);
    g.lineTo(32, 64);
    g.closePath();
    g.stroke();
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Air traffic circling the map, just outside its edge and clear of the buildings. */
function addTraffic(scene: THREE.Scene, animators: Animator[], half: number): void {
  const lanes = [{ radius: half + 17, y: 7, speed: 0.11 }, { radius: half + 21, y: 15, speed: -0.09 }, { radius: half + 19, y: 26, speed: 0.07 }];
  const perLane = 7;
  const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.16, 0.16), new THREE.MeshBasicMaterial({ toneMapped: false, fog: false }), lanes.length * perLane);
  // Headlights one way round and tail lights the other, as on a real road.
  const color = new THREE.Color();
  lanes.forEach((lane, l) => {
    for (let i = 0; i < perLane; i++) cars.setColorAt(l * perLane + i, color.set(lane.speed > 0 ? 0xdff4ff : 0xff4a3a));
  });
  cars.frustumCulled = false;
  scene.add(cars);
  const place = new THREE.Object3D();
  animators.push((time) => {
    lanes.forEach((lane, l) => {
      for (let i = 0; i < perLane; i++) {
        const angle = time * lane.speed + (i / perLane) * Math.PI * 2 + l * 0.7;
        place.position.set(Math.cos(angle) * lane.radius, lane.y, Math.sin(angle) * lane.radius);
        place.rotation.y = Math.PI / 2 - angle;
        place.updateMatrix();
        cars.setMatrixAt(l * perLane + i, place.matrix);
      }
    });
    cars.instanceMatrix.needsUpdate = true;
  });
}

/** Aircraft warning lights, which all blink together. */
function addBeacons(scene: THREE.Scene, animators: Animator[], spots: [number, number, number][]): void {
  if (!spots.length) return;
  const material = new THREE.MeshBasicMaterial({ color: 0xff2a1e, toneMapped: false, fog: false, transparent: true });
  addMerged(scene, spots.map(([x, y, z]) => placedBox(0.7, 0.7, 0.7, x, y, z)), material);
  animators.push((time) => {
    material.opacity = (time * 0.7) % 1 < 0.28 ? 1 : 0.12;
  });
}

/** Specks in the air, in two stacked layers that take turns so the movement loops without updating each one. */
function addMotes(scene: THREE.Scene, animators: Animator[], half: number, motes: NonNullable<Look['motes']>): void {
  const height = 22;
  const rand = sequence(303);
  const positions = new Float32Array(motes.count * 3);
  for (let i = 0; i < motes.count; i++) {
    positions.set([(rand() * 2 - 1) * half * 1.15, rand() * height, (rand() * 2 - 1) * half * 1.15], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: motes.color, size: motes.size, map: dotTexture(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const lower = new THREE.Points(geometry, material);
  const upper = new THREE.Points(geometry, material);
  lower.frustumCulled = upper.frustumCulled = false;
  scene.add(lower, upper);
  animators.push((time) => {
    const y = ((time * motes.speed) % height + height) % height;
    lower.position.y = y - height;
    upper.position.y = y;
  });
}

/** Lit windows, a band of light around each roof, and a warning light on every third. */
function addTowerTops(glow: GlowBatch, beacons: [number, number, number][], look: Look, towers: [number, number, number, number, number][]): void {
  towers.forEach(([x, z, w, d, top], i) => {
    const color = i % 2 ? look.second : look.accent;
    const y = top - 0.6;
    const proud = 0.7;
    glow.box(color, w + proud, 0.35, proud, x, y, z + d / 2);
    glow.box(color, w + proud, 0.35, proud, x, y, z - d / 2);
    glow.box(color, proud, 0.35, d + proud, x + w / 2, y, z);
    glow.box(color, proud, 0.35, d + proud, x - w / 2, y, z);
    if (i % 3 === 0) beacons.push([x, top + 0.6, z]);
  });
}

/** Lower rooftops right beside the night city's roof, close enough for a falling robot to land on. */
function nightCityLedges(half: number): Ledge[] {
  return [
    { x: -12, z: half + 7, w: 36, d: 12, top: -2 },
    { x: -half - 7, z: 16, w: 12, d: 30, top: -2 },
    { x: 28, z: half + 7, w: 34, d: 12, top: -10 },
  ];
}

/** The city around the roof. The towers merge into one draw, so all this costs one call per material. */
function buildNightCity(scene: THREE.Scene, half: number, look: Look, glow: GlowBatch, animators: Animator[]): void {
  const map = windowTexture(WINDOWS_NIGHT, 77);
  const towers: THREE.BufferGeometry[] = [];
  // The roof's own building, whose windows show when looking over the edge.
  towers.push(towerGeometry(half * 2, 300, half * 2, 0, -150.1, 0, 1.3));

  // Huge neighbours crowding right up against the roof.
  // They leave gaps, so the sunset shows between them.
  const near: [number, number, number, number, number][] = [
    [-half - 30, half + 30, 34, 34, 74], [14, half + 38, 44, 26, 60], [half + 44, half + 10, 26, 34, 90],
    [half + 36, -16, 20, 26, 26], [-half - 38, -8, 24, 34, 48], [-half - 26, -half - 38, 30, 26, 70],
    [10, -half - 48, 34, 24, 24], [half + 40, -half - 42, 26, 30, 62],
  ];
  for (const [x, z, w, d, top] of near) towers.push(towerGeometry(w, top + 300, d, x, top - (top + 300) / 2, z, 1.2));
  // Lower ledges behind the fenced sides, which carry the neon.
  for (const { x, z, w, d, top } of nightCityLedges(half)) towers.push(towerGeometry(w, 300, d, x, top - 150, z, 1.2));
  addMerged(scene, towers, new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  const beacons: [number, number, number][] = [];
  addTowerTops(glow, beacons, look, near);

  // A smaller skyline further out, dimmed so it sits back behind the big towers.
  const skyline: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + 0.2;
    const dist = half + 110 + ((i * 53) % 130);
    const top = 2 + ((i * 37) % 62);
    const w = 16 + (i % 5) * 5;
    skyline.push(towerGeometry(w, top + 300, w, Math.cos(a) * dist, top - (top + 300) / 2, Math.sin(a) * dist, 1.2));
  }
  addMerged(scene, skyline, new THREE.MeshBasicMaterial({ map, color: 0x8088a0, toneMapped: false }));
  addBeacons(scene, animators, beacons);

  // Neon ledges on the buildings just below the roof.
  glow.box(look.second, 36, 0.5, 0.5, -12, -1.8, half + 13);
  glow.box(look.second, 0.5, 0.5, 30, -half - 13, -1.8, 16);
  glow.box(look.accent, 34, 0.5, 0.5, 28, -9.8, half + 13);

  // Scrolling signs up on the towers behind the roof.
  addTicker(scene, animators, '#ff7f3f', 34, 14, 44, half + 24.6, Math.PI);
  addTicker(scene, animators, '#38e8ff', 28, half + 30.6, 62, half + 10, -Math.PI / 2);

  // The gear sign on two poles behind the back of the roof, lit from behind.
  const gear = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, alphaTest: 0.3 }),
  );
  gear.position.set(-8, 8, half + 1);
  gear.rotation.y = Math.PI;
  scene.add(gear);
  glow.wallHalo(look.accent, 12, 12, -8, 8, half + 1.05);
  const post = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.8 });
  for (const x of [-11, -5]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 10, 6), post);
    pole.position.set(x, 5, half + 1.1);
    scene.add(pole);
  }

  // Thin posts all round the edge, which mark it without stopping anything.
  const posts: THREE.BufferGeometry[] = [];
  for (let along = -half; along <= half; along += 7.5) {
    for (const [x, z] of [[along, half - 0.3], [along, -half + 0.3], [half - 0.3, along], [-half + 0.3, along]]) {
      // The fenced stretches have posts of their own.
      if ((z > half - 1 && x < 4) || (x < -half + 1 && z > 2)) continue;
      posts.push(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 5).translate(x, 0.55, z));
      glow.box(look.accent, 0.13, 0.13, 0.13, x, 1.12, z);
    }
  }
  addMerged(scene, posts, post);
  addTraffic(scene, animators, half);
}

/** Rolling grey water, with a little white on it. */
function seaTexture(): THREE.CanvasTexture {
  const rand = sequence(515);
  const texture = canvasTexture(512, 512, (g) => {
    g.fillStyle = '#123040';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      const shade = rand();
      g.fillStyle = shade < 0.5 ? `rgba(6,22,32,${0.2 + rand() * 0.3})` : `rgba(60,110,130,${0.08 + rand() * 0.2})`;
      g.beginPath();
      g.ellipse(rand() * 512, rand() * 512, 10 + rand() * 46, 1.5 + rand() * 5, (rand() - 0.5) * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(226,240,246,${0.1 + rand() * 0.28})`;
      g.beginPath();
      g.ellipse(rand() * 512, rand() * 512, 3 + rand() * 16, 0.7 + rand() * 1.4, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const SEA_LEVEL = -26;

/** A deck on steel legs over a stormy sea, with a gas flare on one corner and other rigs out on the horizon. */
function buildRig(scene: THREE.Scene, def: ArenaDef, look: Look, glow: GlowBatch, animators: Animator[]): void {
  const { half } = def;
  const map = seaTexture();
  map.repeat.set(26, 26);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map, color: 0x7f9fb0, roughness: 0.42, metalness: 0.25 }));
  sea.position.y = SEA_LEVEL;
  scene.add(sea);
  const second = map.clone();
  second.needsUpdate = true;
  second.repeat.set(11, 11);
  const swell = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: second, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  swell.position.y = SEA_LEVEL + 0.1;
  scene.add(swell);
  animators.push((time) => {
    map.offset.set(time * 0.006, time * 0.012);
    second.offset.set(-time * 0.004, time * 0.007);
    sea.position.y = SEA_LEVEL + Math.sin(time * 0.6) * 0.3;
    swell.position.y = sea.position.y + 0.1;
  });

  // The deck has a real thickness, and steelwork below it.
  const steel = new THREE.MeshStandardMaterial({ color: 0x3c4046, metalness: 0.55, roughness: 0.6 });
  const deck = deckPath(def);
  scene.add(new THREE.Mesh(wallAround(deck, -0.01, -1.6), new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide })));
  const arm = def.arm!;
  const under: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[arm - 2, arm - 2], [-arm + 2, arm - 2], [arm - 2, -arm + 2], [-arm + 2, -arm + 2], [half - 3, 0], [-half + 3, 0], [0, half - 3], [0, -half + 3]]) {
    under.push(new THREE.CylinderGeometry(1.5, 2, 60, 14).translate(x, -31, z));
    for (let y = -6; y > -26; y -= 6) under.push(new THREE.TorusGeometry(1.75, 0.16, 6, 18).rotateX(Math.PI / 2).translate(x, y, z));
  }
  // Cross bracing between the legs, under the arms, leaving the hatches clear to look down through.
  for (const [ax, az, bx, bz] of [[arm - 2, arm - 2, -arm + 2, -arm + 2], [-arm + 2, arm - 2, arm - 2, -arm + 2], [half - 3, 0, 0, half - 3], [0, half - 3, -half + 3, 0], [-half + 3, 0, 0, -half + 3], [0, -half + 3, half - 3, 0]]) {
    const length = Math.hypot(bx - ax, bz - az);
    under.push(new THREE.CylinderGeometry(0.28, 0.28, length, 7).rotateX(Math.PI / 2).rotateY(Math.atan2(bx - ax, bz - az)).translate((ax + bx) / 2, -14, (az + bz) / 2));
  }
  addMerged(scene, under, steel);

  // Safety rail lights along the cut-away corners, where the drop comes up on you fastest.
  for (let i = 0; i < deck.length; i++) {
    const [x, z] = deck[i];
    const [nx, nz] = deck[(i + 1) % deck.length];
    const length = Math.hypot(nx - x, nz - z);
    for (let along = 2; along < length - 1; along += 4.2) {
      const t = along / length;
      glow.box(look.accent, 0.14, 0.14, 0.14, x + (nx - x) * t, 0.34, z + (nz - z) * t);
    }
  }

  // The gas flare, burning off on a boom out past the corner. It's the map's landmark from anywhere.
  const stack = half * 0.72;
  const flarePipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 62, 12), steel);
  flarePipe.position.set(-stack, 9, -stack);
  scene.add(flarePipe);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffb040, toneMapped: false, fog: false }));
  flame.scale.set(1, 2.2, 1);
  flame.position.set(-stack, 43, -stack);
  scene.add(flame);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(26, 34), new THREE.MeshBasicMaterial({ map: dotTexture(), color: 0xff7a2a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  halo.position.copy(flame.position);
  scene.add(halo);
  animators.push((time) => {
    const beat = 1 + Math.sin(time * 7) * 0.09 + Math.sin(time * 13.7) * 0.06;
    flame.scale.set(beat, 2.2 * (2 - beat), beat);
    halo.lookAt(0, 8, 0);
  });

  // Other rigs on the horizon, just a silhouette and a few lights.
  const far: THREE.BufferGeometry[] = [];
  const beacons: [number, number, number][] = [];
  for (const [a, dist, size] of [[0.7, 300, 1.3], [2.9, 380, 1], [4.2, 260, 1.5], [5.4, 420, 0.9]]) {
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    far.push(placedBox(46 * size, 8 * size, 30 * size, x, 24 * size, z));
    far.push(placedBox(10 * size, 22 * size, 10 * size, x + 8 * size, 38 * size, z));
    far.push(new THREE.CylinderGeometry(0.6, 3 * size, 60 * size, 5).translate(x - 14 * size, 50 * size, z));
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) far.push(placedBox(4 * size, 46 * size, 4 * size, x + lx * 16 * size, 2 * size, z + lz * 11 * size));
    beacons.push([x - 14 * size, 80 * size, z]);
  }
  addMerged(scene, far, new THREE.MeshBasicMaterial({ color: 0x141820 }));
  addBeacons(scene, animators, beacons);
}

/** Horizontal bands of old sediment. */
function strataTexture(): THREE.CanvasTexture {
  const rand = sequence(66);
  const texture = canvasTexture(4, 512, (g) => {
    let y = 0;
    while (y < 512) {
      const band = 4 + rand() * 34;
      const light = 0.72 + rand() * 0.34;
      g.fillStyle = `rgb(${172 * light},${102 * light},${66 * light})`;
      g.fillRect(0, y, 4, band);
      y += band;
    }
  });
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 3);
  return texture;
}

/** Mesas striped with rock layers, with a few radio masts to say someone works out here. */
function buildCanyon(scene: THREE.Scene, half: number, animators: Animator[]): void {
  const strata = strataTexture();
  // Only the sides, so the chasms have nothing plugging them.
  const face = wallAround([[half, half], [-half, half], [-half, -half], [half, -half]], -0.02, -200);
  const faceUv = face.getAttribute('uv');
  for (let i = 0; i < faceUv.count; i++) faceUv.setXY(i, faceUv.getX(i) * 0.02, faceUv.getY(i));
  scene.add(new THREE.Mesh(face, new THREE.MeshStandardMaterial({ map: strata, roughness: 1, side: THREE.DoubleSide })));
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const dist = half + 45 + ((i * 41) % 60);
    const height = 40 + ((i * 29) % 45);
    parts.push(new THREE.CylinderGeometry(9 + (i % 5) * 3, 16 + (i % 5) * 3, height + 100, 7).rotateY(i).translate(Math.cos(a) * dist, height / 2 - 60, Math.sin(a) * dist));
  }
  addMerged(scene, parts, new THREE.MeshStandardMaterial({ map: strata, roughness: 1, flatShading: true }));
  const masts: THREE.BufferGeometry[] = [];
  const beacons: [number, number, number][] = [];
  for (const [x, z, h] of [[half + 22, -half - 14, 34], [-half - 26, half + 8, 26], [-half - 8, -half - 30, 30]]) {
    masts.push(new THREE.CylinderGeometry(0.12, 0.3, h + 30, 5).translate(x, h / 2 - 15, z));
    masts.push(placedBox(2.6, 0.12, 0.12, x, h - 3, z));
    masts.push(placedBox(1.8, 0.12, 0.12, x, h - 6, z));
    beacons.push([x, h + 0.3, z]);
  }
  addMerged(scene, masts, new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.7 }));
  addBeacons(scene, animators, beacons);
}

/** Dark peaks with snow on their tips, under the aurora. */
function buildGlacier(scene: THREE.Scene, def: ArenaDef): void {
  const { half } = def;
  // A shelf of ice around the lake, then dark water all the way out to the mountains.
  scene.add(new THREE.Mesh(wallAround(deckPath(def), -0.01, -2.4), new THREE.MeshStandardMaterial({ color: 0x9fd2ea, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide })));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x06141f, roughness: 0.25, metalness: 0.4 }));
  water.position.y = -2.4;
  scene.add(water);
  const floes: THREE.BufferGeometry[] = [];
  const rand = sequence(909);
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2;
    const dist = half + 5 + rand() * rand() * 70;
    const size = 0.6 + rand() * 2.6;
    floes.push(new THREE.CylinderGeometry(size, size * 1.15, 0.6, 5 + Math.floor(rand() * 3)).rotateY(rand() * 6).translate(Math.cos(a) * dist, -2.2, Math.sin(a) * dist));
  }
  addMerged(scene, floes, new THREE.MeshStandardMaterial({ color: 0x8fb0c4, roughness: 0.7, flatShading: true }));
  const tinted = (geometry: THREE.BufferGeometry, hex: number) => {
    const color = new THREE.Color(hex);
    const { count } = geometry.getAttribute('position');
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
    return geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const dist = half + 50 + ((i * 31) % 70);
    const height = 40 + ((i * 47) % 50) + 70;
    const radius = 22 + (i % 4) * 5;
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    const y = (height - 70) / 2 - 45;
    parts.push(tinted(new THREE.ConeGeometry(radius, height, 6).rotateY(i).translate(x, y, z), 0x34506e));
    // The cap is the same cone's tip, a little proud of it.
    const cap = 0.24;
    parts.push(tinted(new THREE.ConeGeometry(radius * cap * 1.01, height * cap, 6).rotateY(i).translate(x, y + height / 2 - (height * cap) / 2 + 0.2, z), 0xdcebf8));
  }
  addMerged(scene, parts, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
}

/** A floodlit stadium: tiers edged in LED ribbon, a crowd of phone lights, and big screens up high. */
function buildStadium(scene: THREE.Scene, half: number, look: Look, glow: GlowBatch): void {
  const tiers: THREE.BufferGeometry[] = [];
  const crowd: number[] = [];
  const colors: number[] = [];
  const rand = sequence(12);
  const palette = [new THREE.Color(0xf2eadb), new THREE.Color(look.accent), new THREE.Color(0x8fc1dc), new THREE.Color(0xffffff)];
  for (let tier = 0; tier < 4; tier++) {
    const inset = half + 5 + tier * 4;
    const y = 2 + tier * 2.5;
    const top = y * 2 - 2;
    for (const side of [1, -1]) {
      tiers.push(placedBox(inset * 2 + 4, y * 2, 4, 0, y - 2, inset * side));
      tiers.push(placedBox(4, y * 2, inset * 2, inset * side, y - 2, 0));
      const face = inset - 2.06;
      glow.box(look.accent, face * 2, 0.16, 0.08, 0, top - 0.3, face * side);
      glow.box(look.accent, 0.08, 0.16, face * 2, face * side, top - 0.3, 0);
      for (let i = 0; i < 70; i++) {
        const along = (rand() * 2 - 1) * face;
        const seatY = top + 0.5 + rand() * 0.5;
        const rowOut = face + 1 + rand() * 3;
        crowd.push(...(i % 2 ? [along, seatY, rowOut * side] : [rowOut * side, seatY, along]));
        const picked = palette[Math.floor(rand() * palette.length)];
        colors.push(picked.r, picked.g, picked.b);
      }
    }
  }
  addMerged(scene, tiers, new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 1 }));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(crowd, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.34, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, toneMapped: false })));

  // A floodlight tower on each corner.
  const steel: THREE.BufferGeometry[] = [];
  const far = half + 24;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = far * sx;
    const z = far * sz;
    steel.push(placedBox(1.2, 44, 1.2, x, 20, z));
    const turn = Math.atan2(-sx, -sz);
    const inX = -sx * 0.7;
    const inZ = -sz * 0.7;
    steel.push(new THREE.BoxGeometry(9, 4, 0.4).rotateY(turn).translate(x, 40, z));
    glow.part(0xfff6e4, new THREE.BoxGeometry(8, 3.2, 0.12).rotateY(turn).translate(x + inX * 0.32, 40, z + inZ * 0.32));
    glow.wallHalo(0xfff6e4, 22, 12, x + inX * 0.7, 40, z + inZ * 0.7, turn);
  }
  addMerged(scene, steel, new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.4, roughness: 0.6 }));

  // A big screen above the top tier on two sides.
  for (const side of [1, -1]) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, alphaTest: 0.3, toneMapped: false, fog: false }));
    screen.position.set(0, 27, (half + 18) * side);
    screen.rotation.y = side > 0 ? Math.PI : 0;
    scene.add(screen);
    glow.wallHalo(look.accent, 22, 20, 0, 27, (half + 18.2) * side);
  }
}

/** Bulkheads with structural ribs and glowing vents. Nothing crosses overhead, where it could block the camera. */
function buildFoundry(scene: THREE.Scene, half: number, look: Look, glow: GlowBatch): void {
  const far = half + 7;
  const parts: THREE.BufferGeometry[] = [
    placedBox(far * 2 + 6, 26, 2, 0, 12, far), placedBox(far * 2 + 6, 26, 2, 0, 12, -far),
    placedBox(2, 26, far * 2, far, 12, 0), placedBox(2, 26, far * 2, -far, 12, 0),
  ];
  for (let i = -3; i <= 3; i++) {
    const along = i * 14 + 7;
    parts.push(placedBox(1.4, 26, 1, along, 12, far - 1.4), placedBox(1.4, 26, 1, along, 12, -far + 1.4));
    parts.push(placedBox(1, 26, 1.4, far - 1.4, 12, along), placedBox(1, 26, 1.4, -far + 1.4, 12, along));
  }
  addMerged(scene, parts, new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.75, metalness: 0.4 }));
  for (let i = -2; i <= 2; i++) {
    const along = i * 14;
    for (const side of [1, -1]) {
      glow.box(look.accent, 8, 0.3, 0.1, along, 12, (far - 1.04) * side);
      glow.box(look.accent, 0.1, 0.3, 8, (far - 1.04) * side, 12, along);
      glow.wallHalo(look.accent, 11, 4.5, along, 12, (far - 1.1) * side);
      glow.wallHalo(look.accent, 11, 4.5, (far - 1.1) * side, 12, along, Math.PI / 2);
    }
  }
  for (const side of [1, -1]) {
    glow.box(look.accent, far * 2 - 2, 0.16, 0.1, 0, 22, (far - 1.04) * side);
    glow.box(look.accent, 0.1, 0.16, far * 2 - 2, (far - 1.04) * side, 22, 0);
  }
}

function addFence(scene: THREE.Scene, b: Block, link: THREE.Texture, metal: THREE.Material): void {
  const length = Math.max(b.w, b.d);
  const height = 4.2;
  const texture = link.clone();
  texture.repeat.set(length / 0.9, height / 0.9);
  texture.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(length, height),
    new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  mesh.position.set(b.x, height / 2, b.z);
  if (b.d > b.w) mesh.rotation.y = Math.PI / 2;
  scene.add(mesh);
  const start = -length / 2;
  for (let along = 0; along <= length; along += 6) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, height + 0.5, 6), metal);
    const offset = start + along;
    post.position.set(b.x + (b.w > b.d ? offset : 0), (height + 0.5) / 2, b.z + (b.d > b.w ? offset : 0));
    post.castShadow = true;
    scene.add(post);
  }
}

/** Glass panes under gabled frames, in a row along the block's long side. */
function addSkylight(scene: THREE.Scene, b: Block): void {
  const curb = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.5, b.d), new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.8 }));
  curb.position.set(b.x, 0.25, b.z);
  curb.castShadow = true;
  scene.add(curb);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x1f6a8a, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.68, side: THREE.DoubleSide });
  const frame = new THREE.MeshStandardMaterial({ color: 0xc8d4dc, roughness: 0.5 });
  const panes = 3;
  const width = b.w / panes;
  const rise = 2.4;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2 + 0.1, 0);
  shape.lineTo(0, rise);
  shape.lineTo(width / 2 - 0.1, 0);
  shape.closePath();
  const prism = new THREE.ExtrudeGeometry(shape, { depth: b.d - 0.4, bevelEnabled: false });
  prism.translate(0, 0, -(b.d - 0.4) / 2);
  for (let i = 0; i < panes; i++) {
    const x = b.x - b.w / 2 + width * (i + 0.5);
    const pane = new THREE.Mesh(prism, glass);
    pane.position.set(x, 0.5, b.z);
    pane.castShadow = true;
    scene.add(pane);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, b.d - 0.3), frame);
    ridge.position.set(x, 0.5 + rise, b.z);
    scene.add(ridge);
  }
}

/** A dark concrete hut with a sloping front and a strip of hazard paint at its foot. */
function addBunker(scene: THREE.Scene, b: Block, stripes: THREE.Texture): void {
  const height = 3.6;
  const shape = new THREE.Shape();
  shape.moveTo(-b.d / 2, 0);
  shape.lineTo(-b.d / 2, height);
  shape.lineTo(b.d * 0.1, height);
  shape.lineTo(b.d / 2, 0.8);
  shape.lineTo(b.d / 2, 0);
  shape.closePath();
  const hut = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: b.w, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0x3e4249, roughness: 0.85 }),
  );
  // The profile is drawn sideways, so it turns to run along the block's width.
  hut.rotation.y = Math.PI / 2;
  hut.position.set(b.x - b.w / 2, 0, b.z);
  hut.castShadow = true;
  hut.receiveShadow = true;
  scene.add(hut);
  const texture = stripes.clone();
  texture.repeat.set(b.w / 3, 1);
  texture.needsUpdate = true;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(b.w, 0.8), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(b.x, 0.03, b.z - b.d / 2 - 0.45);
  scene.add(strip);
}

/** The big plant room at the back of the roof, tagged along its lower wall. */
function addShed(scene: THREE.Scene, b: Block, look: Look, glow: GlowBatch): void {
  const height = 6;
  const top = new THREE.MeshStandardMaterial({ color: 0x34373d, roughness: 0.9 });
  const wall = new THREE.MeshStandardMaterial({ map: graffitiTexture(), color: 0x9a9a9a, roughness: 0.9 });
  const shed = new THREE.Mesh(new THREE.BoxGeometry(b.w, height, b.d), [wall, wall, top, top, wall, wall]);
  shed.position.set(b.x, height / 2, b.z);
  shed.castShadow = true;
  shed.receiveShadow = true;
  scene.add(shed);
  // The logo painted up on the wall facing the roof.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshStandardMaterial({ map: logoTexture(), transparent: true, depthWrite: false, roughness: 0.9 }));
  sign.position.set(b.x - b.w * 0.28, height * 0.56, b.z - b.d / 2 - 0.03);
  sign.rotation.y = Math.PI;
  scene.add(sign);
  glow.box(look.second, b.w, 0.14, 0.08, b.x, height - 0.2, b.z - b.d / 2 - 0.05);
  glow.wallHalo(look.second, b.w, 2.4, b.x, height - 0.2, b.z - b.d / 2 - 0.06);
}

export function hazardTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(256, 64, (g) => {
    g.fillStyle = '#ff7f3f';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#141516';
    for (let x = -64; x < 320; x += 64) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 32, 64);
      g.lineTo(x + 96, 0);
      g.lineTo(x + 64, 0);
      g.fill();
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** Builds a saw blade whose spin axis is the object's local Y. */
export function buildSaw(): THREE.Group {
  const saw = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xbfc6cc, metalness: 0.95, roughness: 0.25 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(SAW_RADIUS * 0.85, SAW_RADIUS * 0.85, 0.12, 24), steel);
  disc.castShadow = true;
  saw.add(disc);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 4), steel);
    tooth.rotation.z = -Math.PI / 2;
    tooth.rotation.y = -a;
    tooth.position.set(Math.cos(a) * SAW_RADIUS * 0.92, 0, Math.sin(a) * SAW_RADIUS * 0.92);
    saw.add(tooth);
  }
  saw.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0xc9331f, roughness: 0.6 })));
  return saw;
}

/** Whether something on the floor is already here, so markings can keep clear of it. */
function floorTaken(def: ArenaDef, x: number, z: number, pad: number): boolean {
  const inCircle = (c: { x: number; z: number; r: number }) => Math.hypot(x - c.x, z - c.z) < c.r + pad;
  const inRect = (c: Rect) => Math.abs(x - c.x) < c.w / 2 + pad && Math.abs(z - c.z) < c.d / 2 + pad;
  const sawRect = (saw: ArenaDef['saws'][number]): Rect => {
    const long = saw.amplitude * 2 + SAW_RADIUS * 2;
    return saw.axis === 'x' ? { x: 0, z: saw.fixed, w: long, d: 3 } : { x: saw.fixed, z: 0, w: 3, d: long };
  };
  return [...def.pits, ...def.trapdoors, ...def.firePits, ...def.shockers, ...def.hammers, ...def.pillars, def.logo].some(inCircle)
    || [...def.chasms, ...def.conveyors, ...def.grinders, ...def.saws.map(sawRect)].some(inRect)
    || def.pistons.some((p) => inRect({ x: p.x + p.dirX * 4, z: p.z + p.dirZ * 4, w: p.dirX ? 10 : 6, d: p.dirX ? 6 : 10 }));
}

/** A thin bright line standing on the edge of the floor, and a glow rising from it. */
function addMergedEdge(scene: THREE.Scene, outline: [number, number][], color: number): void {
  scene.add(new THREE.Mesh(wallAround(outline, 0.05, -0.12), new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false, side: THREE.DoubleSide })));
  const texture = softTexture();
  const spill = wallAround(outline, 0.9, -0.9);
  scene.add(new THREE.Mesh(spill, new THREE.MeshBasicMaterial({ map: texture, color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide })));
}

/** A copper coil set in a dark plate, with warning paint around it. */
function coilTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#16181b';
    g.fillRect(0, 0, 256, 256);
    g.save();
    g.translate(128, 128);
    g.strokeStyle = '#c27a3f';
    g.lineWidth = 7;
    g.beginPath();
    for (let a = 0; a < Math.PI * 14; a += 0.08) {
      const r = 8 + (a / (Math.PI * 14)) * 100;
      if (a === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.stroke();
    for (let i = 0; i < 24; i++) {
      g.fillStyle = i % 2 ? '#4fd0ff' : '#101214';
      g.beginPath();
      g.arc(0, 0, 126, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2);
      g.arc(0, 0, 113, ((i + 1) / 24) * Math.PI * 2, (i / 24) * Math.PI * 2, true);
      g.fill();
    }
    g.restore();
  });
}

/** The map's own kind of obstacle, filling the space its round footprint takes up in the rules. */
function addPillarProp(scene: THREE.Scene, p: Pillar, look: Look, wall: number, plain: THREE.Material, glow: GlowBatch): void {
  const rand = sequence(Math.floor(Math.abs(p.x * 13 + p.z * 7)) + 21);
  const shadowed = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  switch (look.pillar) {
    case 'scrap': {
      // A stack of crushed cars, each block a different faded colour.
      const colors = [0x6a3a28, 0x3e4a50, 0x5a5230, 0x3a3d40, 0x552a24, 0x2e3a32, 0x5e4a3a];
      const parts: THREE.BufferGeometry[] = [];
      let y = 0;
      for (let i = 0; i < 5; i++) {
        const tall = 0.8 + rand() * 0.5;
        const side = p.r * (1.62 - i * 0.05);
        const block = new THREE.BoxGeometry(side, tall, side * (0.86 + rand() * 0.1), 3, 2, 3);
        const position = block.getAttribute('position');
        // Dented, because they've been through a crusher.
        for (let v = 0; v < position.count; v++) {
          position.setXYZ(v, position.getX(v) + (rand() - 0.5) * 0.14, position.getY(v) + (rand() - 0.5) * 0.1, position.getZ(v) + (rand() - 0.5) * 0.14);
        }
        block.rotateY((rand() - 0.5) * 0.5);
        block.translate(p.x + (rand() - 0.5) * 0.2, y + tall / 2, p.z + (rand() - 0.5) * 0.2);
        const color = new THREE.Color(colors[Math.floor(rand() * colors.length)]);
        const paint = new Float32Array(position.count * 3);
        for (let v = 0; v < position.count; v++) paint.set([color.r, color.g, color.b], v * 3);
        block.setAttribute('color', new THREE.BufferAttribute(paint, 3));
        parts.push(block.toNonIndexed());
        block.dispose();
        y += tall;
      }
      const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.15, flatShading: true }));
      for (const part of parts) part.dispose();
      scene.add(shadowed(mesh));
      return;
    }
    case 'tank': {
      // A pressure tank in warning yellow, with bands and a pipe.
      const tank = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(p.r * 0.92, 2.4, 8, 20), new THREE.MeshStandardMaterial({ color: 0xc89a2a, metalness: 0.4, roughness: 0.5 })));
      tank.position.set(p.x, p.r * 0.92 + 1.2, p.z);
      scene.add(tank);
      const bands: THREE.BufferGeometry[] = [];
      for (const y of [0.9, 2.6]) bands.push(new THREE.TorusGeometry(p.r * 0.94, 0.07, 6, 24).rotateX(Math.PI / 2).translate(p.x, y, p.z));
      bands.push(new THREE.CylinderGeometry(0.14, 0.14, 2.2, 8).translate(p.x, 5.2, p.z));
      addMerged(scene, bands, new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.6, roughness: 0.5 }));
      glow.box(look.second, 0.24, 0.24, 0.24, p.x, 6.4, p.z);
      return;
    }
    case 'chimney': {
      // A brick stack, with hot light showing through a slot and the top glowing.
      const stack = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.72, p.r, 7, 20), new THREE.MeshStandardMaterial({ color: 0x3a2a24, roughness: 0.9 })));
      stack.position.set(p.x, 3.5, p.z);
      scene.add(stack);
      for (const y of [2.1, 4.2]) glow.part(look.second, new THREE.CylinderGeometry(p.r * (1 - y * 0.04) + 0.03, p.r * (1 - y * 0.04) + 0.03, 0.14, 20, 1, true).translate(p.x, y, p.z));
      glow.part(look.accent, new THREE.CylinderGeometry(p.r * 0.56, p.r * 0.56, 0.12, 20).translate(p.x, 7.02, p.z));
      return;
    }
    case 'rock': {
      // A weathered stack of the map's own rock, its layers lining up with the cliffs.
      const geometry = new THREE.CylinderGeometry(p.r * 0.72, p.r * 1.04, 7, 9, 5);
      const position = geometry.getAttribute('position');
      const seen = new Map<string, [number, number]>();
      for (let v = 0; v < position.count; v++) {
        const key = `${position.getX(v).toFixed(3)},${position.getY(v).toFixed(3)},${position.getZ(v).toFixed(3)}`;
        // The same corner gets the same nudge, or the faces would split apart.
        const nudge = seen.get(key) ?? [(rand() - 0.5) * 0.5, (rand() - 0.5) * 0.5];
        seen.set(key, nudge);
        position.setXYZ(v, position.getX(v) + nudge[0], position.getY(v), position.getZ(v) + nudge[1]);
      }
      geometry.computeVertexNormals();
      const mesh = shadowed(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: strataTexture(), roughness: 1, flatShading: true })));
      mesh.position.set(p.x, 3.5, p.z);
      scene.add(mesh);
      return;
    }
    case 'ice': {
      // Shards of blue ice, thrust up through the lake and glowing faintly from inside.
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const out = i === 0 ? 0 : p.r * 0.62;
        const tall = i === 0 ? 7 : 2.4 + rand() * 2.6;
        const width = i === 0 ? p.r * 0.72 : p.r * (0.32 + rand() * 0.2);
        const shard = new THREE.ConeGeometry(width, tall, 5).rotateY(rand() * 6);
        shard.rotateZ(i === 0 ? 0 : Math.cos(a) * -0.16).rotateX(i === 0 ? 0 : Math.sin(a) * 0.16);
        parts.push(shard.translate(p.x + Math.cos(a) * out, tall / 2 - 0.1, p.z + Math.sin(a) * out));
      }
      const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: 0x9fdcf0, emissive: 0x1f6a8a, emissiveIntensity: 0.65, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.88, flatShading: true }));
      for (const part of parts) part.dispose();
      mesh.castShadow = true;
      scene.add(mesh);
      return;
    }
    default: {
      // A steel column with a band of warning paint, and a lit ring near its head.
      const column = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.92, p.r * 1.04, 5.4, 24), plain));
      column.position.set(p.x, 2.7, p.z);
      scene.add(column);
      const strip = hazardTexture();
      strip.repeat.set(4, 1);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 1.06, p.r * 1.07, 0.7, 24, 1, true), new THREE.MeshStandardMaterial({ map: strip, roughness: 0.7 }));
      band.position.set(p.x, 0.6, p.z);
      scene.add(band);
      glow.part(look.accent, new THREE.CylinderGeometry(p.r * 0.96, p.r * 0.96, 0.16, 24, 1, true).translate(p.x, 4.7, p.z));
      glow.part(look.accent, new THREE.CylinderGeometry(p.r * 0.6, p.r * 0.6, 0.14, 24).translate(p.x, 5.46, p.z));
      void wall;
    }
  }
}

function buildBackdrop(scene: THREE.Scene, def: ArenaDef, look: Look, glow: GlowBatch, animators: Animator[]): void {
  const { half, theme } = def;
  if (theme.backdrop === 'stands') buildStadium(scene, half, look, glow);
  else if (theme.backdrop === 'foundry') buildFoundry(scene, half, look, glow);
  else if (theme.backdrop === 'night') buildNightCity(scene, half, look, glow, animators);
  else if (theme.backdrop === 'sea') buildRig(scene, def, look, glow, animators);
  else if (theme.backdrop === 'canyon') buildCanyon(scene, half, animators);
  else buildGlacier(scene, def);
}

export interface Ledge {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
}

export interface ArenaScene {
  def: ArenaDef;
  scene: THREE.Scene;
  /** Scenery below the floor that a falling robot lands on. */
  ledges: Ledge[];
  saws: THREE.Group[];
  shockers: THREE.MeshStandardMaterial[];
  fire: THREE.MeshStandardMaterial;
  hill: THREE.Mesh;
  /** Stands in for the light reflections would give, on settings without them. */
  fill: THREE.AmbientLight;
  /** Moves the scenery that has nothing to do with the match, such as signs and air traffic. */
  animate: Animator;
  /** Moves the hazards, by the match's clock, because the rules go by that. */
  sync: (matchTime: number) => void;
}

export function buildArena(def: ArenaDef): ArenaScene {
  const { half, theme } = def;
  const look = LOOKS[def.id];
  const scene = new THREE.Scene();
  scene.background = skyTexture(look);
  scene.fog = new THREE.Fog(theme.sky, theme.fogNear, theme.fogFar);
  const glow = new GlowBatch();
  const animators: Animator[] = [];
  if (look.drift) {
    animators.push((time) => {
      scene.backgroundRotation.y = time * look.drift!;
    });
  }

  scene.add(new THREE.HemisphereLight(0xc8d4e8, 0x2c2c30, theme.backdrop === 'night' ? 0.8 : 1.1));
  const fill = new THREE.AmbientLight(0xffffff, 0);
  scene.add(fill);
  const sun = new THREE.DirectionalLight(theme.light, theme.sunIntensity);
  sun.position.set(24, 50, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const reach = half + 6;
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  // From low on the far side in the map's own colour, so every robot gets a coloured edge.
  const rim = new THREE.DirectionalLight(look.accent, 0.55);
  rim.position.set(-22, 10, -28);
  scene.add(rim);

  const size = half * 2;
  const concrete = look.floor === 'concrete';
  const floor = new THREE.Mesh(
    floorGeometry(def),
    new THREE.MeshStandardMaterial({
      map: FLOORS[look.floor](),
      color: theme.floor,
      // Kept fairly matte, or the low coloured light glares off the whole floor.
      metalness: concrete || look.floor === 'rock' ? 0 : def.grip < 0.5 ? 0.2 : 0.25,
      // Ice is the shiny one, but not so shiny that the sun's reflection hides what's on it.
      roughness: concrete || look.floor === 'rock' ? 0.95 : def.grip < 0.5 ? 0.58 : 0.82,
    }),
  );
  floor.receiveShadow = true;
  scene.add(floor);

  const stripes = hazardTexture();
  if (def.walled) {
    // Ground beyond the walls, with the middle left out so it can't plug a hole in the floor.
    const beyond = new THREE.Shape([new THREE.Vector2(-200, -200), new THREE.Vector2(200, -200), new THREE.Vector2(200, 200), new THREE.Vector2(-200, 200)]);
    beyond.holes.push(new THREE.Path([new THREE.Vector2(-half, -half), new THREE.Vector2(-half, half), new THREE.Vector2(half, half), new THREE.Vector2(half, -half)]));
    const outer = new THREE.Mesh(new THREE.ShapeGeometry(beyond).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 1 }));
    outer.position.y = -0.1;
    scene.add(outer);

    // Dark walls with ribs, lit by a band of LEDs along the top and a line at the foot.
    const h = def.wallHeight;
    const t = 1.2;
    const walls: THREE.BufferGeometry[] = [];
    const ribs: THREE.BufferGeometry[] = [];
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const alongX = nz !== 0;
      const length = alongX ? size + t * 2 : size;
      walls.push(placedBox(alongX ? length : t, h, alongX ? t : length, nx * (half + t / 2), h / 2, nz * (half + t / 2)));
      const face = half - 0.04;
      const line = (color: number, y: number, tall: number) => glow.box(color, alongX ? size : 0.06, tall, alongX ? 0.06 : size, nx * face, y, nz * face);
      line(look.accent, h - 0.3, 0.16);
      line(look.second, 0.14, 0.06);
      glow.wallHalo(look.accent, size, 1.8, nx * (face - 0.03), h - 0.3, nz * (face - 0.03), alongX ? 0 : Math.PI / 2);
      glow.floorHalo(look.accent, alongX ? size : 1.1, alongX ? 1.1 : size, nx * (half - 0.55), nz * (half - 0.55));
      for (let along = -half + 6; along < half; along += 6) {
        ribs.push(placedBox(alongX ? 0.3 : 0.14, h - 0.7, alongX ? 0.14 : 0.3, alongX ? along : nx * (half - 0.07), (h - 0.7) / 2 + 0.2, alongX ? nz * (half - 0.07) : along));
      }
    }
    const wallMat = new THREE.MeshStandardMaterial({ color: theme.wall, metalness: 0.6, roughness: 0.55 });
    addMerged(scene, walls, wallMat).castShadow = true;
    addMerged(scene, ribs, new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.5, roughness: 0.6 }));

    // Fine lane markings set into the floor. Open maps go without, or they'd read as the edge.
    const inset = half * 0.72;
    const marking = new THREE.Color(look.accent).multiplyScalar(0.42).getHex();
    for (let along = -inset; along < inset; along += 3.6) {
      const middle = along + 0.9;
      for (const side of [inset, -inset]) {
        if (!floorTaken(def, middle, side, 1.6)) glow.flat(marking, 1.8, 0.09, middle, side);
        if (!floorTaken(def, side, middle, 1.6)) glow.flat(marking, 0.09, 1.8, side, middle);
      }
    }
  } else {
    // A line of light at the floor's edge, which follows its real shape, so the drop is easy to read while driving.
    const outline = deckPath(def);
    addMergedEdge(scene, outline, look.accent);
  }

  buildBackdrop(scene, def, look, glow, animators);
  // A logo over a trapdoor is painted on the doors instead.
  if (!def.trapdoors.some((door) => Math.hypot(door.x - def.logo.x, door.z - def.logo.z) < 1)) addFloorLogo(scene, def.logo.x, def.logo.z, def.logo.r);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2e3136, metalness: 0.4, roughness: 0.6 });
  const link = def.blocks.some((b) => b.kind === 'fence') ? chainLinkTexture() : null;
  for (const block of def.blocks) {
    if (block.kind === 'fence') addFence(scene, block, link!, metal);
    else if (block.kind === 'skylight') addSkylight(scene, block);
    else if (block.kind === 'bunker') addBunker(scene, block, stripes);
    else addShed(scene, block, look, glow);
  }

  // Pillars with glowing caps.
  const pillarMat = new THREE.MeshStandardMaterial({ color: theme.wall, metalness: 0.5, roughness: 0.5 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0xbd4d1c, metalness: 0.3, roughness: 0.55 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.3, roughness: 0.7 });
  for (const p of def.pillars) {
    if (p.prop === 'barrel') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 2.1, 24), barrelMat);
      barrel.position.set(p.x, 1.05, p.z);
      barrel.castShadow = true;
      scene.add(barrel);
      for (const y of [0.5, 1.6]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.05, 4, 16), metal);
        band.rotation.x = Math.PI / 2;
        band.position.set(p.x, y, p.z);
        scene.add(band);
      }
      continue;
    }
    if (p.prop === 'pole') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.7, p.r, 9, 16), poleMat);
      pole.position.set(p.x, 4.5, p.z);
      pole.castShadow = true;
      scene.add(pole);
      glow.box(look.accent, p.r * 2.4, 0.2, p.r * 2.4, p.x, 9.1, p.z);
      continue;
    }
    addPillarProp(scene, p, look, theme.wall, pillarMat, glow);
  }

  const sync = buildHazards(scene, def, look.hole, glow);
  for (const bridge of look.bridges ?? []) addBridge(scene, bridge);

  // The sentries and everything else that burns share this, so it all flickers together.
  const fire = new THREE.MeshStandardMaterial({ color: 0xb02a00, emissive: 0xff3a00, emissiveIntensity: 0.8 });

  const shockers: THREE.MeshStandardMaterial[] = [];
  for (const s of def.shockers) {
    const map = coilTexture();
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0x7fdcff, emissiveIntensity: 0.1, roughness: 0.5, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(s.r, 40).rotateX(-Math.PI / 2), mat);
    disc.position.set(s.x, 0.024, s.z);
    disc.receiveShadow = true;
    scene.add(disc);
    shockers.push(mat);
  }

  const sentryBody = new THREE.MeshStandardMaterial({ color: 0x2a2320, metalness: 0.5, roughness: 0.55 });
  for (const s of def.sentries) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 2.6, 24), sentryBody);
    base.position.set(s.x, 1.3, s.z);
    base.castShadow = true;
    scene.add(base);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 20), fire);
    nozzle.position.set(s.x, 2.8, s.z);
    scene.add(nozzle);
    // Only the quarter facing the map. The rest of the circle would be inside the walls.
    const facing = Math.atan2(Math.sign(s.z), -Math.sign(s.x));
    const warn = new THREE.Mesh(new THREE.RingGeometry(s.range - 0.2, s.range, 24, 1, facing - Math.PI / 4, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    warn.rotation.x = -Math.PI / 2;
    warn.position.set(s.x, 0.03, s.z);
    scene.add(warn);
  }

  // Saw tracks and blades, with a warning line down each side of the slot.
  const trench = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const saws: THREE.Group[] = [];
  for (const saw of def.saws) {
    const length = saw.amplitude * 2 + SAW_RADIUS * 2;
    const alongX = saw.axis === 'x';
    const trackX = alongX ? 0 : saw.fixed;
    const trackZ = alongX ? saw.fixed : 0;
    const track = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? length : 0.7, alongX ? 0.7 : length).rotateX(-Math.PI / 2), trench);
    track.position.set(trackX, 0.02, trackZ);
    scene.add(track);
    for (const side of [0.42, -0.42]) {
      glow.flat(DANGER, alongX ? length : 0.07, alongX ? 0.07 : length, trackX + (alongX ? 0 : side), trackZ + (alongX ? side : 0), 0.024);
    }
    const mesh = buildSaw();
    mesh.position.y = 0.5;
    scene.add(mesh);
    saws.push(mesh);
  }

  // The King of the Hill zone. Only shown in that mode.
  const zoneColor = 0xfff1dc;
  const hill = new THREE.Mesh(
    new THREE.RingGeometry(def.hill.r - 0.3, def.hill.r, 48),
    new THREE.MeshBasicMaterial({ color: zoneColor, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false }),
  );
  hill.add(new THREE.Mesh(new THREE.CircleGeometry(def.hill.r - 0.3, 48), new THREE.MeshBasicMaterial({ color: zoneColor, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })));
  hill.rotation.x = -Math.PI / 2;
  hill.position.set(def.hill.x, 0.05, def.hill.z);
  hill.visible = false;
  scene.add(hill);

  if (look.motes) addMotes(scene, animators, half, look.motes);
  glow.build(scene);

  return {
    def, scene, saws, shockers, fire, hill, fill, sync,
    ledges: theme.backdrop === 'night' ? nightCityLedges(half) : [],
    animate: (time) => {
      for (const animator of animators) animator(time);
    },
  };
}
