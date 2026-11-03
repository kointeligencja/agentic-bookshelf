import { describe, expect, it } from 'vitest';
import { cardToMarkdown, bookToMarkdown, topicToMarkdown, bulkToMarkdown, slugify } from '../src/lib/exportMarkdown.ts';
import type { Agentic, AgenticCard, AgenticConcept, Book } from '../src/types.ts';

const mockConcept: AgenticConcept = {
  id: 'test-concept',
  name: "Commander's Intent",
  summary: 'Give the reasons and the limits so people can adapt when the plan stops fitting',
  bookIds: ['b1'],
  theses: ['1'],
  status: '✓',
};

const mockCard: AgenticCard = {
  title: "Commander's Intent",
  subtitle: 'Give the reasons and the limits so people can adapt when the plan stops fitting',
  sources: [{ book: 'Clear Thinking', authors: 'Shane Parrish' }],
  idea: [
    "Commander's intent is a way of handing over a task so the other person can still act sensibly.",
    'The term comes from the military.',
  ],
  apply: {
    label: 'Our adaptation',
    text: 'Open each task for an agent with four lines: the goal, the reason, boundaries, and signs.',
  },
  why: ['Without it, the boss is a single point of failure.'],
  method: {
    source: 'Clear Thinking',
    intro: 'Four components:',
    steps: ['Formulate strategy.', 'Communicate rationale and limits.', 'Interpret situation.', 'Implement.'],
  },
  limits: ['Fails on ego default: insisting that everything is done your way.'],
  tension: 'Balancing autonomy with strategic alignment.',
  stories: [
    {
      source: 'Primed to Perform',
      text: 'In 1805, Nelson gave his captains discretion over targets at Trafalgar.',
    },
  ],
  quotes: [
    {
      text: 'Tell them not just what to do, but why to do it.',
      source: 'Shane Parrish, Clear Thinking',
      verified: true,
    },
  ],
  conversation: [
    {
      speaker: 'Lauren Tan',
      at: '41:37',
      at_s: 2497,
      text: 'this idea of context not control',
    },
  ],
};

const mockAgentic: Agentic = {
  video: { id: 'test-video', url: 'https://youtube.com', duration: 3600 },
  theses: [
    {
      key: '1',
      title: 'Passing on intent',
      line: 'Tell the other person why you made the decision and what is completely off the table.',
      clips: [{ start: 0, end: 100, label: 'Clip 1' }],
    },
  ],
  books: [{ id: 'b1', slug: 'clear-thinking', title: 'Clear Thinking', author: 'Shane Parrish' }],
  concepts: [mockConcept],
};

const mockBook: Book = {
  id: 'b1',
  title: 'Clear Thinking',
  author: 'Shane Parrish',
  shelf: 'read',
  favourite: false,
  rating: 5,
  avgRating: 4.5,
  dateRead: '2024-01-01',
  dateAdded: '2023-01-01',
  year: 2023,
  publisher: 'Penguin',
  pages: 280,
  pagesEstimated: false,
  binding: 'hardcover',
  dims: { h: 220, w: 145, t: 25 },
  palette: { dominant: '#222', accent: '#f5a623', text: '#fff' },
  category: 'thinking',
  secondaryCategory: null,
  coverUrl: '/covers/b1.jpg',
  coverPlaceholder: '',
  coverAspect: 1.5,
  spineAtlas: { sheet: 0, uv: [0, 0, 1, 1] },
  coverAtlas: { sheet: 0, uv: [0, 0, 1, 1] },
  links: { goodreads: '', amazon: '' },
};

describe('exportMarkdown', () => {
  it('slugifies titles safely', () => {
    expect(slugify("Commander's Intent")).toBe('commander-s-intent');
    expect(slugify('Café & Théâtre!')).toBe('cafe-theatre');
    expect(slugify('  Spaces   and -- dashes  ')).toBe('spaces-and-dashes');
  });

  it('serializes a concept card with 100% 1-to-1 fidelity', () => {
    const md = cardToMarkdown(mockConcept, mockCard, mockAgentic.theses, 1);

    expect(md).toContain("# Commander's Intent");
    expect(md).toContain('> Give the reasons and the limits so people can adapt when the plan stops fitting');
    expect(md).toContain('## With Your Agent');
    expect(md).toContain('Open each task for an agent with four lines');
    expect(md).toContain('## Core Idea');
    expect(md).toContain("Commander's intent is a way of handing over a task");
    expect(md).toContain('## Why It Works');
    expect(md).toContain('Without it, the boss is a single point of failure.');
    expect(md).toContain('## Method');
    expect(md).toContain('1. Formulate strategy.');
    expect(md).toContain('4. Implement.');
    expect(md).toContain('## Limits & Tension');
    expect(md).toContain('Fails on ego default');
    expect(md).toContain('**Tension:** Balancing autonomy with strategic alignment.');
    expect(md).toContain('## Real Examples & Stories');
    expect(md).toContain('### Primed to Perform');
    expect(md).toContain('In 1805, Nelson gave his captains discretion');
    expect(md).toContain('## Quotes');
    expect(md).toContain('> "Tell them not just what to do, but why to do it."');
    expect(md).toContain('## From the Conversation');
    expect(md).toContain('> "this idea of context not control"');
    expect(md).toContain('— **Lauren Tan** (41:37)');
  });

  it('exports cards for a book', () => {
    const cards = { [mockConcept.id]: mockCard };
    const md = bookToMarkdown(mockBook, mockAgentic, cards);

    expect(md).toContain('# Clear Thinking');
    expect(md).toContain('> By Shane Parrish');
    expect(md).toContain('1 concept card distilled');
    expect(md).toContain('## Table of Contents');
    expect(md).toContain("1. [Commander's Intent](#commander-s-intent)");
    expect(md).toContain("## Commander's Intent");
  });

  it('exports cards for a topic', () => {
    const cards = { [mockConcept.id]: mockCard };
    const md = topicToMarkdown('1', mockAgentic, cards);

    expect(md).toContain('# 1. Passing on intent');
    expect(md).toContain('> "Tell the other person why you made the decision and what is completely off the table."');
    expect(md).toContain('## Table of Contents');
    expect(md).toContain("## Commander's Intent");
  });

  it('exports all cards in bulk', () => {
    const cards = { [mockConcept.id]: mockCard };
    const md = bulkToMarkdown(mockAgentic, cards);

    expect(md).toContain('# The Agentic Bookshelf: Complete Knowledge Base');
    expect(md).toContain('## Topics Overview');
    expect(md).toContain('1. Passing on intent');
    expect(md).toContain("### Commander's Intent");
  });
});
