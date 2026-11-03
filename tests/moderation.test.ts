import { describe, expect, it } from 'vitest';
import { isNameAllowed } from '../src/game/nameFilter';
import { COLORBLIND_PALETTE, healthColor, STANDARD_PALETTE } from '../src/game/palette';
import { defaultSettings, loadSettings } from '../src/game/settings';
import { DEFAULT_NAME, sanitizeName } from '../src/net/protocol';
import { hullFaceHit, withoutSkin } from '../src/render/robots';
import { DEFAULT_PAINT } from '../src/sim/data';

describe('the name filter', () => {
  it.each(['fuck', 'FUCK', 'fuuuuck', 'f u c k', 'f.u.c.k', 'phil_fuck', 'sh1t', '5hit', 'b!tch', 'fúck', 'hitler99', 'big ass', 'nazi', 'n4zi', 'a55', 'c0ck'])('stops %s', (name) => {
    expect(isNameAllowed(name)).toBe(false);
  });

  it.each(['Nigel', 'Niger', 'Hancock', 'Peacock', 'Dickens', 'Therapist', 'Grape', 'Torpedo', 'Bassist', 'Scunthorpe', 'Spicy', 'Nazir', 'Cucumber', 'Titan', 'Old Ironjaw', 'Pilot', 'Bot3000', 'Wraith_77', '机器人'])('lets %s through', (name) => {
    expect(isNameAllowed(name)).toBe(true);
  });

  it('turns a blocked name into the default, which the server relies on', () => {
    expect(sanitizeName('f.u.c.k')).toBe(DEFAULT_NAME);
    expect(sanitizeName('Nigel')).toBe('Nigel');
  });
});

/** Machado, Oliveira and Fernandes (2009), at full severity, applied in linear light. */
const VISION: Record<string, number[][]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function toLab([r, g, b]: number[]): number[] {
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function seenAs(color: number, vision: number[][]): number[] {
  const rgb = [(color >> 16) & 255, (color >> 8) & 255, color & 255].map(toLinear);
  return toLab(vision.map((row) => Math.max(0, Math.min(1, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]))));
}

/** The closest any two of these colors come, for the given vision. */
function closest(colors: number[], vision: number[][]): number {
  let best = Infinity;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const [a, b] = [seenAs(colors[i], vision), seenAs(colors[j], vision)];
      best = Math.min(best, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
  }
  return best;
}

describe('the color-blind colors', () => {
  it.each(Object.keys(VISION))('keep health, armor and pickups apart for %s', (name) => {
    const vision = VISION[name];
    expect(closest(COLORBLIND_PALETTE.bar, vision)).toBeGreaterThan(25);
    expect(closest([COLORBLIND_PALETTE.repair, COLORBLIND_PALETTE.scrap], vision)).toBeGreaterThan(25);
    expect(closest([COLORBLIND_PALETTE.armour, COLORBLIND_PALETTE.bar[0]], vision)).toBeGreaterThan(15);
  });

  // Green against red is the problem they're for. The standard colors already suit tritanopia, by about as much.
  it.each(['protanopia', 'deuteranopia'])('separate health better than the standard ones for %s', (name) => {
    expect(closest(COLORBLIND_PALETTE.bar, VISION[name])).toBeGreaterThan(closest(STANDARD_PALETTE.bar, VISION[name]));
  });

  it('picks by how much health is left', () => {
    const { bar } = COLORBLIND_PALETTE;
    expect([1, 0.51, 0.5, 0.26, 0.25, 0].map((health) => healthColor(bar, health))).toEqual([bar[0], bar[0], bar[1], bar[1], bar[2], bar[2]]);
  });
});

describe('the new settings', () => {
  const stored = (saved: object) => ({ getItem: () => JSON.stringify(saved) });

  it('start off', () => {
    const { reduceShake, colorblind, hidePaint } = defaultSettings();
    expect({ reduceShake, colorblind, hidePaint }).toEqual({ reduceShake: false, colorblind: false, hidePaint: false });
  });

  it('are read back', () => {
    const { reduceShake, colorblind, hidePaint } = loadSettings(stored({ reduceShake: true, colorblind: true, hidePaint: true }));
    expect({ reduceShake, colorblind, hidePaint }).toEqual({ reduceShake: true, colorblind: true, hidePaint: true });
  });

  it('ignore nonsense', () => {
    const { reduceShake, colorblind, hidePaint } = loadSettings(stored({ reduceShake: 'yes', colorblind: 1, hidePaint: 'true' }));
    expect({ reduceShake, colorblind, hidePaint }).toEqual({ reduceShake: false, colorblind: false, hidePaint: false });
  });
});

describe('hiding paint', () => {
  it('takes off the drawing and keeps the colors, pattern and shape', () => {
    const paint = { ...DEFAULT_PAINT, primary: 0x123456, pattern: 'camo' as const, skin: 'anything' };
    const plain = withoutSkin(paint)!;
    expect(plain.skin).toBeUndefined();
    expect('skin' in plain).toBe(false);
    expect({ ...plain, skin: 'anything' }).toEqual(paint);
    expect(paint.skin).toBe('anything');
  });

  it('copes with a robot that has no paint', () => {
    expect(withoutSkin(undefined)).toBeUndefined();
  });
});

describe('which face a cut lands on', () => {
  it('follows the robot as it turns', () => {
    expect(hullFaceHit(0, 1, 0)).toBe('front');
    expect(hullFaceHit(0, -1, 0)).toBe('back');
    expect(hullFaceHit(1, 0, 0)).toBe('right');
    expect(hullFaceHit(-1, 0, 0)).toBe('left');
    expect(hullFaceHit(1, 0, Math.PI / 2)).toBe('front');
    expect(hullFaceHit(0, 1, Math.PI)).toBe('back');
    expect(hullFaceHit(0, -1, Math.PI / 2)).toBe('right');
  });
});
