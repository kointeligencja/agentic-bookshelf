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

/**
 * Cuts a method's steps into pages of two columns. Each page takes as many steps as fit, split ceil(k/2) left and the rest
 * right, in order. The first page has `first` px, the others `height` (the intro stands over the first). A step taller than
 * a column still gets a page.
 */
export function packSteps(heights: number[], gap: number, first: number, height = first): StepPage[] {
  const pages: StepPage[] = [];
  let at = 0;
  while (at < heights.length) {
    const room = pages.length === 0 ? first : height;
    const rest = heights.length - at;
    let best = 1;
    for (let k = 2; k <= rest; k++) {
      const { left, right } = splitSteps(k);
      const l = stackHeight(heights, left.map((i) => at + i), gap);
      const r = stackHeight(heights, right.map((i) => at + i), gap);
      if (Math.max(l, r) > room) break;
      best = k;
    }
    const { left, right } = splitSteps(best);
    pages.push({ left: left.map((i) => at + i), right: right.map((i) => at + i) });
    at += best;
  }
  return pages;
}

/** How many columns a multi-column box holds, from its scroll width: columns of `col` px with `gap` between. */
export function columnCount(scrollWidth: number, col: number, gap: number): number {
  return Math.max(1, Math.round((scrollWidth + gap) / (col + gap)));
}

/** Pages of two columns that `columns` columns come to. */
export const pagesOf = (columns: number): number => Math.max(1, Math.ceil(columns / 2));
