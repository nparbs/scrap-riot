export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Saw {
  /** Which axis the saw slides along. */
  axis: 'x' | 'z';
  fixed: number;
  amplitude: number;
  speed: number;
  phase: number;
}

export const ARENA = {
  half: 32,
  wallHeight: 3,
  pillars: [
    { x: 12, z: 12, r: 2.5 },
    { x: -12, z: 12, r: 2.5 },
    { x: 12, z: -12, r: 2.5 },
    { x: -12, z: -12, r: 2.5 },
  ] as Circle[],
  saws: [
    { axis: 'z', fixed: 22, amplitude: 18, speed: 0.7, phase: 0 },
    { axis: 'z', fixed: -22, amplitude: 18, speed: 0.7, phase: Math.PI },
    { axis: 'x', fixed: 22, amplitude: 18, speed: 0.55, phase: Math.PI / 2 },
    { axis: 'x', fixed: -22, amplitude: 18, speed: 0.55, phase: -Math.PI / 2 },
  ] as Saw[],
  sawRadius: 1.7,
  sawDps: 30,
  sawKnock: 14,
  spawns: [
    { x: 26, z: 26 },
    { x: -26, z: -26 },
    { x: 26, z: -26 },
    { x: -26, z: 26 },
    { x: 0, z: 27 },
    { x: 0, z: -27 },
    { x: 27, z: 0 },
    { x: -27, z: 0 },
  ],
  repairSpots: [
    { x: 0, z: 0 },
    { x: 16, z: 0 },
    { x: -16, z: 0 },
    { x: 0, z: 16 },
    { x: 0, z: -16 },
  ],
};

export function sawPos(saw: Saw, t: number): { x: number; z: number } {
  const slide = Math.sin(t * saw.speed + saw.phase) * saw.amplitude;
  return saw.axis === 'z' ? { x: saw.fixed, z: slide } : { x: slide, z: saw.fixed };
}
