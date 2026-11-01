import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bookCounts, clock, conceptCount, themeAtTime, themeStart, timelineSegments } from '../lib/agentic.ts';
import { createPlayer, PLAYING, type YTPlayer } from './youtube.ts';
import { SearchResults } from './SearchResults.tsx';
import { useNarrow } from './useNarrow.ts';
import { useSearch } from './useSearch.ts';
import { scrollToShelf } from './scrollToShelf.ts';
import { useStore } from '../store.ts';
import type { Agentic } from '../types.ts';

/** How often the video's position is checked against the themes, ms. */
const POLL_MS = 500;

/**
 * The left wall: the title, a search box, the conversation hung as a framed picture with its timeline, and a
 * label card with the themes. Playing the video follows the themes; picking one seeks to it. Either way the
 * store's active theme lights the shelf.
 */
export function ThemePanel({ data }: { data: Agentic }) {
  const theme = useStore((s) => s.theme);
  const playing = useStore((s) => s.playing);
  const setTheme = useStore((s) => s.setTheme);
  const setSeek = useStore((s) => s.setSeek);
  const slot = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const active = data.theses.find((t) => t.key === theme);
  const search = useSearch(data);
  // With books lit the room dims, and the wall text turns light to stay readable on it.
  const dim = useStore((s) => !s.focused && Object.keys(s.lit).length > 0);

  useEffect(() => {
    let gone = false;
    let timer = 0;
    const host = slot.current;
    if (!host) return;
    // The API swaps this element for its iframe and removes it on destroy, so each run gets its own.
    const el = document.createElement('div');
    host.replaceChildren(el);
    void createPlayer(el, data.video.id).then((p) => {
      if (gone) return p.destroy();
      player.current = p;
      timer = window.setInterval(() => {
        if (typeof p.getCurrentTime !== 'function') return; // not ready yet
        const key = themeAtTime(data.theses, p.getCurrentTime());
        const s = useStore.getState();
        if (key === s.playing) return;
        s.setPlaying(key);
        // Follow the video into a theme, but only while it plays, so scrubbing doesn't take over the shelf.
        if (key && p.getPlayerState() === PLAYING) s.setTheme(key);
      }, POLL_MS);
    });
    return () => {
      gone = true;
      clearInterval(timer);
      player.current?.destroy();
      player.current = null;
    };
  }, [data]);

  const seek = (seconds: number) => {
    const p = player.current;
    if (!p || typeof p.seekTo !== 'function') return;
    p.seekTo(seconds, true);
    p.playVideo();
  };
  // The book panel's timestamps seek through here.
  useEffect(() => setSeek(seek), [setSeek]);
  const narrow = useNarrow();
  const pick = (key: string) => {
    if (key === theme) return setTheme(null);
    setTheme(key);
    // On a narrow screen the index is below the shelf: bring the shelf up so the books that light are in view.
    if (narrow) scrollToShelf();
    const start = themeStart(data.theses.find((t) => t.key === key)!);
    if (start !== null) seek(start);
  };
  const getTime = useCallback(() => {
    const p = player.current;
    return p && typeof p.getCurrentTime === 'function' ? p.getCurrentTime() : null;
  }, []);
  /** A mark on the timeline: light its theme and play from that clip. */
  const playClip = (key: string, start: number) => {
    setTheme(key);
    seek(start);
  };

  const books = Object.keys(bookCounts(data, theme)).length;
  // The numbered themes go in the index; the rest (T, C, M) are a small group under it.
  const numbered = data.theses.filter((t) => /^\d+$/.test(t.key));
  const others = data.theses.filter((t) => !/^\d+$/.test(t.key));

  // Tell the camera where the column's search pill starts and its theme card ends, so the bookcase lines up with them.
  const wall = useRef<HTMLElement>(null);
  const setWallBox = useStore((s) => s.setWallBox);
  useLayoutEffect(() => {
    const el = wall.current;
    if (!el) return;
    const measure = () => {
      const top = el.querySelector('.search')?.getBoundingClientRect().top;
      const bottom = el.querySelector('.plaque')?.getBoundingClientRect().bottom;
      if (top !== undefined && bottom !== undefined) setWallBox({ top, bottom });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll('.wall-head, .plaque').forEach((e) => ro.observe(e));
    void document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [setWallBox]);

  // The results keep their last content while the pane fades out.
  const shown = useRef(search.state);
  if (search.state.active) shown.current = search.state;
  const results = search.state.active;
  // On a narrow screen the results are under the search box, in the page's flow, and the themes stay in their card.
  const stacked = narrow && results;
  const inCard = !narrow && results;

  return (
    <aside ref={wall} className={`wall${dim ? ' dim' : ''}`} aria-label="The conversation">
      <header className="wall-head">
        <h1>The Agentic Bookshelf</h1>
        <p className="sub">What Matt Pocock and Lauren Tan say about working with coding agents, and the books that go further.</p>
      </header>
      <div className="search-wrap">
        <div className="search">
          <input
            type="text"
            value={search.state.query}
            placeholder="What are you working on, or stuck with?"
            aria-label="Search the shelf by meaning"
            autoComplete="off"
            onChange={(e) => search.change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search.submit();
              if (e.key === 'Escape' && search.state.query) {
                e.stopPropagation();
                search.clear();
              }
            }}
          />
          {search.state.query && (
            <button className="x" onClick={search.clear} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>
        {/* Out of the flow, so the picture below never moves when the note appears. */}
        {search.state.note && !search.state.active && <div className="qnote hint">{search.state.note}</div>}
        {stacked && <SearchResults data={data} state={search.state} stacked />}
      </div>
      <figure className="frame">
        <div className="video">
          <div ref={slot} className="slot" />
        </div>
      </figure>
      <Timeline data={data} theme={theme} getTime={getTime} onPlay={playClip} />
      <section className={`plaque${inCard ? ' with-results' : ''}`} aria-label="Themes">
        <div className={`pane${inCard ? ' off' : ''}`} aria-hidden={inCard} inert={inCard}>
          <div className="index" role="group" aria-label="Themes">
            {numbered.map((t) => (
              <button
                key={t.key}
                className={`idx${theme === t.key ? ' on' : ''}${playing === t.key ? ' playing' : ''}`}
                aria-pressed={theme === t.key}
                onClick={() => pick(t.key)}
              >
                <span className="k">{t.key}</span>
                <span className="t">{t.title}</span>
              </button>
            ))}
          </div>
          {others.length > 0 && (
            <div className="also" role="group" aria-label="Also in the conversation">
              <span className="label">Also in the conversation</span>
              <div className="row">
                {others.map((t, i) => (
                  <span key={t.key}>
                    {i > 0 && <span className="dot" aria-hidden="true">·</span>}
                    <button className={theme === t.key ? 'on' : ''} aria-pressed={theme === t.key} onClick={() => pick(t.key)}>
                      {t.title}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="now" aria-live="polite">
            {active ? (
              <>
                <div className="label">{playing === active.key ? 'Now in the conversation' : 'Selected theme'}</div>
                <h2>{active.title}</h2>
                <p>{active.line}</p>
                <div className="meta">
                  <span>
                    {books} books lit · {conceptCount(data, active.key)} concepts
                  </span>
                  {active.clips.map((c) => (
                    <button key={c.start} className="ts" onClick={() => seek(c.start)}>
                      ▶ {clock(c.start)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="label">How it works</div>
                <h2>Play the conversation</h2>
                <p>When it reaches a theme, the books that take the idea further light up. Or pick a theme above.</p>
              </>
            )}
          </div>
        </div>
        <div className={`pane${inCard ? '' : ' off'}`} aria-hidden={!inCard} inert={!inCard}>
          {!narrow && <SearchResults data={data} state={shown.current} />}
        </div>
      </section>
    </aside>
  );
}

/**
 * The whole video as a thin bar: each theme's clips as marks (gold for the active theme) and the playhead.
 * The playhead is read from the player twice a second, here, so the rest of the wall does not re-render with it.
 */
function Timeline({
  data,
  theme,
  getTime,
  onPlay,
}: {
  data: Agentic;
  theme: string | null;
  getTime: () => number | null;
  onPlay: (key: string, start: number) => void;
}) {
  const duration = data.video.duration;
  const segments = useMemo(() => timelineSegments(data.theses, duration), [data.theses, duration]);
  const [at, setAt] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = getTime();
      if (typeof t === 'number' && Number.isFinite(t)) setAt(t);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [getTime]);
  return (
    <div className="timeline" role="group" aria-label="Themes along the video">
      <div className="track" />
      {segments.map((s) => (
        <button
          key={`${s.theme}-${s.start}`}
          className={`seg${s.theme === theme ? ' on' : ''}`}
          style={{ left: `${s.left}%`, width: `max(${s.width}%, 4px)` }}
          title={`${s.title} · ${clock(s.start)}`}
          aria-label={`${s.title}, from ${clock(s.start)}`}
          onClick={() => onPlay(s.theme, s.start)}
        />
      ))}
      <div className="head" style={{ left: `${Math.min(100, (at / duration) * 100)}%` }} />
    </div>
  );
}
