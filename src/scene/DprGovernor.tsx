import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

/** The ratio the canvas may reach: the screen's own, never above 2, never below 1. */
const MAX_DPR = 2;
const MIN_DPR = 1;
const STEP = 0.25;
/** Frames in the first (deciding) sample and in a later (safety net) one. Only gaps under GAP_MS count; longer ones are pauses. */
const SAMPLE = 8;
const SAFETY_SAMPLE = 30;
/** Frames ignored at the start (shader compiles, first uploads) and after any change. */
const START_SKIP = 2;
const SETTLE_FRAMES = 3;
const GAP_MS = 130;
/** The ratio is the highest step expected to keep this frame time (about 38 fps: 1.25 on the test Mac, where a frame costs 23 ms at 1.25, 33 at 1.5). */
const TARGET_MS = 26.5;
/** Median frame time that is slow enough to step down once more, later in the session (about 30 fps). */
const SAFETY_MS = 36;
/** Share of the frame that does not scale with the pixel count. Measured on the Intel HD 630 test Mac: 59, 33 and 23 ms at ratio 2, 1.5 and 1.25, i.e. proportional to the pixel count. */
const FIXED = 0;

/**
 * One canvas pixel ratio per session, so nothing visibly re-renders while you move around.
 * The canvas runs on demand, so only gaps between frames that follow each other closely can be timed. This component mounts once
 * the scene has loaded, so the first frames it sees are the books sliding in; that run is measured, and from its median frame time at the current ratio the ratio is chosen once: the highest 0.25 step (cap
 * min(devicePixelRatio, 2), floor 1) expected to hold TARGET_MS. A machine that is fast enough stays at the cap and never resizes.
 * Safety net: if a later run of 30 timed frames has a median over SAFETY_MS, it steps down once more, then stays.
 * The ratio is handed to the owner of the Canvas (`onRatio`) to pass as its `dpr` prop: react-three-fiber resets the ratio to the
 * prop on every render of the Canvas, so setting it on the store alone would be undone by the next re-render of the scene.
 * `?dpr=1.5` forces a ratio (for measuring).
 */
export function DprGovernor({ onRatio }: { onRatio: (ratio: number) => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const current = useRef(Math.min(MAX_DPR, window.devicePixelRatio));
  const decided = useRef(false);
  const safetyUsed = useRef(false);
  const last = useRef(0);
  const skip = useRef(START_SKIP);
  const gaps = useRef<number[]>([]);

  useEffect(() => {
    const forced = Number(new URLSearchParams(window.location.search).get('dpr'));
    if (!forced) return;
    decided.current = safetyUsed.current = true;
    current.current = forced;
    onRatio(forced);
    invalidate();
  }, [onRatio, invalidate]);

  useFrame(() => {
    const now = performance.now();
    const gap = now - last.current;
    last.current = now;
    if (gap > GAP_MS) {
      // A pause (idle canvas, a stall while loading): not a frame time. The frame after it is not timed either.
      skip.current = Math.max(skip.current, 1);
      return;
    }
    if (skip.current > 0) {
      skip.current--;
      return;
    }
    if (current.current <= MIN_DPR || (decided.current && safetyUsed.current)) return;
    gaps.current.push(gap);
    if (gaps.current.length < (decided.current ? SAFETY_SAMPLE : SAMPLE)) return;
    const sorted = [...gaps.current].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1]!;
    gaps.current = [];
    const wasDeciding = !decided.current;
    decided.current = true;
    if (median <= (wasDeciding ? TARGET_MS : SAFETY_MS)) return;
    if (!wasDeciding) safetyUsed.current = true;
    const cur = current.current;
    let next = MIN_DPR;
    for (let d = cur - STEP; d > MIN_DPR; d -= STEP) {
      if (median * (FIXED + (1 - FIXED) * ((d * d) / (cur * cur))) <= TARGET_MS) {
        next = d;
        break;
      }
    }
    current.current = next;
    skip.current = SETTLE_FRAMES;
    onRatio(next);
    invalidate();
  });
  return null;
}
