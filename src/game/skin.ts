import { PAINT_COLORS } from '../sim/data';

// A paint job is a small image of the robot's hull, unfolded flat. Each pixel holds 0 for bare
// paint, or a position in PAINT_COLORS plus one. Only palette colours can be stored, which keeps
// paint jobs small enough to send to other players and easy for the server to check.

export const SKIN_SIZE = 128;
/** Fits inside the API's request limit. Spray over the whole robot is about as big as it gets. */
export const SKIN_MAX_CHARS = 24_000;
export const ERASED = 0;

export type PanelId = 'back' | 'top' | 'front' | 'left' | 'right';

export const SKIN_PANELS: Record<PanelId, { x0: number; y0: number; x1: number; y1: number }> = {
  back: { x0: 35, y0: 2, x1: 93, y1: 21 },
  top: { x0: 35, y0: 24, x1: 93, y1: 103 },
  front: { x0: 35, y0: 106, x1: 93, y1: 126 },
  left: { x0: 4, y0: 24, x1: 32, y1: 103 },
  right: { x0: 96, y0: 24, x1: 124, y1: 103 },
};

const PAINTABLE = new Uint8Array(SKIN_SIZE * SKIN_SIZE);
for (const { x0, y0, x1, y1 } of Object.values(SKIN_PANELS)) {
  for (let y = y0; y < y1; y++) PAINTABLE.fill(1, y * SKIN_SIZE + x0, y * SKIN_SIZE + x1);
}

export function emptySkin(): Uint8Array {
  return new Uint8Array(SKIN_SIZE * SKIN_SIZE);
}

export function isPaintable(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < SKIN_SIZE && y < SKIN_SIZE && PAINTABLE[y * SKIN_SIZE + x] === 1;
}

/** Runs of pairs (count, colour), in base64. Bare paint encodes to nothing at all. */
export function encodeSkin(pixels: Uint8Array): string {
  if (pixels.every((p) => p === ERASED)) return '';
  let binary = '';
  for (let i = 0; i < pixels.length; ) {
    const color = pixels[i];
    let run = 1;
    while (run < 255 && pixels[i + run] === color) run++;
    binary += String.fromCharCode(run, color);
    i += run;
  }
  return btoa(binary);
}

/** Returns null for anything that isn't exactly one valid image, since other players' browsers read this. */
export function decodeSkin(text: unknown): Uint8Array | null {
  if (typeof text !== 'string' || text.length > SKIN_MAX_CHARS) return null;
  const pixels = emptySkin();
  if (text === '') return pixels;
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  if (binary.length % 2 !== 0) return null;
  let at = 0;
  for (let i = 0; i < binary.length; i += 2) {
    const run = binary.charCodeAt(i);
    const color = binary.charCodeAt(i + 1);
    if (run === 0 || color > PAINT_COLORS.length || at + run > pixels.length) return null;
    pixels.fill(color, at, at + run);
    at += run;
  }
  return at === pixels.length ? pixels : null;
}

function plot(pixels: Uint8Array, x: number, y: number, color: number): void {
  if (isPaintable(x, y)) pixels[y * SKIN_SIZE + x] = color;
}

/** A round dab, `size` pixels across. */
export function stamp(pixels: Uint8Array, x: number, y: number, size: number, color: number): void {
  const reach = (size - 1) / 2;
  const limit = (reach + 0.25) ** 2;
  for (let dy = -Math.ceil(reach); dy <= Math.ceil(reach); dy++) {
    for (let dx = -Math.ceil(reach); dx <= Math.ceil(reach); dx++) {
      if (dx * dx + dy * dy <= limit) plot(pixels, x + dx, y + dy, color);
    }
  }
}

export function drawLine(pixels: Uint8Array, x0: number, y0: number, x1: number, y1: number, size: number, color: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    stamp(pixels, Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), size, color);
  }
}

export function drawRect(pixels: Uint8Array, x0: number, y0: number, x1: number, y1: number, size: number, color: number, filled: boolean): void {
  const [left, right] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [top, bottom] = [Math.min(y0, y1), Math.max(y0, y1)];
  if (filled) {
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) plot(pixels, x, y, color);
    }
    return;
  }
  drawLine(pixels, left, top, right, top, size, color);
  drawLine(pixels, right, top, right, bottom, size, color);
  drawLine(pixels, right, bottom, left, bottom, size, color);
  drawLine(pixels, left, bottom, left, top, size, color);
}

export function drawEllipse(pixels: Uint8Array, x0: number, y0: number, x1: number, y1: number, size: number, color: number, filled: boolean): void {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.max(0.5, Math.abs(x1 - x0) / 2);
  const ry = Math.max(0.5, Math.abs(y1 - y0) / 2);
  if (filled) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) plot(pixels, x, y, color);
      }
    }
    return;
  }
  const steps = Math.max(24, Math.ceil((rx + ry) * 4));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    stamp(pixels, Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), size, color);
  }
}

/** Fills the connected area of one colour, stopping at the edge of the panel. */
export function floodFill(pixels: Uint8Array, x: number, y: number, color: number): void {
  if (!isPaintable(x, y)) return;
  const target = pixels[y * SKIN_SIZE + x];
  if (target === color) return;
  const stack = [y * SKIN_SIZE + x];
  while (stack.length > 0) {
    const at = stack.pop()!;
    if (pixels[at] !== target || PAINTABLE[at] === 0) continue;
    pixels[at] = color;
    if (at % SKIN_SIZE > 0) stack.push(at - 1);
    if (at % SKIN_SIZE < SKIN_SIZE - 1) stack.push(at + 1);
    if (at >= SKIN_SIZE) stack.push(at - SKIN_SIZE);
    if (at < pixels.length - SKIN_SIZE) stack.push(at + SKIN_SIZE);
  }
}
