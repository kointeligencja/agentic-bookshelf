import { describe, expect, it } from 'vitest';
import { contrast, luminance, MIN_CONTRAST, PAPER, parseHex, readableOn, rgba, tintOf, toHex } from '../src/lib/accent.ts';

describe('contrast', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#336699', '#336699')).toBeCloseTo(1, 5);
  });
  it('does not depend on the order', () => {
    expect(contrast('#1d93e1', PAPER)).toBeCloseTo(contrast(PAPER, '#1d93e1'), 10);
  });
  it('has the luminance of white 1 and of black 0', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000')).toBe(0);
  });
});

describe('hex', () => {
  it('parses 3 and 6 digit colours and writes them back', () => {
    expect(parseHex('#1d93e1')).toEqual([29, 147, 225]);
    expect(parseHex('#fc0')).toEqual([255, 204, 0]);
    expect(toHex([29, 147, 225])).toBe('#1d93e1');
    expect(toHex([300, -4, 0.4])).toBe('#ff0000');
  });
  it('writes rgba with an opacity', () => {
    expect(rgba('#1d93e1', 0.09)).toBe('rgba(29, 147, 225, 0.09)');
  });
});

describe('readableOn', () => {
  it('leaves a colour that already has 4.5:1 on the paper alone', () => {
    expect(readableOn('#0c3957')).toBe('#0c3957');
    expect(readableOn('#7F6226')).toBe('#7f6226');
  });
  it('darkens the Socrates blue until it has 4.5:1 on the paper, keeping its hue', () => {
    const out = readableOn('#1d93e1');
    expect(contrast('#1d93e1', PAPER)).toBeLessThan(MIN_CONTRAST);
    expect(contrast(out, PAPER)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    const [r, g, b] = parseHex(out);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThanOrEqual(g);
  });
  it('stops as soon as it is readable: one step less is not', () => {
    const out = readableOn('#e8c840');
    expect(contrast(out, PAPER)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrast(out, PAPER)).toBeLessThan(MIN_CONTRAST + 0.6);
  });
  it('makes pale and bright colours readable', () => {
    for (const hex of ['#ffff00', '#ffffff', '#f2c66d', '#ff9a8c', '#9bd1ff', '#cccccc']) expect(contrast(readableOn(hex), PAPER), hex).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
  it('works against another background and another minimum', () => {
    expect(contrast(readableOn('#1d93e1', '#ffffff', 7), '#ffffff')).toBeGreaterThanOrEqual(7);
  });
  it('every book in the library gets a readable accent', async () => {
    const { readFileSync } = await import('node:fs');
    const lib = JSON.parse(readFileSync('public/data/books.json', 'utf8')) as { books: { id: string; palette: { accent: string } }[] };
    for (const b of lib.books) expect(contrast(readableOn(b.palette.accent), PAPER), b.id).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});

describe('tintOf', () => {
  it('is a light colour of the same hue, not grey', () => {
    const [r, , b] = parseHex(tintOf('#1d93e1'));
    expect(b).toBeGreaterThan(r + 15);
    expect(luminance(tintOf('#1d93e1'))).toBeGreaterThan(0.8);
  });
  it('every book accent reads on its own tint, and so does the ink', async () => {
    const { readFileSync } = await import('node:fs');
    const lib = JSON.parse(readFileSync('public/data/books.json', 'utf8')) as { books: { id: string; palette: { accent: string } }[] };
    for (const b of lib.books) {
      const tint = tintOf(b.palette.accent);
      // As the card makes it: readable on the tint, then on the paper.
      const accent = readableOn(readableOn(b.palette.accent, tint), PAPER);
      expect(contrast(accent, tint), b.id).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrast(accent, PAPER), b.id).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrast('#2b2620', tint), b.id).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});
