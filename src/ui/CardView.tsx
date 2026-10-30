import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { PAPER, readableOn, tintOf } from '../lib/accent.ts';
import {
  band,
  columnCount,
  defaultTab,
  limitsContent,
  packColumn,
  packSteps,
  pagesOf,
  paragraphs,
  quotesContent,
  splitSteps,
  stepTab,
  STATUS,
  TAB_LABELS,
  tabsOf,
  whyContent,
  type StepPage,
  type TabId,
} from '../lib/card.ts';
import { useStore } from '../store.ts';
import type { AgenticCard, AgenticConcept, AgenticThesis } from '../types.ts';

/** Space between two columns, px (`--s3`). */
const GAP = 24;
/** Space between two steps, px (`--s3`); between two quotes (`--s2`). */
const STEP_GAP = 24;
const ITEM_GAP = 16;
/** A column's heading and the space under it, px (`--label-h`: 24px line + 4px). */
const LABEL_H = 28;
/** Space between a method's intro and its steps, px (`--s2`). */
const HEAD_GAP = 16;
/** Below this viewport width the page is one column and scrolls: no fixed regions, no pages. */
const NARROW = '(max-width: 899px)';

// ---------------------------------------------------------------------------------------------------------------
// Hooks

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** The inner size of an element, kept current. */
function useBox(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/** Counts up when the web fonts arrive, since the text moves a little then and has to be measured again. */
function useFonts(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const bump = () => live && setTick((t) => t + 1);
    void document.fonts?.ready.then(bump);
    document.fonts?.addEventListener?.('loadingdone', bump);
    return () => {
      live = false;
      document.fonts?.removeEventListener?.('loadingdone', bump);
    };
  }, []);
  return tick;
}

/** Heights of an element's children, px. */
const heightsOf = (el: Element | null | undefined): number[] => Array.from(el?.children ?? []).map((c) => c.getBoundingClientRect().height);

// ---------------------------------------------------------------------------------------------------------------
// Tab panels. Each fills the same fixed region; when its content does not fit, that tab alone is paged (the pager sits in the
// tab row). The hidden copy (`.tb-measure`) is the same content at the same width, to measure.

interface PanelProps {
  card: AgenticCard;
  narrow: boolean;
  /** Current page, from 0. */
  page: number;
  /** How many pages the content comes to. */
  onPages: (n: number) => void;
  onSeek: (seconds: number) => void;
}

/** Two balanced columns of running text (Why it works, Story, Limits). Too long for the region: columns fill in turn, a page at a time. */
function FlowTab({ narrow, page, onPages, children }: { narrow: boolean; page: number; onPages: (n: number) => void; children: ReactNode }) {
  const region = useRef<HTMLDivElement>(null);
  const meas = useRef<HTMLDivElement>(null);
  const box = useBox(region);
  const tick = useFonts();
  const [layout, setLayout] = useState({ paged: false, pages: 1 });

  useLayoutEffect(() => {
    const m = meas.current;
    if (narrow || !m || !box.w || !box.h) return;
    m.style.width = `${box.w}px`;
    m.style.height = `${box.h}px`;
    const col = (box.w - GAP) / 2;
    // Balanced columns: it fits when they stay two. Otherwise they fill one after the other and the rest is on the next pages.
    m.style.columnFill = 'balance';
    let n = columnCount(m.scrollWidth, col, GAP);
    if (n > 2) {
      m.style.columnFill = 'auto';
      n = columnCount(m.scrollWidth, col, GAP);
    }
    setLayout((l) => (l.paged === n > 2 && l.pages === pagesOf(n) ? l : { paged: n > 2, pages: pagesOf(n) }));
  }, [narrow, box.w, box.h, tick]);

  useEffect(() => onPages(narrow ? 1 : layout.pages), [narrow, layout.pages, onPages]);
  const at = Math.min(page, layout.pages - 1);
  const style: CSSProperties | undefined = narrow ? undefined : { height: box.h, columnFill: layout.paged ? 'auto' : 'balance', transform: at ? `translateX(${-at * (box.w + GAP)}px)` : undefined };
  return (
    <div className="tb" ref={region}>
      <div className="mc" style={style}>
        {children}
      </div>
      {!narrow && (
        <div className="mc tb-measure" ref={meas} aria-hidden="true">
          {children}
        </div>
      )}
    </div>
  );
}

function WhyTab({ card, narrow, page, onPages }: PanelProps) {
  const { more, why } = whyContent(card);
  return (
    <FlowTab narrow={narrow} page={page} onPages={onPages}>
      {more.length > 0 && (
        <>
          <div className="label">More on the idea</div>
          {more.map((p, i) => (
            <p key={`m${i}`}>{p}</p>
          ))}
        </>
      )}
      {why.length > 0 && (
        <>
          {more.length > 0 && <div className="label">Why it works</div>}
          {why.map((p, i) => (
            <p key={`w${i}`}>{p}</p>
          ))}
        </>
      )}
    </FlowTab>
  );
}

function StoryTab({ card, narrow, page, onPages }: PanelProps) {
  return (
    <FlowTab narrow={narrow} page={page} onPages={onPages}>
      {(card.stories ?? []).map((s, i) => (
        <section className="story" key={i}>
          <div className="label">
            From <em>{s.source}</em>
          </div>
          {paragraphs(s.text).map((p, j) => (
            <p key={j}>{p}</p>
          ))}
        </section>
      ))}
    </FlowTab>
  );
}

function LimitsTab({ card, narrow, page, onPages }: PanelProps) {
  const { limits, tension } = limitsContent(card);
  return (
    <FlowTab narrow={narrow} page={page} onPages={onPages}>
      {limits.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {tension && (
        <>
          <div className="label">Tension</div>
          {paragraphs(tension).map((p, i) => (
            <p key={`t${i}`}>{p}</p>
          ))}
        </>
      )}
    </FlowTab>
  );
}

/** One step: a large numeral in the accent and the text. */
function Step({ n, text }: { n: number; text: string }) {
  return (
    <li className="m-step">
      <b>{n}</b>
      <span>{text}</span>
    </li>
  );
}

/**
 * The method: its source and intro, then the steps in two columns, ceil(n/2) on the left. Too many for the region: the steps are paged.
 * A page with one step (one too tall for half the width, or the last) has it across the full width, so it is never taller than measured.
 */
function MethodTab({ card, narrow, page, onPages }: PanelProps) {
  const m = card.method;
  const steps = m?.steps ?? [];
  const region = useRef<HTMLDivElement>(null);
  const meas = useRef<HTMLDivElement>(null);
  const box = useBox(region);
  const tick = useFonts();
  const [pages, setPages] = useState<StepPage[]>([]);

  const head = (
    <>
      {m?.source && (
        <div className="label">
          From <em>{m.source}</em>
        </div>
      )}
      {m?.intro && <p className="m-intro">{m.intro}</p>}
    </>
  );
  const hasHead = !!m?.source || !!m?.intro;

  useLayoutEffect(() => {
    const root = meas.current;
    if (narrow || !root || !box.w || !box.h) return;
    const headH = root.querySelector('.m-head')?.getBoundingClientRect().height ?? 0;
    const heights = heightsOf(root.querySelector('.m-steps'));
    const first = box.h - (headH ? headH + HEAD_GAP : 0);
    setPages(packSteps(heights, STEP_GAP, first, box.h));
  }, [narrow, box.w, box.h, tick, steps.length]);

  const count = Math.max(1, pages.length);
  useEffect(() => onPages(narrow ? 1 : count), [narrow, count, onPages]);
  const at = Math.min(page, count - 1);

  const col = (idx: number[]) => (
    <ol className="m-col" start={(idx[0] ?? 0) + 1}>
      {idx.map((i) => (
        <Step key={i} n={i + 1} text={steps[i] ?? ''} />
      ))}
    </ol>
  );
  const shown = pages[at] ?? (narrow ? undefined : { left: [], right: [] });
  const whole = splitSteps(steps.length);
  return (
    <div className="tb method" ref={region}>
      {(narrow || at === 0) && hasHead && <div className="m-head">{head}</div>}
      <div className={`m-cols${!narrow && shown && shown.right.length === 0 ? ' one' : ''}`}>{narrow ? col(whole.left.concat(whole.right)) : (
        <>
          {col(shown?.left ?? [])}
          {col(shown?.right ?? [])}
        </>
      )}</div>
      {!narrow && (
        <div className="tb-measure" ref={meas} aria-hidden="true" style={{ width: box.w }}>
          <div className="m-head" style={{ width: box.w }}>
            {head}
          </div>
          <ol className="m-steps" style={{ width: Math.max(0, (box.w - GAP) / 2) }}>
            {steps.map((t, i) => (
              <Step key={i} n={i + 1} text={t} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/** Left: the book's quotes, all. Right: the conversation's lines, each with its speaker and a ▶ that seeks the video. Paged together. */
function QuotesTab({ card, narrow, page, onPages, onSeek }: PanelProps) {
  const { quotes, lines } = quotesContent(card);
  const region = useRef<HTMLDivElement>(null);
  const meas = useRef<HTMLDivElement>(null);
  const box = useBox(region);
  const tick = useFonts();
  const [cut, setCut] = useState<{ q: number[][]; l: number[][] }>({ q: [], l: [] });

  useLayoutEffect(() => {
    const root = meas.current;
    if (narrow || !root || !box.w || !box.h) return;
    const room = box.h - LABEL_H;
    setCut({ q: packColumn(heightsOf(root.querySelector('.q-quotes')), ITEM_GAP, room), l: packColumn(heightsOf(root.querySelector('.q-lines')), ITEM_GAP, room) });
  }, [narrow, box.w, box.h, tick, quotes.length, lines.length]);

  const count = Math.max(1, cut.q.length, cut.l.length);
  useEffect(() => onPages(narrow ? 1 : count), [narrow, count, onPages]);
  const at = Math.min(page, count - 1);

  const quote = (i: number) => {
    const q = quotes[i];
    return q ? (
      <li className="q-quote" key={i}>
        <p>“{q.text}”</p>
        <small>
          {q.source}
          {q.verified ? '' : ' · not checked against the book text'}
        </small>
      </li>
    ) : null;
  };
  const line = (i: number, measure?: boolean) => {
    const l = lines[i];
    return l ? (
      <li className="q-line" key={i}>
        <p>“{l.text}”</p>
        <small>
          {l.speaker}{' '}
          <button className="ts" type="button" tabIndex={measure ? -1 : undefined} disabled={measure} onClick={() => onSeek(l.at_s)}>
            ▶ {l.at}
          </button>
        </small>
      </li>
    ) : null;
  };
  const all = (n: number) => Array.from({ length: n }, (_, i) => i);
  const qIdx = narrow ? all(quotes.length) : (cut.q[at] ?? []);
  const lIdx = narrow ? all(lines.length) : (cut.l[at] ?? []);
  return (
    <div className="tb quotes" ref={region}>
      <div className="q-cols">
        <div className="q-col">
          {quotes.length > 0 && <div className="label">In the book</div>}
          <ul className="q-list">{qIdx.map((i) => quote(i))}</ul>
        </div>
        <div className="q-col">
          {lines.length > 0 && <div className="label">In the conversation</div>}
          <ul className="q-list">{lIdx.map((i) => line(i))}</ul>
        </div>
      </div>
      {!narrow && (
        <div className="tb-measure" ref={meas} aria-hidden="true" style={{ width: Math.max(0, (box.w - GAP) / 2) }}>
          <ul className="q-list q-quotes">{all(quotes.length).map((i) => quote(i))}</ul>
          <ul className="q-list q-lines">{all(lines.length).map((i) => line(i, true))}</ul>
        </div>
      )}
    </div>
  );
}

const PANELS: Record<TabId, ComponentType<PanelProps>> = {
  why: WhyTab,
  story: StoryTab,
  method: MethodTab,
  limits: LimitsTab,
  quotes: QuotesTab,
};

// ---------------------------------------------------------------------------------------------------------------
// The band

/**
 * Idea (the first paragraph) on the left, "With your agent" on the right, in a band of one fixed height. Text that does not fit is
 * cut, faded and reported: the card gets `data-band-overflow` for the audit, and the data is shortened.
 */
function Band({ card, narrow, onOverflow }: { card: AgenticCard; narrow: boolean; onOverflow: (o: { idea: boolean; apply: boolean }) => void }) {
  const { idea, apply } = band(card);
  const root = useRef<HTMLDivElement>(null);
  const tick = useFonts();
  const box = useBox(root);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || narrow) return onOverflow({ idea: false, apply: false });
    const over = (s: string) => {
      const e = el.querySelector(s);
      return !!e && e.scrollHeight > e.clientHeight + 1;
    };
    onOverflow({ idea: over('.b-idea'), apply: over('.b-apply') });
  }, [narrow, box.w, box.h, tick, idea, apply?.text, onOverflow]);
  if (!idea && !apply) return null;
  return (
    <section className="band" ref={root}>
      {idea && (
        <div className="b-idea">
          <div className="label">Idea</div>
          <p>{idea}</p>
        </div>
      )}
      {apply && (
        <aside className="b-apply">
          <div className="label">
            With your agent <span className="cap">{apply.label}</span>
          </div>
          <p>{apply.text}</p>
        </aside>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export interface CardBook {
  title: string;
  author: string;
  /** The book's accent colour, as in the library; made readable on the paper here. */
  accent: string;
  /** A small cover for narrow screens. */
  cover: string | null;
}

/**
 * A concept card, a fixed template for every card: the header (book, concept, summary, themes; `controls` sit at its right), the
 * band (Idea | With your agent), the tabs the card has and the panel of the open one, the footer. Left and right arrows switch tabs.
 */
export function CardView({
  concept,
  book,
  card,
  themes,
  activeTheme,
  pinned,
  controls,
  onPin,
  onTheme,
  onSeek,
}: {
  concept: AgenticConcept;
  book: CardBook;
  card: AgenticCard | undefined;
  themes: AgenticThesis[];
  activeTheme: string | null;
  pinned: boolean;
  controls: ReactNode;
  onPin: () => void;
  onTheme: (key: string) => void;
  onSeek: (seconds: number) => void;
}) {
  const narrow = useNarrow();
  const tabs = useMemo(() => tabsOf(card), [card]);
  const [picked, setPicked] = useState<TabId | null>(null);
  const tab = picked && tabs.includes(picked) ? picked : defaultTab(tabs);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [over, setOver] = useState({ idea: false, apply: false });
  // The "With your agent" box is a light tint of the accent; the accent is darkened until it reads on that tint (and so on the paper).
  const tint = useMemo(() => tintOf(book.accent), [book.accent]);
  const accent = useMemo(() => readableOn(readableOn(book.accent, tint), PAPER), [book.accent, tint]);

  const select = (t: TabId) => {
    if (t === tab) return;
    setPicked(t);
    setPage(0);
    setPages(1);
  };
  const onPages = useRef((n: number) => setPages((p) => (p === n ? p : n))).current;
  const onOverflow = useRef((o: { idea: boolean; apply: boolean }) => setOver((p) => (p.idea === o.idea && p.apply === o.apply ? p : o))).current;
  const last = Math.max(0, pages - 1);
  const at = Math.min(page, last);

  // ← and → switch tabs.
  const tabRef = useRef({ tabs, tab });
  tabRef.current = { tabs, tab };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT' || useStore.getState().boardOpen) return;
      const { tabs: ts, tab: cur } = tabRef.current;
      const next = stepTab(ts, cur, e.key === 'ArrowRight' ? 1 : -1);
      if (next && next !== cur) {
        setPicked(next);
        setPage(0);
        setPages(1);
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const Panel = tab ? PANELS[tab] : undefined;
  const style = { '--accent': accent, '--accent-tint': tint } as CSSProperties;
  const overflow = [over.idea && 'idea', over.apply && 'apply'].filter(Boolean).join(' ');
  return (
    <div className="card" style={style} data-tab={tab} data-pages={pages > 1 ? pages : undefined} data-band-overflow={overflow || undefined} data-band-idea={over.idea ? '' : undefined} data-band-apply={over.apply ? '' : undefined}>
      <header className="c-head">
        <div className="c-titles">
          <div className="c-by">
            {book.cover && <img className="c-thumb" src={book.cover} alt="" />}
            <span>
              {book.title} · {book.author}
            </span>
          </div>
          <h3 className="c-name">{concept.name}</h3>
          <p className="c-sum">{concept.summary}</p>
          <div className="c-chips">
            {concept.theses.map((k) => {
              const t = themes.find((x) => x.key === k);
              return (
                <button key={k} className={`theme mini${k === activeTheme ? ' on' : ''}`} onClick={() => onTheme(k)} title={t?.title}>
                  {/^\d+$/.test(k) && <span className="k">{k}</span>}
                  <span className="t">{t?.title}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="c-ctl">{controls}</div>
      </header>
      {card ? (
        <>
          <Band card={card} narrow={narrow} onOverflow={onOverflow} />
          {tabs.length > 0 && (
            <div className="c-tabs">
              <div role="tablist" aria-label="Sections of the card">
                {tabs.map((t) => (
                  <button key={t} role="tab" type="button" aria-selected={t === tab} data-tab={t} className={t === tab ? 'on' : ''} onClick={() => select(t)}>
                    {TAB_LABELS[t]}
                  </button>
                ))}
              </div>
              {!narrow && pages > 1 && (
                <span className="c-pager">
                  <button type="button" onClick={() => setPage(Math.max(0, at - 1))} disabled={at === 0} aria-label="Previous page">
                    ‹
                  </button>
                  {at + 1} / {pages}
                  <button type="button" onClick={() => setPage(Math.min(last, at + 1))} disabled={at === last} aria-label="Next page">
                    ›
                  </button>
                </span>
              )}
            </div>
          )}
          {Panel && (
            <div className="c-panel" role="tabpanel" key={tab}>
              <Panel card={card} narrow={narrow} page={at} onPages={onPages} onSeek={onSeek} />
            </div>
          )}
        </>
      ) : (
        <p className="wip">Card in progress.</p>
      )}
      <footer className="c-foot">
        <span className="status">
          {concept.status} {STATUS[concept.status] ?? ''}
        </span>
        <button className="pill pin" aria-pressed={pinned} onClick={onPin}>
          {pinned ? 'Pinned' : 'Pin to board'}
        </button>
      </footer>
    </div>
  );
}
