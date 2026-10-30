import { useFrame, useThree } from '@react-three/fiber';
import type { Lit } from '../lib/agentic.ts';
import { useStore } from '../store.ts';

const hasLit = (lit: Lit) => Object.keys(lit).length > 0;

/**
 * How far the theme lighting has gone, 0 (room lit) to 1 (room dimmed, the lit books under their spots).
 * Which books are lit is `lit` in the store; this is only the room's side of it.
 * `uniform` is shared by every book material so one write reaches them all.
 */
export const starFx = { amount: 0, uniform: { value: 0 } };

/** How much of the room light is left with a theme on. */
export const DIMMED = 0.045;
export const roomLight = () => 1 - (1 - DIMMED) * starFx.amount;

/** Eases the room in and out of the dimmed state. Pulling a book out brings the light back up to read by. */
export function StarLightDriver() {
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, delta) => {
    const { lit, focused } = useStore.getState();
    const target = hasLit(lit) && !focused ? 1 : 0;
    const next = starFx.amount + (target - starFx.amount) * (1 - Math.exp(-5 * Math.min(delta, 0.1)));
    starFx.amount = Math.abs(next - target) < 1e-3 ? target : next;
    starFx.uniform.value = starFx.amount;
    if (starFx.amount !== target) invalidate();
  }, -1);
  return null;
}
