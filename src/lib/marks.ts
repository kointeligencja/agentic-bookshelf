/** Load-timeline marks (User Timing): `performance.getEntriesByType('mark')` in the console, or scripts/load-timeline.ts. Each name is set once. */
const seen = new Set<string>();

export function mark(name: string): void {
  if (seen.has(name) || typeof performance === 'undefined') return;
  seen.add(name);
  performance.mark(`bs:${name}`);
}

/** Runs `fn` and adds its duration (ms) to the `bs:cost:<name>` total, read by scripts/load-timeline.ts from `window.__costs`. */
export function timed<T>(name: string, fn: () => T): T {
  const t0 = performance.now();
  const out = fn();
  const w = globalThis as unknown as { __costs?: Record<string, number> };
  const costs = (w.__costs ??= {});
  costs[name] = (costs[name] ?? 0) + (performance.now() - t0);
  return out;
}
