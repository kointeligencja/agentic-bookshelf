import { describe, expect, it } from 'vitest';
import { bookScores, GATE_MIN, GLOW_FLOOR, glow, searchable, SHOWN_MIN, shownResults } from '../src/lib/search.ts';

const books: Record<string, string[]> = { c1: ['b1', 'b2'], c2: ['b2'], c3: ['b3'], c4: ['b4'] };
const of = (id: string) => books[id] ?? [];

describe('bookScores', () => {
  it('adds a book\'s concepts up in the quick pass', () => {
    expect(bookScores([{ id: 'c1', p: 0.4 }, { id: 'c2', p: 0.3 }], of, true)).toEqual({ b1: 0.4, b2: 0.7 });
  });
  it('takes the best concept in the careful pass', () => {
    expect(bookScores([{ id: 'c1', p: 0.4 }, { id: 'c2', p: 0.9 }], of, false)).toEqual({ b1: 0.4, b2: 0.9 });
  });
  it('ignores concepts with no books', () => {
    expect(bookScores([{ id: 'zz', p: 1 }], of, true)).toEqual({});
  });
});

describe('glow', () => {
  it('gives the strongest book 1 and scales the rest between the floor and 1', () => {
    const lit = glow({ b1: 0.5, b2: 1, b3: 0.75 });
    expect(lit.b2).toBe(1);
    expect(lit.b1).toBeCloseTo(GLOW_FLOOR + (1 - GLOW_FLOOR) * 0.5);
    expect(lit.b3).toBeGreaterThan(lit.b1!);
  });
  it('never goes under the floor or over 1', () => {
    for (const v of Object.values(glow({ a: 1, b: 0.1, c: 0.5, d: 0.0001 }))) {
      expect(v).toBeGreaterThanOrEqual(GLOW_FLOOR);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it('leaves a book dark when it is a small fraction of the strongest', () => {
    expect(glow({ a: 1, b: 0.05 })).toEqual({ a: 1 });
  });
  it('lights nothing for no scores or all zeros', () => {
    expect(glow({})).toEqual({});
    expect(glow({ a: 0 })).toEqual({});
  });
});

describe('shownResults', () => {
  it(`lists concepts from ${SHOWN_MIN} up`, () => {
    const r = shownResults([{ id: 'a', p: 0.9 }, { id: 'b', p: SHOWN_MIN }, { id: 'c', p: 0.29 }]);
    expect(r.items.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.closest).toBe(false);
  });
  it('falls back to the closest three when none clear it', () => {
    const r = shownResults([1, 2, 3, 4].map((i) => ({ id: `c${i}`, p: 0.2 / i })));
    expect(r.items).toHaveLength(3);
    expect(r.closest).toBe(true);
  });
});

describe('searchable and the gate', () => {
  it('needs three characters', () => {
    expect(searchable('ab')).toBe(false);
    expect(searchable('  ab ')).toBe(false);
    expect(searchable('abc')).toBe(true);
  });
  it('gates below 0.25', () => {
    expect(GATE_MIN).toBe(0.25);
  });
});
