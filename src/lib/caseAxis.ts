/**
 * Where the bookcase's vertical middle line is on screen, in CSS pixels from the left edge of the window. The camera rig writes
 * it every frame it moves; the category nav centres itself on it. NaN until the first frame.
 */
let cx = Number.NaN;
const listeners = new Set<() => void>();

export const getCaseCx = (): number => cx;

export function setCaseCx(x: number): void {
  if (Math.abs(x - cx) < 0.5) return;
  cx = x;
  listeners.forEach((l) => l());
}

export function subscribeCaseCx(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Where to put a box `width` wide so that it is centred on `centre`, but stays inside `[min, max]`. Returns its left edge.
 * If the room between `min` and `max` is narrower than the box, it starts at `min`.
 */
export function clampedLeft(centre: number, width: number, min: number, max: number): number {
  const lo = min;
  const hi = Math.max(lo, max - width);
  const want = Number.isFinite(centre) ? centre - width / 2 : (min + max - width) / 2;
  return Math.min(hi, Math.max(lo, want));
}
