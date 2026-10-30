import { useEffect, useMemo, useState } from 'react';
import { livePins, pageCount } from '../lib/board.ts';
import { useStore } from '../store.ts';
import type { Agentic } from '../types.ts';

/** The board is a fixed grid of notes: 4 across, 3 down. More pins make more pages. */
const PER_PAGE = 12;

/** The pinned concepts that still exist, in the order they were pinned. */
function usePinned(data: Agentic) {
  const pins = useStore((s) => s.pins);
  return useMemo(() => {
    const byId = new Map(data.concepts.map((c) => [c.id, c]));
    return livePins(pins, (id) => byId.has(id)).map((id) => byId.get(id)!);
  }, [pins, data]);
}

/** Top right: how many cards are pinned; opens the board. */
export function BoardButton({ data }: { data: Agentic }) {
  const setOpen = useStore((s) => s.setBoardOpen);
  const n = usePinned(data).length;
  return (
    <button className="pill board-btn" onClick={() => setOpen(true)}>
      Your board · {n}
    </button>
  );
}

/** A corkboard over everything, with the pinned cards on it. Click a note to read its card; ✕ unpins. */
export function Board({ data }: { data: Agentic }) {
  const open = useStore((s) => s.boardOpen);
  const setOpen = useStore((s) => s.setBoardOpen);
  const togglePin = useStore((s) => s.togglePin);
  const openConcept = useStore((s) => s.openConcept);
  const items = usePinned(data);
  const [page, setPage] = useState(0);
  const pages = pageCount(items.length, PER_PAGE);
  const at = Math.min(page, pages - 1);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(pages - 1, p + 1));
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pages]);

  return (
    <div className={`overlay${open ? ' show' : ''}`} aria-hidden={!open} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="board" role="dialog" aria-label="Your board">
        <button className="close" onClick={() => setOpen(false)} aria-label="Close the board">
          ✕
        </button>
        {items.length === 0 ? (
          <p className="empty-msg">Pin concepts from the books to collect what you want to try.</p>
        ) : (
          <div className="notes">
            {items.slice(at * PER_PAGE, (at + 1) * PER_PAGE).map((c) => (
              <div
                key={c.id}
                className="note"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setOpen(false);
                  openConcept(c.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setOpen(false);
                    openConcept(c.id);
                  }
                }}
              >
                <button
                  className="unpin"
                  aria-label={`Unpin ${c.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(c.id);
                  }}
                >
                  ✕
                </button>
                <h4>{c.name}</h4>
                <p>{c.summary}</p>
                <div className="tags">
                  {c.theses.map((k) => (
                    <i key={k} className="tag">
                      {k}
                    </i>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {pages > 1 && (
          <div className="board-pager">
            <button onClick={() => setPage(Math.max(0, at - 1))} disabled={at === 0} aria-label="Previous page">
              ‹
            </button>
            {at + 1} / {pages}
            <button onClick={() => setPage(Math.min(pages - 1, at + 1))} disabled={at === pages - 1} aria-label="Next page">
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
