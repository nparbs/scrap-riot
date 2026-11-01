import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Particles } from '../src/render/fx';
import { Ragdoll } from '../src/render/ragdoll';

const BLAST = { count: 40, color: 0xff8a2a, speed: 15, size: 0.4, life: 2 };

function heights(particles: Particles): number[] {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const found: number[] = [];
  for (let i = 0; i < particles.mesh.count; i++) {
    particles.mesh.getMatrixAt(i, matrix);
    found.push(position.setFromMatrixPosition(matrix).y);
  }
  return found;
}

function run(particles: Particles, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) particles.update(1 / 60);
}

describe('explosion particles', () => {
  it('land on the floor', () => {
    const particles = new Particles();
    particles.floorHalf = 30;
    particles.burst(0, 0, { ...BLAST, y: 1, speed: 2 });
    run(particles, 0.9);
    const found = heights(particles);
    expect(found.length).toBeGreaterThan(0);
    for (const y of found) expect(y).toBeGreaterThanOrEqual(0.05);
  });

  it('stay with a robot that blew up below the edge', () => {
    const particles = new Particles();
    particles.floorHalf = 30;
    particles.burst(34, 0, { ...BLAST, y: -14, speed: 4 });
    run(particles, 0.1);
    for (const y of heights(particles)) expect(y).toBeLessThan(-10);
  });

  it('stay below the floor when they drift back under it', () => {
    const particles = new Particles();
    particles.floorHalf = 30;
    particles.burst(29, 0, { ...BLAST, y: -14, speed: 4, gravity: 0, spread: 0 });
    run(particles, 0.5);
    for (const y of heights(particles)) expect(y).toBeLessThan(0);
  });

  it('fall past the edge instead of landing on thin air', () => {
    const particles = new Particles();
    particles.floorHalf = 30;
    particles.burst(31, 0, { ...BLAST, y: 1, speed: 0.1 });
    run(particles, 1);
    for (const y of heights(particles)) expect(y).toBeLessThan(0);
  });
});

describe('a robot going over the edge', () => {
  const LEDGE = { x: 28, z: 37, w: 34, d: 12, top: -10 };

  /** Where it was when it blew, and how low it got before that. */
  function fall(x: number, z: number, vx: number, vz: number, fell = true) {
    const blast = { y: Infinity, overEdge: false };
    let lowest = Infinity;
    const world = { scene: new THREE.Scene(), half: 30, walled: false, ledges: [LEDGE] };
    const doll = new Ragdoll(new THREE.Object3D(), x, z, 0, vx, vz, fell, world, (position, overEdge) => {
      blast.y = position.y;
      blast.overEdge = overEdge;
    });
    for (let t = 0; t < 1.05; t += 1 / 60) {
      doll.update(1 / 60);
      if (blast.y === Infinity) lowest = Math.min(lowest, doll.position.y);
    }
    return { ...blast, lowest };
  }

  it('blows up far below the roof where the drop is clear', () => {
    const { y, overEdge } = fall(31, 0, 6, 0);
    expect(overEdge).toBe(true);
    expect(y).toBeLessThan(-8);
  });

  it('lands on a lower rooftop instead of going through it', () => {
    const { y, lowest } = fall(20, 31, 0, 4);
    expect(lowest).toBeGreaterThanOrEqual(LEDGE.top);
    expect(y).toBeGreaterThanOrEqual(LEDGE.top);
    expect(y).toBeLessThan(-5);
  });

  it('is not snapped up when it drifts in under a rooftop', () => {
    // It only reaches the rooftop's side, at x 11, as the second runs out and it's already lower.
    const { y } = fall(9, 31, 2.8, 4);
    expect(y).toBeLessThan(LEDGE.top - 1);
  });

  it('keeps falling past the edge after being killed on the roof', () => {
    expect(fall(29, 0, 12, 0, false).y).toBeLessThan(0);
  });

  it('still rests on the roof after being killed in the middle', () => {
    expect(fall(5, 5, 0, 0, false).y).toBeGreaterThan(0);
  });
});
