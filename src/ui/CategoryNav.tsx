import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { scrollFades } from '../lib/scrollFades.ts';
import { clampedLeft, getCaseCx, subscribeCaseCx } from '../lib/caseAxis.ts';
import { categorySpot, type Layout } from '../scene/layout.ts';
import { useStore } from '../store.ts';
import { scrollToShelf } from './scrollToShelf.ts';
import { useNarrow } from './useNarrow.ts';
import type { Library } from '../types.ts';

/** Chips are narrow, so the nav spells "and" as "&". The shelf labels keep the full name. */
const short = (name: string) => name.replace(/\s+and\s+/gi, ' & ');

/** Space kept between the nav and the left column, and between the nav and the board button, px (`--s2`). */
const KEEP = 16;

/**
 * Text chips that light a category's books, the way a theme does (a second click turns it off). The pill is centred on the bookcase's middle line (as the camera
 * has it on screen), but never over the left column or the board button.
 */
export function CategoryNav({ layout, library }: { layout: Layout; library: Library }) {
  const category = useStore((s) => s.category);
  const setCategory = useStore((s) => s.setCategory);
  const focused = useStore((s) => s.focused);
  const narrow = useNarrow();
  const wallBox = useStore((s) => s.wallBox);
  const cx = useSyncExternalStore(subscribeCaseCx, getCaseCx);
  const nav = useRef<HTMLElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  // On a narrow screen the row scrolls sideways; the edge with more chips behind it fades (the style is in a narrow-screen media query).
  const [fade, setFade] = useState({ start: false, end: false });
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const place = () => {
      const wall = document.querySelector('.wall')?.getBoundingClientRect().right ?? 0;
      const board = document.querySelector('.board-btn')?.getBoundingClientRect().left ?? window.innerWidth;
      const l = clampedLeft(cx, el.offsetWidth, wall + KEEP, board - KEEP);
      setLeft((prev) => (prev !== null && Math.abs(prev - l) < 0.25 ? prev : l));
    };
    place();
    window.addEventListener('resize', place);
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => {
      window.removeEventListener('resize', place);
      ro.disconnect();
    };
  }, [cx, wallBox, library]);
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const update = () => {
      const next = scrollFades(el.scrollLeft, el.clientWidth, el.scrollWidth);
      setFade((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    window.addEventListener('resize', update);
    void document.fonts?.ready.then(update);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [library]);
  const pick = (slug: string) => {
    setCategory(category === slug ? null : slug);
    // On a narrow screen the nav is above the shelf block: bring the shelf up so the books that light are in view.
    if (category !== slug && narrow) scrollToShelf();
  };
  return (
    <nav ref={nav} className={`chips${focused ? ' hidden' : ''}${fade.start ? ' fade-l' : ''}${fade.end ? ' fade-r' : ''}`} aria-label="Categories" style={left === null ? undefined : { left }}>
      {library.categories
        .map((c) => ({ c, spot: categorySpot(layout, c.slug) }))
        .filter((e): e is { c: (typeof library.categories)[number]; spot: { x: number; y: number } } => e.spot !== null)
        .map(({ c }) => (
          <button
            key={c.slug}
            className={`chip${category === c.slug ? ' on' : ''}`}
            aria-pressed={category === c.slug}
            onClick={() => pick(c.slug)}
            title={c.description}
          >
            {c.short ?? short(c.name)}
          </button>
        ))}
    </nav>
  );
}
