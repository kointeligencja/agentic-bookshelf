import type { Lit } from './agentic.ts';

/** Wait after the last keystroke before the quick pass, and before the careful one, ms. */
export const SKIM_MS = 280;
export const FULL_MS = 900;
/** Shortest query worth sending. */
export const MIN_CHARS = 3;
/** Below this the gate says the text isn't about anything the shelf covers. */
export const GATE_MIN = 0.25;
/** A concept needs at least this probability to be listed in the careful pass. */
export const SHOWN_MIN = 0.3;
/** The faintest glow a book gets, and the share of the strongest below which it gets none. */
export const GLOW_FLOOR = 0.25;
const GLOW_CUT = 0.08;

export interface Scored {
  id: string;
  p: number;
}

/** A search response, as `api/search.js` sends it. `results` only comes with the careful pass. */
export interface SearchData {
  gate: number | null;
  ranked: Scored[];
  results?: Scored[];
  ms?: number;
  ms2?: number;
}

/** What the careful pass lists: concepts at or above `SHOWN_MIN`, or the three closest if none make it. */
export function shownResults(results: Scored[]): { items: Scored[]; closest: boolean } {
  const items = results.filter((r) => r.p >= SHOWN_MIN);
  return items.length ? { items, closest: false } : { items: results.slice(0, 3), closest: true };
}

/** Book id → score, from concept scores. `sum` adds a book's concepts up (quick pass); otherwise the best one counts. */
export function bookScores(scored: Scored[], bookIds: (conceptId: string) => string[], sum: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { id, p } of scored) {
    for (const b of bookIds(id)) out[b] = sum ? (out[b] ?? 0) + p : Math.max(out[b] ?? 0, p);
  }
  return out;
}

/** Scores → glow intensities: the strongest book is 1, the faintest that still glows is `GLOW_FLOOR`, the rest are dark. */
export function glow(scores: Record<string, number>): Lit {
  const max = Math.max(0, ...Object.values(scores));
  const lit: Lit = {};
  if (max <= 0) return lit;
  for (const [id, s] of Object.entries(scores)) {
    const share = s / max;
    if (share >= GLOW_CUT) lit[id] = GLOW_FLOOR + (1 - GLOW_FLOOR) * share;
  }
  return lit;
}

/** Whether a query is long enough to send. */
export function searchable(q: string): boolean {
  return q.trim().length >= MIN_CHARS;
}
