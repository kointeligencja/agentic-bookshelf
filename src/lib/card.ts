import type { AgenticCard } from '../types.ts';

/** The tabs of a card, in order. Each starts a new page. */
export const SECTIONS = ['Idea', 'Stories', 'Method', 'Limits', 'Quotes', 'With your agent'] as const;
export type Section = (typeof SECTIONS)[number];

/** A small label above a block; `em` is a source title shown in italics after it. */
export interface Head {
  label: string;
  em?: string;
}

/** One unit of a card's text. Blocks are what the pager moves between pages, never split further. */
export type Block = { sec: Section } & (
  | { kind: 'summary'; text: string }
  | { kind: 'text'; text: string; head?: Head; cont?: boolean }
  | { kind: 'step'; n: number; text: string }
  | { kind: 'quote'; text: string; source: string; verified: boolean }
  | { kind: 'conv'; text: string; speaker: string; at: string; atS: number; head?: Head }
  | { kind: 'apply'; label: string; text: string }
);

/** Longest run of text kept as one block. Longer paragraphs are cut at sentence ends so they can span pages. */
export const MAX_RUN = 300;

/**
 * Cuts a paragraph into runs of whole sentences, each about `max` characters. A sentence longer than that
 * stays whole. Joining the runs with a space gives the paragraph back.
 */
export function splitText(text: string, max = MAX_RUN): string[] {
  const sentences = text.trim().split(/(?<=[.!?…]["”’')\]]*)\s+(?=["“‘'(\[]?[A-Z0-9])/u);
  const runs: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + 1 + s.length > max) {
      runs.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) runs.push(cur);
  return runs;
}

/** The status marks on a card and what they say. */
export const STATUS: Record<string, string> = {
  '✓': 'Checked against the book',
  '⚠': 'Checked; some details corrected',
  '?': 'Not yet checked',
};

/** A paragraph as blocks: the heading sits on the first run, the others carry on from it. */
function paragraph(sec: Section, text: string, head?: Head): Block[] {
  return splitText(text).map((run, i) => ({ sec, kind: 'text', text: run, head: i === 0 ? head : undefined, cont: i > 0 }));
}

/** The card as a flat list of blocks, each tagged with the section it belongs to. */
export function cardBlocks(card: AgenticCard | undefined, summary: string): Block[] {
  const out: Block[] = [{ sec: 'Idea', kind: 'summary', text: summary }];
  if (!card) {
    out.push({ sec: 'Idea', kind: 'text', text: 'Card in progress.' });
    return out;
  }
  for (const t of card.idea ?? []) out.push(...paragraph('Idea', t));
  (card.why ?? []).forEach((t, i) => out.push(...paragraph('Idea', t, i ? undefined : { label: 'Why it works' })));
  for (const st of card.stories ?? []) {
    st.text
      .split(/\n\n+/)
      .filter(Boolean)
      .forEach((t, i) => out.push(...paragraph('Stories', t, i ? undefined : { label: 'From', em: st.source })));
  }
  const m = card.method;
  if (m) {
    const head: Head = { label: "The book's method", em: m.source };
    if (m.intro) out.push(...paragraph('Method', m.intro, head));
    else out.push({ sec: 'Method', kind: 'text', text: '', head });
    (m.steps ?? []).forEach((t, i) => out.push({ sec: 'Method', kind: 'step', n: i + 1, text: t }));
  }
  for (const t of card.limits ?? []) out.push(...paragraph('Limits', t));
  if (card.tension) out.push(...paragraph('Limits', card.tension, { label: 'Tension' }));
  for (const q of card.quotes ?? []) out.push({ sec: 'Quotes', kind: 'quote', text: q.text, source: q.source, verified: q.verified });
  (card.conversation ?? []).forEach((q, i) =>
    out.push({
      sec: 'Quotes',
      kind: 'conv',
      text: q.text,
      speaker: q.speaker,
      at: q.at,
      atS: q.at_s,
      head: i ? undefined : { label: 'In the conversation' },
    }),
  );
  if (card.apply) out.push({ sec: 'With your agent', kind: 'apply', label: card.apply.label, text: card.apply.text });
  return out;
}

export interface Page {
  sec: Section;
  blocks: Block[];
}

/**
 * Flows blocks into pages of at most `limit` pixels, given each block's measured height. A section always
 * starts a new page. A block taller than a page still gets a page of its own.
 */
export function paginate(blocks: Block[], heights: number[], limit: number): Page[] {
  const pages: Page[] = [];
  let cur: Page | null = null;
  let used = 0;
  blocks.forEach((b, i) => {
    const h = heights[i] ?? 0;
    if (!cur || cur.sec !== b.sec || (used + h > limit && cur.blocks.length)) {
      cur = { sec: b.sec, blocks: [] };
      pages.push(cur);
      used = 0;
    }
    cur.blocks.push(b);
    used += h;
  });
  return pages;
}

/** The sections that have pages, in tab order, each with the index of its first page. */
export function tabs(pages: Page[]): { sec: Section; page: number }[] {
  const seen: { sec: Section; page: number }[] = [];
  pages.forEach((p, i) => {
    if (!seen.some((t) => t.sec === p.sec)) seen.push({ sec: p.sec, page: i });
  });
  return seen;
}
