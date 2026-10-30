/** Where the visitor's pinned concepts live in the browser. */
export const BOARD_KEY = 'agentic-board';

/** The part of `Storage` the board uses, so tests can pass a plain object. */
export interface PinStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The pinned concept ids, oldest first. Anything unreadable (no storage, bad JSON, wrong shape) is an empty board. */
export function loadPins(store: Pick<PinStore, 'getItem'> | null): string[] {
  try {
    const raw = store?.getItem(BOARD_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((x): x is string => typeof x === 'string'))];
  } catch {
    return [];
  }
}

/** Saves the pins. Storage can be full or blocked; the board then lasts until the page closes. */
export function savePins(store: Pick<PinStore, 'setItem'> | null, pins: string[]): void {
  try {
    store?.setItem(BOARD_KEY, JSON.stringify(pins));
  } catch {
    /* keep going without it */
  }
}

/** Adds `id` to the end, or removes it if it is already pinned. */
export function togglePin(pins: string[], id: string): string[] {
  return pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
}

/** The pins that still name a concept, in pinned order. */
export function livePins(pins: string[], exists: (id: string) => boolean): string[] {
  return pins.filter(exists);
}

/** How many pages `count` items take, at least one. */
export function pageCount(count: number, perPage: number): number {
  return Math.max(1, Math.ceil(count / perPage));
}

/** The item `delta` places from the one with `id`, stopping at either end. The first item if `id` is not in the list. */
export function stepTo<T extends { id: string }>(list: T[], id: string | undefined, delta: number): T | undefined {
  const i = Math.max(0, list.findIndex((x) => x.id === id));
  return list[Math.min(list.length - 1, Math.max(0, i + delta))];
}
