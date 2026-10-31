import { useLayoutEffect, useRef, useState } from 'react';
import type { SearchState } from './useSearch.ts';
import { useStore } from '../store.ts';
import type { Agentic } from '../types.ts';

/** Height of one result row and of the note above the rows, px (see `.res` and `.results .qnote` in styles.css). */
const ROW = 56;
const NOTE = 24;

/** Most rows listed when the list is not in a box of fixed height. */
const MAX_ROWS = 8;

/**
 * The ideas a search found, in the theme card's frame in place of the themes. As many rows as the card has room for, at least
 * one. Click one to read its card in its first book. `stacked` (a narrow screen): the list sits in the page's flow under the search
 * box, as tall as its rows, all of them up to MAX_ROWS.
 */
export function SearchResults({ data, state, stacked = false }: { data: Agentic; state: SearchState; stacked?: boolean }) {
  const openConcept = useStore((s) => s.openConcept);
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || stacked) return;
    const measure = () => setRoom(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stacked]);
  const byId = new Map(data.concepts.map((c) => [c.id, c]));
  const books = new Map(data.books.map((b) => [b.id, b.title]));
  const rows = stacked ? MAX_ROWS : Math.max(1, Math.min(MAX_ROWS, Math.floor((room - (state.note ? NOTE : 0)) / ROW)));
  const shown = state.results.filter((r) => byId.has(r.id)).slice(0, rows);
  return (
    <div className={`results${stacked ? ' stacked' : ''}`} ref={box} aria-live="polite">
      {state.note && <div className="qnote">{state.note}</div>}
      {shown.map((r) => {
        const c = byId.get(r.id)!;
        const pct = Math.round(r.p * 100);
        return (
          <button key={r.id} className={`res${state.provisional ? ' prov' : ''}`} onClick={() => openConcept(r.id)}>
            <b>{c.name}</b>
            <span className="pct">{state.provisional ? '' : `${pct}%`}</span>
            <small>{c.bookIds.map((id) => books.get(id)).filter(Boolean).join(' · ')}</small>
            <span className="bar">
              <i style={{ width: `${state.provisional ? Math.min(100, Math.round(r.p * 250)) : pct}%` }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
