import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { PAPER, readableOn, tintOf } from '../lib/accent.ts';
import {
  band,
  columnCount,
  defaultTab,
  limitsContent,
  nextBreak,
  packColumn,
  packSteps,
  pagesOf,
  paragraphs,
  quotesContent,
  splitSentences,
  splitSteps,
  stepTab,
  STATUS,
  subtitleOf,
  TAB_LABELS,
  tabsOf,
  whyContent,
  type PageBreak,
  type PieceFit,
  type SentenceFit,
  type StepPage,
  type TabId,
} from '../lib/card.ts';
import { useStore } from '../store.ts';
import type { AgenticCard, AgenticConcept, AgenticThesis } from '../types.ts';

/** Space between two columns, px (`--s3`). */
const GAP = 24;
/** Space between two paragraphs in a flow tab, px (`--s2`). */
const ITEM_GAP = 16;
/** The space between two method steps when they would not all fit on one page at the usual one (`--s3`), px (`--s2`). */
const STEP_GAP_TIGHT = 16;
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

/** A heading or a paragraph of running text in a flow tab. */
type FlowBlock = { kind: 'label'; key: string; content: ReactNode } | { kind: 'p'; key: string; text: string };

/** Where (in the columns of the measured copy) an element starts and ends: the column of its first and last box, from 0. */
function columnsOf(el: Element, left: number, col: number, gap: number): { first: number; last: number } {
  const rects = el.getClientRects();
  const at = (r: DOMRect | undefined) => (r ? Math.max(0, Math.floor((r.left - left + 1) / (col + gap))) : 0);
  return { first: at(rects[0]), last: at(rects[rects.length - 1]) };
}

/** Pages (two columns to a page) from the columns of an element's first and last box. */
const pagesFit = (c: { first: number; last: number }): SentenceFit => ({ start: Math.floor(c.first / 2), end: Math.floor(c.last / 2) });

/**
 * Two balanced columns of running text (Why it works, Story, Limits). Too long for the region: the columns fill one after the other
 * and the text is paged, two columns to a page. A page never ends inside a sentence: a paragraph that would run over to the next page
 * moves whole to it, and one too long for a page is cut before the sentence that crosses (see nextBreak). The cuts are found by
 * measuring the hidden copy, then putting empty space in front of the first fault that fills the rest of its page, and measuring again,
 * until nothing is left to fix.
 */
function FlowTab({ narrow, page, onPages, blocks }: { narrow: boolean; page: number; onPages: (n: number) => void; blocks: FlowBlock[] }) {
  const region = useRef<HTMLDivElement>(null);
  const meas = useRef<HTMLDivElement>(null);
  const box = useBox(region);
  const tick = useFonts();
  const sentences = useMemo(() => blocks.map((b) => (b.kind === 'p' ? splitSentences(b.text) : [])), [blocks]);
  const [layout, setLayout] = useState({ paged: false, pages: 1 });
  // The breaks found so far; they belong to one content at one size, and are dropped when either changes.
  const [plan, setPlan] = useState<{ blocks: FlowBlock[]; w: number; h: number; tick: number; breaks: PageBreak[] }>({ blocks, w: 0, h: 0, tick: 0, breaks: NO_BREAKS });
  const breaks = plan.blocks === blocks && plan.w === box.w && plan.h === box.h && plan.tick === tick ? plan.breaks : NO_BREAKS;

  useLayoutEffect(() => {
    const m = meas.current;
    if (narrow || !m || !box.w || !box.h) return;
    m.style.width = `${box.w}px`;
    m.style.height = `${box.h}px`;
    const col = (box.w - GAP) / 2;
    const done = (paged: boolean, n: number) => setLayout((l) => (l.paged === paged && l.pages === pagesOf(n) ? l : { paged, pages: pagesOf(n) }));
    // Balanced columns: it fits when they stay two, and there is nothing to cut.
    if (!breaks.length) {
      m.style.columnFill = 'balance';
      m.classList.remove('paged');
      const n = columnCount(m.scrollWidth, col, GAP);
      if (n <= 2) return done(false, n);
    }
    // Otherwise the columns fill one after the other.
    m.style.columnFill = 'auto';
    m.classList.add('paged');
    const mBox = m.getBoundingClientRect();
    const colAt = (r: DOMRect) => Math.max(0, Math.floor((r.left - mBox.left + 1) / (col + GAP)));
    const els = Array.from(m.querySelectorAll<HTMLElement>('[data-piece]'));
    const lastBox = (el: Element) => Array.from(el.getClientRects()).pop()!;
    const pieces: PieceFit[] = els.map((el) => {
      const mine = pagesFit(columnsOf(el, mBox.left, col, GAP));
      return {
        ...mine,
        block: Number(el.dataset.block),
        first: Number(el.dataset.first),
        label: el.dataset.piece === 'label',
        sentences: mine.start === mine.end ? [] : Array.from(el.querySelectorAll('[data-s]')).map((s) => pagesFit(columnsOf(s, mBox.left, col, GAP))),
      };
    });
    const { at } = nextBreak(pieces, breaks);
    if (at && breaks.length < 200) {
      // The empty space that fills the rest of the page the text starts on: from the end of what is before it (and the gap) to the
      // top of the first column of the next page, a little short so that the text does not fit in what is left and moves on.
      let j = pieces.length - 1;
      while (j > 0 && !(pieces[j]!.block === at.block && pieces[j]!.first <= at.sentence)) j--;
      const el = els[j]!;
      const spans = Array.from(el.querySelectorAll('[data-s]'));
      const k = at.sentence - pieces[j]!.first;
      const from = k > 0 ? spans[k] : el;
      const before = k > 0 ? spans[k - 1] : els[j - 1];
      const start = from?.getClientRects()[0];
      const prev = before ? lastBox(before) : undefined;
      if (start && prev) {
        const target = 2 * (Math.floor(colAt(start) / 2) + 1);
        const space = Math.max(0, box.h - (prev.bottom - mBox.top + ITEM_GAP) + (target - colAt(prev) - 1) * box.h - 3);
        return setPlan({ blocks, w: box.w, h: box.h, tick, breaks: [...breaks, { ...at, space }] });
      }
    }
    done(true, columnCount(m.scrollWidth, col, GAP));
  }, [narrow, box.w, box.h, tick, blocks, breaks]);

  useEffect(() => onPages(narrow ? 1 : layout.pages), [narrow, layout.pages, onPages]);
  const at = Math.min(page, layout.pages - 1);
  const style: CSSProperties | undefined = narrow ? undefined : { height: box.h, columnFill: layout.paged ? 'auto' : 'balance', transform: at ? `translateX(${-at * (box.w + GAP)}px)` : undefined };
  const content = flowContent(blocks, sentences, breaks);
  return (
    <div className="tb" ref={region}>
      <div className={`mc${layout.paged ? ' paged' : ''}`} style={style}>
        {content}
      </div>
      {!narrow && (
        <div className="mc tb-measure" ref={meas} aria-hidden="true">
          {flowContent(blocks, sentences, breaks, true)}
        </div>
      )}
    </div>
  );
}

const NO_BREAKS: PageBreak[] = [];

/** The blocks as elements, cut at `breaks`: a paragraph with a break inside is several elements, each a run of its sentences. */
function flowContent(blocks: FlowBlock[], sentences: string[][], breaks: PageBreak[], measure = false): ReactNode[] {
  const out: ReactNode[] = [];
  blocks.forEach((b, i) => {
    const sents = sentences[i] ?? [];
    const mine = breaks.filter((x) => x.block === i);
    // Where its pieces start: the block's start, and every break inside a paragraph.
    const starts = b.kind === 'p' ? [...new Set([0, ...mine.map((x) => x.sentence)])].sort((x, y) => x - y) : [0];
    starts.forEach((from, k) => {
      const brk = mine.find((x) => x.sentence === from);
      const attrs = measure ? { 'data-piece': b.kind, 'data-block': i, 'data-first': from } : undefined;
      // A break is empty space in front of the piece, to the end of its page.
      if (brk) out.push(<div key={`f${b.key}.${from}`} className="pgfill" style={{ height: brk.space ?? 0 }} aria-hidden="true" />);
      if (b.kind === 'label') {
        out.push(
          <div key={`${b.key}.${from}`} className="label" {...attrs}>
            {b.content}
          </div>,
        );
      } else {
        out.push(
          <p key={`${b.key}.${from}`} {...attrs}>
            {sents.slice(from, starts[k + 1] ?? sents.length).map((t, n) => (
              <span key={n} data-s={measure ? '' : undefined}>
                {n ? ' ' : ''}
                {t}
              </span>
            ))}
          </p>,
        );
      }
    });
  });
  return out;
}

function WhyTab({ card, narrow, page, onPages }: PanelProps) {
  const blocks = useMemo(() => {
    const { more, why } = whyContent(card);
    const out: FlowBlock[] = [];
    if (more.length) out.push({ kind: 'label', key: 'lm', content: 'More on the idea' }, ...more.map((text, i): FlowBlock => ({ kind: 'p', key: `m${i}`, text })));
    if (why.length) {
      if (more.length) out.push({ kind: 'label', key: 'lw', content: 'Why it works' });
      out.push(...why.map((text, i): FlowBlock => ({ kind: 'p', key: `w${i}`, text })));
    }
    return out;
  }, [card]);
  return <FlowTab narrow={narrow} page={page} onPages={onPages} blocks={blocks} />;
}

function StoryTab({ card, narrow, page, onPages }: PanelProps) {
  const blocks = useMemo(
    () =>
      (card.stories ?? []).flatMap((s, i): FlowBlock[] => [
        { kind: 'label', key: `l${i}`, content: <>From <em>{s.source}</em></> },
        ...paragraphs(s.text).map((text, j): FlowBlock => ({ kind: 'p', key: `s${i}.${j}`, text })),
      ]),
    [card],
  );
  return <FlowTab narrow={narrow} page={page} onPages={onPages} blocks={blocks} />;
}

function LimitsTab({ card, narrow, page, onPages }: PanelProps) {
  const blocks = useMemo(() => {
    const { limits, tension } = limitsContent(card);
    const out: FlowBlock[] = limits.map((text, i) => ({ kind: 'p', key: `p${i}`, text }));
    if (tension) out.push({ kind: 'label', key: 'lt', content: 'Tension' }, ...paragraphs(tension).map((text, i): FlowBlock => ({ kind: 'p', key: `t${i}`, text })));
    return out;
  }, [card]);
  return <FlowTab narrow={narrow} page={page} onPages={onPages} blocks={blocks} />;
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
  const [plan, setPlan] = useState<{ pages: StepPage[]; tight: boolean }>({ pages: [], tight: false });
  const pages = plan.pages;

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

  // The steps are packed from what is measured: the region's height, the height of the intro and the gap under it, and each step's
  // height in a column. If they do not all fit on one page at the usual gap between steps but do at the tight one, that is used.
  useLayoutEffect(() => {
    const root = meas.current;
    if (narrow || !root || !box.w || !box.h) return;
    const headH = root.querySelector('.m-head')?.getBoundingClientRect().height ?? 0;
    const heights = heightsOf(root.querySelector('.m-steps'));
    const first = box.h - (headH ? headH + (parseFloat(getComputedStyle(region.current!).rowGap) || 0) : 0);
    const gap = parseFloat(getComputedStyle(root.querySelector('.m-steps')!).rowGap) || 0;
    let pages = packSteps(heights, gap, first, box.h);
    let tight = false;
    if (pages.length > 1) {
      const t = packSteps(heights, STEP_GAP_TIGHT, first, box.h);
      if (t.length === 1) [pages, tight] = [t, true];
    }
    setPlan((p) => (p.tight === tight && JSON.stringify(p.pages) === JSON.stringify(pages) ? p : { pages, tight }));
  }, [narrow, box.w, box.h, tick, steps.length, hasHead]);

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
    <div className={`tb method${plan.tight && !narrow ? ' tight' : ''}`} ref={region}>
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
    // The room is the region less what stands over the list (its heading and the space under it), as laid out; the gap is the list's own.
    const rect = region.current!.getBoundingClientRect();
    const list = region.current!.querySelector('.q-col .label + .q-list');
    const room = box.h - (list ? list.getBoundingClientRect().top - rect.top : 0);
    const gap = parseFloat(getComputedStyle(root.querySelector('.q-list')!).rowGap) || 0;
    setCut({ q: packColumn(heightsOf(root.querySelector('.q-quotes')), gap, room), l: packColumn(heightsOf(root.querySelector('.q-lines')), gap, room) });
  }, [narrow, box.w, box.h, tick, quotes.length, lines.length]);

  const count = Math.max(1, cut.q.length, cut.l.length);
  useEffect(() => onPages(narrow ? 1 : count), [narrow, count, onPages]);
  const at = Math.min(page, count - 1);

  const quote = (i: number) => {
    const q = quotes[i];
    return q ? (
      <li className="q-quote" key={i} data-i={i}>
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
      <li className="q-line" key={i} data-i={i}>
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
 * Idea (the first paragraph) on the left, "With your agent" on the right, half the width each. Nothing in it is cut or faded: the band
 * is as tall as the taller of the two texts (180px at least), and the tab panel gets what is left.
 */
function Band({ card }: { card: AgenticCard }) {
  const { idea, apply } = band(card);
  if (!idea && !apply) return null;
  return (
    <section className="band">
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
  return (
    <div className="card" style={style} data-tab={tab} data-pages={pages > 1 ? pages : undefined}>
      <header className="c-head">
        <div className="c-titles">
          <div className="c-by">
            {book.cover && <img className="c-thumb" src={book.cover} alt="" />}
            <span>
              {book.title} · {book.author}
            </span>
          </div>
          <h3 className="c-name">{concept.name}</h3>
          <p className="c-sum">{subtitleOf(card, concept.summary)}</p>
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
          <Band card={card} />
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
