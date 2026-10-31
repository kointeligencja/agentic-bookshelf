import { SHELF_GAP, scrollTargetFor } from '../lib/shelfScroll.ts';

/**
 * Scrolls the page so the shelf block is at the top of the window (smoothly unless the visitor asked for less motion). Returns whether
 * it scrolled; a page already there stays put.
 */
export function scrollToShelf(): boolean {
  const stage = document.querySelector('[data-stage]');
  if (!stage) return false;
  const doc = document.documentElement;
  const top = scrollTargetFor(stage.getBoundingClientRect().top + window.scrollY, 0, SHELF_GAP, doc.scrollHeight - window.innerHeight);
  if (Math.abs(top - window.scrollY) < 2) return false;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: calm ? 'auto' : 'smooth' });
  return true;
}
