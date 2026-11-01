import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bookCounts, categoryLit, clock, litBooks, mapIds, themeAtTime, themeStart, timelineSegments } from '../src/lib/agentic.ts';
import { cardWidth, isReading, panelWidth, readingPanel, stripWidth } from '../src/lib/panel.ts';
import type { Agentic, AgenticThesis } from '../src/types.ts';

const theses: AgenticThesis[] = [
  { key: '1', title: 'One', line: '', clips: [{ start: 380, end: 503, label: 'main' }, { start: 242, end: 264, label: 'early' }] },
  { key: 'T', title: 'Trust', line: '', clips: [{ start: 89, end: 126, label: 'a' }, { start: 250, end: 300, label: 'overlaps one' }] },
];
const concepts: Agentic['concepts'] = [
  { id: 'a', name: 'A', bookIds: ['b1', 'b2'], theses: ['1', 'T'], summary: '', status: '✓' },
  { id: 'b', name: 'B', bookIds: ['b2', 'b3'], theses: ['1'], summary: '', status: '✓' },
  { id: 'c', name: 'C', bookIds: ['b4'], theses: ['T'], summary: '', status: '✓' },
];

describe('themeAtTime', () => {
  it('finds the theme whose clip holds the time, in any of its clips', () => {
    expect(themeAtTime(theses, 400)).toBe('1');
    expect(themeAtTime(theses, 241)).toBe(null);
    expect(themeAtTime(theses, 100)).toBe('T');
  });
  it('treats a clip as start-inclusive, end-exclusive', () => {
    expect(themeAtTime(theses, 380)).toBe('1');
    expect(themeAtTime(theses, 503)).toBe(null);
  });
  it('returns the first theme when clips overlap', () => {
    expect(themeAtTime(theses, 255)).toBe('1');
  });
  it('is null outside every clip', () => {
    expect(themeAtTime(theses, 0)).toBe(null);
    expect(themeAtTime([], 10)).toBe(null);
  });
});

describe('themeStart', () => {
  it('is the start of the first clip as listed, not the earliest', () => {
    expect(themeStart(theses[0]!)).toBe(380);
    expect(themeStart({ ...theses[0]!, clips: [] })).toBe(null);
  });
});

describe('litBooks', () => {
  it('lights every book with a concept that extends the theme', () => {
    expect(Object.keys(litBooks({ concepts }, '1')).sort()).toEqual(['b1', 'b2', 'b3']);
    expect(Object.keys(litBooks({ concepts }, 'T')).sort()).toEqual(['b1', 'b2', 'b4']);
  });
  it('lights nothing with no theme or an unknown one', () => {
    expect(litBooks({ concepts }, null)).toEqual({});
    expect(litBooks({ concepts }, 'zz')).toEqual({});
  });
  it('gives lit books full intensity', () => {
    expect(Object.values(litBooks({ concepts }, '1'))).toEqual([1, 1, 1]);
  });
  it('counts concepts per book', () => {
    expect(bookCounts({ concepts }, '1')).toEqual({ b1: 1, b2: 2, b3: 1 });
  });
});

describe('mapIds', () => {
  it('swaps slugs for ids, in order', () => {
    expect(mapIds({ x: '1', y: '2' }, ['y', 'x'])).toEqual(['2', '1']);
  });
  it('throws on an unknown slug', () => {
    expect(() => mapIds({ x: '1' }, ['x', 'nope'], 'concept c')).toThrow(/nope.*concept c/);
  });
  it('covers every book and concept in the real data', () => {
    const read = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
    const src = read<{ books: { id: string }[]; concepts: { id: string; book_ids: string[] }[] }>('data/agentic.json');
    const ids = read<Record<string, string>>('data/agentic-ids.json');
    const library = read<{ books: { id: string }[] }>('public/data/books.json');
    const known = new Set(library.books.map((b) => b.id));
    for (const b of src.books) expect(known.has(mapIds(ids, [b.id])[0]!)).toBe(true);
    for (const c of src.concepts) mapIds(ids, c.book_ids, c.id);
  });
});

describe('clock', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65)).toBe('1:05');
    expect(clock(3936)).toBe('1:05:36');
  });
});

describe('panelWidth', () => {
  it('is 36% of the viewport between 360 and 500, never over 45%', () => {
    expect(panelWidth(1280)).toBe(461);
    expect(panelWidth(1440)).toBe(500);
    expect(panelWidth(900)).toBe(360);
    expect(panelWidth(600)).toBe(270);
  });
});

describe('cardWidth', () => {
  it('is 55% of the space right of the left panel on a big screen', () => {
    expect(cardWidth(1920)).toBe(Math.round((1920 - 500) * 0.55));
    expect(cardWidth(2560)).toBe(Math.round((2560 - 500) * 0.55));
  });
  it('is at least 600 on a laptop screen, so a card gets two columns', () => {
    expect(cardWidth(1280)).toBe(600);
    expect(cardWidth(1440)).toBe(600);
    expect(cardWidth(1512)).toBe(600);
  });
  it('leaves 200px for the book beside the left panel, down to 1100px wide', () => {
    for (const w of [1100, 1200, 1280, 1440, 1600, 1920]) expect(w - panelWidth(w) - cardWidth(w), `${w}`).toBeGreaterThanOrEqual(200);
    expect(cardWidth(1100)).toBe(704 - 200);
  });
  it('is the old 55% on a narrow screen', () => {
    expect(cardWidth(800)).toBe(Math.round((800 - 360) * 0.55));
  });
});

describe('reading mode', () => {
  it('starts at 900px; narrower screens get a full-width page', () => {
    expect(isReading(900)).toBe(true);
    expect(isReading(899)).toBe(false);
  });
  it('holds the book in the left quarter of the screen, 240px at least', () => {
    expect(stripWidth(900)).toBe(240);
    expect(stripWidth(1280)).toBe(320);
    expect(stripWidth(1440)).toBe(360);
    expect(stripWidth(2000)).toBe(500);
    for (const w of [900, 960, 1100, 1280, 1440, 1920, 2560]) expect(stripWidth(w), `${w}`).toBeGreaterThanOrEqual(240);
    for (const w of [1100, 1280, 1440, 1920, 2560]) expect(stripWidth(w) / w, `${w}`).toBe(Math.round(w * 0.25) / w);
  });
  it('puts the paper page right of the strip, to the edge of the screen', () => {
    for (const w of [900, 1280, 1440, 2000]) {
      const r = readingPanel(w);
      expect(r.left, `${w}`).toBe(r.strip);
      expect(r.left + r.width, `${w}`).toBe(w);
      expect(r.width / w, `${w}`).toBeGreaterThanOrEqual(0.7);
    }
  });
  it('centres the book in the strip, less wide than the strip', () => {
    for (const w of [900, 1280, 1440, 1920, 2560]) {
      const r = readingPanel(w);
      expect(r.bookCentre, `${w}`).toBe(r.strip / 2);
      expect(r.book, `${w}`).toBeLessThan(r.strip);
      expect(r.bookCentre - r.book / 2, `${w}`).toBeGreaterThanOrEqual(32);
    }
  });
});

describe('timelineSegments', () => {
  it('turns every clip into a mark placed as a share of the video', () => {
    const segs = timelineSegments(theses, 1000);
    expect(segs).toHaveLength(4);
    expect(segs[0]).toMatchObject({ theme: '1', title: 'One', start: 380, end: 503, left: 38 });
    expect(segs[0]!.width).toBeCloseTo(12.3);
  });
  it('clips marks to the video length and drops those past it', () => {
    const segs = timelineSegments(theses, 280);
    expect(segs.map((s) => [s.theme, s.start])).toEqual([['1', 242], ['T', 89], ['T', 250]]);
    expect(segs.find((s) => s.start === 250)!.end).toBe(280);
  });
  it('has no marks without a duration', () => {
    expect(timelineSegments(theses, 0)).toEqual([]);
  });
});

describe('categoryLit', () => {
  const books = [
    { id: 'b1', category: 'ai' },
    { id: 'b2', category: 'ai' },
    { id: 'b3', category: 'mind' },
  ];
  it('lights the books of the category at full intensity, as a theme does', () => {
    expect(categoryLit(books, 'ai')).toEqual({ b1: 1, b2: 1 });
    expect(categoryLit(books, 'ai')).toEqual(litBooks({ concepts: [{ ...concepts[0]!, theses: ['x'], bookIds: ['b1', 'b2'] }] }, 'x'));
  });
  it('lights nothing for no category or an unknown one', () => {
    expect(categoryLit(books, null)).toEqual({});
    expect(categoryLit(books, 'nope')).toEqual({});
  });
});
