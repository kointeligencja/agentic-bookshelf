import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { clampedLeft, getCaseCx, subscribeCaseCx } from '../lib/caseAxis.ts';
import { categorySpot, type Layout } from '../scene/layout.ts';
import { useStore } from '../store.ts';
import type { Library } from '../types.ts';

/** Chips are narrow, so the nav spells "and" as "&". The shelf labels keep the full name. */
const short = (name: string) => name.replace(/\s+and\s+/gi, ' & ');

/** Space kept between the nav and the left column, and between the nav and the board button, px (`--s2`). */
const KEEP = 16;

/**
 * Text chips that fly the camera to where a category starts. The pill is centred on the bookcase's middle line (as the camera
 * has it on screen), but never over the left column or the board button.
 */
export function CategoryNav({ layout, library }: { layout: Layout; library: Library }) {
  const setTargetX = useStore((s) => s.setTargetX);
  const setTargetY = useStore((s) => s.setTargetY);
  const setDistance = useStore((s) => s.setDistance);
  const focused = useStore((s) => s.focused);
  const wallBox = useStore((s) => s.wallBox);
  const cx = useSyncExternalStore(subscribeCaseCx, getCaseCx);
  const nav = useRef<HTMLElement>(null);
  const [left, setLeft] = useState<number | null>(null);
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
  const fly = (x: number, y: number | null, d: number, hash: string) => {
    setTargetX(Math.min(layout.maxX, Math.max(layout.minX, x)));
    setTargetY(y);
    setDistance(d);
    history.replaceState(null, '', `${location.search}${hash}`);
  };
  return (
    <nav ref={nav} className={`chips${focused ? ' hidden' : ''}`} aria-label="Categories" style={left === null ? undefined : { left }}>
      {library.categories
        .map((c) => ({ c, spot: categorySpot(layout, c.slug) }))
        .filter((e): e is { c: (typeof library.categories)[number]; spot: { x: number; y: number } } => e.spot !== null)
        .map(({ c, spot }) => (
          <button
            key={c.slug}
            className="chip"
            onClick={() => fly(spot.x + 350, spot.y + 170, 2300, `#category/${c.slug}`)}
            title={c.description}
          >
            {c.short ?? short(c.name)}
          </button>
        ))}
    </nav>
  );
}
