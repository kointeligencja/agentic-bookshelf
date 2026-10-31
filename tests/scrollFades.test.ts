import { describe, expect, it } from 'vitest';
import { scrollFades } from '../src/lib/scrollFades.ts';

describe('scrollFades', () => {
  it('has no fade when everything fits', () => {
    expect(scrollFades(0, 300, 300)).toEqual({ start: false, end: false });
    expect(scrollFades(0, 300, 301.5)).toEqual({ start: false, end: false });
  });
  it('fades the right edge at the start of a row that scrolls', () => {
    expect(scrollFades(0, 300, 900)).toEqual({ start: false, end: true });
  });
  it('fades both edges in the middle', () => {
    expect(scrollFades(250, 300, 900)).toEqual({ start: true, end: true });
  });
  it('fades the left edge at the end', () => {
    expect(scrollFades(600, 300, 900)).toEqual({ start: true, end: false });
    expect(scrollFades(599.2, 300, 900)).toEqual({ start: true, end: false });
  });
  it('ignores a fraction of a pixel from an end', () => {
    expect(scrollFades(1, 300, 900)).toEqual({ start: false, end: true });
  });
});
