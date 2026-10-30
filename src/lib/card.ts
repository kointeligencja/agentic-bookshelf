import type { AgenticCard, AgenticConcept } from '../types.ts';

// A concept card is always one screen. Its text is turned into blocks (this file, pure), the blocks are measured
// in the browser and flowed into two columns (also here, pure, given the measures), and when they do not fit
// the card steps down a fixed ladder of clamp levels until they do. See CardView.tsx for the measuring.

/** The sections a "more ›" link can open: each is shown whole in its own view. */
export const SECTIONS = ['stories', 'method', 'limits', 'tension', 'quotes', 'conversation'] as const;
export type SectionId = (typeof SECTIONS)[number];

/** The heading shown over each section's expanded view. */
export const SECTION_TITLES: Record<SectionId, string> = {
  stories: 'Stories',
  method: 'Method',
  limits: 'Limits',
  tension: 'Tension',
  quotes: 'More quotes',
  conversation: 'From the conversation',
};

/** A small label above a block; `em` is a source title shown in italics after it. */
export interface Head {
  label: string;
  em?: string;
}

/** A link that opens a section in place. */
export interface More {
  sec: SectionId;
  label: string;
}

/**
 * Where a block goes. `right` is the start of the last column (With your agent, the first conversation line). `left`
 * (Idea, Why it works) and `rest` are one stream in a fixed order that fills the columns from the first on, the last
 * one below its start.
 */
export type Zone = 'left' | 'right' | 'rest';

/** One unit of a card's text. Blocks are what the columns are filled with and are never split further. */
export type Block = {
  id: string;
  zone: Zone;
  /** The section the block belongs to, or the part of the skeleton. */
  sec: SectionId | 'idea' | 'why' | 'apply' | 'first-line' | 'note';
  /** Part of the skeleton (Idea, Why it works, With your agent): never clamped. */
  skeleton?: boolean;
  /** Cut short by the ladder; carries a link to the whole. */
  clamped?: boolean;
} & (
  | { kind: 'text'; text: string; head?: Head; cont?: boolean; more?: More }
  | { kind: 'step'; n: number; text: string; head?: Head }
  | { kind: 'quote'; text: string; source: string; verified: boolean; head?: Head }
  | { kind: 'conv'; text: string; speaker: string; at: string; atS: number; head?: Head }
  | { kind: 'apply'; head: Head; text: string }
  | { kind: 'more'; more: More }
  | { kind: 'links'; links: More[] }
);

/** What opens a card. */
export interface Lead {
  kind: 'quote' | 'summary';
  text: string;
  /** Where a quote comes from. */
  source?: string;
  verified?: boolean;
}

/** The status marks on a card and what they say. */
export const STATUS: Record<string, string> = {
  '✓': 'Checked against the book',
  '⚠': 'Checked; some details corrected',
  '?': 'Not yet checked',
};

// ---------------------------------------------------------------------------------------------------------------
// Sentences

/** Words that end in a period without ending a sentence. Lower case, no period. */
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'cf', 'inc', 'ltd', 'co', 'gen', 'col', 'lt', 'capt', 'sgt', 'gov', 'sen', 'rep', 'rev', 'mt', 'ft', 'fig', 'vol', 'approx']);

/** A period, question or exclamation mark (or an ellipsis), any closing quotes or brackets, then a gap before a capital or digit. */
const BOUNDARY = /([.!?…]+)(["”’')\]]*)(\s+)(?=["“‘'(\[]?[\p{Lu}\d])/gu;

/** The word a period ends: letters and inner periods, after a space, quote or the start. "U.S" for "U.S.". */
const WORD_BEFORE = /(?:^|[\s"“‘'(\[])(\p{L}[\p{L}.]*)$/u;

/**
 * Cuts text into sentences. A sentence ends at ., ! or ? (or …) with its closing quotes, before a space and a capital
 * letter or digit. A period after an abbreviation (Dr., Mr., e.g., i.e., U.S.), an initial (A. G.) or in front of a
 * number after "No" does not end one. Decimals have no space after the period, so they never split. Joining the
 * result with a space gives the text back, with its runs of white space made single.
 */
export function splitSentences(text: string): string[] {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return [];
  const out: string[] = [];
  let from = 0;
  for (const m of t.matchAll(BOUNDARY)) {
    const [whole, marks = '', closers = ''] = m;
    const end = m.index + whole.length;
    if (marks === '.' && closers === '') {
      const word = WORD_BEFORE.exec(t.slice(0, m.index))?.[1];
      if (word) {
        const w = word.toLowerCase();
        const dotted = /^\p{L}(\.\p{L})+$/u.test(word);
        const initial = /^\p{Lu}$/u.test(word);
        const number = w === 'no' && /\d/.test(t.charAt(end));
        if (ABBREVIATIONS.has(w) || dotted || initial || number) continue;
      }
    }
    out.push(t.slice(from, end).trim());
    from = end;
  }
  if (from < t.length) out.push(t.slice(from).trim());
  return out;
}

/** The first `n` sentences of `text` joined by spaces, and whether anything was left out. */
export function firstSentences(text: string, n: number): { text: string; cut: boolean } {
  const s = splitSentences(text);
  return { text: s.slice(0, n).join(' '), cut: s.length > n };
}

/** Longest run of text kept as one block. Longer paragraphs are cut at sentence ends so they can fill a column to its end. */
export const MAX_RUN = 300;

/**
 * Cuts a paragraph into runs of whole sentences, each about `max` characters. A sentence longer than that
 * stays whole. Joining the runs with a space gives the paragraph back.
 */
export function splitText(text: string, max = MAX_RUN): string[] {
  const runs: string[] = [];
  let cur = '';
  for (const s of splitSentences(text)) {
    if (cur && cur.length + 1 + s.length > max) {
      runs.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) runs.push(cur);
  return runs;
}

// ---------------------------------------------------------------------------------------------------------------
// Blocks

/**
 * The ladder's levels. 0 shows everything; each level after it cuts more, and the card takes the first one that fits.
 * 0..6 are the ladder as specified. 7 is a last step used only when level 6 still does not fit while the skeleton
 * does: the first conversation line, which is not part of the skeleton, becomes a link too.
 */
export const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export const MAX_LEVEL = 7;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A paragraph as blocks: the heading sits on the first run, the others carry on from it, the link ends the last. */
function runs(id: string, sec: Block['sec'], zone: Zone, text: string, o: { head?: Head; more?: More; skeleton?: boolean; clamped?: boolean } = {}): Block[] {
  const parts = splitText(text);
  return parts.map((run, i) => ({
    id: `${id}.${i}`,
    zone,
    sec,
    kind: 'text' as const,
    text: run,
    head: i === 0 ? o.head : undefined,
    cont: i > 0,
    more: i === parts.length - 1 ? o.more : undefined,
    ...(o.skeleton ? { skeleton: true } : {}),
    ...(o.clamped ? { clamped: true } : {}),
  }));
}

/** A story's paragraphs as one flat text, for cutting to sentences. */
const flat = (text: string) => text.replace(/\s*\n+\s*/g, ' ').trim();

function storyBlocks(card: AgenticCard, level: number): Block[] {
  const out: Block[] = [];
  (card.stories ?? []).forEach((st, si) => {
    const head: Head = { label: 'Story', em: st.source };
    if (level < 2) {
      st.text
        .split(/\n\n+/)
        .filter(Boolean)
        .forEach((p, pi) => out.push(...runs(`story-${si}-${pi}`, 'stories', 'rest', p, { head: pi === 0 ? head : undefined })));
      return;
    }
    const { text, cut } = firstSentences(flat(st.text), level >= 5 ? 1 : 2);
    out.push(...runs(`story-${si}`, 'stories', 'rest', text, { head, more: cut ? { sec: 'stories', label: 'Full story ›' } : undefined, clamped: cut }));
  });
  return out;
}

function methodBlocks(card: AgenticCard, level: number): Block[] {
  const m = card.method;
  if (!m) return [];
  const head: Head = { label: "The book's method", em: m.source };
  const steps = m.steps ?? [];
  const step = (t: string, i: number, clamped?: boolean): Block => ({ id: `step-${i}`, zone: 'rest', sec: 'method', kind: 'step', n: i + 1, text: t, head: i === 0 && !(level < 3 && m.intro) ? head : undefined, ...(clamped ? { clamped: true } : {}) });
  if (level < 3) return [...(m.intro ? runs('method-intro', 'method', 'rest', m.intro, { head }) : []), ...steps.map((t, i) => step(t, i))];
  const kept = steps.slice(0, level >= 5 ? 2 : 3).map((t) => firstSentences(t, 1));
  const cut = !!m.intro || kept.length < steps.length || kept.some((k) => k.cut);
  const out = kept.map((k, i) => step(k.text, i, cut));
  if (cut) out.push({ id: 'method-more', zone: 'rest', sec: 'method', kind: 'more', more: { sec: 'method', label: `All ${plural(steps.length, 'step', 'steps')} ›` }, clamped: true });
  return out;
}

function limitBlocks(card: AgenticCard, level: number): Block[] {
  const paras = card.limits ?? [];
  const head: Head = { label: 'Limits' };
  if (level < 1) return paras.flatMap((t, i) => runs(`limit-${i}`, 'limits', 'rest', t, { head: i === 0 ? head : undefined }));
  const first = paras[0];
  if (first === undefined) return [];
  const { text, cut } = firstSentences(first, 2);
  const more = cut || paras.length > 1;
  return runs('limit-0', 'limits', 'rest', text, { head, more: more ? { sec: 'limits', label: 'All limits ›' } : undefined, clamped: more });
}

function tensionBlocks(card: AgenticCard, level: number): Block[] {
  if (!card.tension) return [];
  const head: Head = { label: 'Tension' };
  if (level < 1) return runs('tension', 'tension', 'rest', card.tension, { head });
  const { text, cut } = firstSentences(card.tension, 2);
  return runs('tension', 'tension', 'rest', text, { head, more: cut ? { sec: 'tension', label: 'Full tension ›' } : undefined, clamped: cut });
}

/** The quotes after the lead, in full. */
function quoteBlocks(card: AgenticCard): Block[] {
  return (card.quotes ?? []).slice(1).map((q, i) => ({
    id: `quote-${i + 1}`,
    zone: 'rest' as const,
    sec: 'quotes' as const,
    kind: 'quote' as const,
    text: q.text,
    source: q.source,
    verified: q.verified,
    head: i === 0 ? { label: 'More quotes' } : undefined,
  }));
}

/** Conversation lines from index `from` on. The first line gets its heading from the right column's. */
function lineBlocks(card: AgenticCard, from: number): Block[] {
  return (card.conversation ?? []).slice(from).map((q, i) => ({
    id: `line-${from + i}`,
    zone: from === 0 && i === 0 ? ('right' as const) : ('rest' as const),
    sec: from === 0 && i === 0 ? ('first-line' as const) : ('conversation' as const),
    kind: 'conv' as const,
    text: q.text,
    speaker: q.speaker,
    at: q.at,
    atS: q.at_s,
    head: from + i === 0 ? { label: 'In the conversation' } : i === 0 ? { label: 'More from the conversation' } : undefined,
  }));
}

/**
 * The card as blocks at a clamp level (0 = everything). The skeleton, Idea and Why it works on the left and With your
 * agent on the right, is the same at every level. Levels are cumulative:
 * 1 Limits to the first paragraph's first 2 sentences, Tension to its first 2;
 * 2 Stories to each story's first 2 sentences;
 * 3 Method without its intro, 3 steps at most, each step's first sentence;
 * 4 further quotes and conversation lines become a link;
 * 5 Stories to the first sentence, Method to 2 steps;
 * 6 Stories, Method, Limits and Tension each become a single link;
 * 7 the first conversation line becomes a link too.
 * Every cut block ends with a link to the whole.
 */
export function cardBlocks(card: AgenticCard | undefined, level: number): Block[] {
  if (!card) return [{ id: 'note', zone: 'left', sec: 'note', kind: 'text', text: 'Card in progress.', skeleton: true }];
  const out: Block[] = [];
  (card.idea ?? []).forEach((t, i) => out.push(...runs(`idea-${i}`, 'idea', 'left', t, { head: i === 0 ? { label: 'Idea' } : undefined, skeleton: true })));
  (card.why ?? []).forEach((t, i) => out.push(...runs(`why-${i}`, 'why', 'left', t, { head: i === 0 ? { label: 'Why it works' } : undefined, skeleton: true })));
  if (card.apply) out.push({ id: 'apply', zone: 'right', sec: 'apply', kind: 'apply', head: { label: 'With your agent', em: card.apply.label }, text: card.apply.text, skeleton: true });
  if (level < 7) out.push(...lineBlocks(card, 0).slice(0, 1));

  const links: More[] = [];
  const whole = level >= 6;
  const stories = (card.stories ?? []).length;
  const steps = card.method?.steps?.length ?? 0;
  if (whole) {
    if (stories) links.push({ sec: 'stories', label: `${stories === 1 ? 'Story' : `Stories (${stories})`} ›` });
    if (card.method) links.push({ sec: 'method', label: steps ? `Method (${plural(steps, 'step', 'steps')}) ›` : 'Method ›' });
    if ((card.limits ?? []).length) links.push({ sec: 'limits', label: 'Limits ›' });
    if (card.tension) links.push({ sec: 'tension', label: 'Tension ›' });
  } else {
    out.push(...storyBlocks(card, level), ...methodBlocks(card, level), ...limitBlocks(card, level), ...tensionBlocks(card, level));
  }

  const quotes = Math.max(0, (card.quotes ?? []).length - 1);
  const lines = (card.conversation ?? []).length;
  const wholeLine = level >= 7;
  const moreLines = Math.max(0, lines - (wholeLine ? 0 : 1));
  if (level >= 4) {
    if (quotes) links.push({ sec: 'quotes', label: `${plural(quotes, 'more quote', 'more quotes')} ›` });
    if (moreLines) links.push({ sec: 'conversation', label: `${wholeLine ? plural(moreLines, 'conversation line', 'conversation lines') : plural(moreLines, 'more conversation line', 'more conversation lines')} ›` });
    if (links.length) out.push({ id: 'links', zone: 'rest', sec: 'conversation', kind: 'links', links, clamped: true });
  } else {
    out.push(...quoteBlocks(card), ...lineBlocks(card, 1));
  }
  return out;
}

/** Labels the heading of an expanded view already says. */
const REDUNDANT = new Set(['Limits', 'Tension', 'More quotes', 'In the conversation', 'More from the conversation']);

/** The blocks of one section, whole, for its expanded view. The conversation starts at line 2 unless line 1 is cut from the card. */
export function sectionBlocks(card: AgenticCard | undefined, sec: SectionId, wholeConversation = false): Block[] {
  if (!card) return [];
  const blocks = (() => {
    switch (sec) {
      case 'stories':
        return storyBlocks(card, 0);
      case 'method':
        return methodBlocks(card, 0);
      case 'limits':
        return limitBlocks(card, 0);
      case 'tension':
        return tensionBlocks(card, 0);
      case 'quotes':
        return quoteBlocks(card);
      case 'conversation':
        return lineBlocks(card, wholeConversation ? 0 : 1);
    }
  })();
  return blocks.map((b): Block => {
    const plain = { ...b, zone: 'rest' as const };
    return 'head' in plain && plain.kind !== 'apply' && plain.head && REDUNDANT.has(plain.head.label) ? { ...plain, head: undefined } : plain;
  });
}

/** The sections of a card that have something to show in an expanded view. */
export function sectionsOf(card: AgenticCard | undefined): SectionId[] {
  return SECTIONS.filter((s) => sectionBlocks(card, s).length > 0);
}

/** The lead: the first quote, or the concept's summary if the card has no quotes. */
export function lead(card: AgenticCard | undefined, summary: string): Lead {
  const q = card?.quotes?.[0];
  return q ? { kind: 'quote', text: q.text, source: q.source, verified: q.verified } : { kind: 'summary', text: summary };
}

// ---------------------------------------------------------------------------------------------------------------
// Columns

/** A block's measured height, top padding included, and that padding (dropped when the block starts a column). */
export interface Metric {
  h: number;
  top: number;
}

/** Height of a column holding these blocks. */
export function columnHeight(metrics: Metric[], idx: number[]): number {
  let used = 0;
  idx.forEach((i, k) => {
    const m = metrics[i];
    if (m) used += m.h - (k === 0 ? m.top : 0);
  });
  return used;
}

export type Columns = 1 | 2 | 3;

export interface Flow {
  /** Indices into the blocks, per column, in reading order. */
  left: number[];
  right: number[];
  third: number[];
  usedLeft: number;
  usedRight: number;
  usedThird: number;
  /** All columns are within the height. */
  fits: boolean;
}

/**
 * Places blocks in columns of `height` pixels. With two or three columns the last column always starts with the `right`
 * zone (With your agent, then the first conversation line). Every other block, the `left` zone (Idea, Why it works) and
 * the `rest`, is one stream in its fixed order: it fills the first column, then the next, and finally the last column
 * below its start. A paragraph may continue from one column into the next, since long paragraphs are already runs of
 * whole sentences. Reading order is never broken: a smaller block later on does not jump back to an earlier column.
 * With one column everything follows in order: left blocks, right blocks, the rest. Always returns a placement; `fits`
 * says whether it is inside the height.
 */
export function flowBlocks(zones: Zone[], metrics: Metric[], height: number, columns: Columns): Flow {
  const at = (z: Zone) => zones.flatMap((x, i) => (x === z ? [i] : []));
  const cols: number[][] = [[], [], []];
  const [left, right, rest] = [at('left'), at('right'), at('rest')];
  if (columns === 1) {
    cols[0] = [...left, ...right, ...rest];
  } else {
    const last = columns - 1;
    cols[last] = right;
    let c = 0;
    for (const i of [...left, ...rest]) {
      while (c < last && cols[c]!.length && columnHeight(metrics, [...cols[c]!, i]) > height) c++;
      cols[c]!.push(i);
    }
  }
  const used = cols.map((idx) => columnHeight(metrics, idx));
  return {
    left: cols[0]!,
    right: cols[1]!,
    third: cols[2]!,
    usedLeft: used[0]!,
    usedRight: used[1]!,
    usedThird: used[2]!,
    fits: used.every((u) => u <= height),
  };
}

export interface Measured {
  zones: Zone[];
  metrics: Metric[];
}

export interface Choice {
  /** The level shown. */
  level: number;
  flow: Flow;
  /** The skeleton alone does not fit: shown at level 6, for someone to shorten the text. */
  overflow: boolean;
}

/**
 * The first level whose blocks fit in the columns. Past level 6 the last step (7) is tried; if even that does not
 * fit, the skeleton is too long for the screen and the card is shown at level 6, marked as overflowing.
 * `levels[k]` is level k's blocks, measured.
 */
export function chooseLevel(levels: Measured[], height: number, columns: Columns): Choice {
  let last: Flow | null = null;
  for (let level = 0; level < levels.length; level++) {
    const m = levels[level];
    if (!m) continue;
    const flow = flowBlocks(m.zones, m.metrics, height, columns);
    if (flow.fits) return { level, flow, overflow: false };
    if (level === 6) last = flow;
  }
  const six = levels[6];
  return { level: 6, flow: last ?? (six ? flowBlocks(six.zones, six.metrics, height, columns) : { left: [], right: [], third: [], usedLeft: 0, usedRight: 0, usedThird: 0, fits: false }), overflow: true };
}

export interface ColumnPage {
  left: number[];
  right: number[];
  third: number[];
}

/**
 * Pages of columns for a section that does not fit one: each page fills its columns from the left, and the next page
 * starts again on the left. A block taller than a column gets a column of its own.
 */
export function paginateColumns(metrics: Metric[], height: number, columns: Columns): ColumnPage[] {
  const sides = ['left', 'right', 'third'] as const;
  const fresh = (): ColumnPage => ({ left: [], right: [], third: [] });
  const pages: ColumnPage[] = [];
  let page = fresh();
  let side = 0;
  metrics.forEach((_, i) => {
    // Move on until the block fits, or is alone in an empty column.
    while (page[sides[side]!].length && columnHeight(metrics, [...page[sides[side]!], i]) > height) {
      if (side < columns - 1) side++;
      else {
        pages.push(page);
        page = fresh();
        side = 0;
      }
    }
    page[sides[side]!].push(i);
  });
  if (page.left.length || page.right.length || page.third.length) pages.push(page);
  return pages;
}

// ---------------------------------------------------------------------------------------------------------------
// Read next

/** How many concepts "Read next" offers. */
export const READ_NEXT = 3;

/**
 * Concepts to read after this one: those that share its first theme, the "start here" ones first, then those from
 * the same book, then the rest in data order. Never the concept itself.
 */
export function readNext<T extends Pick<AgenticConcept, 'id' | 'theses' | 'bookIds' | 'startHere'>>(concepts: T[], currentId: string, bookId: string, limit = READ_NEXT): T[] {
  const current = concepts.find((c) => c.id === currentId);
  const theme = current?.theses[0];
  if (!theme) return [];
  return concepts
    .map((c, order) => ({ c, order, tier: c.startHere ? 0 : c.bookIds.includes(bookId) ? 1 : 2 }))
    .filter(({ c }) => c.id !== currentId && c.theses.includes(theme))
    .sort((a, b) => a.tier - b.tier || a.order - b.order)
    .slice(0, limit)
    .map(({ c }) => c);
}
