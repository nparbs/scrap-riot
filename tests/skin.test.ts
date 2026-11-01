import { describe, expect, it } from 'vitest';
import { decodeSkin, drawEllipse, drawLine, drawRect, emptySkin, encodeSkin, floodFill, isPaintable, SKIN_MAX_CHARS, SKIN_PANELS, SKIN_SIZE, stamp } from '../src/game/skin';
import { sanitizePaint } from '../src/net/protocol';
import { DEFAULT_PAINT, legibleColor, PAINT_COLORS } from '../src/sim/data';

const count = (pixels: Uint8Array, color: number) => pixels.filter((p) => p === color).length;
const { top } = SKIN_PANELS;

describe('paint jobs', () => {
  it('round-trips, and bare paint takes no room', () => {
    const pixels = emptySkin();
    expect(encodeSkin(pixels)).toBe('');
    expect(decodeSkin('')).toEqual(pixels);
    drawRect(pixels, top.x0, top.y0, top.x1, top.y1, 1, 5, true);
    stamp(pixels, 50, 50, 8, 9);
    const encoded = encodeSkin(pixels);
    expect(encoded.length).toBeLessThan(1000);
    expect(decodeSkin(encoded)).toEqual(pixels);
  });

  it('refuses anything that is not exactly one valid image', () => {
    const short = btoa(String.fromCharCode(10, 1));
    const zeroRun = btoa(String.fromCharCode(0, 1));
    const badColor = btoa(String.fromCharCode(255, PAINT_COLORS.length + 1));
    const tooLong = btoa(String.fromCharCode(255, 1).repeat(70));
    for (const bad of [short, zeroRun, badColor, tooLong, '%%%not base64', 'a'.repeat(SKIN_MAX_CHARS + 1), 7, null, {}]) {
      expect(decodeSkin(bad), String(bad).slice(0, 20)).toBeNull();
    }
  });

  it('the server keeps a real paint job and drops anything else', () => {
    const pixels = emptySkin();
    stamp(pixels, 50, 50, 5, 3);
    const skin = encodeSkin(pixels);
    expect(sanitizePaint({ ...DEFAULT_PAINT, skin }).skin).toBe(skin);
    expect(sanitizePaint({ ...DEFAULT_PAINT, skin: 'nonsense' }).skin).toBeUndefined();
    expect(sanitizePaint({ ...DEFAULT_PAINT, skin: '' }).skin).toBeUndefined();
    expect(sanitizePaint({ ...DEFAULT_PAINT, eye: 1 })).not.toHaveProperty('eye');
  });

  it('a whole robot of heavy spray still fits', () => {
    const pixels = emptySkin();
    let seed = 1;
    for (const panel of Object.values(SKIN_PANELS)) {
      for (let y = panel.y0; y < panel.y1; y++) {
        for (let x = panel.x0; x < panel.x1; x++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          if (seed % 5 === 0) pixels[y * SKIN_SIZE + x] = 7;
        }
      }
    }
    expect(encodeSkin(pixels).length).toBeLessThanOrEqual(SKIN_MAX_CHARS);
  });

  it('the palette has room for every index, and the defaults are in it', () => {
    expect(PAINT_COLORS).toHaveLength(120);
    expect(PAINT_COLORS.every((c) => Number.isInteger(c) && c >= 0 && c <= 0xffffff)).toBe(true);
    expect(PAINT_COLORS).toContain(DEFAULT_PAINT.primary);
    expect(PAINT_COLORS).toContain(DEFAULT_PAINT.secondary);
  });
});

describe('names on dark paint', () => {
  const brightness = (c: number) => (0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255)) / 255;

  it('every colour in the palette gives a readable name', () => {
    for (const color of PAINT_COLORS) expect(brightness(legibleColor(color)), color.toString(16)).toBeGreaterThanOrEqual(0.45);
  });

  it('bright colours stay exactly as they are', () => {
    expect(legibleColor(0xffffff)).toBe(0xffffff);
    expect(legibleColor(DEFAULT_PAINT.primary)).toBe(DEFAULT_PAINT.primary);
  });
});

describe('paint tools', () => {
  const inTop = { x: top.x0 + 10, y: top.y0 + 10 };

  it('never paints outside the template', () => {
    const pixels = emptySkin();
    drawRect(pixels, 0, 0, SKIN_SIZE - 1, SKIN_SIZE - 1, 1, 4, true);
    for (let y = 0; y < SKIN_SIZE; y++) {
      for (let x = 0; x < SKIN_SIZE; x++) {
        if (!isPaintable(x, y)) expect(pixels[y * SKIN_SIZE + x]).toBe(0);
      }
    }
    expect(count(pixels, 4)).toBeGreaterThan(0);
  });

  it('copes with brushes hanging off the edge', () => {
    const pixels = emptySkin();
    expect(() => {
      stamp(pixels, -5, -5, 8, 1);
      stamp(pixels, SKIN_SIZE + 3, SKIN_SIZE + 3, 8, 1);
      drawLine(pixels, -20, -20, SKIN_SIZE + 20, SKIN_SIZE + 20, 3, 1);
    }).not.toThrow();
  });

  it('brush size sets how much it covers', () => {
    const area = (size: number) => {
      const pixels = emptySkin();
      stamp(pixels, inTop.x, inTop.y, size, 1);
      return count(pixels, 1);
    };
    expect(area(1)).toBe(1);
    expect(area(3)).toBeGreaterThan(area(2));
    expect(area(8)).toBeGreaterThan(area(5));
  });

  it('an outline leaves the middle bare, and a filled shape does not', () => {
    const middle = (top.x0 + 20) + (top.y0 + 20) * SKIN_SIZE;
    for (const draw of [drawRect, drawEllipse]) {
      const outline = emptySkin();
      draw(outline, top.x0 + 10, top.y0 + 10, top.x0 + 30, top.y0 + 30, 1, 2, false);
      expect(outline[middle]).toBe(0);
      expect(count(outline, 2)).toBeGreaterThan(10);
      const filled = emptySkin();
      draw(filled, top.x0 + 10, top.y0 + 10, top.x0 + 30, top.y0 + 30, 1, 2, true);
      expect(filled[middle]).toBe(2);
    }
  });

  it('fill stops at other colours and at the edge of the panel', () => {
    const pixels = emptySkin();
    floodFill(pixels, inTop.x, inTop.y, 6);
    const panelArea = (top.x1 - top.x0) * (top.y1 - top.y0);
    expect(count(pixels, 6)).toBe(panelArea);

    const walled = emptySkin();
    drawRect(walled, top.x0 + 5, top.y0 + 5, top.x0 + 15, top.y0 + 15, 1, 2, false);
    floodFill(walled, top.x0 + 10, top.y0 + 10, 6);
    expect(count(walled, 6)).toBe(9 * 9);
    // Filling an area with the colour it already is does nothing, and off-template is ignored.
    floodFill(walled, top.x0 + 10, top.y0 + 10, 6);
    floodFill(walled, 0, 0, 6);
    expect(count(walled, 6)).toBe(9 * 9);
  });
});
