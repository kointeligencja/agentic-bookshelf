import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
  stackHeight,
  stepTab,
  TAB_LABELS,
  TABS,
  tabsOf,
  whyContent,
} from '../src/lib/card.ts';
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
