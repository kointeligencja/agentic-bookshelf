import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { computeLayout } from './scene/layout.ts';
import { useStore } from './store.ts';
import { stageHeight } from './lib/framing.ts';
import { isNarrow, isReading, panelWidth, readingPanel } from './lib/panel.ts';
import { FOV, groupFor, MAX_DISTANCE, MIN_DISTANCE, PHONE_MARGIN } from './scene/camera.ts';
import { mark } from './lib/marks.ts';
import { homeGroup } from './lib/homeGroup.ts';
import { caseHeight, caseWidth } from './scene/layout.ts';
import type { Agentic, AgenticCard, Library } from './types.ts';
import { CategoryNav } from './ui/CategoryNav.tsx';
import { Board, BoardButton } from './ui/Board.tsx';
import { BookPanel } from './ui/BookPanel.tsx';
import { ThemePanel } from './ui/ThemePanel.tsx';
import { Tooltip } from './ui/Tooltip.tsx';
import { ViewToggle } from './ui/ViewToggle.tsx';

/** The 3D scene (three.js, drei) is its own chunk: the page's blocks are painted before it has been fetched and parsed. */
// The import starts as soon as this module runs, in parallel with the library, not when the scene is first drawn.
const sceneChunk = import('./scene/Scene.tsx').then((m) => ({ default: m.Scene }));
const Scene = lazy(() => sceneChunk);

/** Limits of the shelf block's height on a narrow screen, px: the least, the most, and the most on a phone held sideways. */
const STAGE_MIN = 300;
const STAGE_MAX = 760;
const STAGE_MAX_LANDSCAPE = 420;

/** The shape of the case in the opening view (Covers), mm, used to place the page's blocks before the library is in. Replaced by the real case once it is. */
const FIRST_CASE = { width: 2192, height: 2314, z: 180 };

/** Writes the desktop home group's edges as CSS variables: the column's left edge and width, and the group's right edge as a distance from the window's right. */
function setGroupVars(g: { columnLeft: number; columnWidth: number; groupRight: number; caseLeft: number; caseWidth: number; caseTop: number; caseBottom: number }, vw: number) {
  const root = document.documentElement.style;
  root.setProperty('--col-w', `${g.columnWidth}px`);
  root.setProperty('--group-l', `${Math.round(g.columnLeft * 10) / 10}px`);
  root.setProperty('--case-l', `${Math.round(g.caseLeft)}px`);
  root.setProperty('--case-t', `${Math.round(g.caseTop)}px`);
  root.setProperty('--case-w', `${Math.round(g.caseWidth)}px`);
  root.setProperty('--case-h', `${Math.round(g.caseBottom - g.caseTop)}px`);
  root.setProperty('--group-r', `${Math.round((vw - g.groupRight) * 10) / 10}px`);
}

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
  const [booksReady, setBooksReady] = useState(false);
  const layout = useMemo(
    () => (library ? computeLayout(library.books, library.categories, sort, view) : null),
    [library, sort, view],
  );

  useEffect(() => {
    fetch('/data/books.json')
      .then((r) => r.json() as Promise<Library>)
      .then((lib) => {
        mark('library');
        setLibrary(lib);
      })
      .catch((err: unknown) => console.error('Failed to load library', err));
  }, [setLibrary]);

  // The conversation's themes; `?t=<key>` opens with one on.
  useEffect(() => {
    fetch('/data/agentic.json')
      .then((r) => r.json() as Promise<Agentic>)
      .then((data) => {
        const s = useStore.getState();
        mark('agentic');
        s.setAgentic(data);
        const key = new URLSearchParams(location.search).get('t');
        if (key && data.theses.some((t) => t.key === key)) s.setTheme(key);
      })
      .catch((err: unknown) => console.error('Failed to load the conversation', err));
    // The cards are only needed once a book is opened: let them wait behind the shelf's atlases.
    fetch('/data/agentic-cards.json', { priority: 'low' } as RequestInit)
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
      if (!isNarrow(width)) {
        root.removeProperty('--stage-h');
        return setGroupVars(groupFor(layout, width, window.innerHeight), width);
      }
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

  // Before the library is in, the page's blocks stand where the group will put them (for a case of the usual shape), so they do not jump.
  useLayoutEffect(() => {
    if (layout) return;
    const first = () => {
      const w = document.documentElement.clientWidth;
      if (!isNarrow(w)) setGroupVars(homeGroup(w, window.innerHeight, { ...FIRST_CASE, fovDeg: FOV, min: MIN_DISTANCE, max: MAX_DISTANCE }), w);
    };
    first();
    window.addEventListener('resize', first);
    return () => window.removeEventListener('resize', first);
  }, [layout]);

  const onBooksReady = useCallback(() => setBooksReady(true), []);
  const onReady = useCallback(() => {
    mark('scene-ready');
    setReady(true);
  }, []);

  // The page's own blocks have been painted (two frames after they were first in the DOM).
  const uiUp = !!agentic;
  useEffect(() => {
    if (!uiUp) return;
    requestAnimationFrame(() => requestAnimationFrame(() => mark('ui-painted')));
  }, [uiUp]);

  // Deep links in, once the scene is up; and keep the hash in step with the focused book.
  useEffect(() => {
    if (!booksReady || !library || !layout) return;
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
  }, [booksReady, library, layout]);

  return (
    <main className={`app${ready ? ' ready' : ''}${reading ? ' reading' : ''}${dim ? ' dim' : ''}${held ? ' held' : ''}`}>
      {/* The shelf's block: the whole window beside and under the other parts on a desktop screen, a block of the page on a narrow one. */}
      <div className="stage" data-stage>
        <div className="stage-hold" aria-hidden="true" />
        {library && layout && (
          <Suspense fallback={null}>
            <Scene library={library} layout={layout} onReady={onReady} onBooksReady={onBooksReady} />
          </Suspense>
        )}
      </div>
      {library && layout && <CategoryNav layout={layout} library={library} />}
      {agentic && <ThemePanel data={agentic} />}
      {library && <ViewToggle />}
      {library && <Tooltip library={library} />}
      {library && agentic && <BookPanel library={library} data={agentic} />}
      {agentic && <BoardButton data={agentic} />}
      {agentic && <Board data={agentic} />}
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
