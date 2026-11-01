import type { Agentic, AgenticThesis, Book } from '../types.ts';

/** Book id → how strongly the active theme lights it, 0..1. Absent means dark. */
export type Lit = Record<string, number>;

/** The theme whose clip contains `seconds`, or null between themes. The first match wins, as in the prototype. */
export function themeAtTime(theses: AgenticThesis[], seconds: number): string | null {
  return theses.find((t) => t.clips.some((c) => seconds >= c.start && seconds < c.end))?.key ?? null;
}

/** Where the video should jump to for a theme: the start of its first clip. */
export function themeStart(thesis: AgenticThesis): number | null {
  return thesis.clips[0]?.start ?? null;
}

/** How many of a theme's concepts each book carries: book id → count. */
export function bookCounts(data: Pick<Agentic, 'concepts'>, key: string | null): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!key) return counts;
  for (const c of data.concepts) {
    if (!c.theses.includes(key)) continue;
    for (const id of c.bookIds) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** The books a theme lights: those with at least one concept that extends it, at full intensity. */
export function litBooks(data: Pick<Agentic, 'concepts'>, key: string | null): Lit {
  return Object.fromEntries(Object.keys(bookCounts(data, key)).map((id) => [id, 1]));
}

/** The books on a category's shelves, lit at full intensity, the same way a theme lights its books. */
export function categoryLit(books: Pick<Book, 'id' | 'category'>[], slug: string | null): Lit {
  if (!slug) return {};
  return Object.fromEntries(books.filter((b) => b.category === slug).map((b) => [b.id, 1]));
}

/** How many concepts extend a theme. */
export function conceptCount(data: Pick<Agentic, 'concepts'>, key: string): number {
  return data.concepts.filter((c) => c.theses.includes(key)).length;
}

export interface SourceConcept {
  id: string;
  name: string;
  book_ids: string[];
  theses: string[];
  concept: string;
  status: string;
  start_here?: boolean;
}

/** Swap our book slugs for the 3D library's ids. Throws on a slug with no id, so the build fails loudly. */
export function mapIds(ids: Record<string, string>, slugs: string[], where = 'concept'): string[] {
  return slugs.map((s) => {
    const id = ids[s];
    if (!id) throw new Error(`No 3D book id for slug "${s}" (${where})`);
    return id;
  });
}

/** `m:ss` or `h:mm:ss`. */
export function clock(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export interface Segment {
  theme: string;
  title: string;
  start: number;
  end: number;
  /** Position and width along the video as percentages, 0..100. */
  left: number;
  width: number;
}

/** Every theme's clips as marks along a video of `duration` seconds, clipped to its length. */
export function timelineSegments(theses: AgenticThesis[], duration: number): Segment[] {
  if (!(duration > 0)) return [];
  return theses.flatMap((t) =>
    t.clips
      .filter((c) => c.end > c.start && c.start < duration)
      .map((c) => {
        const end = Math.min(c.end, duration);
        return { theme: t.key, title: t.title, start: c.start, end, left: (c.start / duration) * 100, width: ((end - c.start) / duration) * 100 };
      }),
  );
}
