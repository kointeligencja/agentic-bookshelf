import { create } from 'zustand';
import { litBooks, type Lit } from './lib/agentic.ts';
import { loadPins, savePins, togglePin } from './lib/board.ts';
import type { Agentic, AgenticCard, Library } from './types.ts';
import type { SortKey, View } from './scene/layout.ts';

export type FocusPhase = 'out' | 'open';

interface AppState {
  library: Library | null;
  setLibrary: (l: Library) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  view: View;
  setView: (v: View) => void;
  /** Camera dolly target along the wall, in mm. */
  targetX: number;
  setTargetX: (x: number) => void;
  /** Height the camera looks at; null means the framing default for the layout. */
  targetY: number | null;
  setTargetY: (y: number | null) => void;
  /** Distance of the camera from the wall, in mm. */
  distance: number;
  setDistance: (d: number) => void;
  /**
   * Where the left column's search pill starts and its theme card ends, in CSS pixels from the top of the window. The camera
   * frames the bookcase between them (scene/CameraRig.tsx). Null until the column is on screen.
   */
  wallBox: { top: number; bottom: number } | null;
  setWallBox: (box: { top: number; bottom: number } | null) => void;
  /** The conversation and how its themes map onto the books; null until loaded. */
  agentic: Agentic | null;
  setAgentic: (a: Agentic) => void;
  /** The active theme's key: a chip the visitor picked, or the one the video is on. */
  theme: string | null;
  /** Picks a theme (null clears it) and lights the books that extend it. */
  setTheme: (key: string | null) => void;
  /** The theme the video is playing right now, whether or not it is the active one. */
  playing: string | null;
  setPlaying: (key: string | null) => void;
  /**
   * Books lit by the active theme: id → intensity 0..1. While any are lit the room dims and they
   * get their spots. Replaced wholesale, never mutated, so a subscriber can compare references.
   */
  lit: Lit;
  setLit: (lit: Lit) => void;
  /** True while a search owns the glow. The theme (chip or video) then leaves `lit` alone. */
  searching: boolean;
  /** A search's glow, or null when it ends and the theme takes the shelf back. */
  setSearchLit: (lit: Lit | null) => void;
  /** The concept cards, keyed by concept id; null until loaded. */
  cards: Record<string, AgenticCard> | null;
  setCards: (c: Record<string, AgenticCard>) => void;
  /** Seeks the video; set by the theme panel, which owns the player. */
  seek: (seconds: number) => void;
  setSeek: (fn: (seconds: number) => void) => void;
  /** Concept ids the visitor pinned, in order. Kept in localStorage. */
  pins: string[];
  togglePin: (id: string) => void;
  boardOpen: boolean;
  setBoardOpen: (open: boolean) => void;
  /** Opens a concept's card in one of its books: the one already pulled out if it has it, else the first. */
  openConcept: (id: string) => void;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  /** The book pulled out of the shelf, if any. `closing` while it flies back to its slot. */
  focused: { id: string; phase: FocusPhase; closing: boolean } | null;
  /** The concept whose card the book panel shows; null means the first of the book's list. */
  concept: string | null;
  setConcept: (id: string | null) => void;
  focus: (id: string, concept?: string | null) => void;
  open: () => void;
  close: () => void;
  /** Called by the focus animation once the book is back in its slot. */
  settle: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  library: null,
  setLibrary: (library) => set({ library }),
  sort: 'dateRead',
  setSort: (sort) => set({ sort }),
  view: new URLSearchParams(location.search).get('view') === 'spines' ? 'spines' : 'covers',
  setView: (view) => set({ view, focused: null, hovered: null, targetX: 0, targetY: null }),
  targetX: 0,
  setTargetX: (targetX) => set({ targetX }),
  targetY: null,
  setTargetY: (targetY) => set({ targetY }),
  distance: 3000,
  setDistance: (distance) => set({ distance }),
  wallBox: null,
  setWallBox: (box) => {
    const b = get().wallBox;
    if (b && box && Math.abs(b.top - box.top) < 0.5 && Math.abs(b.bottom - box.bottom) < 0.5) return;
    set({ wallBox: box });
  },
  agentic: null,
  setAgentic: (agentic) => set({ agentic }),
  theme: null,
  setTheme: (theme) => {
    const a = get().agentic;
    set(get().searching ? { theme } : { theme, lit: a ? litBooks(a, theme) : {} });
  },
  playing: null,
  setPlaying: (playing) => set({ playing }),
  lit: {},
  setLit: (lit) => set({ lit }),
  searching: false,
  setSearchLit: (lit) => {
    if (lit) return set({ searching: true, lit });
    const { agentic: a, theme } = get();
    set({ searching: false, lit: a ? litBooks(a, theme) : {} });
  },
  cards: null,
  setCards: (cards) => set({ cards }),
  seek: () => {},
  setSeek: (seek) => set({ seek }),
  pins: loadPins(typeof localStorage === 'undefined' ? null : localStorage),
  togglePin: (id) => {
    const pins = togglePin(get().pins, id);
    savePins(typeof localStorage === 'undefined' ? null : localStorage, pins);
    set({ pins });
  },
  boardOpen: false,
  setBoardOpen: (boardOpen) => set({ boardOpen }),
  openConcept: (id) => {
    const { agentic: a, focused, focus } = get();
    const c = a?.concepts.find((x) => x.id === id);
    if (!c) return;
    const book = focused && !focused.closing && c.bookIds.includes(focused.id) ? focused.id : c.bookIds[0];
    if (!book) return;
    if (focused?.id === book && !focused.closing) set({ concept: id });
    else focus(book, id);
  },
  hovered: null,
  setHovered: (hovered) => set({ hovered }),
  focused: null,
  concept: null,
  setConcept: (concept) => set({ concept }),
  focus: (id, concept = null) => set({ focused: { id, phase: 'out', closing: false }, concept, hovered: null }),
  open: () => {
    const f = get().focused;
    if (f && !f.closing) set({ focused: { ...f, phase: f.phase === 'open' ? 'out' : 'open' } });
  },
  close: () => {
    const f = get().focused;
    if (f && !f.closing) set({ focused: { ...f, phase: 'out', closing: true } });
  },
  settle: () => set({ focused: null, concept: null }),
}));
