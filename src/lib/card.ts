import type { AgenticCard, AgenticConversationLine } from '../types.ts';

// A concept card is a fixed template: a header, a band (Idea | With your agent), a row of tabs and the tab's panel, a footer.
// This file is the pure part: which tabs a card has, what each shows, and how a list is cut into pages when it does not
// fit its panel. CardView.tsx draws it and measures the heights these functions take.

/** The tabs, in the order they are shown. */
export const TABS = ['why', 'story', 'method', 'limits', 'quotes'] as const;
export type TabId = (typeof TABS)[number];

/** Words only: no counts, no icons. */
export const TAB_LABELS: Record<TabId, string> = {
  why: 'Why it works',
  story: 'Story',
  method: 'Method',
  limits: 'Limits',
  quotes: 'Quotes',
};

/** The status marks on a card and what they say. */
export const STATUS: Record<string, string> = {
  '✓': 'Checked against the book',
  '⚠': 'Checked; some details corrected',
  '?': 'Not yet checked',
};

/** The line under the concept name: the card's own subtitle when it has one, else the concept's one-line summary. */
export function subtitleOf(card: AgenticCard | undefined, summary: string): string {
  const own = card?.subtitle?.trim();
  return own || summary;
}

const some = (a: readonly unknown[] | undefined): boolean => !!a && a.length > 0;

/** The text of a card's Idea and apply boxes, or nothing. */
export function band(card: AgenticCard | undefined): { idea: string | undefined; apply: { label: string; text: string } | undefined } {
  return { idea: card?.idea?.[0], apply: card?.apply };
}

/** What the "Why it works" tab shows: the idea's remaining paragraphs, then Why it works. No attempt is made to spot repeats. */
export function whyContent(card: AgenticCard | undefined): { more: string[]; why: string[] } {
  return { more: (card?.idea ?? []).slice(1), why: card?.why ?? [] };
}

/** What the Limits tab shows. */
export function limitsContent(card: AgenticCard | undefined): { limits: string[]; tension: string | undefined } {
  return { limits: card?.limits ?? [], tension: card?.tension || undefined };
}

/** A story's paragraphs. */
export const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

/** What the Quotes tab shows: all the book quotes on the left, all the conversation lines on the right. */
export function quotesContent(card: AgenticCard | undefined): { quotes: NonNullable<AgenticCard['quotes']>; lines: AgenticConversationLine[] } {
  return { quotes: card?.quotes ?? [], lines: card?.conversation ?? [] };
}

/** The tabs a card has, in order: those with something to show. */
export function tabsOf(card: AgenticCard | undefined): TabId[] {
  if (!card) return [];
  const has: Record<TabId, boolean> = {
    why: some(card.idea && card.idea.slice(1)) || some(card.why),
    story: some(card.stories),
    method: some(card.method?.steps) || !!card.method?.intro,
    limits: some(card.limits) || !!card.tension,
    quotes: some(card.quotes) || some(card.conversation),
  };
  return TABS.filter((t) => has[t]);
}

/** The tab a card opens on: Method if it has one, else Story, else Why it works, else its first. */
export function defaultTab(tabs: readonly TabId[]): TabId | undefined {
  return (['method', 'story', 'why'] as const).find((t) => tabs.includes(t)) ?? tabs[0];
}

/** The tab `delta` places from `from` (← and → move through the tabs); it stops at the ends. */
export function stepTab(tabs: readonly TabId[], from: TabId | undefined, delta: number): TabId | undefined {
  if (!tabs.length) return undefined;
  const i = from ? tabs.indexOf(from) : 0;
  return tabs[Math.max(0, Math.min(tabs.length - 1, (i < 0 ? 0 : i) + delta))];
}

// ---------------------------------------------------------------------------------------------------------------
// Pages

/** The two columns of a method: the first ceil(n/2) steps on the left, the rest on the right. Indices into the steps. */
export function splitSteps(n: number): { left: number[]; right: number[] } {
  const idx = Array.from({ length: n }, (_, i) => i);
  const half = Math.ceil(n / 2);
  return { left: idx.slice(0, half), right: idx.slice(half) };
}

/** Height of items stacked with `gap` between them. */
export function stackHeight(heights: number[], idx: number[], gap: number): number {
  return idx.reduce((sum, i, k) => sum + (heights[i] ?? 0) + (k > 0 ? gap : 0), 0);
}

/**
 * Cuts a column of items into pages of at most `height` px, in order. An item taller than a page gets a page to itself.
 * Nothing: no pages.
 */
export function packColumn(heights: number[], gap: number, height: number): number[][] {
  const pages: number[][] = [];
  let cur: number[] = [];
  heights.forEach((_, i) => {
    if (cur.length && stackHeight(heights, [...cur, i], gap) > height) {
      pages.push(cur);
      cur = [];
    }
    cur.push(i);
  });
  if (cur.length) pages.push(cur);
  return pages;
}

export interface StepPage {
  left: number[];
  right: number[];
}

/** The steps `from` to `to - 1` (indices). */
const span = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/**
 * Cuts a method's steps into pages of two columns, using the measured heights. A page takes as many steps as its two columns can
 * hold in order: the left column the longest run that fits, the right column the longest run after it, so a step goes on the next
 * page only when it would not fit under the last one on this page, whichever way the page is split. The k steps of a page are then
 * split ceil(k/2) left and the rest right when both columns fit that way, else at the split with the shortest taller column.
 * The first page has `first` px, the others `height` (the intro stands over the first); if not even one step fits under a long
 * intro, the first page is the intro alone. A step taller than a column still gets a page of its own.
 */
export function packSteps(heights: number[], gap: number, first: number, height = first): StepPage[] {
  const pages: StepPage[] = [];
  let at = 0;
  while (at < heights.length) {
    const room = pages.length === 0 ? first : height;
    // Not even the first step fits under the intro: the intro has the first page to itself.
    if (pages.length === 0 && first < height && (heights[at] ?? 0) > first) {
      pages.push({ left: [], right: [] });
      continue;
    }
    // The longest run of steps from `from` that fits in a column.
    const run = (from: number): number => {
      let n = 0;
      while (from + n < heights.length && stackHeight(heights, span(from, from + n + 1), gap) <= room) n++;
      return n;
    };
    const nl = run(at);
    if (nl === 0) {
      pages.push({ left: [at], right: [] });
      at += 1;
      continue;
    }
    const k = nl + run(at + nl);
    const cols = (s: number) => [stackHeight(heights, span(at, at + s), gap), stackHeight(heights, span(at + s, at + k), gap)] as const;
    const fits = (s: number) => cols(s).every((h) => h <= room);
    let split = Math.ceil(k / 2);
    if (!fits(split)) {
      // The feasible split with the shortest taller column (the later one on a tie).
      let best = Infinity;
      for (let s = 1; s <= nl; s++) {
        if (!fits(s)) continue;
        const tall = Math.max(...cols(s));
        if (tall <= best) {
          best = tall;
          split = s;
        }
      }
    }
    pages.push({ left: span(at, at + split), right: span(at + split, at + k) });
    at += k;
  }
  return pages;
}

/** How many columns a multi-column box holds, from its scroll width: columns of `col` px with `gap` between. */
export function columnCount(scrollWidth: number, col: number, gap: number): number {
  return Math.max(1, Math.round((scrollWidth + gap) / (col + gap)));
}

/** Pages of two columns that `columns` columns come to. */
export const pagesOf = (columns: number): number => Math.max(1, Math.ceil(columns / 2));

// ---------------------------------------------------------------------------------------------------------------
// Sentences

/** Words that end in a full stop without ending the sentence (lower case, no stop). */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'etc', 'cf', 'e.g', 'i.e', 'viz', 'approx', 'ca', 'no', 'nos', 'fig', 'figs', 'vol', 'ch', 'p', 'pp',
  'inc', 'ltd', 'co', 'corp', 'gen', 'col', 'capt', 'lt', 'sgt', 'rev', 'hon', 'al',
]);

/** True when the full stop after `word` (the text up to and including it) does not end a sentence. */
function isAbbreviation(word: string): boolean {
  const w = word.replace(/^[("'“‘[]+/, '').replace(/\.+$/, '');
  const lower = w.toLowerCase();
  return (
    ABBREVIATIONS.has(lower) ||
    /^[a-z]$/i.test(w) || // an initial: J. K. Rowling
    /^(?:[a-z]\.)+[a-z]$/i.test(w) || // U.S. and e.g.
    /^\d{1,2}$/.test(w) // a list number or "No. 5"
  );
}

/**
 * Cuts a paragraph into sentences, for paging at a sentence boundary. A boundary is . ! ? or … (with any closing quote or bracket) followed
 * by a space and then a capital, a digit or an opening quote. It errs on the side of not cutting: a stop after Mr., Dr., St., e.g., i.e.,
 * U.S., an initial or a short number, or before a lower-case word, is not a boundary, and a decimal has no space after its stop. The
 * sentences joined by single spaces are the paragraph (whitespace aside).
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /([.!?…]+)(["'”’)\]]*)(\s+)/g;
  let from = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const stop = m.index + m[1]!.length;
    const next = text.slice(m.index + m[0].length, m.index + m[0].length + 1);
    if (!/[A-Z0-9"'“‘([]/.test(next) && !/\p{Lu}/u.test(next)) continue;
    if (!/[!?…]/.test(m[1]!) && isAbbreviation(text.slice(from, stop).split(/\s+/).pop() ?? '')) continue;
    out.push(text.slice(from, stop + m[2]!.length).trim());
    from = m.index + m[0].length;
  }
  const last = text.slice(from).trim();
  if (last) out.push(last);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Paging running text

/** A place where a page of running text starts: before sentence `sentence` of block `block` (0 is the block's start). */
export interface PageBreak {
  block: number;
  sentence: number;
  /**
   * Height in px of the empty space put in front of the text to fill the rest of its page (set when the break is made, from the measure;
   * a column break would not do: it does nothing at the top of a column, and cannot skip the first column of a page).
   */
  space?: number;
}

/** Where a sentence sits in the flow of columns: its first and last page, from 0. */
export interface SentenceFit {
  start: number;
  end: number;
}

/** A paragraph (or a piece of one) or a heading in the flow of columns: its pages, and its sentences' pages. */
export interface PieceFit extends SentenceFit {
  block: number;
  /** Index of the piece's first sentence in its paragraph. */
  first: number;
  label: boolean;
  sentences: SentenceFit[];
}

/**
 * Of running text laid out in columns, two to a page, finds the next place to start a page so that no page ends inside a
 * sentence and none ends with room for the next sentence. Only the first fault is looked at (the text after it moves when it is
 * fixed), and the layout is measured again. A paragraph that runs from one page to the next is cut before the first sentence that
 * crosses the page, so the sentences before it fill the page; if that is its first sentence, the paragraph (with the heading
 * that stands over it) moves to the next page. A paragraph whose pages meet between two sentences is left as it is. A sentence
 * longer than a page cannot be helped; those are counted in `stuck`.
 * Nothing to fix: `at` is null.
 */
export function nextBreak(pieces: readonly PieceFit[], have: readonly PageBreak[] = []): { at: { block: number; sentence: number } | null; stuck: number } {
  let stuck = 0;
  const known = (b: { block: number; sentence: number }) => have.some((h) => h.block === b.block && h.sentence === b.sentence);
  for (let j = 0; j < pieces.length; j++) {
    const p = pieces[j]!;
    if (p.start === p.end || p.label) continue;
    // The first sentence that crosses a page (none: the pages meet between two sentences).
    const i = p.sentences.findIndex((x) => x.start !== x.end);
    if (i > 0) {
      const at = { block: p.block, sentence: p.first + i };
      if (!known(at)) return { at, stuck };
      stuck++;
    } else if (i === 0 || p.sentences.length === 0) {
      // The paragraph's first sentence crosses (or nothing is known of its sentences): move it, and the heading over it, to the next page,
      // unless it already starts one.
      let g = j;
      while (g > 0 && pieces[g - 1]!.label) g--;
      const top = g === 0 || pieces[g - 1]!.end < pieces[g]!.start;
      const q = pieces[g]!;
      const at = { block: q.block, sentence: q.first };
      if (!top && !known(at)) return { at, stuck };
      stuck++;
    }
  }
  return { at: null, stuck };
}
