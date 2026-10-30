// The book's accent colour, made readable on the paper of the card.

/** The card's paper. */
export const PAPER = '#f5efe4';
/** WCAG AA for body text. */
export const MIN_CONTRAST = 4.5;

type RGB = [number, number, number];

export function parseHex(hex: string): RGB {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function toHsl([r, g, b]: RGB): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** The colour darkened (same hue and saturation) until it has at least `min` contrast on `bg`. A colour that already has it is returned as it is. */
export function readableOn(hex: string, bg: string = PAPER, min: number = MIN_CONTRAST): string {
  if (contrast(hex, bg) >= min) return hex.toLowerCase();
  const [h, s, l] = toHsl(parseHex(hex));
  for (let step = 1; step <= 100; step++) {
    const out = toHex(fromHsl(h, s, Math.max(0, l - step * 0.01)));
    if (contrast(out, bg) >= min) return out;
  }
  return '#000000';
}

/** The colour as `rgba(...)` at this opacity, for tints and rules. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The light tint of a colour for a box on the paper: its hue and saturation at 93% lightness (a mix with the paper would turn grey). */
export function tintOf(hex: string, lightness = 0.93): string {
  const [h, s] = toHsl(parseHex(hex));
  return toHex(fromHsl(h, s, lightness));
}
