import type { SearchState } from './useSearch.ts';
import { useStore } from '../store.ts';
import type { Agentic } from '../types.ts';

/** How many results fit under the box, by the height of the window (each takes about 54px, under the video and its timeline). */
const slots = (height: number) => Math.max(3, Math.min(8, Math.floor((height - 560) / 54)));

/** The ideas a search found, in the place of the theme chips. Click one to read its card in its first book. */
export function SearchResults({ data, state }: { data: Agentic; state: SearchState }) {
  const openConcept = useStore((s) => s.openConcept);
  const byId = new Map(data.concepts.map((c) => [c.id, c]));
  const books = new Map(data.books.map((b) => [b.id, b.title]));
  const shown = state.results.filter((r) => byId.has(r.id)).slice(0, slots(window.innerHeight));
  return (
    <div className="results" aria-live="polite">
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
