import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Parts modelled in Blender rather than built from shapes in code. The sources are scripts in art/,
 * which write the .glb files into public/models. They carry shape only: each piece is named after
 * the look it should get, and the game paints it with its own materials so it matches everything else.
 * Anything that hasn't loaded falls back to its built shape.
 */
const parts = new Map<string, { look: string; geometry: THREE.BufferGeometry }[]>();
const FILES = {
  hammerHead: 'models/hammer-head.glb',
  ramPlate: 'models/ram-plate.glb',
  drumBody: 'models/drum-body.glb',
  axeHead: 'models/axe-head.glb',
  drillMotor: 'models/drill-motor.glb',
  flameBody: 'models/flame-body.glb',
  teslaBase: 'models/tesla-base.glb',
  spearBody: 'models/spear-body.glb',
  daggerBlade: 'models/dagger-blade.glb',
  rollerBody: 'models/roller-body.glb',
  magnetBody: 'models/magnet-body.glb',
  vertbarBar: 'models/vertbar-bar.glb',
  horizbarBar: 'models/horizbar-bar.glb',
} as const;
export type ModelName = keyof typeof FILES;

/** Loads every modelled part. It never rejects, and gives up after a few seconds so a slow line can't hold up the game. */
export function loadModels(timeoutMs = 4000): Promise<void> {
  const loader = new GLTFLoader();
  const all = Promise.all(
    (Object.entries(FILES) as [ModelName, string][]).map(async ([name, file]) => {
      try {
        const gltf = await loader.loadAsync(import.meta.env.BASE_URL + file);
        const pieces: { look: string; geometry: THREE.BufferGeometry }[] = [];
        gltf.scene.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            pieces.push({ look: (node.material as THREE.Material).name, geometry: node.geometry });
            (node.material as THREE.Material).dispose();
          }
        });
        if (pieces.length) parts.set(name, pieces);
      } catch (error) {
        console.warn(`Couldn't load ${file}, so it's drawn the old way`, error);
      }
    }),
  ).then(() => undefined);
  return Promise.race([all, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
}

/**
 * A fresh copy of a modelled part, each piece painted with the material its name picks out of `looks`,
 * or null if the part hasn't loaded. The geometry is copied, so disposing it is safe.
 */
export function modelPart(name: ModelName, looks: Record<string, THREE.Material>, fallback: THREE.Material): THREE.Group | null {
  const pieces = parts.get(name);
  if (!pieces) return null;
  const group = new THREE.Group();
  for (const { look, geometry } of pieces) {
    const mesh = new THREE.Mesh(geometry.clone(), looks[look] ?? fallback);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}
