import { categorySpot, type Layout } from '../scene/layout.ts';
import { useStore } from '../store.ts';
import type { Library } from '../types.ts';

/** Chips are narrow, so the nav spells "and" as "&". The shelf labels keep the full name. */
const short = (name: string) => name.replace(/\s+and\s+/gi, ' & ');

/** Text chips that fly the camera to where a category starts. */
export function CategoryNav({ layout, library }: { layout: Layout; library: Library }) {
  const setTargetX = useStore((s) => s.setTargetX);
  const setTargetY = useStore((s) => s.setTargetY);
  const setDistance = useStore((s) => s.setDistance);
  const focused = useStore((s) => s.focused);
  const fly = (x: number, y: number | null, d: number, hash: string) => {
    setTargetX(Math.min(layout.maxX, Math.max(layout.minX, x)));
    setTargetY(y);
    setDistance(d);
    history.replaceState(null, '', `${location.search}${hash}`);
  };
  return (
    <nav className={`chips${focused ? ' hidden' : ''}`} aria-label="Categories">
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
