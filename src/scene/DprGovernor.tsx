import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

/** The ratio at rest: the screen's own, never above 2. While things move the canvas may run lower (see below), never under 1. */
const MAX_DPR = 2;
const MIN_DPR = 1;
const STEP = 0.25;
/** Frames in one sample (consecutive, each under GAP_MS apart), and frames ignored after a change while the new size settles. */
const SAMPLE = 12;
const SETTLE_FRAMES = 3;
const GAP_MS = 100;
/** No frame for this long means nothing moves: back to the full ratio. The render that follows the switch is not motion. */
const IDLE_MS = 200;
const IGNORE_AFTER_SWITCH_MS = 150;
/** A median frame time above this (about 42 fps) is too slow; the next ratio is picked to land under TARGET_MS. */
const SLOW_MS = 24;
const TARGET_MS = 20;
/** Share of the frame that does not scale with the pixel count (geometry, shadow map, JS). */
const FIXED = 0.1;

/**
 * Renders at a lower pixel ratio only while the scene moves, and at the full ratio when it is still, so the resting picture is as
 * sharp as it can be.
 *  - The canvas runs on demand: a frame is drawn only when something needs one. Frames arriving less than GAP_MS apart are a
 *    burst of motion (parallax and its easing, book animations, theme fade, intro). The second frame of a burst switches to the
 *    motion ratio; IDLE_MS without a frame switches back to the full one (and draws once, at full size).
 *  - The motion ratio starts at the full ratio and is lowered by measuring: from the median frame time of 12 consecutive frames
 *    it estimates how the cost falls with the pixel count and goes to the highest 0.25 step expected to hold 50 fps. It is only
 *    ever lowered, and a fast machine never leaves the full ratio, so it never resizes at all.
 */
export function DprGovernor() {
  const setDpr = useThree((s) => s.setDpr);
  const invalidate = useThree((s) => s.invalidate);
  const full = useRef(Math.min(MAX_DPR, window.devicePixelRatio));
  const motion = useRef(full.current);
  const current = useRef(full.current);
  const last = useRef(0);
  const run = useRef(0);
  const ignoreUntil = useRef(0);
  const skip = useRef(0);
  const gaps = useRef<number[]>([]);
  const timer = useRef<number | undefined>(undefined);

  const apply = (d: number, settling = false) => {
    current.current = d;
    if (settling) ignoreUntil.current = performance.now() + IGNORE_AFTER_SWITCH_MS;
    setDpr(d);
    invalidate();
  };

  const check = () => {
    timer.current = undefined;
    const idle = performance.now() - last.current;
    if (idle < IDLE_MS - 20) {
      timer.current = window.setTimeout(check, IDLE_MS - idle);
      return;
    }
    run.current = 0;
    gaps.current = [];
    if (current.current !== full.current) apply(full.current, true);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useFrame(() => {
    const now = performance.now();
    if (now < ignoreUntil.current) return;
    const gap = now - last.current;
    last.current = now;
    if (gap > GAP_MS) {
      run.current = 1;
      gaps.current = [];
      skip.current = Math.max(skip.current, 2);
    } else {
      run.current++;
    }
    if (current.current < full.current && timer.current === undefined) timer.current = window.setTimeout(check, IDLE_MS);
    // Motion has started again: straight to the motion ratio.
    if (run.current >= 2 && current.current > motion.current) {
      apply(motion.current);
      skip.current = SETTLE_FRAMES;
      gaps.current = [];
      if (timer.current === undefined) timer.current = window.setTimeout(check, IDLE_MS);
      return;
    }
    if (current.current <= MIN_DPR || gap > GAP_MS) return;
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
    const cur = current.current;
    let next = MIN_DPR;
    for (let d = cur - STEP; d > MIN_DPR; d -= STEP) {
      if (median * (FIXED + (1 - FIXED) * ((d * d) / (cur * cur))) <= TARGET_MS) {
        next = d;
        break;
      }
    }
    motion.current = next;
    skip.current = SETTLE_FRAMES;
    apply(next);
    if (timer.current === undefined) timer.current = window.setTimeout(check, IDLE_MS);
  });
  return null;
}
