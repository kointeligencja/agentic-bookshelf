import { useSyncExternalStore } from 'react';

/** The phone and tablet layout (`isNarrow` in lib/panel.ts, the max-width of the narrow-screen rules in styles.css). */
const QUERY = '(max-width: 899px)';

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const get = () => window.matchMedia(QUERY).matches;

/** True while the window is narrower than 900px; changes when it is resized across that width. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, get);
}
