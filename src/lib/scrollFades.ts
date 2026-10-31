/** Scroll positions within this many px of an end count as at the end (sub-pixel scroll positions on high-density screens). */
const SLACK = 2;

/**
 * Which ends of a row that scrolls sideways have more content behind them: `start` when it is scrolled away from its left end, `end` when
 * it has more to the right. Neither when everything fits.
 */
export function scrollFades(scrollLeft: number, clientWidth: number, scrollWidth: number): { start: boolean; end: boolean } {
  if (scrollWidth <= clientWidth + SLACK) return { start: false, end: false };
  return { start: scrollLeft > SLACK, end: scrollLeft + clientWidth < scrollWidth - SLACK };
}
