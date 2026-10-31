import * as THREE from 'three';
import { SAW_RADIUS, type ArenaDef } from '../sim/arena';

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
  const steel = new THREE.MeshStandardMaterial({ color: 0xbfc6cc, metalness: 0.95, roughness: 0.25, flatShading: true });
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

  // Open maps sit on top of a tall column, so the drop looks as lethal as it is.
  const base = theme.backdrop === 'city' ? 0x3a4250 : theme.backdrop === 'canyon' ? 0xa86a3e : 0x8fa8c2;
  const columnMat = new THREE.MeshStandardMaterial({ color: base, roughness: 1, flatShading: true });
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
}

export function buildArena(def: ArenaDef): ArenaScene {
  const { half, theme } = def;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.sky, theme.fogNear, theme.fogFar);

  scene.add(new THREE.HemisphereLight(0xc8d4e8, 0x38302a, 1.1));
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
      map: floorTexture(theme.backdrop !== 'ice' && theme.backdrop !== 'canyon'),
      color: theme.floor,
      metalness: def.grip < 0.5 ? 0.25 : 0.5,
      roughness: def.grip < 0.5 ? 0.18 : 0.75,
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
    const wallMat = new THREE.MeshStandardMaterial({ color: theme.wall, metalness: 0.6, roughness: 0.6, flatShading: true });
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
    const edge = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.8 });
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

  // Pillars with glowing caps.
  const pillarMat = new THREE.MeshStandardMaterial({ color: theme.wall, metalness: 0.5, roughness: 0.6, flatShading: true });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xc86a18, emissive: 0xff7a10, emissiveIntensity: 0.7 });
  for (const p of def.pillars) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.1, 5, 10), pillarMat);
    pillar.position.set(p.x, 2.5, p.z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.7, p.r * 0.7, 0.25, 10), capMat);
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
  const headMat = new THREE.MeshStandardMaterial({ color: 0xe6b422, metalness: 0.5, roughness: 0.5, flatShading: true });
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

  const sentryBody = new THREE.MeshStandardMaterial({ color: 0x3a2a24, metalness: 0.5, roughness: 0.6, flatShading: true });
  for (const s of def.sentries) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 2.6, 8), sentryBody);
    base.position.set(s.x, 1.3, s.z);
    base.castShadow = true;
    scene.add(base);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 8), fire);
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

  return { def, scene, saws, shockers, pistons, fire, hill };
}
