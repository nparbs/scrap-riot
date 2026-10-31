import * as THREE from 'three';
import type { ChassisId, DefenseId, MeleeId, TurretId } from '../sim/data';

export interface RobotBuild {
  chassis: ChassisId;
  melee: MeleeId;
  turret: TurretId;
  defense: DefenseId;
  color: number;
}

export interface RobotModel {
  root: THREE.Group;
  turretPivot: THREE.Group;
  meleePivot: THREE.Group;
  sawBlade: THREE.Object3D | null;
  wheels: THREE.Mesh[];
  shield: THREE.Mesh;
  hullMaterial: THREE.MeshStandardMaterial;
}

const steel = new THREE.MeshStandardMaterial({ color: 0x6d7379, metalness: 0.75, roughness: 0.45, flatShading: true });
const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.4, roughness: 0.8, flatShading: true });
const blade = new THREE.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 0.95, roughness: 0.2, flatShading: true });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function cylinder(r: number, h: number, mat: THREE.Material, sides = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), mat);
  mesh.castShadow = true;
  return mesh;
}

interface HullSpec {
  width: number;
  length: number;
  height: number;
  trackWidth: number;
  wheelRadius: number;
  wheelCount: number;
}

const HULLS: Record<ChassisId, HullSpec> = {
  scout: { width: 1.3, length: 2.1, height: 0.45, trackWidth: 0.34, wheelRadius: 0.32, wheelCount: 3 },
  brawler: { width: 1.6, length: 2.4, height: 0.7, trackWidth: 0.42, wheelRadius: 0.38, wheelCount: 4 },
  juggernaut: { width: 2.0, length: 2.9, height: 1.0, trackWidth: 0.55, wheelRadius: 0.44, wheelCount: 5 },
};

function buildHull(root: THREE.Group, id: ChassisId, paint: THREE.Material, wheels: THREE.Mesh[]): number {
  const s = HULLS[id];
  const baseY = s.wheelRadius + 0.1;

  for (const side of [-1, 1]) {
    const x = side * (s.width / 2 + s.trackWidth / 2);
    root.add(box(s.trackWidth, s.wheelRadius * 1.5, s.length, dark, x, s.wheelRadius, 0));
    for (let i = 0; i < s.wheelCount; i++) {
      const wheel = cylinder(s.wheelRadius * 0.72, s.trackWidth + 0.06, steel, 8);
      wheel.rotation.z = Math.PI / 2;
      const t = s.wheelCount === 1 ? 0 : i / (s.wheelCount - 1) - 0.5;
      wheel.position.set(x, s.wheelRadius, t * (s.length - s.wheelRadius * 1.6));
      root.add(wheel);
      wheels.push(wheel);
    }
  }

  const hull = box(s.width, s.height, s.length, paint, 0, baseY + s.height / 2, 0);
  root.add(hull);

  if (id === 'scout') {
    // A sloped wedge nose and a tail fin.
    const wedge = box(s.width * 0.92, 0.14, s.length * 0.55, steel, 0, baseY + s.height + 0.02, s.length * 0.26);
    wedge.rotation.x = 0.28;
    root.add(wedge);
    const fin = box(0.08, 0.5, 0.55, paint, 0, baseY + s.height + 0.25, -s.length * 0.42);
    root.add(fin);
  } else if (id === 'brawler') {
    root.add(box(s.width + 0.08, 0.14, 0.34, steel, 0, baseY + s.height * 0.5, s.length / 2));
    root.add(box(s.width * 0.7, 0.1, s.length * 0.6, steel, 0, baseY + s.height + 0.05, -0.1));
  } else {
    // Bolted-on slabs of extra armor.
    for (const side of [-1, 1]) {
      root.add(box(0.2, s.height * 0.9, s.length * 0.82, steel, side * (s.width / 2 + 0.02), baseY + s.height * 0.55, 0));
    }
    root.add(box(s.width * 1.05, s.height * 0.75, 0.4, steel, 0, baseY + s.height * 0.5, s.length / 2));
    root.add(box(s.width * 0.8, 0.18, s.length * 0.7, steel, 0, baseY + s.height + 0.09, -0.1));
    for (const side of [-1, 1]) {
      const pipe = cylinder(0.1, 0.8, dark, 8);
      pipe.position.set(side * s.width * 0.3, baseY + s.height + 0.4, -s.length * 0.4);
      root.add(pipe);
    }
  }
  return baseY + s.height;
}

function buildTurret(pivot: THREE.Group, id: TurretId, paint: THREE.Material, eye: THREE.Material): void {
  // The domed head with one glowing eye gives every robot its face.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint);
  head.castShadow = true;
  pivot.add(head);
  const eyeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), eye);
  eyeMesh.position.set(0, 0.26, 0.42);
  pivot.add(eyeMesh);

  if (id === 'minigun') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const barrel = cylinder(0.05, 1.2, dark, 6);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(Math.cos(a) * 0.1, 0.2 + Math.sin(a) * 0.1, 0.9);
      pivot.add(barrel);
    }
  } else if (id === 'rockets') {
    pivot.add(box(0.8, 0.45, 0.9, dark, 0, 0.25, 0.45));
    for (const x of [-0.2, 0.2]) {
      for (const y of [0.15, 0.36]) {
        const tube = cylinder(0.08, 0.1, new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0x662200 }), 8);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(x, y, 0.92);
        pivot.add(tube);
      }
    }
  } else {
    const glow = new THREE.MeshStandardMaterial({ color: 0x8fdcff, emissive: 0x2a9fe8, emissiveIntensity: 1.5 });
    const post = cylinder(0.07, 0.9, steel, 6);
    post.position.set(0, 0.85, 0);
    pivot.add(post);
    for (const y of [0.65, 0.9, 1.15]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22 - (y - 0.65) * 0.2, 0.05, 6, 14), glow);
      coil.rotation.x = Math.PI / 2;
      coil.position.y = y;
      pivot.add(coil);
    }
  }
}

function buildMelee(pivot: THREE.Group, id: MeleeId): THREE.Object3D | null {
  if (id === 'chainsaw') {
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
    return disc;
  }
  if (id === 'hammer') {
    pivot.add(box(0.14, 0.14, 1.8, steel, 0, 0, 0.9));
    pivot.add(box(0.9, 0.55, 0.55, dark, 0, 0, 1.85));
    return null;
  }
  pivot.add(box(1.5, 0.35, 0.15, steel, 0, 0, 0.1));
  for (const x of [-0.5, 0, 0.5]) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 6), blade);
    spike.rotation.x = Math.PI / 2;
    spike.position.set(x, 0, 0.55);
    spike.castShadow = true;
    pivot.add(spike);
  }
  return null;
}

function buildDefenseGear(root: THREE.Group, id: DefenseId, deckY: number, length: number): void {
  const z = -length / 2 + 0.25;
  if (id === 'shield') {
    const dish = cylinder(0.26, 0.08, new THREE.MeshStandardMaterial({ color: 0x7fe8ff, emissive: 0x1a8fbf }), 10);
    dish.position.set(0.42, deckY + 0.08, z);
    root.add(dish);
  } else if (id === 'mines') {
    root.add(box(0.7, 0.3, 0.4, dark, 0, deckY + 0.15, z));
  } else {
    const tank = cylinder(0.2, 0.9, steel, 10);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0, deckY + 0.2, z);
    root.add(tank);
  }
}

export function buildRobot(build: RobotBuild): RobotModel {
  const root = new THREE.Group();
  const hullMaterial = new THREE.MeshStandardMaterial({ color: build.color, metalness: 0.35, roughness: 0.55, flatShading: true });
  const eye = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: build.color, emissiveIntensity: 2.5 });
  const wheels: THREE.Mesh[] = [];
  const deckY = buildHull(root, build.chassis, hullMaterial, wheels);
  const spec = HULLS[build.chassis];

  const turretPivot = new THREE.Group();
  turretPivot.position.y = deckY + 0.05;
  buildTurret(turretPivot, build.turret, hullMaterial, eye);
  root.add(turretPivot);

  const meleePivot = new THREE.Group();
  meleePivot.position.set(0, deckY - spec.height * 0.45, spec.length / 2);
  const sawBlade = buildMelee(meleePivot, build.melee);
  root.add(meleePivot);

  buildDefenseGear(root, build.defense, deckY, spec.length);

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

  return { root, turretPivot, meleePivot, sawBlade, wheels, shield, hullMaterial };
}

export function disposeRobot(model: RobotModel): void {
  const shared = new Set<THREE.Material>([steel, dark, blade]);
  model.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const material = node.material as THREE.Material;
    if (!shared.has(material)) material.dispose();
  });
}
