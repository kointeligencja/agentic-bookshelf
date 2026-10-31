/**
 * Where to scroll the page (px from its top) to bring a block that starts at `blockTop` (px from the top of the page) to the top of the
 * window, `gap` px below whatever sticks to the top (`stuck` px high). Never above the top of the page or below `maxScroll`.
 */
export function scrollTargetFor(blockTop: number, stuck: number, gap: number, maxScroll: number): number {
  return Math.min(Math.max(0, maxScroll), Math.max(0, Math.round(blockTop - stuck - gap)));
}

/** Gap kept above the shelf block when a theme pick scrolls it into view, px. Nothing sticks to the top of the home page. */
export const SHELF_GAP = 8;
