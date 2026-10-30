import { describe, expect, it } from 'vitest';
import { BOARD_KEY, livePins, loadPins, pageCount, savePins, stepTo, togglePin } from '../src/lib/board.ts';

const memory = (init: Record<string, string> = {}) => {
  const data = { ...init };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe('loadPins', () => {
  it('is empty with nothing saved or no storage', () => {
    expect(loadPins(memory())).toEqual([]);
    expect(loadPins(null)).toEqual([]);
  });
  it('reads the saved ids in order', () => {
    expect(loadPins(memory({ [BOARD_KEY]: '["b","a"]' }))).toEqual(['b', 'a']);
  });
  it('shrugs off bad JSON, the wrong shape and stray values', () => {
    expect(loadPins(memory({ [BOARD_KEY]: '{oops' }))).toEqual([]);
    expect(loadPins(memory({ [BOARD_KEY]: '{"a":1}' }))).toEqual([]);
    expect(loadPins(memory({ [BOARD_KEY]: '["a",3,null,"a","b"]' }))).toEqual(['a', 'b']);
  });
  it('copes with storage that throws', () => {
    expect(loadPins({ getItem: () => { throw new Error('blocked'); } })).toEqual([]);
  });
});

describe('savePins', () => {
  it('round-trips through the storage key', () => {
    const m = memory();
    savePins(m, ['x', 'y']);
    expect(m.data[BOARD_KEY]).toBe('["x","y"]');
    expect(loadPins(m)).toEqual(['x', 'y']);
  });
  it('does not throw when storage is full or missing', () => {
    expect(() => savePins({ setItem: () => { throw new Error('quota'); } }, ['a'])).not.toThrow();
    expect(() => savePins(null, ['a'])).not.toThrow();
  });
});

describe('togglePin', () => {
  it('appends a new id and removes a pinned one', () => {
    expect(togglePin(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePin(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('does not change its input', () => {
    const pins = ['a'];
    togglePin(pins, 'b');
    expect(pins).toEqual(['a']);
  });
});

describe('livePins and pageCount', () => {
  it('drops ids that name no concept', () => {
    expect(livePins(['a', 'gone', 'b'], (id) => id !== 'gone')).toEqual(['a', 'b']);
  });
  it('counts pages, at least one', () => {
    expect(pageCount(0, 12)).toBe(1);
    expect(pageCount(12, 12)).toBe(1);
    expect(pageCount(13, 12)).toBe(2);
  });
});

describe('stepTo', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('moves to the next and previous item', () => {
    expect(stepTo(list, 'b', 1)?.id).toBe('c');
    expect(stepTo(list, 'b', -1)?.id).toBe('a');
  });
  it('stops at either end', () => {
    expect(stepTo(list, 'c', 1)?.id).toBe('c');
    expect(stepTo(list, 'a', -1)?.id).toBe('a');
  });
  it('starts from the first item when the id is unknown or missing', () => {
    expect(stepTo(list, 'zzz', 1)?.id).toBe('b');
    expect(stepTo(list, undefined, 1)?.id).toBe('b');
  });
  it('has nothing to step to in an empty list', () => {
    expect(stepTo([], 'a', 1)).toBeUndefined();
  });
});
