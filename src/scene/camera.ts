// The camera's fixed numbers and the desktop group's framing: no three.js in here, so the page (App.tsx) can use them without loading the 3D code.
import { homeGroup, type HomeGroup } from '../lib/homeGroup.ts';
import { caseHeight, caseWidth, type Layout } from './layout.ts';

export const EYE_HEIGHT = 1250;
export const MIN_DISTANCE = 1100;
export const MAX_DISTANCE = 6000;
export const FOV = 35;
/** On a phone the case is framed with this much space between it and the edges of the shelf's block, px. */
export const PHONE_MARGIN = 8;

/** The desktop group (column, gap, case) for this layout in a window `vw` x `vh`; the page's CSS and the camera both read it. */
export function groupFor(layout: Layout, vw: number, vh: number): HomeGroup {
  const c = layout.bookcase;
  return homeGroup(vw, vh, { width: caseWidth(c), height: caseHeight(c), z: c.depth, fovDeg: FOV, min: MIN_DISTANCE, max: MAX_DISTANCE });
}

