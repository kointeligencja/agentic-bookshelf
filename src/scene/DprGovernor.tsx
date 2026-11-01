import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';

/** The canvas renders at min(devicePixelRatio, 2). */
export const MAX_DPR = 2;
/** The ratio a very weak device falls back to, once. Never lower. */
export const FALLBACK_DPR = 1.5;
/** Timed frames in the sample, and the median frame time over them that counts as too slow, ms. */
const SAMPLE = 30;
const SLOW_MS = 50;
/** Frames ignored at the start (shader compiles, first uploads) and after a pause. Only gaps under GAP_MS count; longer ones are pauses of the on-demand canvas. */
const START_SKIP = 2;
const GAP_MS = 130;

/** The ratio the canvas starts at: the screen's own, up to 2. */
export function initialDpr(): number {
  const forced = Number(new URLSearchParams(window.location.search).get('dpr'));
  return forced > 0 ? forced : Math.min(MAX_DPR, window.devicePixelRatio || 1);
}

/**
 * The pixel ratio is fixed at min(devicePixelRatio, 2) (`initialDpr`). This component is only a safety net for very weak devices: if
 * the frames of an animation run with a median above SLOW_MS over SAMPLE timed frames, it steps down to FALLBACK_DPR once and stays
 * there. It never goes lower and never switches back. The ratio is handed to the owner of the Canvas (`onRatio`) to pass as its `dpr`
 * prop: react-three-fiber resets the ratio to the prop on every render of the Canvas. `?dpr=1.5` forces a ratio and turns the net off
 * (for measuring).
 */
export function DprGovernor({ onRatio }: { onRatio: (ratio: number) => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const done = useRef(initialDpr() <= FALLBACK_DPR || new URLSearchParams(window.location.search).has('dpr'));
  const last = useRef(0);
  const skip = useRef(START_SKIP);
  const gaps = useRef<number[]>([]);

  useFrame(() => {
    if (done.current) return;
    const now = performance.now();
    const gap = now - last.current;
    last.current = now;
    if (gap > GAP_MS) {
      // A pause (idle canvas, a stall while loading): not a frame time. The frame after it is not timed either.
      skip.current = Math.max(skip.current, 1);
      gaps.current = [];
      return;
    }
    if (skip.current > 0) {
      skip.current--;
      return;
    }
    gaps.current.push(gap);
    if (gaps.current.length < SAMPLE) return;
    const sorted = [...gaps.current].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1]!;
    gaps.current = [];
    if (median <= SLOW_MS) return;
    done.current = true;
    onRatio(FALLBACK_DPR);
    invalidate();
  });
  return null;
}
