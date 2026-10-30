import { useEffect, useMemo, useRef, useState } from 'react';
import { stepTo } from '../lib/board.ts';
import type { SectionId } from '../lib/card.ts';
import { useStore } from '../store.ts';
import type { Agentic, Library } from '../types.ts';
import { CardView } from './CardView.tsx';

/**
 * The panel over the right of the screen while a book is pulled out: what the book contributes, and one
 * concept's card at a time. Esc or ✕ puts the book back.
 */
export function BookPanel({ library, data }: { library: Library; data: Agentic }) {
  const focused = useStore((s) => s.focused);
  const selected = useStore((s) => s.concept);
  const theme = useStore((s) => s.theme);
  const cards = useStore((s) => s.cards);
  const pins = useStore((s) => s.pins);
  const { setConcept, setTheme, togglePin, close } = useStore.getState();
  const book = focused ? library.books.find((b) => b.id === focused.id) : undefined;
  const visible = !!book && !focused?.closing;
  const [menu, setMenu] = useState(false);
  // The section opened in place of a card's body, if any, and the concept it belongs to.
  const [more, setMore] = useState<{ concept: string; sec: SectionId } | null>(null);

  // This book's concepts, those of the active theme first.
  const list = useMemo(() => {
    if (!book) return [];
    const mine = data.concepts.filter((c) => c.bookIds.includes(book.id));
    return [...mine].sort((a, b) => Number(!!theme && b.theses.includes(theme)) - Number(!!theme && a.theses.includes(theme)));
  }, [book, data, theme]);
  const current = list.find((c) => c.id === selected) ?? list[0];
  const index = list.findIndex((c) => c.id === current?.id);

  // The list closes with the book and when the book changes.
  useEffect(() => setMenu(false), [book?.id, visible]);
  // A section opened in place goes back to its card when the concept or the book changes.
  useEffect(() => setMore(null), [current?.id, book?.id, visible]);

  const menuOpen = useRef(false);
  menuOpen.current = menu;
  const expanded = more && more.concept === current?.id ? more.sec : null;
  const expandedRef = useRef<SectionId | null>(null);
  expandedRef.current = expanded;

  // Only for the card audit (scripts/card-audit.ts): opens a section without needing its link on screen.
  useEffect(() => {
    if (!import.meta.env.DEV || !current) return;
    const w = window as unknown as { __more?: (sec: SectionId | null) => void };
    w.__more = (sec) => setMore(sec ? { concept: current.id, sec } : null);
    return () => {
      delete w.__more;
    };
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.key === 'Escape') {
        // The board covers everything, so it goes first. Then, innermost first: a section opened in place, the
        // concept list, the book.
        if (s.boardOpen) s.setBoardOpen(false);
        else if (expandedRef.current) setMore(null);
        else if (menuOpen.current) setMenu(false);
        else s.close();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && s.focused && !s.boardOpen && (e.target as HTMLElement | null)?.tagName !== 'INPUT') {
        const next = stepTo(list, s.concept ?? list[0]?.id, e.key === 'ArrowDown' ? 1 : -1);
        if (next) s.setConcept(next.id);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list]);

  const go = (delta: number) => {
    const next = stepTo(list, current?.id, delta);
    if (next) setConcept(next.id);
  };
  const inTheme = theme ? list.filter((c) => c.theses.includes(theme)).length : 0;
  const themeTitle = data.theses.find((t) => t.key === theme)?.title;

  return (
    <aside className={`book-panel${visible ? ' visible' : ''}`} aria-hidden={!visible} aria-label="The book">
      {book && (
        <>
          <header>
            <div>
              <h2 title={book.title}>{book.title.split(/:\s+/)[0]}</h2>
              <div className="by">{book.author}</div>
            </div>
            <button className="pill icon" onClick={close} aria-label="Put back">
              ✕
            </button>
          </header>
          {list.length === 0 ? (
            <p className="wip">No concepts from this book yet.</p>
          ) : (
            <>
              <div className="cnav">
                <button className="step" onClick={() => go(-1)} disabled={index <= 0} aria-label="Previous concept">
                  ‹
                </button>
                <button className="pick" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="listbox" title={themeTitle ? `${inTheme} of ${list.length} for “${themeTitle}”` : undefined}>
                  <span className="nm">{current?.name}</span> <span className="caret">▾</span>
                </button>
                <span className="count">
                  {index + 1} / {list.length}
                </span>
                <button className="step" onClick={() => go(1)} disabled={index >= list.length - 1} aria-label="Next concept">
                  ›
                </button>
                {menu && (
                  <>
                    <div className="scrim" onClick={() => setMenu(false)} />
                    <ul className="clist pop" role="listbox" aria-label="Concepts in this book">
                      {list.map((c) => (
                        <li key={c.id}>
                          <button
                            role="option"
                            aria-selected={c.id === current?.id}
                            className={`${c.id === current?.id ? 'sel' : ''}${theme && !c.theses.includes(theme) ? ' inactive' : ''}`}
                            onClick={() => {
                              setConcept(c.id);
                              setMenu(false);
                            }}
                          >
                            <span>{c.name}</span>
                            <span className="tags">
                              {c.theses.map((k) => (
                                <i key={k} className={`tag${k === theme ? ' hot' : ''}`}>
                                  {k}
                                </i>
                              ))}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              {current && (
                <CardView
                  key={current.id}
                  concept={current}
                  concepts={data.concepts}
                  bookId={book.id}
                  card={cards?.[current.id]}
                  themes={data.theses}
                  activeTheme={theme}
                  pinned={pins.includes(current.id)}
                  expanded={expanded}
                  onMore={(sec) => setMore({ concept: current.id, sec })}
                  onBack={() => setMore(null)}
                  onPin={() => togglePin(current.id)}
                  onTheme={setTheme}
                  onSeek={(s) => {
                    close();
                    useStore.getState().seek(s);
                  }}
                  onOpen={(id) => useStore.getState().openConcept(id)}
                />
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}
