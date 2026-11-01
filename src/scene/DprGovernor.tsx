import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';

/** Pixel ratios the canvas may render at, highest first. Never above 2, never above the screen's own ratio. */
const MAX_DPR = 2;
const MIN_DPR = 1;
const STEP = 0.25;
/** Frames in one sample (consecutive, each under GAP_MS apart), and frames ignored after a change while the new size settles. */
const SAMPLE = 12;
const SETTLE = 3;
const GAP_MS = 100;
/** A median frame time above this (about 42 fps) is too slow; the next ratio is picked to land under TARGET_MS. */
const SLOW_MS = 24;
const TARGET_MS = 20;
/** Share of the frame that does not scale with the pixel count (geometry, shadow map, JS). */
const FIXED = 0.1;

/**
 * Lowers the render resolution when the machine cannot keep up, and only ever lowers it (no flicker from going up and down).
 * The canvas runs on demand, so only runs of consecutive frames count (an animation, the parallax easing out); one pause longer
 * than GAP_MS restarts the sample. From the median frame time it estimates how much the cost falls with the pixel count and goes
 * straight to the highest ratio expected to hold 50 fps, then checks again at the new ratio. A fast machine never leaves 2.
 */
export function DprGovernor() {
  const setDpr = useThree((s) => s.setDpr);
  const level = useRef(Math.min(MAX_DPR, typeof window === 'undefined' ? 1 : window.devicePixelRatio));
  const last = useRef(0);
  const skip = useRef(SETTLE);
  const gaps = useRef<number[]>([]);

  useFrame(() => {
    const now = performance.now();
    const gap = now - last.current;
    last.current = now;
    if (level.current <= MIN_DPR) return;
    if (gap > GAP_MS) {
      gaps.current = [];
      skip.current = Math.max(skip.current, 2);
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
    const cur = level.current;
    let next = MIN_DPR;
    for (let d = cur - STEP; d > MIN_DPR; d -= STEP) {
      if (median * (FIXED + (1 - FIXED) * ((d * d) / (cur * cur))) <= TARGET_MS) {
        next = d;
        break;
      }
    }
    level.current = next;
    skip.current = SETTLE;
    setDpr(next);
  });
  return null;
}
