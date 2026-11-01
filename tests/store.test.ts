import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store.ts';
import type { Agentic, Library } from '../src/types.ts';

const agentic = { concepts: [{ id: 'a', name: 'A', bookIds: ['b3'], theses: ['1'], summary: '', status: '' }] } as unknown as Agentic;
const library = { books: [{ id: 'b1', category: 'ai' }, { id: 'b2', category: 'ai' }, { id: 'b3', category: 'mind' }] } as unknown as Library;

describe('category and theme share the lit books', () => {
  beforeEach(() => {
    useStore.setState({ library, agentic, theme: null, category: null, lit: {}, searching: false });
  });
  it('a category lights its books and turns the theme off', () => {
    useStore.getState().setTheme('1');
    expect(useStore.getState().lit).toEqual({ b3: 1 });
    useStore.getState().setCategory('ai');
    expect(useStore.getState()).toMatchObject({ category: 'ai', theme: null, lit: { b1: 1, b2: 1 } });
  });
  it('a theme turns the category off', () => {
    useStore.getState().setCategory('ai');
    useStore.getState().setTheme('1');
    expect(useStore.getState()).toMatchObject({ category: null, theme: '1', lit: { b3: 1 } });
  });
  it('clearing the category puts the room back to dark', () => {
    useStore.getState().setCategory('ai');
    useStore.getState().setCategory(null);
    expect(useStore.getState().lit).toEqual({});
  });
  it('a search owns the glow; when it ends the category is lit again', () => {
    useStore.getState().setCategory('mind');
    useStore.getState().setSearchLit({ b1: 0.5 });
    expect(useStore.getState().lit).toEqual({ b1: 0.5 });
    useStore.getState().setSearchLit(null);
    expect(useStore.getState().lit).toEqual({ b3: 1 });
  });
});
