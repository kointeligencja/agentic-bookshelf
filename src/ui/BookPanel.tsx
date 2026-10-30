import { useEffect, useMemo, useRef, useState } from 'react';
import { stepTo } from '../lib/board.ts';
import { useStore } from '../store.ts';
import type { Agentic, Library } from '../types.ts';
import { CardView } from './CardView.tsx';

/**
 * The page over the right of the screen while a book is pulled out: one concept's card at a time. In reading mode (900px and wider)
 * it is an opaque paper page right of the walnut strip that holds the book; narrower, it fills the screen. Esc or ✕ puts the book back.
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

  const menuOpen = useRef(false);
  menuOpen.current = menu;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.key === 'Escape') {
        // The board covers everything, so it goes first. Then, innermost first: the concept list, the book.
        if (s.boardOpen) s.setBoardOpen(false);
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

  // The concept list, `‹ 1/3 ▾ ›`, and ✕, at the top right of the page.
  const controls = (
    <>
      <div className="cnav">
        <button className="step" onClick={() => go(-1)} disabled={index <= 0} aria-label="Previous concept">
          ‹
        </button>
        <button className="pick" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="listbox" aria-label={`Concept ${index + 1} of ${list.length}: ${current?.name ?? ''}`} title={themeTitle ? `${inTheme} of ${list.length} for “${themeTitle}”` : undefined}>
          <span className="count">
            {index + 1}/{list.length}
          </span>{' '}
          <span className="caret">▾</span>
        </button>
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
      <button className="page-close" onClick={close} aria-label="Put back">
        ✕
      </button>
    </>
  );

  return (
    <aside className={`book-panel${visible ? ' visible' : ''}`} aria-hidden={!visible} aria-label="The book">
      {book &&
        (list.length === 0 || !current ? (
          <div className="card">
            <header className="c-head">
              <div className="c-titles">
                <div className="c-by">
                  {book.title} · {book.author}
                </div>
              </div>
              <div className="c-ctl">
                <button className="page-close" onClick={close} aria-label="Put back">
                  ✕
                </button>
              </div>
            </header>
            <p className="wip">No concepts from this book yet.</p>
          </div>
        ) : (
          <CardView
            key={current.id}
            concept={current}
            book={{ title: book.title.split(/:\s+/)[0] ?? book.title, author: book.author, accent: book.palette.accent, cover: book.coverUrl }}
            card={cards?.[current.id]}
            themes={data.theses}
            activeTheme={theme}
            pinned={pins.includes(current.id)}
            controls={controls}
            onPin={() => togglePin(current.id)}
            onTheme={setTheme}
            onSeek={(s) => {
              close();
              useStore.getState().seek(s);
            }}
          />
        ))}
    </aside>
  );
}
