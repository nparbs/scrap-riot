import { decodeSkin, drawEllipse, drawLine, drawRect, emptySkin, encodeSkin, ERASED, floodFill, isPaintable, SKIN_MAX_CHARS, SKIN_PANELS, SKIN_SIZE, stamp } from '../game/skin';
import { DEFAULT_PAINT, PAINT_COLORS } from '../sim/data';

type Tool = 'pencil' | 'spray' | 'line' | 'rect' | 'fillrect' | 'ellipse' | 'fillellipse' | 'bucket' | 'eraser';

const TOOLS: [Tool, string, string][] = [
  ['pencil', 'Pencil', '<path d="M6 26 L8 19 L21 6 L26 11 L13 24 Z"/>'],
  ['rect', 'Rectangle', '<rect x="7" y="8" width="18" height="16"/>'],
  ['ellipse', 'Ellipse', '<ellipse cx="16" cy="16" rx="10" ry="9"/>'],
  ['spray', 'Spray can', '<rect x="9" y="13" width="10" height="14"/><path d="M12 13 V9 H16 V13 M21 7 h1 M24 10 h1 M24 5 h1"/>'],
  ['fillrect', 'Filled rectangle', '<rect class="solid" x="7" y="8" width="18" height="16"/>'],
  ['fillellipse', 'Filled ellipse', '<ellipse class="solid" cx="16" cy="16" rx="10" ry="9"/>'],
  ['line', 'Line', '<path d="M6 26 L26 6"/>'],
  ['bucket', 'Fill', '<path d="M7 16 L16 7 L25 16 L16 25 Z"/><path d="M12 4 L16 7 M27 20 v5"/>'],
  ['eraser', 'Eraser', '<path d="M6 21 L17 8 L26 15 L17 26 H11 Z"/><path d="M12 14 L21 21"/>'],
];
const SIZES = [1, 2, 3, 5, 8];
const MAX_UNDO = 20;
const PREVIEW_MS = 100;
const SPRAY_MS = 40;
const DISPLAY_SCALE = 3;
const OFF_TEMPLATE = '#050707';

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** The paintshop's drawing tools. It outlives the page around it, so tools and undo survive a refresh. */
export class Painter {
  readonly bar = document.createElement('div');
  readonly board = document.createElement('div');
  /** Called with the encoded paint job as it changes. `done` is true when a stroke ends. */
  onChange: ((skin: string, done: boolean) => void) | null = null;
  /** The encoded form of what's on the board. */
  encoded = '';

  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly note = document.createElement('p');
  private pixels = emptySkin();
  private strokeStart = emptySkin();
  private readonly undoStack: Uint8Array[] = [];
  private tool: Tool = 'pencil';
  private size = SIZES[1];
  /** Position in PAINT_COLORS plus one, as stored in the image. */
  private color = 1;
  private base: number = DEFAULT_PAINT.primary;
  private drawing = false;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastPreview = 0;
  private sprayTimer = 0;

  constructor() {
    this.bar.className = 'paint-bar';
    this.bar.innerHTML = `
      <div class="paint-tools">${TOOLS.map(([id, label, icon]) => `<button class="tool-btn" data-tool="${id}" title="${label}" aria-label="${label}"><svg viewBox="0 0 32 32" aria-hidden="true">${icon}</svg></button>`).join('')}</div>
      <div class="paint-sizes">${SIZES.map((size) => `<button class="tool-btn" data-size="${size}" title="Size ${size}" aria-label="Size ${size}"><i style="height:${size + 1}px"></i></button>`).join('')}</div>
      <div class="paint-actions">
        <button class="tool-btn" data-undo title="Undo" aria-label="Undo"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M12 8 L6 14 L12 20 M6 14 H20 A6 6 0 0 1 20 26 H14"/></svg></button>
        <button class="tool-btn" data-clear title="Clear everything" aria-label="Clear everything"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 10 H24 M13 10 V6 H19 V10 M10 10 L11 26 H21 L22 10 M14 14 V22 M18 14 V22"/></svg></button>
      </div>
      <div class="paint-palette">${PAINT_COLORS.map((color, i) => `<button data-color="${i + 1}" style="background:${css(color)}" aria-label="Color ${i + 1}"></button>`).join('')}</div>`;
    this.bar.addEventListener('click', (e) => this.onBarClick(e));

    this.canvas.width = this.canvas.height = SKIN_SIZE;
    this.canvas.className = 'paint-canvas';
    this.context = this.canvas.getContext('2d')!;
    this.image = this.context.createImageData(SKIN_SIZE, SKIN_SIZE);
    const guides = document.createElement('canvas');
    guides.width = guides.height = SKIN_SIZE * DISPLAY_SCALE;
    guides.className = 'paint-guides';
    this.drawGuides(guides.getContext('2d')!);
    const wrap = document.createElement('div');
    wrap.className = 'paint-template';
    wrap.append(this.canvas, guides);
    this.note.className = 'settings-hint paint-note';
    this.board.className = 'paint-board';
    this.board.append(wrap, this.note);

    this.canvas.addEventListener('pointerdown', (e) => this.begin(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', () => this.end());
    this.canvas.addEventListener('pointercancel', () => this.end());
    this.highlight();
    this.redraw();
  }

  /** The selected colour, for painting the tower and trim with. */
  get currentColor(): number {
    return PAINT_COLORS[this.color - 1];
  }

  load(skin: string | undefined): void {
    this.pixels = decodeSkin(skin ?? '') ?? emptySkin();
    this.encoded = skin ?? '';
    this.undoStack.length = 0;
    this.redraw();
  }

  /** The colour showing through wherever nothing has been painted. */
  setBase(color: number): void {
    if (this.base === color) return;
    this.base = color;
    this.redraw();
  }

  private drawGuides(g: CanvasRenderingContext2D): void {
    g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    g.lineWidth = 2;
    g.fillStyle = 'rgba(255, 255, 255, 0.55)';
    g.font = '700 10px Arial, sans-serif';
    for (const [name, panel] of Object.entries(SKIN_PANELS)) {
      const x = panel.x0 * DISPLAY_SCALE;
      const y = panel.y0 * DISPLAY_SCALE;
      g.strokeRect(x - 1, y - 1, (panel.x1 - panel.x0) * DISPLAY_SCALE + 2, (panel.y1 - panel.y0) * DISPLAY_SCALE + 2);
      g.fillText(name.toUpperCase(), x + 3, y + 12);
    }
  }

  private redraw(): void {
    const { data } = this.image;
    const r = (this.base >> 16) & 255;
    const g = (this.base >> 8) & 255;
    const b = this.base & 255;
    const outside = parseInt(OFF_TEMPLATE.slice(1), 16);
    for (let y = 0; y < SKIN_SIZE; y++) {
      for (let x = 0; x < SKIN_SIZE; x++) {
        const at = (y * SKIN_SIZE + x) * 4;
        const value = this.pixels[y * SKIN_SIZE + x];
        const color = value === ERASED ? null : PAINT_COLORS[value - 1];
        if (!isPaintable(x, y)) {
          data[at] = (outside >> 16) & 255;
          data[at + 1] = (outside >> 8) & 255;
          data[at + 2] = outside & 255;
        } else if (color === null) {
          data[at] = r;
          data[at + 1] = g;
          data[at + 2] = b;
        } else {
          data[at] = (color >> 16) & 255;
          data[at + 1] = (color >> 8) & 255;
          data[at + 2] = color & 255;
        }
        data[at + 3] = 255;
      }
    }
    this.context.putImageData(this.image, 0, 0);
  }

  private highlight(): void {
    for (const el of this.bar.querySelectorAll<HTMLElement>('[data-tool]')) el.classList.toggle('tool-on', el.dataset.tool === this.tool);
    for (const el of this.bar.querySelectorAll<HTMLElement>('[data-size]')) el.classList.toggle('tool-on', Number(el.dataset.size) === this.size);
    for (const el of this.bar.querySelectorAll<HTMLElement>('[data-color]')) el.classList.toggle('color-on', Number(el.dataset.color) === this.color);
  }

  private onBarClick(e: Event): void {
    const button = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!button) return;
    const { tool, size, color } = button.dataset;
    if (tool) this.tool = tool as Tool;
    else if (size) this.size = Number(size);
    else if (color) {
      this.color = Number(color);
      // Picking a colour while erasing almost always means wanting to paint again.
      if (this.tool === 'eraser') this.tool = 'pencil';
    } else if ('undo' in button.dataset) this.undo();
    else if ('clear' in button.dataset) this.clear();
    this.highlight();
  }

  private undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.pixels = previous;
    this.commit();
  }

  private clear(): void {
    this.pushUndo();
    this.pixels = emptySkin();
    this.commit();
  }

  private pushUndo(): void {
    this.undoStack.push(this.pixels.slice());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  private commit(): void {
    this.redraw();
    this.encoded = encodeSkin(this.pixels);
    this.onChange?.(this.encoded, true);
  }

  private at(e: PointerEvent): [number, number] {
    const box = this.canvas.getBoundingClientRect();
    return [Math.floor(((e.clientX - box.left) / box.width) * SKIN_SIZE), Math.floor(((e.clientY - box.top) / box.height) * SKIN_SIZE)];
  }

  private begin(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    [this.startX, this.startY] = this.at(e);
    [this.lastX, this.lastY] = [this.startX, this.startY];
    this.drawing = true;
    this.note.textContent = '';
    this.pushUndo();
    this.strokeStart = this.pixels.slice();
    if (this.tool === 'bucket') {
      floodFill(this.pixels, this.startX, this.startY, this.color);
      this.end();
      return;
    }
    if (this.tool === 'spray') this.sprayTimer = window.setInterval(() => this.spray(), SPRAY_MS);
    this.apply(this.startX, this.startY);
  }

  private move(e: PointerEvent): void {
    if (!this.drawing) return;
    const [x, y] = this.at(e);
    this.apply(x, y);
    [this.lastX, this.lastY] = [x, y];
  }

  private spray(): void {
    const reach = this.size * 2 + 3;
    for (let i = 0; i < this.size * 3 + 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * reach;
      stamp(this.pixels, Math.round(this.lastX + Math.cos(a) * r), Math.round(this.lastY + Math.sin(a) * r), 1, this.color);
    }
    this.show();
  }

  private apply(x: number, y: number): void {
    const { pixels, size, color, startX, startY } = this;
    switch (this.tool) {
      case 'pencil':
        drawLine(pixels, this.lastX, this.lastY, x, y, size, color);
        break;
      case 'eraser':
        drawLine(pixels, this.lastX, this.lastY, x, y, size + 2, ERASED);
        break;
      case 'spray':
        return;
      case 'line':
        pixels.set(this.strokeStart);
        drawLine(pixels, startX, startY, x, y, size, color);
        break;
      case 'rect':
      case 'fillrect':
        pixels.set(this.strokeStart);
        drawRect(pixels, startX, startY, x, y, size, color, this.tool === 'fillrect');
        break;
      case 'ellipse':
      case 'fillellipse':
        pixels.set(this.strokeStart);
        drawEllipse(pixels, startX, startY, x, y, size, color, this.tool === 'fillellipse');
        break;
      default:
        break;
    }
    this.show();
  }

  /** Redraws the board at once, and the slower 3D preview a few times a second. */
  private show(): void {
    this.redraw();
    const now = performance.now();
    if (now - this.lastPreview < PREVIEW_MS) return;
    this.lastPreview = now;
    this.encoded = encodeSkin(this.pixels);
    if (this.encoded.length <= SKIN_MAX_CHARS) this.onChange?.(this.encoded, false);
  }

  private end(): void {
    if (!this.drawing) return;
    this.drawing = false;
    window.clearInterval(this.sprayTimer);
    this.encoded = encodeSkin(this.pixels);
    if (this.encoded.length > SKIN_MAX_CHARS) {
      // Very noisy paint jobs won't fit, so that stroke comes back off.
      this.pixels = this.undoStack.pop() ?? emptySkin();
      this.note.textContent = "That's too much detail to save, so the last stroke was undone. Large solid areas take far less room than spray.";
    }
    this.commit();
  }
}
