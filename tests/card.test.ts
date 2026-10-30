import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cardBlocks, MAX_RUN, paginate, SECTIONS, splitText, tabs, type Block } from '../src/lib/card.ts';
import type { AgenticCard } from '../src/types.ts';

const card: AgenticCard = {
  title: 'T',
  sources: [{ book: 'B', authors: 'A' }],
  idea: ['First idea.', 'Second idea.'],
  why: ['Because.', 'And also.'],
  stories: [{ source: 'Book One', text: 'Para one.\n\nPara two.' }],
  method: { source: 'Book One', intro: 'Steps follow.', steps: ['Do a.', 'Do b.'] },
  limits: ['It fails when.'],
  tension: 'A tension.',
  quotes: [
    { text: 'Quoted.', source: 'Someone', verified: true },
    { text: 'Loose.', source: 'Other', verified: false },
  ],
  conversation: [
    { speaker: 'Lauren Tan', at: '8:17', at_s: 497, text: 'one' },
    { speaker: 'Matt Pocock', at: '9:00', at_s: 540, text: 'two' },
  ],
  apply: { label: 'Our adaptation', text: 'Try this.' },
};

describe('splitText', () => {
  it('keeps a short paragraph whole', () => {
    expect(splitText('One. Two. Three.')).toEqual(['One. Two. Three.']);
  });
  it('cuts at sentence ends and gives the paragraph back when joined', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} is here, with some more words in it.`).join(' ');
    const runs = splitText(text, 120);
    expect(runs.length).toBeGreaterThan(3);
    expect(runs.every((r) => r.length <= 120 + 60)).toBe(true);
    expect(runs.join(' ')).toBe(text);
  });
  it('never cuts inside a sentence, however long', () => {
    const long = `${'word '.repeat(100).trim()}.`;
    expect(splitText(`${long} Next.`, 50)).toEqual([long, 'Next.']);
  });
  it('does not split after a quote mark that closes the sentence', () => {
    expect(splitText('He said “stop.” Then he left.', 10)).toEqual(['He said “stop.”', 'Then he left.']);
  });
});

describe('cardBlocks', () => {
  const blocks = cardBlocks(card, 'The summary');
  it('opens with the summary, in Idea', () => {
    expect(blocks[0]).toMatchObject({ sec: 'Idea', kind: 'summary', text: 'The summary' });
  });
  it('sorts blocks into sections in tab order', () => {
    const order = blocks.map((b) => SECTIONS.indexOf(b.sec));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(blocks.map((b) => b.sec))).toEqual(new Set(SECTIONS));
  });
  it('heads the first story paragraph with its source, and the first "why" with a label', () => {
    expect(blocks.find((b) => b.sec === 'Stories')).toMatchObject({ head: { label: 'From', em: 'Book One' } });
    expect(blocks.filter((b) => b.kind === 'text' && b.head?.label === 'Why it works')).toHaveLength(1);
  });
  it('numbers method steps from 1', () => {
    expect(blocks.filter((b) => b.kind === 'step').map((b) => (b.kind === 'step' ? b.n : 0))).toEqual([1, 2]);
  });
  it('keeps the unchecked flag on quotes and the timestamp on conversation lines', () => {
    expect(blocks.filter((b) => b.kind === 'quote').map((b) => (b.kind === 'quote' ? b.verified : null))).toEqual([true, false]);
    expect(blocks.find((b) => b.kind === 'conv')).toMatchObject({ atS: 497, at: '8:17' });
  });
  it('puts the tension in Limits and labels our adaptation', () => {
    expect(blocks.find((b) => b.kind === 'text' && b.head?.label === 'Tension')?.sec).toBe('Limits');
    expect(blocks.find((b) => b.kind === 'apply')).toMatchObject({ label: 'Our adaptation' });
  });
  it('is just the summary and a note when there is no card yet', () => {
    expect(cardBlocks(undefined, 's').map((b) => b.sec)).toEqual(['Idea', 'Idea']);
  });
  it('splits a long paragraph into runs, heading only the first', () => {
    const long = Array.from({ length: 20 }, (_, i) => `This is sentence ${i}.`).join(' ');
    const runs = cardBlocks({ ...card, idea: [], why: [long] }, 's').filter((b) => b.kind === 'text' && b.sec === 'Idea');
    expect(runs.length).toBeGreaterThan(1);
    expect(runs.map((b) => (b.kind === 'text' ? !!b.head : null))).toEqual([true, ...runs.slice(1).map(() => false)]);
    expect(runs.every((b) => b.kind !== 'text' || b.text.length <= MAX_RUN + 40)).toBe(true);
  });
});

describe('paginate', () => {
  const mk = (sec: Block['sec'], n: number): Block[] => Array.from({ length: n }, () => ({ sec, kind: 'text', text: 'x' }));
  it('starts a new page for every section', () => {
    const blocks = [...mk('Idea', 1), ...mk('Stories', 1), ...mk('Limits', 1)];
    expect(paginate(blocks, [10, 10, 10], 1000).map((p) => p.sec)).toEqual(['Idea', 'Stories', 'Limits']);
  });
  it('fills a page up to the limit, then starts another in the same section', () => {
    const pages = paginate(mk('Idea', 5), [40, 40, 40, 40, 40], 100);
    expect(pages.map((p) => p.blocks.length)).toEqual([2, 2, 1]);
    expect(pages.every((p) => p.sec === 'Idea')).toBe(true);
  });
  it('gives a block taller than a page a page of its own', () => {
    expect(paginate(mk('Idea', 3), [10, 500, 10], 100).map((p) => p.blocks.length)).toEqual([1, 1, 1]);
  });
  it('keeps every block exactly once, in order', () => {
    const blocks = cardBlocks(card, 's');
    const pages = paginate(blocks, blocks.map((_, i) => 30 + (i % 3) * 20), 90);
    expect(pages.flatMap((p) => p.blocks)).toEqual(blocks);
  });
  it('is empty for no blocks', () => {
    expect(paginate([], [], 100)).toEqual([]);
  });
});

describe('tabs', () => {
  it('lists each section once with its first page', () => {
    const pages = paginate(cardBlocks(card, 's'), cardBlocks(card, 's').map(() => 60), 100);
    const t = tabs(pages);
    expect(t.map((x) => x.sec)).toEqual([...SECTIONS]);
    t.forEach((x) => expect(pages[x.page]!.sec).toBe(x.sec));
    t.forEach((x) => expect(x.page === 0 || pages[x.page - 1]!.sec !== x.sec).toBe(true));
  });
});

describe('the real cards', () => {
  const cards = JSON.parse(readFileSync('public/data/agentic-cards.json', 'utf8')) as Record<string, AgenticCard>;
  it('all build into blocks within a section list', () => {
    for (const [id, c] of Object.entries(cards)) {
      const blocks = cardBlocks(c, id);
      expect(blocks.length, id).toBeGreaterThan(1);
      for (const b of blocks) expect(SECTIONS).toContain(b.sec);
      for (const b of blocks) if (b.kind === 'text') expect(b.text.length, id).toBeLessThan(MAX_RUN * 3);
    }
  });
});
