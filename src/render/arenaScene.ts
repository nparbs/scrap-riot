import * as THREE from 'three';
import { ARENA } from '../sim/arena';

function floorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#3a3d40';
  g.fillRect(0, 0, size, size);

  // Grime, then rust, then the plate seams and rivets on top.
  for (let i = 0; i < 2600; i++) {
    const shade = 40 + Math.random() * 35;
    g.fillStyle = `rgba(${shade},${shade},${shade + 3},0.16)`;
    const r = 2 + Math.random() * 16;
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(${110 + Math.random() * 40},${60 + Math.random() * 20},25,0.14)`;
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, 6 + Math.random() * 34, 0, Math.PI * 2);
    g.fill();
  }
  const plate = size / 4;
  g.strokeStyle = '#1e2022';
  g.lineWidth = 5;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * plate, 0);
    g.lineTo(i * plate, size);
    g.moveTo(0, i * plate);
    g.lineTo(size, i * plate);
    g.stroke();
  }
  g.fillStyle = '#585c60';
  for (let x = 0; x < 4; x++) {
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
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(ARENA.sawRadius * 0.85, ARENA.sawRadius * 0.85, 0.12, 24), steel);
  disc.castShadow = true;
  saw.add(disc);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 4), steel);
    tooth.rotation.z = -Math.PI / 2;
    tooth.rotation.y = -a;
    tooth.position.set(Math.cos(a) * ARENA.sawRadius * 0.92, 0, Math.sin(a) * ARENA.sawRadius * 0.92);
    saw.add(tooth);
  }
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0xc9331f, roughness: 0.6 }),
  );
  saw.add(hub);
  return saw;
}

export interface ArenaScene {
  scene: THREE.Scene;
  saws: THREE.Group[];
}

export function buildArena(): ArenaScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101216);
  scene.fog = new THREE.Fog(0x101216, 55, 130);

  scene.add(new THREE.HemisphereLight(0xc8d4e8, 0x38302a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(24, 50, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const reach = ARENA.half + 6;
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const size = ARENA.half * 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: floorTexture(), metalness: 0.5, roughness: 0.75 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 1 }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  scene.add(outer);

  // Walls, each topped with a band of hazard paint.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4e52, metalness: 0.6, roughness: 0.6, flatShading: true });
  const stripes = hazardTexture();
  const h = ARENA.wallHeight;
  const t = 1.2;
  const sides: [number, number, number, number][] = [
    [0, ARENA.half + t / 2, size + t * 2, t],
    [0, -ARENA.half - t / 2, size + t * 2, t],
    [ARENA.half + t / 2, 0, t, size],
    [-ARENA.half - t / 2, 0, t, size],
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
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.04, 0.5, d + 0.04),
      new THREE.MeshStandardMaterial({ map: bandTexture, roughness: 0.7 }),
    );
    band.position.set(x, h - 0.25, z);
    scene.add(band);
  }

  // Stands beyond the walls, fading into fog, so the arena does not float in a void.
  const standMat = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 1 });
  for (let tier = 0; tier < 4; tier++) {
    const inset = ARENA.half + 5 + tier * 4;
    const y = 2 + tier * 2.5;
    for (const [x, z, w, d] of [
      [0, inset, inset * 2 + 4, 4],
      [0, -inset, inset * 2 + 4, 4],
      [inset, 0, 4, inset * 2],
      [-inset, 0, 4, inset * 2],
    ]) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(w, y * 2, d), standMat);
      stand.position.set(x, y - 2, z);
      scene.add(stand);
    }
  }

  // Pillars with glowing caps.
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x585d62, metalness: 0.7, roughness: 0.5, flatShading: true });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff8a1a, emissiveIntensity: 1.6 });
  for (const p of ARENA.pillars) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.1, 5, 10), pillarMat);
    pillar.position.set(p.x, 2.5, p.z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.7, p.r * 0.7, 0.25, 10), capMat);
    cap.position.set(p.x, 5.1, p.z);
    scene.add(cap);
  }

  // Saw tracks and blades.
  const trench = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 1 });
  const saws: THREE.Group[] = [];
  for (const def of ARENA.saws) {
    const length = def.amplitude * 2 + ARENA.sawRadius * 2;
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(def.axis === 'x' ? length : 0.7, def.axis === 'z' ? length : 0.7),
      trench,
    );
    track.rotation.x = -Math.PI / 2;
    track.position.set(def.axis === 'z' ? def.fixed : 0, 0.02, def.axis === 'x' ? def.fixed : 0);
    scene.add(track);
    const saw = buildSaw();
    saw.position.y = 0.5;
    scene.add(saw);
    saws.push(saw);
  }

  return { scene, saws };
}
