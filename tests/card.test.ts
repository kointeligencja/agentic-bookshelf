import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
  stackHeight,
  stepTab,
  subtitleOf,
  TAB_LABELS,
  TABS,
  tabsOf,
  whyContent,
} from '../src/lib/card.ts';
import type { PieceFit, PageBreak } from '../src/lib/card.ts';
import type { Agentic, AgenticCard } from '../src/types.ts';

const card: AgenticCard = {
  title: 'T',
  sources: [{ book: 'B', authors: 'A' }],
  idea: ['First idea.', 'Second idea.', 'Third idea.'],
  why: ['Because.', 'And also.'],
  stories: [{ source: 'Book One', text: 'One.\n\nTwo.' }],
  method: { source: 'Book One', intro: 'Steps follow.', steps: ['a', 'b', 'c', 'd', 'e'] },
  limits: ['Limit one.', 'Limit two.'],
  tension: 'Tense.',
  quotes: [
    { text: 'Lead quote.', source: 'Someone', verified: true },
    { text: 'Second quote.', source: 'Other', verified: false },
  ],
  conversation: [{ speaker: 'Lauren Tan', at: '8:17', at_s: 497, text: 'one' }],
  apply: { label: 'Our adaptation', text: 'Try this.' },
};

describe('tabsOf', () => {
  it('lists the five tabs in order for a full card, worded without counts', () => {
    expect(tabsOf(card)).toEqual([...TABS]);
    expect(TABS.map((t) => TAB_LABELS[t])).toEqual(['Why it works', 'Story', 'Method', 'Limits', 'Quotes']);
  });
  it('leaves out the tabs a card has nothing for', () => {
    expect(tabsOf({ ...card, stories: undefined, limits: [], tension: undefined, conversation: [], quotes: undefined })).toEqual(['why', 'method']);
    expect(tabsOf({ ...card, method: undefined })).not.toContain('method');
    expect(tabsOf({ ...card, stories: [] })).not.toContain('story');
  });
  it('has a Why it works tab only for more idea paragraphs or a why', () => {
    expect(tabsOf({ ...card, idea: ['Only.'], why: undefined })).not.toContain('why');
    expect(tabsOf({ ...card, idea: ['Only.'], why: ['W.'] })).toContain('why');
    expect(tabsOf({ ...card, idea: ['One.', 'Two.'], why: [] })).toContain('why');
  });
  it('counts a method with an intro and no steps, and a tension without limits', () => {
    expect(tabsOf({ ...card, method: { intro: 'Hello.' } })).toContain('method');
    expect(tabsOf({ ...card, method: { source: 'x' } })).not.toContain('method');
    expect(tabsOf({ ...card, limits: undefined, tension: 'T.' })).toContain('limits');
  });
  it('has none without a card', () => {
    expect(tabsOf(undefined)).toEqual([]);
  });
});

describe('defaultTab', () => {
  it('is Method when there is one, else Story, else Why it works', () => {
    expect(defaultTab(['why', 'story', 'method', 'limits'])).toBe('method');
    expect(defaultTab(['why', 'story', 'limits'])).toBe('story');
    expect(defaultTab(['why', 'limits', 'quotes'])).toBe('why');
  });
  it('is the first tab otherwise, and nothing for no tabs', () => {
    expect(defaultTab(['limits', 'quotes'])).toBe('limits');
    expect(defaultTab([])).toBeUndefined();
  });
});

describe('stepTab', () => {
  const tabs = ['why', 'method', 'quotes'] as const;
  it('moves one tab and stops at the ends', () => {
    expect(stepTab(tabs, 'method', 1)).toBe('quotes');
    expect(stepTab(tabs, 'method', -1)).toBe('why');
    expect(stepTab(tabs, 'quotes', 1)).toBe('quotes');
    expect(stepTab(tabs, 'why', -1)).toBe('why');
  });
  it('starts from the first tab when there is none open, and has nothing without tabs', () => {
    expect(stepTab(tabs, undefined, 1)).toBe('method');
    expect(stepTab([], 'why', 1)).toBeUndefined();
  });
});

describe('what a card shows', () => {
  it('band: the first idea paragraph and the apply text', () => {
    expect(band(card)).toEqual({ idea: 'First idea.', apply: card.apply });
    expect(band(undefined)).toEqual({ idea: undefined, apply: undefined });
  });
  it('why tab: the remaining idea paragraphs, then why, with no check for repeats', () => {
    expect(whyContent(card)).toEqual({ more: ['Second idea.', 'Third idea.'], why: ['Because.', 'And also.'] });
    expect(whyContent({ ...card, idea: ['Only.'], why: ['Only.'] })).toEqual({ more: [], why: ['Only.'] });
  });
  it('limits tab: the limits, then the tension', () => {
    expect(limitsContent(card)).toEqual({ limits: ['Limit one.', 'Limit two.'], tension: 'Tense.' });
    expect(limitsContent({ ...card, tension: '' }).tension).toBeUndefined();
  });
  it('quotes tab: every book quote, the first included, and every conversation line', () => {
    const q = quotesContent(card);
    expect(q.quotes.map((x) => x.text)).toEqual(['Lead quote.', 'Second quote.']);
    expect(q.lines).toHaveLength(1);
    expect(quotesContent(undefined)).toEqual({ quotes: [], lines: [] });
  });
  it('story paragraphs: split on blank lines, line breaks inside made spaces', () => {
    expect(paragraphs('One.\n\nTwo\nlines.\n\n\n\nThree.')).toEqual(['One.', 'Two lines.', 'Three.']);
    expect(paragraphs('  ')).toEqual([]);
  });
});

describe('splitSteps', () => {
  it('puts ceil(n/2) steps on the left and the rest on the right', () => {
    expect(splitSteps(5)).toEqual({ left: [0, 1, 2], right: [3, 4] });
    expect(splitSteps(6)).toEqual({ left: [0, 1, 2], right: [3, 4, 5] });
    expect(splitSteps(1)).toEqual({ left: [0], right: [] });
    expect(splitSteps(0)).toEqual({ left: [], right: [] });
  });
});

describe('stackHeight', () => {
  it('adds heights and the gaps between them', () => {
    expect(stackHeight([10, 20, 30], [0, 1, 2], 5)).toBe(70);
    expect(stackHeight([10, 20, 30], [2], 5)).toBe(30);
    expect(stackHeight([10], [], 5)).toBe(0);
  });
});

describe('packColumn', () => {
  it('is one page when everything fits', () => {
    expect(packColumn([50, 50, 50], 10, 170)).toEqual([[0, 1, 2]]);
  });
  it('starts a page when the next item would not fit, in order', () => {
    expect(packColumn([50, 50, 50], 10, 169)).toEqual([[0, 1], [2]]);
    expect(packColumn([60, 60, 60, 60, 60], 0, 130)).toEqual([[0, 1], [2, 3], [4]]);
  });
  it('gives an item taller than a page a page of its own', () => {
    expect(packColumn([20, 500, 20], 4, 100)).toEqual([[0], [1], [2]]);
  });
  it('is no pages for no items, and keeps every item once', () => {
    expect(packColumn([], 4, 100)).toEqual([]);
    const h = Array.from({ length: 30 }, (_, i) => 10 + (i % 4) * 7);
    const pages = packColumn(h, 6, 90);
    expect(pages.flat()).toEqual(h.map((_, i) => i));
    for (const p of pages) expect(stackHeight(h, p, 6)).toBeLessThanOrEqual(90);
  });
});

describe('packSteps', () => {
  const same = (n: number, h = 40) => Array.from({ length: n }, () => h);
  it('is one page of two columns, ceil(n/2) left, when the steps fit', () => {
    expect(packSteps(same(5), 10, 200)).toEqual([{ left: [0, 1, 2], right: [3, 4] }]);
    expect(packSteps(same(6), 10, 200)).toEqual([{ left: [0, 1, 2], right: [3, 4, 5] }]);
  });
  it('fills a page with as many steps as its two columns hold, then goes on', () => {
    // A column holds 2 steps (40+10+40 = 90 <= 100): 4 steps a page.
    const pages = packSteps(same(10), 10, 100);
    expect(pages.map((p) => [p.left.length, p.right.length])).toEqual([[2, 2], [2, 2], [1, 1]]);
    expect(pages.flatMap((p) => [...p.left, ...p.right])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it('gives the first page less room than the others (the intro stands over it)', () => {
    const pages = packSteps(same(8), 10, 40, 100);
    expect(pages.map((p) => p.left.length + p.right.length)).toEqual([2, 4, 2]);
  });
  it('splits an odd page ceil(k/2) left even when the right column is the shorter', () => {
    const pages = packSteps([40, 40, 40], 10, 100);
    expect(pages).toEqual([{ left: [0, 1], right: [2] }]);
  });
  it('never makes an empty page, and puts a tall step alone', () => {
    expect(packSteps([], 10, 100)).toEqual([]);
    expect(packSteps([500, 20], 10, 100)).toEqual([{ left: [0], right: [] }, { left: [1], right: [] }]);
  });
  it('gives a long intro a page of its own when not even one step fits under it', () => {
    // 30px left under the intro, steps of 40: the steps start on page 2.
    const pages = packSteps(same(4), 10, 30, 100);
    expect(pages[0]).toEqual({ left: [], right: [] });
    expect(pages.slice(1).flatMap((p) => [...p.left, ...p.right])).toEqual([0, 1, 2, 3]);
    // With no intro (first === height) a step that is too tall still gets its own page, not an empty one before it.
    expect(packSteps([500], 10, 100)).toEqual([{ left: [0], right: [] }]);
  });
  it('keeps every step once, in order, each column within the height', () => {
    const h = Array.from({ length: 23 }, (_, i) => 20 + (i % 5) * 9);
    const pages = packSteps(h, 12, 150);
    expect(pages.flatMap((p) => [...p.left, ...p.right])).toEqual(h.map((_, i) => i));
    for (const p of pages) for (const c of [p.left, p.right]) expect(stackHeight(h, c, 12)).toBeLessThanOrEqual(150);
  });
});

describe('packSteps: no page ends with room for the next step', () => {
  // Whether `steps` (a run of consecutive steps) go in two columns, split anywhere, each within `room`.
  const fitsOnAPage = (h: number[], steps: number[], gap: number, room: number) => {
    for (let s = 0; s <= steps.length; s++) {
      if (stackHeight(h, steps.slice(0, s), gap) <= room && stackHeight(h, steps.slice(s), gap) <= room) return true;
    }
    return false;
  };
  it('puts the first step of the next page on this one when it fits in either column (Socrates, 1280x800)', () => {
    // Measured: six steps, 175px under the intro; three in the left column come to 188.7px, so the page cannot be 3 + 3.
    const h = [29.3, 55.7, 55.7, 29.3, 29.3, 55.7];
    expect(packSteps(h, 24, 175, 219)).toEqual([{ left: [0, 1], right: [2, 3, 4] }, { left: [5], right: [] }]);
    // With the tight gap all six fit on one page, ceil(n/2) to the left.
    expect(packSteps(h, 16, 175, 219)).toEqual([{ left: [0, 1, 2], right: [3, 4, 5] }]);
  });
  it('holds for many heights, gaps and rooms: the first step of a page would not have fit on the one before', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let n = 0; n < 300; n++) {
      const h = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => 20 + Math.floor(rnd() * 90));
      const gap = [8, 16, 24][Math.floor(rnd() * 3)]!;
      const first = 60 + Math.floor(rnd() * 200);
      const room = first + Math.floor(rnd() * 80);
      const pages = packSteps(h, gap, first, room);
      expect(pages.flatMap((p) => [...p.left, ...p.right])).toEqual(h.map((_, i) => i));
      pages.forEach((p, i) => {
        const mine = [...p.left, ...p.right];
        const r = i === 0 ? first : room;
        if (mine.length > 0 && !(mine.length === 1 && (h[mine[0]!] ?? 0) > r)) {
          expect(stackHeight(h, p.left, gap)).toBeLessThanOrEqual(r);
          expect(stackHeight(h, p.right, gap)).toBeLessThanOrEqual(r);
        }
        const next = pages[i + 1]?.left[0] ?? pages[i + 1]?.right[0];
        if (next !== undefined && mine.length > 0) expect(fitsOnAPage(h, [...mine, next], gap, r)).toBe(false);
      });
    }
  });
});

describe('columnCount', () => {
  it('reads the number of columns off a multi-column box from its scroll width', () => {
    expect(columnCount(500, 238, 24)).toBe(2);
    expect(columnCount(238, 238, 24)).toBe(1);
    expect(columnCount(5 * 238 + 4 * 24, 238, 24)).toBe(5);
    expect(columnCount(0, 238, 24)).toBe(1);
  });
  it('comes to pages of two columns', () => {
    expect([1, 2, 3, 4, 5].map(pagesOf)).toEqual([1, 1, 2, 2, 3]);
  });
});

describe('subtitleOf', () => {
  it("is the card's subtitle when it has one", () => {
    expect(subtitleOf({ ...card, subtitle: ' A sharper line. ' }, 'The summary.')).toBe('A sharper line.');
  });
  it('is the concept summary when the card has none, or an empty one', () => {
    expect(subtitleOf(card, 'The summary.')).toBe('The summary.');
    expect(subtitleOf({ ...card, subtitle: '  ' }, 'The summary.')).toBe('The summary.');
    expect(subtitleOf(undefined, 'The summary.')).toBe('The summary.');
  });
});

describe('splitSentences', () => {
  const join = (t: string) => splitSentences(t).join(' ');
  it('cuts after . ! and ?, before a capital', () => {
    expect(splitSentences('One is here. Two is there! Is three? Yes.')).toEqual(['One is here.', 'Two is there!', 'Is three?', 'Yes.']);
  });
  it('keeps a closing quote or bracket with its sentence', () => {
    expect(splitSentences('He said, "Go." Then he left. (It rained.) Nobody cared.')).toEqual(['He said, "Go."', 'Then he left.', '(It rained.)', 'Nobody cared.']);
    expect(splitSentences('“Why?” She asked. “Because.” He shrugged.')).toEqual(['“Why?”', 'She asked.', '“Because.”', 'He shrugged.']);
  });
  it('does not cut after e.g., i.e., Dr., Mr., Mrs., Prof., St., vs. or etc.', () => {
    for (const t of [
      'Use a prompt, e.g. Socrates did, and wait.',
      'It is a rule, i.e. Always ask first.',
      'Dr. Smith agreed with Mr. Jones and Mrs. Lee.',
      'Prof. Kahneman met St. Paul vs. Napoleon.',
      'He packed pens, paper, etc. Then he left.',
    ]) {
      expect(splitSentences(t), t).toHaveLength(1);
    }
  });
  it('does not cut after U.S. or initials', () => {
    expect(splitSentences('The U.S. Army chose J. K. Rowling and J.R.R. Tolkien.')).toHaveLength(1);
    expect(splitSentences('Born in the U.S.A. Later he moved.')).toHaveLength(1);
  });
  it('does not cut inside a decimal or after a short number', () => {
    expect(splitSentences('Pi is 3.14 and e is 2.72 roughly. Next.')).toEqual(['Pi is 3.14 and e is 2.72 roughly.', 'Next.']);
    expect(splitSentences('See No. 5 and step 2. Do it.')).toHaveLength(1);
  });
  it('cuts after a year or a long number', () => {
    expect(splitSentences('It happened in 1999. The war ended.')).toEqual(['It happened in 1999.', 'The war ended.']);
  });
  it('does not cut before a lower-case word', () => {
    expect(splitSentences('He paused... then went on. She did not.')).toEqual(['He paused... then went on.', 'She did not.']);
    expect(splitSentences('"Why?" he asked.')).toHaveLength(1);
  });
  it('cuts after an ellipsis before a capital', () => {
    expect(splitSentences('He paused… Then he went on.')).toEqual(['He paused…', 'Then he went on.']);
  });
  it('keeps every word and the order: the sentences joined are the paragraph', () => {
    const t = 'First, e.g. this one. Second one! Third? "Fourth," said Dr. Who. Fifth.';
    expect(join(t)).toBe(t);
    expect(join('  One.   Two.  ')).toBe('One. Two.');
  });
  it('makes one sentence of text with no stop, and none of nothing', () => {
    expect(splitSentences('no stop here')).toEqual(['no stop here']);
    expect(splitSentences('')).toEqual([]);
  });
  it('cuts every sentence of every real card without losing a word', () => {
    const cards = JSON.parse(readFileSync('public/data/agentic-cards.json', 'utf8')) as Record<string, AgenticCard>;
    const words = (t: string) => t.split(/\s+/).filter(Boolean).join(' ');
    for (const [id, c] of Object.entries(cards)) {
      const texts = [...(c.idea ?? []), ...(c.why ?? []), ...(c.limits ?? []), c.tension ?? '', ...(c.stories ?? []).flatMap((s) => paragraphs(s.text))];
      for (const t of texts) expect(words(join(t)), id).toBe(words(t));
    }
  });
});

describe('nextBreak', () => {
  const sent = (start: number, end: number) => ({ start, end });
  const piece = (block: number, start: number, end: number, extra: Partial<PieceFit> = {}): PieceFit => ({
    block, first: 0, label: false, start, end, sentences: [], ...extra,
  });
  it('has nothing to do when every paragraph is on one page', () => {
    expect(nextBreak([piece(0, 0, 0), piece(1, 0, 0), piece(2, 1, 1)])).toEqual({ at: null, stuck: 0 });
  });
  it('moves a paragraph whose first sentence runs over to the next page whole, to the start of the paragraph', () => {
    const r = nextBreak([piece(0, 0, 0), piece(1, 0, 1, { sentences: [sent(0, 1), sent(1, 1)] })]);
    expect(r.at).toEqual({ block: 1, sentence: 0 });
  });
  it('takes the heading over the paragraph with it', () => {
    const r = nextBreak([piece(0, 0, 0), piece(1, 0, 0, { label: true }), piece(2, 0, 1, { sentences: [sent(0, 1)] })]);
    expect(r.at).toEqual({ block: 1, sentence: 0 });
  });
  it('cuts a paragraph that runs over before the sentence that crosses, so the sentences before it fill the page', () => {
    // Not at the top of a page: its third sentence crosses into page 1, its first two stay on page 0.
    const runs = piece(1, 0, 1, { sentences: [sent(0, 0), sent(0, 0), sent(0, 1), sent(1, 1)] });
    expect(nextBreak([piece(0, 0, 0), runs]).at).toEqual({ block: 1, sentence: 2 });
  });
  it('cuts a paragraph that is too long for one page before the sentence that crosses the page', () => {
    // On its own page already (the one before ended earlier), 4 sentences: the third crosses into page 2.
    const long = piece(1, 1, 2, { sentences: [sent(1, 1), sent(1, 1), sent(1, 2), sent(2, 2)] });
    const r = nextBreak([piece(0, 0, 0), long]);
    expect(r.at).toEqual({ block: 1, sentence: 2 });
  });
  it('cuts the second piece of a paragraph by its sentence number in the paragraph', () => {
    const second = piece(1, 2, 3, { first: 3, sentences: [sent(2, 2), sent(2, 3)] });
    const r = nextBreak([piece(0, 1, 1), second]);
    expect(r.at).toEqual({ block: 1, sentence: 4 });
  });
  it('leaves a long paragraph whose pages meet between two sentences', () => {
    const long = piece(0, 0, 1, { sentences: [sent(0, 0), sent(0, 0), sent(1, 1), sent(1, 1)] });
    expect(nextBreak([long])).toEqual({ at: null, stuck: 0 });
  });
  it('counts a sentence longer than a page as stuck, and goes on to the next fault', () => {
    const huge = piece(0, 0, 2, { sentences: [sent(0, 2)] });
    const run = piece(1, 2, 3, { sentences: [sent(2, 3)] });
    const r = nextBreak([huge, run]);
    expect(r.stuck).toBe(1);
    expect(r.at).toEqual({ block: 1, sentence: 0 });
  });
  it('does not ask for a break it has already', () => {
    const have: PageBreak[] = [{ block: 1, sentence: 0, space: 10 }];
    const r = nextBreak([piece(0, 0, 0), piece(1, 0, 1, { sentences: [sent(0, 1)] })], have);
    expect(r).toEqual({ at: null, stuck: 1 });
  });
});

describe('the real cards', () => {
  const cards = JSON.parse(readFileSync('public/data/agentic-cards.json', 'utf8')) as Record<string, AgenticCard>;
  const data = JSON.parse(readFileSync('public/data/agentic.json', 'utf8')) as Agentic;

  it('every concept has a card with an idea and an adaptation for the band', () => {
    for (const x of data.concepts) {
      const b = band(cards[x.id]);
      expect(b.idea?.length, x.id).toBeGreaterThan(0);
      expect(b.apply?.text.length, x.id).toBeGreaterThan(0);
    }
  });
  it('every card has at least one tab, and opens on one it has', () => {
    for (const x of data.concepts) {
      const tabs = tabsOf(cards[x.id]);
      expect(tabs.length, x.id).toBeGreaterThan(0);
      expect(tabs, x.id).toContain(defaultTab(tabs));
    }
  });
  it('opens on Method when the card has steps, otherwise on Story or Why it works', () => {
    for (const x of data.concepts) {
      const c = cards[x.id]!;
      const open = defaultTab(tabsOf(c));
      if (c.method?.steps?.length || c.method?.intro) expect(open, x.id).toBe('method');
      else if (c.stories?.length) expect(open, x.id).toBe('story');
    }
  });
  it('the Socrates card has Why it works, Story, Method and Quotes, and its six steps split 3 and 3', () => {
    const c = cards['socratic-method']!;
    expect(tabsOf(c)).toEqual(['why', 'story', 'method', 'quotes']);
    expect(splitSteps(c.method!.steps!.length)).toEqual({ left: [0, 1, 2], right: [3, 4, 5] });
  });
});
