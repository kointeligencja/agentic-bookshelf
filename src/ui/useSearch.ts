import { useCallback, useEffect, useRef, useState } from 'react';
import { bookScores, FULL_MS, GATE_MIN, glow, searchable, shownResults, SKIM_MS, type Scored, type SearchData } from '../lib/search.ts';
import { useStore } from '../store.ts';
import type { Agentic } from '../types.ts';

type Stage = 'skim' | 'full';

export interface SearchState {
  query: string;
  /** Concepts to list while a search is on, best first. `provisional` means the careful pass hasn't run yet. */
  results: Scored[];
  provisional: boolean;
  /** One quiet line under the box, or empty. */
  note: string;
  /** True once a response has arrived and the results replace the theme chips. */
  active: boolean;
}

const IDLE: SearchState = { query: '', results: [], provisional: false, note: '', active: false };

/**
 * Search by meaning as the visitor types. A quick pass after a short pause makes the books glow; a careful one
 * after a longer pause (or Enter) lists the ideas with their odds. Every new keystroke drops the requests in flight.
 */
export function useSearch(data: Agentic) {
  const [state, setState] = useState<SearchState>(IDLE);
  const seq = useRef(0);
  const ctrl = useRef<AbortController | null>(null);
  const timers = useRef<number[]>([]);
  const setSearchLit = useStore((s) => s.setSearchLit);

  const stop = useCallback(() => {
    seq.current++;
    ctrl.current?.abort();
    ctrl.current = null;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const run = useCallback(
    async (q: string, stage: Stage) => {
      const mine = ++seq.current;
      ctrl.current?.abort();
      const c = (ctrl.current = new AbortController());
      let out: SearchData;
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q, stage }),
          signal: c.signal,
        });
        const body = (await res.json().catch(() => ({}))) as SearchData & { error?: string };
        if (!res.ok) throw Object.assign(new Error(body.error ?? `status ${res.status}`), { code: body.error });
        out = body;
      } catch (err) {
        if ((err as Error).name === 'AbortError' || mine !== seq.current) return;
        const code = (err as { code?: string }).code;
        console.error('[search]', err);
        setSearchLit(null);
        setState((s) => ({
          ...s,
          results: [],
          active: false,
          note: code === 'no_key' ? 'Search is not connected yet.' : 'Search is not available right now.',
        }));
        return;
      }
      if (mine !== seq.current) return;
      const bookIds = (id: string) => data.concepts.find((x) => x.id === id)?.bookIds ?? [];
      if (out.gate !== null && out.gate < GATE_MIN) {
        setSearchLit({});
        setState((s) => ({ ...s, results: [], provisional: false, active: true, note: 'Nothing here fits that closely.' }));
        return;
      }
      if (stage === 'skim') {
        setSearchLit(glow(bookScores(out.ranked, bookIds, true)));
        setState((s) => ({ ...s, results: out.ranked, provisional: true, active: true, note: '' }));
      } else {
        const { items, closest } = shownResults(out.results ?? []);
        setSearchLit(glow(closest ? {} : bookScores(items, bookIds, false)));
        setState((s) => ({
          ...s,
          results: items,
          provisional: false,
          active: true,
          note: closest ? 'Nothing clears 30%. The closest three:' : '',
        }));
      }
    },
    [data, setSearchLit],
  );

  const clear = useCallback(() => {
    stop();
    setState(IDLE);
    setSearchLit(null);
  }, [stop, setSearchLit]);

  const change = useCallback(
    (query: string) => {
      stop();
      if (!query.trim()) return clear();
      setState((s) => ({ ...s, query }));
      if (!searchable(query)) return;
      const q = query.trim();
      timers.current = [window.setTimeout(() => void run(q, 'skim'), SKIM_MS), window.setTimeout(() => void run(q, 'full'), FULL_MS)];
    },
    [stop, clear, run],
  );

  /** Enter: skip the wait and go straight to the careful pass. */
  const submit = useCallback(() => {
    const q = state.query.trim();
    if (!searchable(q)) return;
    stop();
    void run(q, 'full');
  }, [state.query, stop, run]);

  useEffect(() => stop, [stop]);

  return { state, change, submit, clear };
}
