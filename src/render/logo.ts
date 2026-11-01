// The game's logo, drawn in code so the page, the website icon and the maps all share one design.

const INK = '#12150e';
const GOLD = '#d8d84a';

function cogOutline(g: CanvasRenderingContext2D, center: number, outer: number, inner: number, teeth: number): void {
  g.beginPath();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    g.lineTo(center + Math.cos(a - step * 0.27) * inner, center + Math.sin(a - step * 0.27) * inner);
    g.lineTo(center + Math.cos(a - step * 0.17) * outer, center + Math.sin(a - step * 0.17) * outer);
    g.lineTo(center + Math.cos(a + step * 0.17) * outer, center + Math.sin(a + step * 0.17) * outer);
    g.lineTo(center + Math.cos(a + step * 0.27) * inner, center + Math.sin(a + step * 0.27) * inner);
  }
  g.closePath();
}

/** Draws one line of text with its visible ink centered on x, whatever the font's own spacing does. */
function centeredText(g: CanvasRenderingContext2D, text: string, x: number, baseline: number, weight: number): void {
  const m = g.measureText(text);
  const inkX = x - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
  g.lineWidth = weight;
  g.strokeText(text, inkX, baseline);
  g.fillText(text, inkX, baseline);
}

/** A cog with a hazard band behind the name. It fills a square of the given size, transparent at the corners. */
export function drawLogo(g: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  g.save();
  g.lineJoin = 'round';

  cogOutline(g, c, size * 0.49, size * 0.4, 12);
  g.fillStyle = INK;
  g.fill();
  g.lineWidth = size * 0.022;
  g.strokeStyle = GOLD;
  g.stroke();

  // The hazard band, clipped to the middle of the cog.
  g.save();
  g.beginPath();
  g.arc(c, c, size * 0.355, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#24261c';
  g.fillRect(0, 0, size, size);
  g.translate(c, c);
  g.rotate(-0.42);
  const band = size * 0.5;
  g.fillStyle = '#e6c41f';
  g.fillRect(-size, -band / 2, size * 2, band);
  g.fillStyle = INK;
  const stripe = size * 0.075;
  for (let x = -size; x < size; x += stripe * 2) {
    g.beginPath();
    g.moveTo(x, band / 2);
    g.lineTo(x + stripe, band / 2);
    g.lineTo(x + stripe + band * 0.6, -band / 2);
    g.lineTo(x + band * 0.6, -band / 2);
    g.closePath();
    g.fill();
  }
  g.restore();

  g.beginPath();
  g.arc(c, c, size * 0.355, 0, Math.PI * 2);
  g.lineWidth = size * 0.016;
  g.strokeStyle = GOLD;
  g.stroke();

  if (size >= 96) {
    // Both words are fitted to the same width, then stacked around the exact center.
    const family = 'Impact, Haettenschweiler, "Arial Black", sans-serif';
    const target = size * 0.68;
    g.font = `400 ${size * 0.25}px ${family}`;
    const fontSize = size * 0.25 * (target / g.measureText('SCRAP').width);
    g.font = `400 ${fontSize}px ${family}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const top = g.measureText('SCRAP');
    const bottom = g.measureText('RIOT');
    const gap = size * 0.03;
    const height = top.actualBoundingBoxAscent + gap + bottom.actualBoundingBoxAscent;
    const firstLine = c - height / 2 + top.actualBoundingBoxAscent;
    const secondLine = firstLine + gap + bottom.actualBoundingBoxAscent;
    const fill = g.createLinearGradient(0, firstLine - top.actualBoundingBoxAscent, 0, secondLine);
    fill.addColorStop(0, '#ffd23a');
    fill.addColorStop(0.55, '#ff6a1a');
    fill.addColorStop(1, '#d8280e');
    g.fillStyle = fill;
    g.strokeStyle = '#0a0b06';
    centeredText(g, 'SCRAP', c, firstLine, size * 0.045);
    centeredText(g, 'RIOT', c, secondLine, size * 0.045);
  }
  g.restore();
}

function logoCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  drawLogo(canvas.getContext('2d')!, size);
  return canvas;
}

let cachedUrl = '';

/** The logo as an image address, for the page's own screens. */
export function logoUrl(): string {
  cachedUrl ||= logoCanvas(320).toDataURL('image/png');
  return cachedUrl;
}

/** Sets the website icon. At that size only the cog and band can be seen, so the words are left out. */
export function installLogoIcon(): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = logoCanvas(64).toDataURL('image/png');
}
