import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeLayout } from './scene/layout.ts';
import { Scene } from './scene/Scene.tsx';
import { useStore } from './store.ts';
import { stageHeight } from './lib/framing.ts';
import { isNarrow, isReading, panelWidth, readingPanel } from './lib/panel.ts';
import { FOV, MAX_DISTANCE, MIN_DISTANCE, PHONE_MARGIN } from './scene/CameraRig.tsx';
import { caseHeight, caseWidth } from './scene/layout.ts';
import type { Agentic, AgenticCard, Library } from './types.ts';
import { CategoryNav } from './ui/CategoryNav.tsx';
import { Board, BoardButton } from './ui/Board.tsx';
import { BookPanel } from './ui/BookPanel.tsx';
import { ThemePanel } from './ui/ThemePanel.tsx';
import { Tooltip } from './ui/Tooltip.tsx';
import { ViewToggle } from './ui/ViewToggle.tsx';

/** Limits of the shelf block's height on a narrow screen, px: the least, the most, and the most on a phone held sideways. */
const STAGE_MIN = 300;
const STAGE_MAX = 760;
const STAGE_MAX_LANDSCAPE = 420;

/** `#book/{id}` opens a book pulled out, `#book/{id}/{conceptId}` with one of its cards; `#category/{slug}` lights a category's books. */
function applyHash(library: Library) {
  const [kind, value, concept] = decodeURIComponent(location.hash.slice(1)).split('/');
  const s = useStore.getState();
  if (kind === 'book' && value && library.books.some((b) => b.id === value)) {
    // An unknown concept falls back to the book's first, in the panel.
    const c = concept || null;
    if (s.focused?.id !== value) s.focus(value, c);
    else if (c && s.concept !== c) s.setConcept(c);
  } else if (kind === 'category' && value) {
    if (library.categories.some((c) => c.slug === value)) s.setCategory(value);
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
  // A book is pulled out (or going back): on a narrow screen its card covers the page, which then must not scroll behind it.
  const held = useStore((s) => !!s.focused);
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
      const r = readingPanel(window.innerWidth);
      root.setProperty('--read-left', `${r.left}px`);
      root.setProperty('--strip-w', `${r.strip}px`);
      setWide(isReading(window.innerWidth));
    };
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);

  // On a narrow screen the shelf is a block of the page, as high as the case needs: the one at which the case is PHONE_MARGIN from every edge.
  // Worked out from the case and the page's width, again when the window is resized or turned.
  useEffect(() => {
    if (!layout) return;
    const root = document.documentElement.style;
    const set = () => {
      const width = document.documentElement.clientWidth;
      if (!isNarrow(width)) return root.removeProperty('--stage-h');
      const c = layout.bookcase;
      // A phone on its side is not tall enough for a block that high: it keeps the height the old rule gave it.
      const maxHeight = window.innerWidth > window.innerHeight ? STAGE_MAX_LANDSCAPE : STAGE_MAX;
      const h = stageHeight({
        width: caseWidth(c),
        height: caseHeight(c),
        z: c.depth,
        viewWidth: width,
        fovDeg: FOV,
        margin: PHONE_MARGIN,
        min: MIN_DISTANCE,
        max: MAX_DISTANCE,
        minHeight: STAGE_MIN,
        maxHeight,
      });
      root.setProperty('--stage-h', `${Math.round(h)}px`);
    };
    set();
    window.addEventListener('resize', set);
    window.addEventListener('orientationchange', set);
    return () => {
      window.removeEventListener('resize', set);
      window.removeEventListener('orientationchange', set);
      root.removeProperty('--stage-h');
    };
  }, [layout]);

  const onReady = useCallback(() => setReady(true), []);

  // Deep links in, once the scene is up; and keep the hash in step with the focused book.
  useEffect(() => {
    if (!ready || !library || !layout) return;
    const apply = () => applyHash(library);
    // Let the shelf settle in before pulling a book out.
    const t = setTimeout(apply, 900);
    window.addEventListener('hashchange', apply);
    const unsub = useStore.subscribe((now, before) => {
      // The hash follows the lit category.
      if (now.category !== before.category) {
        if (now.category) history.replaceState(null, '', `${location.search}#category/${now.category}`);
        else if (location.hash.startsWith('#category/')) history.replaceState(null, '', `${location.pathname}${location.search}`);
      }
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
    <main className={`app${ready ? ' ready' : ''}${reading ? ' reading' : ''}${dim ? ' dim' : ''}${held ? ' held' : ''}`}>
      {/* The shelf's block: the whole window beside and under the other parts on a desktop screen, a block of the page on a narrow one. */}
      <div className="stage" data-stage>
        {library && layout && <Scene library={library} layout={layout} onReady={onReady} />}
      </div>
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
