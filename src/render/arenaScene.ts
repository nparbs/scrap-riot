import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SAW_RADIUS, type ArenaDef, type Block } from '../sim/arena';
import { drawLogo } from './logo';

/** `rusty` adds rust and rivets. Natural ground such as ice or rock leaves them out. */
function floorTexture(rusty: boolean): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#6a6d70';
  g.fillRect(0, 0, size, size);

  // Grime, then rust, then the plate seams and rivets on top.
  for (let i = 0; i < 2600; i++) {
    const shade = 70 + Math.random() * 45;
    g.fillStyle = `rgba(${shade},${shade},${shade + 3},0.16)`;
    const r = 2 + Math.random() * 16;
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; rusty && i < 70; i++) {
    g.fillStyle = `rgba(${110 + Math.random() * 40},${60 + Math.random() * 20},25,0.14)`;
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, 6 + Math.random() * 34, 0, Math.PI * 2);
    g.fill();
  }
  const plate = size / 4;
  g.strokeStyle = '#2a2c2e';
  g.lineWidth = rusty ? 5 : 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * plate, 0);
    g.lineTo(i * plate, size);
    g.moveTo(0, i * plate);
    g.lineTo(size, i * plate);
    g.stroke();
  }
  g.fillStyle = '#85898d';
  for (let x = 0; rusty && x < 4; x++) {
    for (let y = 0; y < 4; y++) {
      for (const [ox, oy] of [[18, 18], [plate - 18, 18], [18, plate - 18], [plate - 18, plate - 18]]) {
        g.beginPath();
        g.arc(x * plate + ox, y * plate + oy, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Stained, weathered concrete in the olive greys of the original rooftop. */
function roofTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#5c5e49';
  g.fillRect(0, 0, size, size);
  // A fixed sequence, so every player sees the same stains.
  let seed = 4242;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stain = (x: number, y: number, rx: number, ry: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  };
  // Broad dark patches first, each one a cluster of smaller blots with a rough edge.
  for (let i = 0; i < 26; i++) {
    const x = rand() * size;
    const y = rand() * size;
    for (let j = 0; j < 60; j++) {
      const spread = 40 + rand() * 90;
      const a = rand() * Math.PI * 2;
      stain(x + Math.cos(a) * spread, y + Math.sin(a) * spread * 0.7, 4 + rand() * 18, 3 + rand() * 10, `rgba(22,24,18,${0.06 + rand() * 0.1})`);
    }
  }
  // Then fine grit over everything.
  for (let i = 0; i < 3200; i++) {
    const light = rand() < 0.45;
    stain(rand() * size, rand() * size, 1 + rand() * 7, 1 + rand() * 4, light ? `rgba(130,134,106,${0.06 + rand() * 0.12})` : `rgba(26,28,22,${0.06 + rand() * 0.14})`);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.2, 1.2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const WINDOW_CELLS = 8;

/** A tile of big office windows, some lit and some dark. */
function windowTexture(): THREE.CanvasTexture {
  const size = 512;
  const cell = size / WINDOW_CELLS;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#050508';
  g.fillRect(0, 0, size, size);
  const lit = ['#d6dfa6', '#e8e8c4', '#a9bc82', '#c3cf95', '#dcd29a'];
  let seed = 77;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < WINDOW_CELLS; y++) {
    for (let x = 0; x < WINDOW_CELLS; x++) {
      if (rand() < 0.42) continue;
      g.fillStyle = lit[Math.floor(rand() * lit.length)];
      g.fillRect(x * cell + cell * 0.26, y * cell + cell * 0.2, cell * 0.48, cell * 0.6);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
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

function duskBackground(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 512;
  const g = canvas.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#12132a');
  sky.addColorStop(0.3, '#2b2a55');
  sky.addColorStop(0.48, '#6a4a70');
  sky.addColorStop(0.6, '#c97f6d');
  sky.addColorStop(0.68, '#3a2f3c');
  sky.addColorStop(1, '#0c0c12');
  g.fillStyle = sky;
  g.fillRect(0, 0, 4, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Draws the game's name in the original's hot orange neon. */
function billboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const fill = g.createLinearGradient(0, 20, 0, 108);
  fill.addColorStop(0, '#ffd23a');
  fill.addColorStop(1, '#ff4a12');
  g.font = 'italic 900 92px Impact, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = '#3a0e04';
  g.strokeText('SCRAP RIOT', 256, 66);
  g.fillStyle = fill;
  g.fillText('SCRAP RIOT', 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let sharedLogo: THREE.CanvasTexture | null = null;

/** The game's logo, shared by every sign and floor marking. */
function logoTexture(): THREE.CanvasTexture {
  if (sharedLogo) return sharedLogo;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  drawLogo(canvas.getContext('2d')!, 512);
  sharedLogo = new THREE.CanvasTexture(canvas);
  sharedLogo.colorSpace = THREE.SRGBColorSpace;
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
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#23262a';
  g.fillRect(0, 0, 512, 128);
  let seed = 9;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const inks = ['#2fa8a0', '#3a7fbf', '#7fc8a8', '#a8407f'];
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
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Chain link, drawn with transparent gaps. */
function chainLinkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.strokeStyle = '#8f938a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 32);
  g.lineTo(32, 0);
  g.lineTo(64, 32);
  g.lineTo(32, 64);
  g.closePath();
  g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The city around the roof. The towers merge into one draw, so all this costs one call per material. */
function buildNightCity(scene: THREE.Scene, half: number): void {
  scene.background = duskBackground();
  const map = windowTexture();
  const towers: THREE.BufferGeometry[] = [];
  // The roof's own building, whose windows show when looking over the edge.
  towers.push(towerGeometry(half * 2, 300, half * 2, 0, -150.1, 0, 4.5));

  // Huge neighbours crowding right up against the roof.
  // They leave gaps, so the sunset shows between them.
  const near: [number, number, number, number, number][] = [
    [-half - 30, half + 30, 34, 34, 74], [14, half + 38, 44, 26, 60], [half + 44, half + 10, 26, 34, 90],
    [half + 36, -16, 20, 26, 26], [-half - 38, -8, 24, 34, 48], [-half - 26, -half - 38, 30, 26, 70],
    [10, -half - 48, 34, 24, 24], [half + 40, -half - 42, 26, 30, 62],
  ];
  for (const [x, z, w, d, top] of near) towers.push(towerGeometry(w, top + 300, d, x, top - (top + 300) / 2, z, 4.2));
  // Lower ledges behind the fenced sides, which carry the neon.
  towers.push(towerGeometry(36, 300, 12, -12, -152, half + 7, 4.2));
  towers.push(towerGeometry(12, 300, 30, -half - 7, -152, 16, 4.2));
  towers.push(towerGeometry(34, 300, 12, 28, -160, half + 7, 4.2));
  scene.add(new THREE.Mesh(mergeGeometries(towers), new THREE.MeshBasicMaterial({ map })));
  for (const tower of towers) tower.dispose();

  // A smaller skyline further out, dimmed so it sits back behind the big towers.
  const skyline: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + 0.2;
    const dist = half + 110 + ((i * 53) % 130);
    const top = 2 + ((i * 37) % 62);
    const w = 16 + (i % 5) * 5;
    skyline.push(towerGeometry(w, top + 300, w, Math.cos(a) * dist, top - (top + 300) / 2, Math.sin(a) * dist, 2.8));
  }
  scene.add(new THREE.Mesh(mergeGeometries(skyline), new THREE.MeshBasicMaterial({ map, color: 0x8c8f7c })));
  for (const tower of skyline) tower.dispose();

  // Neon ledges on the buildings just below the roof.
  const neon = (color: number, w: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false }));
    mesh.position.set(x, y, z);
    scene.add(mesh);
  };
  neon(0xf0e23a, 36, 0.5, -12, -1.8, half + 13);
  neon(0xf0e23a, 0.5, 30, -half - 13, -1.8, 16);
  neon(0x38d8ff, 34, 0.5, 28, -9.8, half + 13);

  // Billboards up on the towers behind the roof.
  const board = new THREE.MeshBasicMaterial({ map: billboardTexture(), transparent: true, toneMapped: false });
  const billboard = (width: number, x: number, y: number, z: number, turn: number) => {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), board);
    sign.position.set(x, y, z);
    sign.rotation.y = turn;
    scene.add(sign);
  };
  billboard(30, 14, 44, half + 24.9, Math.PI);
  billboard(24, half + 30.9, 62, half + 10, -Math.PI / 2);

  // The gear sign on two poles behind the back of the roof.
  const gear = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, alphaTest: 0.3 }),
  );
  gear.position.set(-8, 8, half + 1);
  gear.rotation.y = Math.PI;
  scene.add(gear);
  const post = new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.9 });
  for (const x of [-11, -5]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 10, 6), post);
    pole.position.set(x, 5, half + 1.1);
    scene.add(pole);
  }

  // Thin posts all round the edge, which mark it without stopping anything.
  const posts: THREE.BufferGeometry[] = [];
  for (let along = -half; along <= half; along += 7.5) {
    for (const [x, z] of [[along, half - 0.3], [along, -half + 0.3], [half - 0.3, along], [-half + 0.3, along]]) {
      const rail = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 5);
      rail.translate(x, 0.55, z);
      posts.push(rail);
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(posts), post));
  for (const rail of posts) rail.dispose();
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
  const curb = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.5, b.d), new THREE.MeshStandardMaterial({ color: 0x3a3a30, roughness: 0.9 }));
  curb.position.set(b.x, 0.25, b.z);
  curb.castShadow = true;
  scene.add(curb);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfd9c0, emissive: 0x4a5040, roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
  const frame = new THREE.MeshStandardMaterial({ color: 0xe0e0d0, roughness: 0.6 });
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
    new THREE.MeshStandardMaterial({ color: 0x25261f, roughness: 0.95 }),
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
function addShed(scene: THREE.Scene, b: Block): void {
  const height = 6;
  const top = new THREE.MeshStandardMaterial({ color: 0x1f2019, roughness: 0.95 });
  const wall = new THREE.MeshStandardMaterial({ map: graffitiTexture(), color: 0x8c8c8c, roughness: 0.9 });
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
}

function hazardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#e6b422';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#17181a';
  for (let x = -64; x < 320; x += 64) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 32, 64);
    g.lineTo(x + 96, 0);
    g.lineTo(x + 64, 0);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
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

function buildBackdrop(scene: THREE.Scene, def: ArenaDef): void {
  const { half, theme } = def;
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    scene.add(mesh);
  };

  if (theme.backdrop === 'stands') {
    // Stands beyond the walls, fading into fog, so the arena does not float in a void.
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 1 });
    for (let tier = 0; tier < 4; tier++) {
      const inset = half + 5 + tier * 4;
      const y = 2 + tier * 2.5;
      add(inset * 2 + 4, y * 2, 4, 0, y - 2, inset, mat);
      add(inset * 2 + 4, y * 2, 4, 0, y - 2, -inset, mat);
      add(4, y * 2, inset * 2, inset, y - 2, 0, mat);
      add(4, y * 2, inset * 2, -inset, y - 2, 0, mat);
    }
    return;
  }

  if (theme.backdrop === 'foundry') {
    // Tall dark bulkheads with glowing vents.
    const wall = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.9, metalness: 0.4 });
    const vent = new THREE.MeshStandardMaterial({ color: 0xa8400c, emissive: 0xff5a10, emissiveIntensity: 0.7 });
    const far = half + 7;
    add(far * 2 + 6, 26, 2, 0, 12, far, wall);
    add(far * 2 + 6, 26, 2, 0, 12, -far, wall);
    add(2, 26, far * 2, far, 12, 0, wall);
    add(2, 26, far * 2, -far, 12, 0, wall);
    for (let i = -2; i <= 2; i++) {
      add(6, 1.2, 0.3, i * 14, 15, far - 1.1, vent);
      add(6, 1.2, 0.3, i * 14, 15, -far + 1.1, vent);
      add(0.3, 1.2, 6, far - 1.1, 15, i * 14, vent);
      add(0.3, 1.2, 6, -far + 1.1, 15, i * 14, vent);
    }
    return;
  }

  if (theme.backdrop === 'night') {
    buildNightCity(scene, half);
    return;
  }

  // Open maps sit on top of a tall column, so the drop looks as lethal as it is.
  const base = theme.backdrop === 'city' ? 0x3a4250 : theme.backdrop === 'canyon' ? 0xa86a3e : 0x8fa8c2;
  const columnMat = new THREE.MeshStandardMaterial({ color: base, roughness: 1 });
  add(half * 2, 200, half * 2, 0, -100.05, 0, columnMat);

  // Fixed spacing rather than random placement, so every player sees the same scenery.
  if (theme.backdrop === 'city') {
    const tower = new THREE.MeshStandardMaterial({ color: 0x2d3648, roughness: 0.9 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, emissive: 0xffa83a, emissiveIntensity: 0.45 });
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const dist = half + 30 + ((i * 37) % 70);
      const height = 30 + ((i * 53) % 90);
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      const top = height - 60;
      const width = 9 + (i % 4) * 2.5;
      add(width, height + 100, width, x, top - (height + 100) / 2, z, tower);
      for (let row = 0; row < 3; row++) add(width + 0.1, 0.5, width + 0.1, x, top - 5 - row * 11, z, glass);
    }
  } else if (theme.backdrop === 'canyon') {
    const rock = new THREE.MeshStandardMaterial({ color: 0x9c5f38, roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const dist = half + 45 + ((i * 41) % 60);
      const height = 40 + ((i * 29) % 45);
      const mesa = new THREE.Mesh(new THREE.CylinderGeometry(9 + (i % 5) * 3, 16 + (i % 5) * 3, height + 100, 7), rock);
      mesa.position.set(Math.cos(a) * dist, height / 2 - 60, Math.sin(a) * dist);
      mesa.rotation.y = i;
      scene.add(mesa);
    }
  } else {
    const snow = new THREE.MeshStandardMaterial({ color: 0xe8f2fb, roughness: 0.8, flatShading: true });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const dist = half + 50 + ((i * 31) % 70);
      const height = 40 + ((i * 47) % 50);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(22 + (i % 4) * 5, height + 70, 6), snow);
      peak.position.set(Math.cos(a) * dist, height / 2 - 45, Math.sin(a) * dist);
      peak.rotation.y = i;
      scene.add(peak);
    }
  }
}

export interface ArenaScene {
  def: ArenaDef;
  scene: THREE.Scene;
  saws: THREE.Group[];
  shockers: THREE.MeshStandardMaterial[];
  pistons: THREE.Group[];
  fire: THREE.MeshStandardMaterial;
  hill: THREE.Mesh;
  /** Stands in for the light reflections would give, on settings without them. */
  fill: THREE.AmbientLight;
}

export function buildArena(def: ArenaDef): ArenaScene {
  const { half, theme } = def;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.sky, theme.fogNear, theme.fogFar);

  scene.add(new THREE.HemisphereLight(0xc8d4e8, 0x38302a, theme.backdrop === 'night' ? 0.8 : 1.1));
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

  const size = half * 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      map: theme.backdrop === 'night' ? roofTexture() : floorTexture(theme.backdrop !== 'ice' && theme.backdrop !== 'canyon'),
      color: theme.floor,
      metalness: theme.backdrop === 'night' ? 0 : def.grip < 0.5 ? 0.25 : 0.5,
      roughness: theme.backdrop === 'night' ? 0.95 : def.grip < 0.5 ? 0.18 : 0.75,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const stripes = hazardTexture();
  if (def.walled) {
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    scene.add(outer);

    // Walls, each topped with a band of hazard paint.
    const wallMat = new THREE.MeshStandardMaterial({ color: theme.wall, metalness: 0.6, roughness: 0.6 });
    const h = def.wallHeight;
    const t = 1.2;
    const sides: [number, number, number, number][] = [
      [0, half + t / 2, size + t * 2, t],
      [0, -half - t / 2, size + t * 2, t],
      [half + t / 2, 0, t, size],
      [-half - t / 2, 0, t, size],
    ];
    for (const [x, z, w, d] of sides) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, h / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);

      const bandTexture = stripes.clone();
      bandTexture.repeat.set(Math.max(w, d) / 4, 1);
      bandTexture.needsUpdate = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.5, d + 0.04), new THREE.MeshStandardMaterial({ map: bandTexture, roughness: 0.7 }));
      band.position.set(x, h - 0.25, z);
      scene.add(band);
    }
  } else {
    // Hazard paint at the floor's edge, so the drop is easy to read while driving.
    const edge = new THREE.MeshStandardMaterial({ color: theme.backdrop === 'night' ? 0x8a8a68 : 0xe6b422, roughness: 0.8 });
    const w = 0.5;
    const strip = (sx: number, sz: number, x: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), edge);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.02, z);
      scene.add(mesh);
    };
    strip(size, w, 0, half - w / 2);
    strip(size, w, 0, -half + w / 2);
    strip(w, size, half - w / 2, 0);
    strip(w, size, -half + w / 2, 0);
  }

  buildBackdrop(scene, def);
  addFloorLogo(scene, def.logo.x, def.logo.z, def.logo.r);
  const metal = new THREE.MeshStandardMaterial({ color: 0x34352d, metalness: 0.4, roughness: 0.7 });
  const link = def.blocks.some((b) => b.kind === 'fence') ? chainLinkTexture() : null;
  for (const block of def.blocks) {
    if (block.kind === 'fence') addFence(scene, block, link!, metal);
    else if (block.kind === 'skylight') addSkylight(scene, block);
    else if (block.kind === 'bunker') addBunker(scene, block, stripes);
    else addShed(scene, block);
  }

  // Pillars with glowing caps.
  const pillarMat = new THREE.MeshStandardMaterial({ color: theme.wall, metalness: 0.5, roughness: 0.6 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xc86a18, emissive: 0xff7a10, emissiveIntensity: 0.7 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4a3224, metalness: 0.2, roughness: 0.85 });
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
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.7, p.r, 9, 16), barrelMat);
      pole.position.set(p.x, 4.5, p.z);
      pole.castShadow = true;
      scene.add(pole);
      continue;
    }
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.1, 5, 24), pillarMat);
    pillar.position.set(p.x, 2.5, p.z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.7, p.r * 0.7, 0.25, 24), capMat);
    cap.position.set(p.x, 5.1, p.z);
    scene.add(cap);
  }

  // Pits are drawn as black holes ringed in hazard paint.
  const pitMat = new THREE.MeshBasicMaterial({ color: 0x020203 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.8 });
  for (const p of def.pits) {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(p.r, 32), pitMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(p.x, 0.025, p.z);
    scene.add(hole);
    const ring = new THREE.Mesh(new THREE.RingGeometry(p.r, p.r + 0.4, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.03, p.z);
    scene.add(ring);
  }

  const fire = new THREE.MeshStandardMaterial({ color: 0xb02a00, emissive: 0xff3a00, emissiveIntensity: 0.8 });
  for (const f of def.firePits) {
    const bed = new THREE.Mesh(new THREE.CircleGeometry(f.r, 28), fire);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(f.x, 0.03, f.z);
    scene.add(bed);
    const lip = new THREE.Mesh(new THREE.RingGeometry(f.r, f.r + 0.5, 28), new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 1 }));
    lip.rotation.x = -Math.PI / 2;
    lip.position.set(f.x, 0.035, f.z);
    scene.add(lip);
  }

  const shockers: THREE.MeshStandardMaterial[] = [];
  for (const s of def.shockers) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b4a66, emissive: 0x4fd0ff, emissiveIntensity: 0.1, transparent: true, opacity: 0.85 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(s.r, 32), mat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(s.x, 0.03, s.z);
    scene.add(disc);
    shockers.push(mat);
    for (const radius of [s.r * 0.45, s.r * 0.95]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.1, 6, 32), new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.8, roughness: 0.4 }));
      coil.rotation.x = Math.PI / 2;
      coil.position.set(s.x, 0.1, s.z);
      scene.add(coil);
    }
  }

  const pistons: THREE.Group[] = [];
  const headMat = new THREE.MeshStandardMaterial({ color: 0xe6b422, metalness: 0.5, roughness: 0.5 });
  const rodMat = new THREE.MeshStandardMaterial({ color: 0xc0c6cc, metalness: 0.9, roughness: 0.3 });
  for (const p of def.pistons) {
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    group.rotation.y = Math.atan2(p.dirX, p.dirZ);
    const head = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 1.2), headMat);
    head.position.set(0, 1.2, 0.6);
    head.castShadow = true;
    group.add(head);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 8), rodMat);
    rod.position.set(0, 1.2, -4);
    group.add(rod);
    scene.add(group);
    pistons.push(group);
  }

  const sentryBody = new THREE.MeshStandardMaterial({ color: 0x3a2a24, metalness: 0.5, roughness: 0.6 });
  for (const s of def.sentries) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 2.6, 24), sentryBody);
    base.position.set(s.x, 1.3, s.z);
    base.castShadow = true;
    scene.add(base);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 20), fire);
    nozzle.position.set(s.x, 2.8, s.z);
    scene.add(nozzle);
    const warn = new THREE.Mesh(new THREE.RingGeometry(s.range - 0.2, s.range, 40), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.4 }));
    warn.rotation.x = -Math.PI / 2;
    warn.position.set(s.x, 0.03, s.z);
    scene.add(warn);
  }

  // Saw tracks and blades.
  const trench = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 1 });
  const saws: THREE.Group[] = [];
  for (const saw of def.saws) {
    const length = saw.amplitude * 2 + SAW_RADIUS * 2;
    const track = new THREE.Mesh(new THREE.PlaneGeometry(saw.axis === 'x' ? length : 0.7, saw.axis === 'z' ? length : 0.7), trench);
    track.rotation.x = -Math.PI / 2;
    track.position.set(saw.axis === 'z' ? saw.fixed : 0, 0.02, saw.axis === 'x' ? saw.fixed : 0);
    scene.add(track);
    const mesh = buildSaw();
    mesh.position.y = 0.5;
    scene.add(mesh);
    saws.push(mesh);
  }

  // The King of the Hill zone. Only shown in that mode.
  const hill = new THREE.Mesh(
    new THREE.RingGeometry(def.hill.r - 0.5, def.hill.r, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  hill.rotation.x = -Math.PI / 2;
  hill.position.set(def.hill.x, 0.05, def.hill.z);
  hill.visible = false;
  scene.add(hill);

  return { def, scene, saws, shockers, pistons, fire, hill, fill };
}
