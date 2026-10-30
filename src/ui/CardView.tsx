import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import {
  cardBlocks,
  chooseLevel,
  type Columns,
  flowBlocks,
  LEVELS,
  lead as leadOf,
  paginateColumns,
  readNext,
  SECTION_TITLES,
  sectionBlocks,
  STATUS,
  type Block,
  type ColumnPage,
  type Lead,
  type Measured,
  type Metric,
  type SectionId,
} from '../lib/card.ts';
import type { AgenticCard, AgenticConcept, AgenticThesis } from '../types.ts';

/** Space between the two columns, px. */
const GAP = 24;
/** Below this viewport width the card is one column that scrolls, with nothing clamped. */
const NARROW = '(max-width: 899px)';
/** A column holds at least this many characters of body text, or there is one column fewer, and at most MAX_CHARS. There are three columns at most. */
const MIN_CHARS = 40;
const MAX_CHARS = 70;
/** Typical English, to measure how wide a character of the body text is. */
const SAMPLE = 'Most of the time a short and clear instruction does the job, so the agent knows what to do next and why it matters.';
/** Fallbacks for the column limits until they are measured, px. */
const LIMITS = { min: 220, max: 385 };

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

/**
 * How many columns fit in a box this wide, and how wide each is. As many as give each at least 40 characters of the body
 * text, three at most, otherwise fewer; never wider than 70. The probe holds a sample of text to measure a character with, since the
 * font is narrow and the `ch` unit would be too wide.
 */
function useColumns(width: number, narrow: boolean, probe: RefObject<HTMLElement | null>, tick: number): { cols: Columns; colW: number } {
  const [limits, setLimits] = useState(LIMITS);
  useLayoutEffect(() => {
    const w = probe.current?.firstElementChild?.getBoundingClientRect().width;
    if (!w) return;
    const ch = w / SAMPLE.length;
    const next = { min: Math.ceil(MIN_CHARS * ch), max: Math.floor(MAX_CHARS * ch) };
    setLimits((l) => (l.min === next.min && l.max === next.max ? l : next));
  }, [probe, tick, narrow]);
  const cols = (narrow ? 1 : Math.max(1, Math.min(3, Math.floor((width + GAP) / (limits.min + GAP))))) as Columns;
  const colW = Math.max(1, Math.floor(Math.min(limits.max, (width - GAP * (cols - 1)) / cols)));
  return { cols, colW };
}

/** Heights of an element's children, and the padding each has on top. */
function metricsOf(group: Element | null | undefined): Metric[] {
  return Array.from(group?.children ?? []).map((el) => ({ h: el.getBoundingClientRect().height, top: parseFloat(getComputedStyle(el).paddingTop) || 0 }));
}

// ---------------------------------------------------------------------------------------------------------------
// Pieces

/** A "more ›" link. In the hidden copy it is the same button, not clickable. */
function MoreLink({ label, sec, onMore, measure }: { label: string; sec: SectionId; onMore: (s: SectionId) => void; measure?: boolean }) {
  return measure ? (
    <button type="button" className="more" tabIndex={-1} disabled>
      {label}
    </button>
  ) : (
    <button type="button" className="more" data-more={sec} onClick={() => onMore(sec)}>
      {label}
    </button>
  );
}

/** One block of a card. Spacing is padding on the wrapper, so measured heights add up exactly. */
function BlockView({ b, onSeek, onMore, measure }: { b: Block; onSeek: (s: number) => void; onMore: (s: SectionId) => void; measure?: boolean }) {
  const head = b.kind !== 'apply' && 'head' in b && b.head;
  return (
    <div className={`blk blk-${b.kind}${'cont' in b && b.cont ? ' cont' : ''}`} data-sk={b.skeleton ? '' : undefined} data-clamped={b.clamped ? '' : undefined}>
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
      {b.kind === 'text' && (
        <p className="c-text">
          {b.text}
          {b.more && (
            <>
              {' '}
              <MoreLink label={b.more.label} sec={b.more.sec} onMore={onMore} measure={measure} />
            </>
          )}
        </p>
      )}
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
          <button className="ts" type="button" tabIndex={measure ? -1 : undefined} disabled={measure} onClick={() => onSeek(b.atS)}>
            ▶ {b.at}
          </button>
        </div>
      )}
      {b.kind === 'apply' && (
        <div className="c-try">
          <div className="label">
            {b.head.label}
            {b.head.em && (
              <>
                {' '}
                <em>{b.head.em}</em>
              </>
            )}
          </div>
          {b.text}
        </div>
      )}
      {b.kind === 'more' && <MoreLink label={b.more.label} sec={b.more.sec} onMore={onMore} measure={measure} />}
      {b.kind === 'links' && (
        <div className="c-links">
          {b.links.map((l) => (
            <MoreLink key={l.sec} label={l.label} sec={l.sec} onMore={onMore} measure={measure} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The lead: the card's first quote, large, or its summary when it has no quotes. */
function LeadView({ lead }: { lead: Lead }) {
  return (
    <div className={`c-lead ${lead.kind}`} data-sk="">
      <p>{lead.kind === 'quote' ? `“${lead.text}”` : lead.text}</p>
      {lead.kind === 'quote' && (
        <small>
          {lead.source}
          {lead.verified ? '' : ' · not checked against the book text'}
        </small>
      )}
    </div>
  );
}

/** "Read next": up to `n` concepts, one row each. */
function NextView({ items, n, onOpen, measure }: { items: AgenticConcept[]; n: number; onOpen?: (id: string) => void; measure?: boolean }) {
  return (
    <div className="c-next">
      <div className="label">Read next</div>
      {items.slice(0, n).map((c) => (
        <button key={c.id} type="button" className="c-nrow" tabIndex={measure ? -1 : undefined} disabled={measure} onClick={() => onOpen?.(c.id)}>
          <span className="nm">{c.name}</span>
          <span className="sm">{c.summary}</span>
        </button>
      ))}
    </div>
  );
}

/** The hidden sample of body text the layout measures a character with. */
function Probe({ probe }: { probe: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="c-probe" ref={probe}>
      <i>{SAMPLE}</i>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The card's body: one screen

interface Plan {
  level: number;
  overflow: boolean;
  cols: Columns;
  left: Block[];
  right: Block[];
  third: Block[];
  /** How many "Read next" rows fit under the columns; 0 for none. */
  next: number;
}

/**
 * The lead, then Idea and Why it works on the left and With your agent on the right, then what follows. Every level of
 * the clamp ladder is laid out in a hidden copy of the box; the first that fits is shown. Nothing scrolls on a wide
 * screen; on a narrow one it is a single column with everything in it.
 */
function CardBody({
  card,
  concept,
  related,
  restore,
  onRestored,
  onMore,
  onSeek,
  onOpen,
  onPlan,
}: {
  card: AgenticCard | undefined;
  concept: AgenticConcept;
  related: AgenticConcept[];
  restore: SectionId | null;
  onRestored: () => void;
  onMore: (s: SectionId) => void;
  onSeek: (s: number) => void;
  onOpen: (id: string) => void;
  onPlan: (p: Pick<Plan, 'level' | 'overflow' | 'cols'> | null) => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const box = useBox(body);
  const narrow = useNarrow();
  const tick = useFonts();
  const { cols, colW } = useColumns(box.w, narrow, probe, tick);
  const [plan, setPlan] = useState<Plan | null>(null);

  const levels = useMemo(() => LEVELS.map((l) => cardBlocks(card, l)), [card]);
  // Levels that come out the same share one measured copy.
  const { distinct, which } = useMemo(() => {
    const keys = new Map<string, number>();
    const distinct: Block[][] = [];
    const which = levels.map((blocks) => {
      const key = JSON.stringify(blocks);
      let d = keys.get(key);
      if (d === undefined) {
        d = distinct.length;
        keys.set(key, d);
        distinct.push(blocks);
      }
      return d;
    });
    return { distinct, which };
  }, [levels]);
  const lead = useMemo(() => leadOf(card, concept.summary), [card, concept.summary]);

  useLayoutEffect(() => {
    const root = wrap.current;
    if (narrow || !root || !box.w || !box.h) return;
    const [cl, ld, nx] = [root.querySelector('.m-cols'), root.querySelector('.m-lead'), root.querySelector('.m-next')];
    const leadH = ld?.firstElementChild?.getBoundingClientRect().height ?? 0;
    const measured: Measured[] = levels.map((blocks, l) => ({ zones: blocks.map((b) => b.zone), metrics: metricsOf(cl?.children[which[l] ?? 0]) }));
    // A pixel of room against rounding.
    const avail = box.h - leadH - 1;
    const choice = chooseLevel(measured, avail, cols);
    const blocks = levels[choice.level] ?? [];
    // "Read next" takes what is left under both columns, one row at least.
    const free = avail - Math.max(choice.flow.usedLeft, choice.flow.usedRight, choice.flow.usedThird);
    const heights = Array.from(nx?.children ?? []).map((e) => e.getBoundingClientRect().height);
    let next = 0;
    heights.forEach((h, i) => {
      if (h <= free) next = i + 1;
    });
    setPlan({ level: choice.level, overflow: choice.overflow, cols, left: choice.flow.left.flatMap((i) => blocks[i] ?? []), right: choice.flow.right.flatMap((i) => blocks[i] ?? []), third: choice.flow.third.flatMap((i) => blocks[i] ?? []), next });
  }, [narrow, box, cols, colW, levels, which, tick, related.length]);

  // Narrow: all of it, in one column, in reading order.
  const all = useMemo<Plan>(() => {
    const blocks = levels[0] ?? [];
    return { level: 0, overflow: false, cols: 1, left: flowBlocks(blocks.map((b) => b.zone), [], 0, 1).left.flatMap((i) => blocks[i] ?? []), right: [], third: [], next: related.length };
  }, [levels, related.length]);
  const shown = narrow ? all : plan;

  useEffect(() => {
    onPlan(shown ? { level: shown.level, overflow: shown.overflow, cols: shown.cols } : null);
  }, [shown, onPlan]);

  // Coming back from a section: focus the link that opened it.
  useEffect(() => {
    if (!restore || !shown) return;
    (body.current?.querySelector<HTMLElement>(`[data-more="${restore}"]`) ?? body.current)?.focus({ preventScroll: true });
    onRestored();
  }, [restore, shown, onRestored]);

  const style = { '--n': shown?.cols ?? cols, '--colw': `${colW}px` } as CSSProperties;
  const column = (blocks: Block[]) => blocks.map((b) => <BlockView key={b.id} b={b} onSeek={onSeek} onMore={onMore} />);
  return (
    <div className={`c-body${narrow ? ' scroll' : ''}`} ref={body} tabIndex={-1}>
      {shown && (
        <>
          <LeadView lead={lead} />
          <div className="c-cols" style={narrow ? undefined : style}>
            <div className="c-col">{column(shown.left)}</div>
            {shown.cols >= 2 && <div className="c-col">{column(shown.right)}</div>}
            {shown.cols === 3 && <div className="c-col">{column(shown.third)}</div>}
          </div>
          {shown.next > 0 && <NextView items={related} n={shown.next} onOpen={onOpen} />}
        </>
      )}
      {!narrow && (
        <div className="c-measure-wrap" ref={wrap} aria-hidden="true">
          <Probe probe={probe} />
          <div className="c-measure m-lead" style={{ width: box.w }}>
            <LeadView lead={lead} />
          </div>
          <div className="c-measure m-cols" style={{ width: colW }}>
            {distinct.map((blocks, d) => (
              <div key={d}>
                {blocks.map((b) => (
                  <BlockView key={b.id} b={b} onSeek={onSeek} onMore={onMore} measure />
                ))}
              </div>
            ))}
          </div>
          <div className="c-measure m-next" style={{ width: box.w }}>
            {[1, 2, 3]
              .filter((n) => n <= related.length)
              .map((n) => (
                <NextView key={n} items={related} n={n} measure />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// One section, whole

/**
 * A section in full, in place of the card's body. Two columns like the card; if it still does not fit it is paged,
 * here only. Focus lands on the heading, and Esc or the Back button return to the card.
 */
function SectionView({
  card,
  sec,
  wholeConversation,
  onBack,
  onSeek,
}: {
  card: AgenticCard | undefined;
  sec: SectionId;
  wholeConversation: boolean;
  onBack: () => void;
  onSeek: (s: number) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const box = useBox(area);
  const narrow = useNarrow();
  const tick = useFonts();
  const { cols, colW } = useColumns(box.w, narrow, probe, tick);
  const blocks = useMemo(() => sectionBlocks(card, sec, wholeConversation), [card, sec, wholeConversation]);
  const [pages, setPages] = useState<ColumnPage[] | null>(null);
  const [page, setPage] = useState(0);
  const none = () => {};

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  useLayoutEffect(() => {
    const root = wrap.current;
    if (narrow || !root || !box.w || !box.h) return;
    setPages(paginateColumns(metricsOf(root.querySelector('.m-cols')?.firstElementChild), box.h - 1, cols));
  }, [narrow, box, cols, colW, blocks, tick]);

  const last = Math.max(0, (pages?.length ?? 1) - 1);
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
  const column = (idx: number[]) => idx.map((i) => blocks[i]).flatMap((b) => (b ? [<BlockView key={b.id} b={b} onSeek={onSeek} onMore={none} />] : []));
  const style = { '--n': cols, '--colw': `${colW}px` } as CSSProperties;
  return (
    <div className={`c-body c-section${narrow ? ' scroll' : ''}`} data-section={sec}>
      <div className="c-xhead">
        <button type="button" className="back" onClick={onBack}>
          ‹ Back to card
        </button>
        <h4 ref={heading} tabIndex={-1}>
          {SECTION_TITLES[sec]}
        </h4>
        {!narrow && pages && pages.length > 1 && (
          <span className="c-pager">
            <button type="button" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous page">
              ‹
            </button>
            {at + 1} / {pages.length}
            <button type="button" onClick={() => go(at + 1)} disabled={at === last} aria-label="Next page">
              ›
            </button>
          </span>
        )}
      </div>
      <div className="c-cols" ref={area} style={narrow ? undefined : style}>
        {narrow ? (
          <div className="c-col">{blocks.map((b) => <BlockView key={b.id} b={b} onSeek={onSeek} onMore={none} />)}</div>
        ) : (
          current && (
            <>
              <div className="c-col">{column(current.left)}</div>
              {cols >= 2 && <div className="c-col">{column(current.right)}</div>}
              {cols === 3 && <div className="c-col">{column(current.third)}</div>}
            </>
          )
        )}
      </div>
      {!narrow && (
        <div className="c-measure-wrap" ref={wrap} aria-hidden="true">
          <Probe probe={probe} />
          <div className="c-measure m-cols" style={{ width: colW }}>
            <div>
              {blocks.map((b) => (
                <BlockView key={b.id} b={b} onSeek={onSeek} onMore={none} measure />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * A concept card: theme chips, name and source books, then the body, which is one screen: never tabs or pages.
 * A "more ›" link swaps the body for one section in full (`expanded`, owned by the panel so Esc can close it).
 */
export function CardView({
  concept,
  concepts,
  bookId,
  card,
  themes,
  activeTheme,
  pinned,
  expanded,
  onMore,
  onBack,
  onPin,
  onTheme,
  onSeek,
  onOpen,
}: {
  concept: AgenticConcept;
  /** Every concept, for "Read next". */
  concepts: AgenticConcept[];
  /** The book the card is shown in. */
  bookId: string;
  card: AgenticCard | undefined;
  themes: AgenticThesis[];
  activeTheme: string | null;
  pinned: boolean;
  expanded: SectionId | null;
  onMore: (s: SectionId) => void;
  onBack: () => void;
  onPin: () => void;
  onTheme: (key: string) => void;
  onSeek: (seconds: number) => void;
  onOpen: (id: string) => void;
}) {
  const related = useMemo(() => readNext(concepts, concept.id, bookId), [concepts, concept.id, bookId]);
  const [plan, setPlan] = useState<Pick<Plan, 'level' | 'overflow' | 'cols'> | null>(null);

  // The link that opened a section gets the focus back when the card does.
  const was = useRef<SectionId | null>(null);
  const [restore, setRestore] = useState<SectionId | null>(null);
  useEffect(() => {
    if (was.current && !expanded) setRestore(was.current);
    was.current = expanded;
  }, [expanded]);
  const restored = useRef(() => setRestore(null)).current;

  // The conversation's first line is cut from the card at level 7; its view then starts there.
  const wholeConversation = (plan?.level ?? 0) >= 7;

  return (
    <div className="card" data-view={expanded ? 'section' : 'card'} data-level={plan?.level} data-overflow={!expanded && plan?.overflow ? '' : undefined} data-cols={plan?.cols}>
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
      {expanded ? (
        <SectionView key={expanded} card={card} sec={expanded} wholeConversation={wholeConversation} onBack={onBack} onSeek={onSeek} />
      ) : (
        <CardBody card={card} concept={concept} related={related} restore={restore} onRestored={restored} onMore={onMore} onSeek={onSeek} onOpen={onOpen} onPlan={setPlan} />
      )}
      <div className="c-foot">
        <span className="status">
          {concept.status} {STATUS[concept.status] ?? ''}
        </span>
        <button className="pill pin" aria-pressed={pinned} onClick={onPin}>
          {pinned ? 'Pinned' : 'Pin to board'}
        </button>
      </div>
    </div>
  );
}
