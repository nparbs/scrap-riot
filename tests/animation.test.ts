import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRobot, poseWeapon, type RobotModel, type WeaponState } from '../src/render/robots';
import { MELEE, type MeleeId } from '../src/sim/data';

const REST: WeaponState = { windingUp: false, swing: 99, active: false, pressed: false, cooling: false, lunging: false, radius: 1.45, rear: false, speed: 0, time: 0 };

function robot(melee: MeleeId, wheels: 'tracks' | 'large4' = 'large4'): RobotModel {
  return buildRobot({ chassis: 'brawler', melee, defense: 'shield', wheels, color: 0xff8a2a });
}

/** Where every mesh in the weapon is right now, to tell whether anything moved. */
function shape(model: RobotModel): number[] {
  model.root.updateMatrixWorld(true);
  const out: number[] = [];
  model.meleePivot.traverse((node) => {
    if (node instanceof THREE.Mesh && node.visible) out.push(...node.matrixWorld.elements);
  });
  return out;
}

function settle(model: RobotModel, id: MeleeId, state: Partial<WeaponState>, seconds = 0.5): void {
  for (let t = 0; t < seconds; t += 1 / 60) poseWeapon(model, id, { ...REST, ...state, time: t }, 1 / 60);
}

describe('weapon animation', () => {
  it('shuts the claw, crusher and forks on a target, and opens them again', () => {
    for (const id of ['claw', 'crusher', 'forks'] as const) {
      const model = robot(id);
      settle(model, id, {});
      expect(model.grip).toBeCloseTo(1);
      const open = shape(model);
      settle(model, id, { active: true });
      expect(model.grip).toBeLessThan(0.05);
      expect(shape(model)).not.toEqual(open);
      settle(model, id, {}, 2);
      expect(model.grip).toBeGreaterThan(0.95);
    }
  });

  it('half opens a claw while it recharges, and snaps it if the key is down with nothing to grab', () => {
    const model = robot('claw');
    settle(model, 'claw', { cooling: true }, 2);
    expect(model.grip).toBeCloseTo(0.45, 1);
    const grips = new Set<number>();
    for (let t = 0; t < 1; t += 1 / 60) {
      poseWeapon(model, 'claw', { ...REST, pressed: true, time: t }, 1 / 60);
      grips.add(Math.round(model.grip * 10));
    }
    expect(grips.size).toBeGreaterThan(3);
  });

  it('moves every weapon in some way when it fires', () => {
    for (const id of Object.keys(MELEE) as MeleeId[]) {
      const model = robot(id);
      settle(model, id, {});
      const rest = shape(model);
      // A spinner's rotation is driven by whoever owns the model, so turn it here as they would.
      if (model.spinner) model.spinner.rotation[model.spinAxis] += 1;
      model.chain?.(0.5);
      settle(model, id, { windingUp: MELEE[id].kind === 'strike', active: true, pressed: true, lunging: true, speed: 1 }, 0.1);
      poseWeapon(model, id, { ...REST, swing: 0.02, active: true, pressed: true, lunging: true, speed: 1, time: 0.77 }, 1 / 60);
      expect(shape(model), id).not.toEqual(rest);
    }
  });

  it('puts a spear and a flipper back where they started', () => {
    for (const id of ['spear', 'flipper', 'magnet', 'chainsaw'] as const) {
      const model = robot(id);
      settle(model, id, {}, 2);
      const rest = shape(model);
      settle(model, id, { swing: 0.01, active: true, pressed: true });
      settle(model, id, {}, 3);
      const after = shape(model);
      after.forEach((n, i) => expect(n).toBeCloseTo(rest[i], 3));
    }
  });
});

describe('tank tracks', () => {
  const links = (model: RobotModel): THREE.InstancedMesh[] => {
    const found: THREE.InstancedMesh[] = [];
    model.root.traverse((node) => {
      if (node instanceof THREE.InstancedMesh) found.push(node);
    });
    return found;
  };

  it('runs links around both sides, and only on robots with tracks', () => {
    expect(robot('hammer').tread).toBeNull();
    const model = robot('hammer', 'tracks');
    expect(links(model)).toHaveLength(2);
    const before = [...links(model)[0].instanceMatrix.array];
    model.tread!(0.05);
    expect([...links(model)[0].instanceMatrix.array]).not.toEqual(before);
  });

  it('keeps the links in a closed loop that rests on the floor', () => {
    const model = robot('hammer', 'tracks');
    model.tread!(0.123);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const [track] = links(model);
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < track.count; i++) {
      track.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      low = Math.min(low, position.y);
      high = Math.max(high, position.y);
    }
    // Nothing floats above the floor or sinks through it, allowing for the depth of a link.
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(0.1);
    expect(high).toBeGreaterThan(0.5);
  });
});
