import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cardBlocks,
  chooseColumns,
  chooseLevel,
  columnHeight,
  firstSentences,
  flowBlocks,
  LEVELS,
  lead,
  MAX_LEVEL,
  MAX_RUN,
  paginateColumns,
  readNext,
  SECTIONS,
  sectionBlocks,
  sectionsOf,
  splitSentences,
  splitText,
  type Block,
  type Measured,
  type Metric,
  type Zone,
} from '../src/lib/card.ts';
import type { Agentic, AgenticCard } from '../src/types.ts';

const s = (n: number, tag = 'Sentence') => Array.from({ length: n }, (_, i) => `${tag} ${i + 1} is here.`).join(' ');

const card: AgenticCard = {
  title: 'T',
  sources: [{ book: 'B', authors: 'A' }],
  idea: ['First idea.', 'Second idea.'],
  why: ['Because.', 'And also.'],
  stories: [
    { source: 'Book One', text: `${s(4, 'One')}\n\n${s(2, 'Two')}` },
    { source: 'Book Two', text: s(3, 'Three') },
    { source: 'Book Three', text: 'Only one sentence here.' },
  ],
  method: { source: 'Book One', intro: 'Steps follow.', steps: ['Do a. Then more of a.', 'Do b.', 'Do c.', 'Do d.', 'Do e.', 'Do f.'] },
  limits: [s(3, 'Limit'), 'Another limit paragraph.'],
  tension: s(3, 'Tense'),
  quotes: [
    { text: 'Lead quote.', source: 'Someone', verified: true },
    { text: 'Second quote.', source: 'Other', verified: false },
    { text: 'Third quote.', source: 'Third', verified: true },
  ],
  conversation: [
    { speaker: 'Lauren Tan', at: '8:17', at_s: 497, text: 'one' },
    { speaker: 'Matt Pocock', at: '9:00', at_s: 540, text: 'two' },
    { speaker: 'Matt Pocock', at: '9:30', at_s: 570, text: 'three' },
  ],
  apply: { label: 'Our adaptation', text: 'Try this.' },
};

const textOf = (b: Block) => ('text' in b ? b.text : '');
const where = (blocks: Block[], sec: Block['sec']) => blocks.filter((b) => b.sec === sec);
const joined = (blocks: Block[]) => blocks.map(textOf).join(' ');
const links = (blocks: Block[]) => blocks.flatMap((b) => (b.kind === 'links' ? b.links.map((l) => l.label) : b.kind === 'more' ? [b.more.label] : 'more' in b && b.more ? [b.more.label] : []));

describe('splitSentences', () => {
  it('cuts at . ! ? and … before a capital', () => {
    expect(splitSentences('One. Two! Three? Four… Five.')).toEqual(['One.', 'Two!', 'Three?', 'Four…', 'Five.']);
  });
  it('does not cut after e.g., i.e., Dr., Mr., Mrs. or U.S.', () => {
    expect(splitSentences('Use a rule, e.g. Stop. Then go, i.e. Run. Dr. Smith met Mr. Jones and Mrs. Lee in the U.S. Navy.')).toEqual([
      'Use a rule, e.g. Stop.',
      'Then go, i.e. Run.',
      'Dr. Smith met Mr. Jones and Mrs. Lee in the U.S. Navy.',
    ]);
  });
  it('does not cut after initials', () => {
    expect(splitSentences('A. G. Lafley ran P&G. He said so.')).toEqual(['A. G. Lafley ran P&G.', 'He said so.']);
  });
  it('does not cut inside decimals or numbers', () => {
    expect(splitSentences('It grew 3.5 percent in 2.1 years. Then it fell. See No. 5 for more.')).toEqual(['It grew 3.5 percent in 2.1 years.', 'Then it fell.', 'See No. 5 for more.']);
  });
  it('keeps a closing quote with its sentence', () => {
    expect(splitSentences('He said “stop.” Then he left. She asked "why?" He shrugged.')).toEqual(['He said “stop.”', 'Then he left.', 'She asked "why?"', 'He shrugged.']);
  });
  it('does not cut before a lower-case word', () => {
    expect(splitSentences('He said “stop.” and left. Then he came back.')).toEqual(['He said “stop.” and left.', 'Then he came back.']);
  });
  it('gives the text back when joined, white space made single', () => {
    const t = 'First one.  Second\none.\n\nThird (a note.) Fourth.';
    expect(splitSentences(t).join(' ')).toBe(t.replace(/\s+/g, ' '));
  });
  it('is empty for blank text and one piece for a sentence without an end', () => {
    expect(splitSentences('  ')).toEqual([]);
    expect(splitSentences('no end here')).toEqual(['no end here']);
  });
});

describe('firstSentences', () => {
  it('takes the first n and says whether it left any out', () => {
    expect(firstSentences('A one. B two. C three.', 2)).toEqual({ text: 'A one. B two.', cut: true });
    expect(firstSentences('A one. B two.', 2)).toEqual({ text: 'A one. B two.', cut: false });
    expect(firstSentences('Just this', 1)).toEqual({ text: 'Just this', cut: false });
  });
});

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

describe('lead', () => {
  it('is the first quote, with where it comes from', () => {
    expect(lead(card, 'The summary')).toEqual({ kind: 'quote', text: 'Lead quote.', source: 'Someone', verified: true });
  });
  it('is the summary when the card has no quotes, or no card', () => {
    expect(lead({ ...card, quotes: [] }, 'The summary')).toEqual({ kind: 'summary', text: 'The summary' });
    expect(lead({ ...card, quotes: undefined }, 'The summary')).toEqual({ kind: 'summary', text: 'The summary' });
    expect(lead(undefined, 'The summary')).toEqual({ kind: 'summary', text: 'The summary' });
  });
});

describe('cardBlocks: level 0', () => {
  const blocks = cardBlocks(card, 0);
  it('puts Idea and Why it works on the left, With your agent and the first line on the right, the rest after', () => {
    const zones = blocks.map((b) => b.zone);
    expect(zones.slice(0, 5)).toEqual(['left', 'left', 'left', 'left', 'right']);
    expect(blocks.filter((b) => b.zone === 'left').map((b) => b.sec)).toEqual(['idea', 'idea', 'why', 'why']);
    expect(blocks.filter((b) => b.zone === 'right').map((b) => b.sec)).toEqual(['apply', 'first-line']);
    expect(blocks.filter((b) => b.zone === 'rest').map((b) => b.sec).filter((x, i, a) => a.indexOf(x) === i)).toEqual(['stories', 'method', 'limits', 'tension', 'quotes', 'conversation']);
    // Everything in `rest` follows the skeleton.
    const firstRest = blocks.findIndex((b) => b.zone === 'rest');
    expect(blocks.slice(firstRest).every((b) => b.zone === 'rest')).toBe(true);
  });
  it('labels the sections', () => {
    const heads = blocks.flatMap((b) => ('head' in b && b.head ? [b.head.label] : []));
    expect(heads).toEqual(['Idea', 'Why it works', 'With your agent', 'In the conversation', 'Story', 'Story', 'Story', "The book's method", 'Limits', 'Tension', 'More quotes', 'More from the conversation']);
    expect(blocks.find((b) => b.kind === 'apply')).toMatchObject({ head: { label: 'With your agent', em: 'Our adaptation' } });
    expect(blocks.find((b) => b.sec === 'stories')).toMatchObject({ head: { label: 'Story', em: 'Book One' } });
  });
  it('does not repeat the lead quote or the first conversation line further down', () => {
    expect(blocks.filter((b) => b.kind === 'quote').map(textOf)).toEqual(['Second quote.', 'Third quote.']);
    expect(blocks.filter((b) => b.kind === 'conv').map(textOf)).toEqual(['one', 'two', 'three']);
    expect(blocks.filter((b) => b.sec === 'conversation').map(textOf)).toEqual(['two', 'three']);
  });
  it('keeps the unchecked flag on quotes and the timestamp on conversation lines', () => {
    expect(blocks.filter((b) => b.kind === 'quote').map((b) => (b.kind === 'quote' ? b.verified : null))).toEqual([false, true]);
    expect(blocks.find((b) => b.kind === 'conv')).toMatchObject({ atS: 497, at: '8:17' });
  });
  it('numbers method steps from 1 and heads the method with its intro', () => {
    expect(blocks.filter((b) => b.kind === 'step').map((b) => (b.kind === 'step' ? b.n : 0))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(where(blocks, 'method')[0]).toMatchObject({ kind: 'text', text: 'Steps follow.', head: { label: "The book's method" } });
  });
  it('has nothing cut and no links', () => {
    expect(blocks.some((b) => b.clamped)).toBe(false);
    expect(links(blocks)).toEqual([]);
  });
  it('splits a long paragraph into runs, heading only the first', () => {
    const long = Array.from({ length: 20 }, (_, i) => `This is sentence ${i}.`).join(' ');
    const runs = cardBlocks({ ...card, idea: [long] }, 0).filter((b) => b.sec === 'idea');
    expect(runs.length).toBeGreaterThan(1);
    expect(runs.map((b) => ('head' in b ? !!b.head : null))).toEqual([true, ...runs.slice(1).map(() => false)]);
    expect(runs.every((b) => b.kind !== 'text' || b.text.length <= MAX_RUN + 40)).toBe(true);
  });
  it('is just a note when there is no card yet', () => {
    expect(cardBlocks(undefined, 0).map((b) => textOf(b))).toEqual(['Card in progress.']);
  });
  it('has unique ids', () => {
    for (const l of LEVELS) {
      const ids = cardBlocks(card, l).map((b) => b.id);
      expect(new Set(ids).size, `level ${l}`).toBe(ids.length);
    }
  });
});

describe('cardBlocks: the ladder', () => {
  it('level 1 cuts Limits to the first paragraph, 2 sentences, and Tension to 2', () => {
    const b = cardBlocks(card, 1);
    expect(joined(where(b, 'limits'))).toBe('Limit 1 is here. Limit 2 is here.');
    expect(joined(where(b, 'tension'))).toBe('Tense 1 is here. Tense 2 is here.');
    expect(links(where(b, 'limits'))).toEqual(['All limits ›']);
    expect(links(where(b, 'tension'))).toEqual(['Full tension ›']);
    expect(where(b, 'limits').every((x) => x.clamped)).toBe(true);
    // Nothing else moved.
    expect(where(b, 'stories')).toEqual(where(cardBlocks(card, 0), 'stories'));
    expect(where(b, 'method')).toEqual(where(cardBlocks(card, 0), 'method'));
  });
  it('level 1 adds no link where nothing was cut', () => {
    const short: AgenticCard = { ...card, limits: ['One. Two.'], tension: 'Just one.' };
    const b = cardBlocks(short, 1);
    expect(links(b)).toEqual([]);
    expect(b.some((x) => x.clamped)).toBe(false);
  });
  it('level 1 links to the limits when a second paragraph is dropped', () => {
    expect(links(cardBlocks({ ...card, limits: ['One. Two.', 'More.'] }, 1))).toContain('All limits ›');
  });
  it('level 2 cuts every story to its first 2 sentences', () => {
    const b = where(cardBlocks(card, 2), 'stories');
    expect(b.map(textOf)).toEqual(['One 1 is here. One 2 is here.', 'Three 1 is here. Three 2 is here.', 'Only one sentence here.']);
    expect(links(b)).toEqual(['Full story ›', 'Full story ›']);
    expect(b[2]!.clamped).toBeFalsy();
  });
  it('level 3 drops the intro, keeps 3 steps and each first sentence, and links to all of them', () => {
    const b = where(cardBlocks(card, 3), 'method');
    expect(b.filter((x) => x.kind === 'text')).toEqual([]);
    expect(b.filter((x) => x.kind === 'step').map(textOf)).toEqual(['Do a.', 'Do b.', 'Do c.']);
    expect(b[0]).toMatchObject({ head: { label: "The book's method", em: 'Book One' } });
    expect(links(b)).toEqual(['All 6 steps ›']);
  });
  it('level 3 keeps a short method whole when only the intro is dropped, with a link', () => {
    const b = where(cardBlocks({ ...card, method: { source: 'X', intro: 'Intro.', steps: ['A.', 'B.'] } }, 3), 'method');
    expect(b.map(textOf)).toEqual(['A.', 'B.', '']);
    expect(links(b)).toEqual(['All 2 steps ›']);
    const none = where(cardBlocks({ ...card, method: { source: 'X', steps: ['A.', 'B.'] } }, 3), 'method');
    expect(links(none)).toEqual([]);
    expect(none.some((x) => x.clamped)).toBe(false);
  });
  it('level 4 turns further quotes and conversation lines into links, and keeps the first line', () => {
    const b = cardBlocks(card, 4);
    expect(b.filter((x) => x.kind === 'quote')).toEqual([]);
    expect(b.filter((x) => x.kind === 'conv').map(textOf)).toEqual(['one']);
    expect(links(b)).toEqual(['Full story ›', 'Full story ›', 'All 6 steps ›', 'All limits ›', 'Full tension ›', '2 more quotes ›', '2 more conversation lines ›']);
    expect(b.at(-1)).toMatchObject({ kind: 'links', links: [{ sec: 'quotes', label: '2 more quotes ›' }, { sec: 'conversation', label: '2 more conversation lines ›' }] });
  });
  it('level 5 cuts stories to one sentence and the method to 2 steps', () => {
    const b = cardBlocks(card, 5);
    expect(where(b, 'stories').map(textOf)).toEqual(['One 1 is here.', 'Three 1 is here.', 'Only one sentence here.']);
    expect(where(b, 'method').filter((x) => x.kind === 'step').map(textOf)).toEqual(['Do a.', 'Do b.']);
    expect(links(where(b, 'method'))).toEqual(['All 6 steps ›']);
    // Limits and Tension stay at level 1's cut.
    expect(joined(where(b, 'limits'))).toBe(joined(where(cardBlocks(card, 1), 'limits')));
  });
  it('level 6 leaves one line of links for Stories, Method, Limits, Tension and the rest', () => {
    const b = cardBlocks(card, 6);
    const rest = b.filter((x) => x.zone === 'rest');
    expect(rest).toHaveLength(1);
    expect(rest[0]).toMatchObject({ kind: 'links' });
    expect(links(rest)).toEqual(['Stories (3) ›', 'Method (6 steps) ›', 'Limits ›', 'Tension ›', '2 more quotes ›', '2 more conversation lines ›']);
    expect(b.filter((x) => x.kind === 'conv').map(textOf)).toEqual(['one']);
  });
  it('level 7 also turns the first conversation line into a link', () => {
    const b = cardBlocks(card, 7);
    expect(b.filter((x) => x.kind === 'conv')).toEqual([]);
    expect(links(b).at(-1)).toBe('3 conversation lines ›');
  });
  it('words 1, 1 and singular counts', () => {
    const one: AgenticCard = { ...card, stories: [card.stories![0]!], method: { source: 'X', steps: ['Only.'] }, quotes: [card.quotes![0]!, card.quotes![1]!], conversation: card.conversation!.slice(0, 2) };
    expect(links(cardBlocks(one, 6))).toEqual(['Story ›', 'Method (1 step) ›', 'Limits ›', 'Tension ›', '1 more quote ›', '1 more conversation line ›']);
  });
  it('never touches the skeleton, at any level', () => {
    const skeleton = (l: number) => cardBlocks(card, l).filter((b) => b.skeleton);
    expect(skeleton(0).map((b) => b.sec)).toEqual(['idea', 'idea', 'why', 'why', 'apply']);
    for (let l = 0; l <= 7; l++) {
      expect(skeleton(l), `level ${l}`).toEqual(skeleton(0));
      expect(skeleton(l).some((b) => b.clamped)).toBe(false);
    }
  });
  it('never clamps Idea or With your agent, at any level', () => {
    const keep = (l: number) => cardBlocks(card, l).filter((b) => b.sec === 'idea' || b.sec === 'apply');
    expect(keep(0).map((b) => b.sec)).toEqual(['idea', 'idea', 'apply']);
    for (const l of LEVELS) {
      expect(keep(l), `level ${l}`).toEqual(keep(0));
      expect(keep(l).some((b) => b.clamped || !b.skeleton)).toBe(false);
    }
  });
  it('level 8 cuts Why it works to its first paragraph, whole, ending with a link to the rest', () => {
    const b = cardBlocks(card, 8);
    const why = where(b, 'why');
    expect(joined(why)).toBe(card.why![0]);
    expect(links(why)).toEqual(['Why it works ›']);
    expect(why.at(-1)).toMatchObject({ kind: 'text', more: { sec: 'why' } });
    expect(why.every((x) => x.clamped && !x.skeleton)).toBe(true);
    // Everything else is level 7.
    expect(b.filter((x) => x.sec !== 'why')).toEqual(cardBlocks(card, 7).filter((x) => x.sec !== 'why'));
  });
  it('level 8 has no link when Why it works is a single paragraph', () => {
    const one: AgenticCard = { ...card, why: [card.why![0]!] };
    expect(links(where(cardBlocks(one, 8), 'why'))).toEqual([]);
    expect(joined(where(cardBlocks(one, 8), 'why'))).toBe(one.why![0]);
  });
  it('level 9 reduces Why it works to the link alone', () => {
    const why = where(cardBlocks(card, 9), 'why');
    expect(why).toHaveLength(1);
    expect(why[0]).toMatchObject({ kind: 'more', zone: 'left', more: { sec: 'why', label: 'Why it works ›' }, clamped: true });
    expect(where(cardBlocks({ ...card, why: undefined }, 9), 'why')).toEqual([]);
  });
  it('never adds text: each level has no more words than the one before', () => {
    const words = (l: number) => cardBlocks(card, l).filter((b) => b.kind !== 'links' && b.kind !== 'more').map(textOf).join(' ').split(/\s+/).filter(Boolean).length;
    for (let l = 1; l <= MAX_LEVEL; l++) expect(words(l), `level ${l}`).toBeLessThanOrEqual(words(l - 1));
    expect(words(6)).toBeLessThan(words(0));
    expect(words(9)).toBeLessThan(words(7));
  });
  it('leaves out empty sections and their links', () => {
    const bare: AgenticCard = { title: 'T', sources: [], idea: ['Only an idea.'], apply: { label: 'Our adaptation', text: 'Try.' } };
    for (const l of LEVELS) {
      const b = cardBlocks(bare, l);
      expect(b.map((x) => x.sec), `level ${l}`).toEqual(['idea', 'apply']);
    }
  });
});

describe('sectionBlocks', () => {
  it('has the whole of each section', () => {
    expect(joined(sectionBlocks(card, 'stories'))).toContain(s(4, 'One'));
    expect(sectionBlocks(card, 'method').filter((b) => b.kind === 'step')).toHaveLength(6);
    expect(sectionBlocks(card, 'limits').map(textOf)).toEqual([s(3, 'Limit'), 'Another limit paragraph.']);
    expect(joined(sectionBlocks(card, 'tension'))).toBe(s(3, 'Tense'));
    expect(sectionBlocks(card, 'quotes').map(textOf)).toEqual(['Second quote.', 'Third quote.']);
  });
  it('starts the conversation at line 2, or at line 1 when the card cut it', () => {
    expect(sectionBlocks(card, 'conversation').map(textOf)).toEqual(['two', 'three']);
    expect(sectionBlocks(card, 'conversation', true).map(textOf)).toEqual(['one', 'two', 'three']);
  });
  it('drops headings the view already says, and keeps where a story comes from', () => {
    expect(sectionBlocks(card, 'limits').every((b) => !('head' in b && b.head))).toBe(true);
    expect(sectionBlocks(card, 'conversation').every((b) => !('head' in b && b.head))).toBe(true);
    expect(sectionBlocks(card, 'stories')[0]).toMatchObject({ head: { label: 'Story', em: 'Book One' } });
  });
  it('has the whole of Why it works, without its heading', () => {
    const w = sectionBlocks(card, 'why');
    expect(w.map(textOf)).toEqual(card.why!.flatMap((t) => splitText(t)));
    expect(w.every((b) => !('head' in b && b.head) && !b.skeleton)).toBe(true);
    expect(sectionBlocks({ ...card, why: undefined }, 'why')).toEqual([]);
  });
  it('flows everything', () => {
    for (const sec of SECTIONS) expect(sectionBlocks(card, sec).every((b) => b.zone === 'rest' && !b.clamped), sec).toBe(true);
  });
  it('lists the sections that have something', () => {
    expect(sectionsOf(card)).toEqual([...SECTIONS]);
    expect(SECTIONS[0]).toBe('why');
    expect(sectionsOf({ ...card, stories: [], tension: undefined, quotes: [card.quotes![0]!], conversation: [card.conversation![0]!] })).toEqual(['why', 'method', 'limits']);
    expect(sectionsOf(undefined)).toEqual([]);
  });
});

// Metrics: every block 20px high with 4px of padding on top, unless said.
const flat = (n: number, h = 20): Metric[] => Array.from({ length: n }, () => ({ h, top: 4 }));
const zones = (spec: string): Zone[] => [...spec].map((c) => (c === 'L' ? 'left' : c === 'R' ? 'right' : 'rest'));

describe('flowBlocks', () => {
  it('counts a column without the padding above its first block', () => {
    expect(columnHeight(flat(3), [0, 1, 2])).toBe(56);
    expect(columnHeight(flat(3), [])).toBe(0);
  });
  it('fills the first column with the stream, then the last one below its start', () => {
    // L L R, then 6 more blocks: the first column holds 76px = 16 + 3 × 20.
    const f = flowBlocks(zones('LLRrrrrrr'), flat(9), 76, 2);
    expect(f.left).toEqual([0, 1, 3, 4]);
    expect(f.right).toEqual([2, 5, 6, 7, 8]);
    expect(f.fits).toBe(false);
    expect(flowBlocks(zones('LLRrrrrrr'), flat(9), 96, 2).fits).toBe(true);
  });
  it('lets Idea and Why it works run on into the next column, in order, after With your agent', () => {
    // Four left blocks (a long Idea and Why), R, then rest. Height 56 holds 3 blocks.
    const f = flowBlocks(zones('LLLLRrr'), flat(7), 56, 2);
    expect(f.left).toEqual([0, 1, 2]);
    expect(f.right).toEqual([4, 3, 5, 6]);
    expect(f.right[0]).toBe(4);
    expect(f.fits).toBe(false);
    const g = flowBlocks(zones('LLLLRrr'), flat(7), 76, 2);
    expect(g.left).toEqual([0, 1, 2, 3]);
    expect(g.right).toEqual([4, 5, 6]);
    expect(g.fits).toBe(true);
  });
  it('keeps reading order: a small block later never goes back to the first column', () => {
    const m: Metric[] = [{ h: 50, top: 0 }, { h: 50, top: 0 }, { h: 80, top: 0 }, { h: 10, top: 0 }];
    const f = flowBlocks(zones('LRrr'), m, 100, 2);
    expect(f.left).toEqual([0]);
    expect(f.right).toEqual([1, 2, 3]);
  });
  it('does not fit when a skeleton column is too tall by itself', () => {
    expect(flowBlocks(zones('LLR'), flat(3, 60), 100, 2).fits).toBe(false);
  });
  it('puts one column in reading order: left, right, then the rest', () => {
    const f = flowBlocks(zones('LRrLr'), flat(5), 1000, 1);
    expect(f.left).toEqual([0, 3, 1, 2, 4]);
    expect(f.right).toEqual([]);
    expect(f.fits).toBe(true);
    expect(flowBlocks(zones('LRrLr'), flat(5), 60, 1).fits).toBe(false);
  });
  it('fills three columns in turn, the third starting with With your agent', () => {
    // L L R, then 8 more blocks. Height 76 holds 4 blocks (16 + 20 + 20 + 20).
    const f = flowBlocks(zones('LLRrrrrrrrr'), flat(11), 76, 3);
    expect(f.left).toEqual([0, 1, 3, 4]);
    expect(f.right).toEqual([5, 6, 7, 8]);
    expect(f.third).toEqual([2, 9, 10]);
    expect(f.fits).toBe(true);
    expect(f.usedThird).toBe(56);
  });
  it('three columns keep reading order and leave the middle one empty when two are enough', () => {
    const f = flowBlocks(zones('LLRrr'), flat(5), 1000, 3);
    expect(f.third).toEqual([2]);
    expect(f.right).toEqual([]);
    expect(f.left).toEqual([0, 1, 3, 4]);
    const g = flowBlocks(zones('LRrr'), [{ h: 50, top: 0 }, { h: 50, top: 0 }, { h: 80, top: 0 }, { h: 10, top: 0 }], 100, 3);
    expect(g.left).toEqual([0]);
    expect(g.right).toEqual([2, 3]);
    expect(g.third).toEqual([1]);
  });
  it('is the same with three columns as with two when nothing reaches the middle one', () => {
    const z = zones('LLRrrrr');
    const two = flowBlocks(z, flat(7), 200, 2);
    const three = flowBlocks(z, flat(7), 200, 3);
    expect(three.left).toEqual(two.left);
    expect(three.third).toEqual(two.right);
    expect(three.right).toEqual([]);
  });
  it('always lists every block once, whatever the column count', () => {
    for (const columns of [1, 2, 3] as const) {
      const f = flowBlocks(zones('LLLRrrrrrrrr'), flat(12), 70, columns);
      expect([...f.left, ...f.right, ...f.third].sort((a, b) => a - b)).toEqual(flat(12).map((_, i) => i));
    }
  });
  it('is empty for no blocks', () => {
    expect(flowBlocks([], [], 100, 2)).toEqual({ left: [], right: [], third: [], usedLeft: 0, usedRight: 0, usedThird: 0, fits: true });
  });
});

describe('chooseLevel', () => {
  // Level k has the skeleton (2 left, 1 right) and 8 - k rest blocks, 20px each (none from level 8 on).
  const levels: Measured[] = Array.from({ length: 10 }, (_, k) => ({ zones: zones(`LLR${'r'.repeat(Math.max(0, 8 - k))}`), metrics: flat(3 + Math.max(0, 8 - k)) }));
  it('takes the first level that fits', () => {
    expect(chooseLevel(levels, 1000, 2)).toMatchObject({ level: 0, overflow: false });
    const c = chooseLevel(levels, 60, 2);
    expect(c.overflow).toBe(false);
    expect(c.level).toBeGreaterThan(0);
    const before = flowBlocks(levels[c.level - 1]!.zones, levels[c.level - 1]!.metrics, 60, 2);
    expect(before.fits).toBe(false);
    expect(c.flow.fits).toBe(true);
  });
  it('goes down the ladder in order and never skips a level that fits', () => {
    for (const h of [30, 40, 56, 76, 96, 116, 136, 200, 400]) {
      const c = chooseLevel(levels, h, 2);
      for (let l = 0; l < c.level; l++) expect(flowBlocks(levels[l]!.zones, levels[l]!.metrics, h, 2).fits, `h=${h} l=${l}`).toBe(false);
    }
  });
  // Levels below `from` are too tall; `from` and later are a skeleton that fits.
  const from = (n: number): Measured[] => levels.map((_, k) => (k < n ? { zones: zones('LLRR'), metrics: [...flat(3), { h: 70, top: 4 }] } : { zones: zones('LLR'), metrics: flat(3) }));
  it('uses level 7 only when level 6 does not fit', () => {
    expect(chooseLevel(from(7), 60, 2)).toMatchObject({ level: 7, overflow: false });
  });
  it('uses level 8 only when level 7 does not fit, and level 9 only when 8 does not fit', () => {
    expect(chooseLevel(from(8), 60, 2)).toMatchObject({ level: 8, overflow: false });
    expect(chooseLevel(from(9), 60, 2)).toMatchObject({ level: 9, overflow: false });
  });
  it('shows level 9 and says overflow when even that does not fit', () => {
    const tall: Measured[] = levels.map(() => ({ zones: zones('LLR'), metrics: flat(3, 100) }));
    const c = chooseLevel(tall, 150, 2);
    expect(c).toMatchObject({ level: 9, overflow: true });
    expect(c.flow.fits).toBe(false);
  });
});

describe('paginateColumns', () => {
  it('fills a column, then the next one, then the next page', () => {
    const pages = paginateColumns(flat(9), 56, 2);
    expect(pages.map((p) => [p.left.length, p.right.length])).toEqual([[3, 3], [3, 0]]);
    expect(pages.flatMap((p) => [...p.left, ...p.right])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('is one column per page with one column', () => {
    const pages = paginateColumns(flat(5), 56, 1);
    expect(pages.map((p) => [p.left.length, p.right.length])).toEqual([[3, 0], [2, 0]]);
  });
  it('gives a block taller than a column a column of its own', () => {
    const m = [{ h: 20, top: 0 }, { h: 500, top: 0 }, { h: 20, top: 0 }];
    expect(paginateColumns(m, 100, 2)).toEqual([{ left: [0], right: [1], third: [] }, { left: [2], right: [], third: [] }]);
  });
  it('fills three columns on a page, then the next page', () => {
    const pages = paginateColumns(flat(11), 56, 3);
    expect(pages.map((p) => [p.left.length, p.right.length, p.third.length])).toEqual([[3, 3, 3], [2, 0, 0]]);
    expect(pages.flatMap((p) => [...p.left, ...p.right, ...p.third])).toEqual(flat(11).map((_, i) => i));
  });
  it('is no pages for no blocks', () => {
    expect(paginateColumns([], 100, 2)).toEqual([]);
  });
  it('keeps every block exactly once, in order, and every column within the height', () => {
    const m = Array.from({ length: 40 }, (_, i) => ({ h: 20 + (i % 5) * 9, top: 4 }));
    const pages = paginateColumns(m, 150, 2);
    expect(pages.flatMap((p) => [...p.left, ...p.right])).toEqual(m.map((_, i) => i));
    for (const p of pages) for (const c of [p.left, p.right]) expect(columnHeight(m, c)).toBeLessThanOrEqual(150);
  });
});

describe('readNext', () => {
  const c = (id: string, theses: string[], bookIds: string[], startHere = false) => ({ id, theses, bookIds, ...(startHere ? { startHere: true } : {}) });
  const all = [
    c('a', ['1', '2'], ['b1']),
    c('b', ['2'], ['b2']),
    c('c', ['1'], ['b2']),
    c('d', ['1'], ['b1']),
    c('e', ['1'], ['b3'], true),
    c('f', ['1', '3'], ['b9']),
    c('g', ['3'], ['b1']),
    c('h', ['1'], ['b1'], true),
    c('i', ['1'], ['b1']),
  ];
  it('offers concepts that share the first theme, never the card itself', () => {
    const ids = readNext(all, 'a', 'b1', 99).map((x) => x.id);
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('b');
    expect(ids).not.toContain('g');
    expect(new Set(ids)).toEqual(new Set(['c', 'd', 'e', 'f', 'h', 'i']));
  });
  it('puts "start here" first, then the same book, then data order', () => {
    expect(readNext(all, 'a', 'b1', 99).map((x) => x.id)).toEqual(['e', 'h', 'd', 'i', 'c', 'f']);
  });
  it('gives up to three by default', () => {
    expect(readNext(all, 'a', 'b1').map((x) => x.id)).toEqual(['e', 'h', 'd']);
  });
  it('reads the same book as the one the card is shown in', () => {
    expect(readNext(all, 'a', 'b2').map((x) => x.id)).toEqual(['e', 'h', 'c']);
  });
  it('is empty without a theme or when nothing else shares it', () => {
    expect(readNext([c('x', [], ['b'])], 'x', 'b')).toEqual([]);
    expect(readNext([c('x', ['9'], ['b']), c('y', ['8'], ['b'])], 'x', 'b')).toEqual([]);
    expect(readNext(all, 'nope', 'b1')).toEqual([]);
  });
});

describe('the real cards', () => {
  const cards = JSON.parse(readFileSync('public/data/agentic-cards.json', 'utf8')) as Record<string, AgenticCard>;
  const data = JSON.parse(readFileSync('public/data/agentic.json', 'utf8')) as Agentic;
  const norm = (t: string) => splitSentences(t).join(' ');

  it('all build into blocks at every level, each with a lead', () => {
    for (const concept of data.concepts) {
      const c = cards[concept.id];
      expect(c, concept.id).toBeDefined();
      expect(lead(c, concept.summary).text.length, concept.id).toBeGreaterThan(0);
      for (const l of LEVELS) {
        const blocks = cardBlocks(c, l);
        expect(blocks.some((b) => b.skeleton), `${concept.id} L${l}`).toBe(true);
        for (const b of blocks) if (b.kind === 'text') expect(b.text.length, concept.id).toBeLessThan(MAX_RUN * 3);
      }
    }
  });
  it('lead: the first quote, or the summary for the cards without one', () => {
    const without = data.concepts.filter((x) => !cards[x.id]?.quotes?.length);
    expect(without).toHaveLength(10);
    for (const x of without) expect(lead(cards[x.id], x.summary)).toEqual({ kind: 'summary', text: x.summary });
    for (const x of data.concepts.filter((y) => cards[y.id]?.quotes?.length)) expect(lead(cards[x.id], x.summary).text).toBe(cards[x.id]!.quotes![0]!.text);
  });
  it('never clamps the skeleton and cuts only on sentence ends, with a link for every cut', () => {
    for (const concept of data.concepts) {
      const c = cards[concept.id]!;
      const full = cardBlocks(c, 0);
      for (const l of LEVELS) {
        const b = cardBlocks(c, l);
        const keep = (x: Block) => x.sec === 'idea' || x.sec === 'apply';
        expect(b.filter(keep), `${concept.id} L${l}`).toEqual(full.filter(keep));
        if (l < 8) expect(b.filter((x) => x.skeleton), `${concept.id} L${l}`).toEqual(full.filter((x) => x.skeleton));
        // Each cut section is a prefix, in whole sentences, of its full text.
        for (const sec of ['stories', 'limits', 'tension'] as const) {
          const cut = joined(where(b, sec));
          const orig = norm(joined(where(full, sec)));
          if (l === 0 || !cut) continue;
          const parts = where(b, sec).filter((x) => x.kind === 'text');
          expect(parts.length).toBeGreaterThan(0);
          for (const part of parts) expect(orig.includes(textOf(part)), `${concept.id} ${sec} L${l}`).toBe(true);
          if (where(b, sec).some((x) => x.clamped)) expect(links(where(b, sec)).length, `${concept.id} ${sec} L${l}`).toBeGreaterThan(0);
        }
        for (const x of b) if (x.clamped && x.kind !== 'links') expect(links(b.filter((y) => y.sec === x.sec)).length, `${concept.id} ${x.id} L${l}`).toBeGreaterThan(0);
      }
    }
  });
  it('shrinks level by level and ends in links', () => {
    for (const concept of data.concepts) {
      const c = cards[concept.id]!;
      const size = (l: number) => cardBlocks(c, l).filter((b) => b.kind !== 'links' && b.kind !== 'more').map(textOf).join(' ').length;
      for (let l = 1; l <= MAX_LEVEL; l++) expect(size(l), `${concept.id} L${l}`).toBeLessThanOrEqual(size(l - 1));
      expect(cardBlocks(c, 6).filter((b) => b.zone === 'rest').every((b) => b.kind === 'links'), concept.id).toBe(true);
    }
  });
  it('has a section view for everything the ladder links to', () => {
    for (const concept of data.concepts) {
      const c = cards[concept.id]!;
      const have = new Set(sectionsOf(c));
      for (const l of LEVELS) for (const b of cardBlocks(c, l)) for (const label of links([b])) expect(label.length).toBeGreaterThan(0);
      for (const l of [8, 9]) for (const b of where(cardBlocks(c, l), 'why')) for (const m of [b.kind === 'more' ? b.more : undefined, b.kind === 'text' ? b.more : undefined]) if (m) expect(have.has(m.sec), `${concept.id} ${m.sec}`).toBe(true);
      for (const b of cardBlocks(c, 6)) if (b.kind === 'links') for (const link of b.links) expect(have.has(link.sec), `${concept.id} ${link.sec}`).toBe(true);
    }
  });
  it('start-here concepts are marked in the data', () => {
    expect(data.concepts.filter((x) => x.startHere)).toHaveLength(35);
  });
  it('read next gives up to three others on the first theme, for every concept', () => {
    for (const x of data.concepts) {
      const next = readNext(data.concepts, x.id, x.bookIds[0]!);
      expect(next.length).toBeLessThanOrEqual(3);
      expect(next.some((n) => n.id === x.id)).toBe(false);
      for (const n of next) expect(n.theses).toContain(x.theses[0]);
    }
  });
});

describe('chooseColumns', () => {
  // Level 0: two left blocks, one right, and some rest blocks, 20px each (the first of a column loses its 4px of padding).
  const l0 = (rest: number): Measured => ({ zones: zones(`LLR${'r'.repeat(rest)}`), metrics: flat(3 + rest) });
  it('uses two columns for a short card, so the third does not stay empty', () => {
    const m = l0(1);
    expect(chooseColumns({ 2: m, 3: m }, 200, 3)).toBe(2);
    // Even a card that would fit in one column uses two on a desktop screen, never one.
    expect(chooseColumns({ 2: l0(0), 3: l0(0) }, 1000, 3)).toBe(2);
  });
  it('takes three when two do not hold the whole card, if three do', () => {
    // 10 blocks: two columns need about 5 * 20 + 4, 3 columns about 3 * 20 + 4.
    const m = l0(7);
    const two = flowBlocks(m.zones, m.metrics, 90, 2);
    const three = flowBlocks(m.zones, m.metrics, 90, 3);
    expect(two.fits).toBe(false);
    expect(three.fits).toBe(true);
    expect(chooseColumns({ 2: m, 3: m }, 90, 3)).toBe(3);
  });
  it('takes three, and the clamp ladder after, when neither fits at level 0', () => {
    const m = l0(30);
    expect(chooseColumns({ 2: m, 3: m }, 90, 3)).toBe(3);
  });
  it('is two when the box has room for no more, whatever fits', () => {
    const m = l0(30);
    expect(chooseColumns({ 2: m }, 90, 2)).toBe(2);
    expect(chooseColumns({ 2: l0(0), 3: l0(0) }, 1000, 2)).toBe(2);
  });
  it('is decided by the fewest columns that fit, not by the most room', () => {
    for (const rest of [0, 1, 2, 3, 5, 8, 12]) {
      for (const h of [60, 90, 120, 200, 400]) {
        const m = l0(rest);
        const n = chooseColumns({ 2: m, 3: m }, h, 3);
        if (n === 3) expect(flowBlocks(m.zones, m.metrics, h, 2).fits, `rest=${rest} h=${h}`).toBe(false);
        else expect(flowBlocks(m.zones, m.metrics, h, 2).fits).toBe(true);
      }
    }
  });
});
