import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cardBlocks, paginate, STATUS, tabs, type Block, type Page } from '../lib/card.ts';
import type { AgenticCard, AgenticConcept, AgenticThesis } from '../types.ts';

/** One block of a card. Spacing is padding on the wrapper, so measured heights add up exactly. */
function BlockView({ b, onSeek }: { b: Block; onSeek: (s: number) => void }) {
  const head = 'head' in b && b.head;
  return (
    <div className={`blk blk-${b.kind}${'cont' in b && b.cont ? ' cont' : ''}`}>
      {head && (
        <div className="label c-sub">
          {head.label}
          {head.em && (
            <>
              {' '}
              <em>{head.em}</em>
            </>
          )}
        </div>
      )}
      {b.kind === 'summary' && <p className="c-sum">{b.text}</p>}
      {b.kind === 'text' && b.text && <p className="c-body">{b.text}</p>}
      {b.kind === 'step' && (
        <div className="c-step">
          <b>{b.n}</b>
          <span>{b.text}</span>
        </div>
      )}
      {b.kind === 'quote' && (
        <div className="c-quote">
          “{b.text}”
          <small>
            {b.source}
            {b.verified ? '' : ' · not checked against the book text'}
          </small>
        </div>
      )}
      {b.kind === 'conv' && (
        <div className="c-conv">
          “{b.text}” <small>{b.speaker}</small>{' '}
          <button className="ts" onClick={() => onSeek(b.atS)}>
            ▶ {b.at}
          </button>
        </div>
      )}
      {b.kind === 'apply' && (
        <div className="c-try">
          <div className="label">{b.label}</div>
          {b.text}
        </div>
      )}
    </div>
  );
}

/**
 * A concept card: theme chips, name, source books, then the card's sections as tabs over fixed-height pages.
 * The blocks are measured once in a hidden copy of the box and flowed into pages, so the card never scrolls.
 */
export function CardView({
  concept,
  card,
  themes,
  activeTheme,
  pinned,
  onPin,
  onTheme,
  onSeek,
}: {
  concept: AgenticConcept;
  card: AgenticCard | undefined;
  themes: AgenticThesis[];
  activeTheme: string | null;
  pinned: boolean;
  onPin: () => void;
  onTheme: (key: string) => void;
  onSeek: (seconds: number) => void;
}) {
  const blocks = useMemo(() => cardBlocks(card, concept.summary), [card, concept.summary]);
  const box = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    const copy = measure.current;
    if (!el || !copy) return;
    const run = () => {
      if (!el.clientHeight) return;
      const heights = [...copy.children].map((c) => (c as HTMLElement).offsetHeight);
      setPages(paginate(blocks, heights, el.clientHeight));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    // Text moves a little when the web fonts arrive.
    void document.fonts?.ready.then(run);
    return () => ro.disconnect();
  }, [blocks]);

  const last = (pages?.length ?? 1) - 1;
  const at = Math.min(page, last);
  const go = (to: number) => setPage(Math.max(0, Math.min(last, to)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') go(at + 1);
      else if (e.key === 'ArrowLeft') go(at - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const current = pages?.[at];
  return (
    <div className="card">
      <div className="c-chips">
        {concept.theses.map((k) => {
          const t = themes.find((x) => x.key === k);
          return (
            <button key={k} className={`theme mini${k === activeTheme ? ' on' : ''}`} onClick={() => onTheme(k)} title={t?.title}>
              <span className="k">{k}</span>
              <span className="t">{t?.title}</span>
            </button>
          );
        })}
      </div>
      <h3 className="c-name">{concept.name}</h3>
      <div className="c-books">
        {(card?.sources ?? []).map((s, i) => (
          <span key={s.book}>
            {i > 0 && ' · '}
            <em>{s.book}</em>
          </span>
        ))}
      </div>
      <div className="c-tabs" role="tablist">
        {pages &&
          tabs(pages).map((t) => (
            <button key={t.sec} role="tab" aria-selected={t.sec === current?.sec} className={t.sec === current?.sec ? 'on' : ''} onClick={() => setPage(t.page)}>
              {t.sec}
            </button>
          ))}
      </div>
      <div className="c-content" ref={box}>
        {current?.blocks.map((b, i) => <BlockView key={`${at}-${i}`} b={b} onSeek={onSeek} />)}
        <div className="c-measure" ref={measure} aria-hidden="true">
          {blocks.map((b, i) => (
            <BlockView key={i} b={b} onSeek={onSeek} />
          ))}
        </div>
      </div>
      <div className="c-foot">
        <span className="status">
          {concept.status} {STATUS[concept.status] ?? ''}
        </span>
        <span className="c-pager">
          {pages && pages.length > 1 && (
            <>
              <button onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous page">
                ‹
              </button>
              {at + 1} / {pages.length}
              <button onClick={() => go(at + 1)} disabled={at === last} aria-label="Next page">
                ›
              </button>
            </>
          )}
        </span>
        <button className="pill pin" aria-pressed={pinned} onClick={onPin}>
          {pinned ? 'Pinned' : 'Pin to board'}
        </button>
      </div>
    </div>
  );
}
