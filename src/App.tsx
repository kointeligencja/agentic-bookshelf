import { useCallback, useEffect, useMemo, useState } from 'react';
import { categorySpot, computeLayout, type Layout } from './scene/layout.ts';
import { Scene } from './scene/Scene.tsx';
import { useStore } from './store.ts';
import { cardWidth, isReading, panelWidth, readingPanel } from './lib/panel.ts';
import type { Agentic, AgenticCard, Library } from './types.ts';
import { CategoryNav } from './ui/CategoryNav.tsx';
import { Board, BoardButton } from './ui/Board.tsx';
import { BookPanel } from './ui/BookPanel.tsx';
import { ThemePanel } from './ui/ThemePanel.tsx';
import { Tooltip } from './ui/Tooltip.tsx';
import { ViewToggle } from './ui/ViewToggle.tsx';

/** `#book/{id}` opens a book pulled out, `#book/{id}/{conceptId}` with one of its cards; `#category/{slug}` flies to a bay. */
function applyHash(library: Library, layout: Layout) {
  const [kind, value, concept] = decodeURIComponent(location.hash.slice(1)).split('/');
  const s = useStore.getState();
  if (kind === 'book' && value && library.books.some((b) => b.id === value)) {
    // An unknown concept falls back to the book's first, in the panel.
    const c = concept || null;
    if (s.focused?.id !== value) s.focus(value, c);
    else if (c && s.concept !== c) s.setConcept(c);
  } else if (kind === 'category' && value) {
    const spot = categorySpot(layout, value);
    if (spot) {
      s.setTargetX(Math.min(layout.maxX, Math.max(layout.minX, spot.x + 350)));
      s.setTargetY(spot.y + 170);
      s.setDistance(2300);
    }
  }
}

export function App() {
  const library = useStore((s) => s.library);
  const setLibrary = useStore((s) => s.setLibrary);
  const agentic = useStore((s) => s.agentic);
  const sort = useStore((s) => s.sort);
  const view = useStore((s) => s.view);
  const [wide, setWide] = useState(() => isReading(window.innerWidth));
  // Reading mode: a book is pulled out on a screen wide enough for the card beside it. The left column fades out.
  const reading = useStore((s) => !!s.focused && !s.focused.closing) && wide;
  // With books lit the room is dark, and the footer (which has no pill behind it) turns light.
  const dim = useStore((s) => !s.focused && Object.keys(s.lit).length > 0);
  const [ready, setReady] = useState(false);
  const layout = useMemo(
    () => (library ? computeLayout(library.books, library.categories, sort, view) : null),
    [library, sort, view],
  );

  useEffect(() => {
    fetch('/data/books.json')
      .then((r) => r.json() as Promise<Library>)
      .then(setLibrary)
      .catch((err: unknown) => console.error('Failed to load library', err));
  }, [setLibrary]);

  // The conversation's themes; `?t=<key>` opens with one on.
  useEffect(() => {
    fetch('/data/agentic.json')
      .then((r) => r.json() as Promise<Agentic>)
      .then((data) => {
        const s = useStore.getState();
        s.setAgentic(data);
        const key = new URLSearchParams(location.search).get('t');
        if (key && data.theses.some((t) => t.key === key)) s.setTheme(key);
      })
      .catch((err: unknown) => console.error('Failed to load the conversation', err));
    fetch('/data/agentic-cards.json')
      .then((r) => r.json() as Promise<Record<string, AgenticCard>>)
      .then((cards) => useStore.getState().setCards(cards))
      .catch((err: unknown) => console.error('Failed to load the concept cards', err));
  }, []);

  // The panel's width, shared with the camera so the case sits to its right.
  useEffect(() => {
    const set = () => {
      const root = document.documentElement.style;
      root.setProperty('--panel-w', `${panelWidth(window.innerWidth)}px`);
      root.setProperty('--card-w', `${cardWidth(window.innerWidth)}px`);
      const r = readingPanel(window.innerWidth);
      root.setProperty('--read-left', `${r.left}px`);
      root.setProperty('--strip-w', `${r.strip}px`);
      setWide(isReading(window.innerWidth));
    };
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);

  const onReady = useCallback(() => setReady(true), []);

  // Deep links in, once the scene is up; and keep the hash in step with the focused book.
  useEffect(() => {
    if (!ready || !library || !layout) return;
    const apply = () => applyHash(library, layout);
    // Let the shelf settle in before pulling a book out.
    const t = setTimeout(apply, 900);
    window.addEventListener('hashchange', apply);
    const unsub = useStore.subscribe((now, before) => {
      if (now.focused?.id === before.focused?.id && now.concept === before.concept) return;
      if (now.focused) history.replaceState(null, '', `${location.search}#book/${now.focused.id}${now.concept ? `/${now.concept}` : ''}`);
      else if (location.hash.startsWith('#book/')) history.replaceState(null, '', `${location.pathname}${location.search}`);
    });
    return () => {
      clearTimeout(t);
      window.removeEventListener('hashchange', apply);
      unsub();
    };
  }, [ready, library, layout]);

  return (
    <main className={`app${ready ? ' ready' : ''}${reading ? ' reading' : ''}${dim ? ' dim' : ''}`}>
      {library && layout && <Scene library={library} layout={layout} onReady={onReady} />}
      {library && layout && <CategoryNav layout={layout} library={library} />}
      {agentic && <ThemePanel data={agentic} />}
      {library && <ViewToggle />}
      {library && <Tooltip library={library} />}
      {library && agentic && <BookPanel library={library} data={agentic} />}
      {agentic && <BoardButton data={agentic} />}
      {agentic && <Board data={agentic} />}
      <div className="loading" aria-hidden={ready}>
        <span>The Agentic Bookshelf</span>
      </div>
      <footer className="credit">
        Work in progress: {agentic?.books.length ?? 48} books we think apply. Conversation:{' '}
        <a href="https://www.youtube.com/watch?v=MN9dGgmLyso" target="_blank" rel="noreferrer noopener">
          Matt Pocock and Lauren Tan
        </a>
        . Shelf:{' '}
        <a href="https://github.com/chrija76/bookshelf" target="_blank" rel="noreferrer noopener">
          Christoph Janz's bookshelf
        </a>{' '}
        (MIT). Covers via Goodreads, Amazon and Open Library.
      </footer>
    </main>
  );
}
