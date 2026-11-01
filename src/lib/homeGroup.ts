/**
 * The desktop home page as one composed group, centred in the window: the left column, a gap, then the bookcase. Pure maths: the
 * column's width, the case's slot and size on screen, and the group's edges, from the window's size and the case's shape.
 */
import { eyeHeight, frameBetween, screenRow } from './framing.ts';

/** The column's width: 26 % of the window, between 380 and 520px. */
export const COLUMN_MIN = 380;
export const COLUMN_MAX = 520;
export const COLUMN_SHARE = 0.26;
/** Space between the column's right edge and the case's visible left edge, px. */
export const GROUP_GAP = 56;
/** The window's outer margin, px (`--s3`). */
export const OUTER = 24;
/** Where the case's top edge goes: under the category nav row (margin, the nav's 40px, 16px of air). */
export const CASE_TOP = 80;
/** Space kept under the case: the margin, the footer line and a gap (`--s3` + `--footer-h` + `--s1`). */
export const CASE_BOTTOM_ROOM = 48;
/** The case is never smaller than this high on screen, px (very small windows). */
export const CASE_MIN_HEIGHT = 300;

/** A small window needs the camera further back than the 3D scene's own limit allows, mm. */
const FAR_MAX = 20000;

export const columnWidth = (viewport: number): number => Math.round(Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, viewport * COLUMN_SHARE)));

export interface CaseShape {
  /** Width and height of the case (mm) and the depth of its front face, which is the part that is widest on screen. */
  width: number;
  height: number;
  z: number;
  fovDeg: number;
  /** Limits of the camera's distance, mm. */
  min: number;
  max: number;
}

/** Width on screen (px) of the case's front face, in a view `viewHeight` high, for a camera `d` mm away looking at height `look`. */
export function projectedCaseWidth(c: CaseShape, d: number, look: number, viewHeight: number): number {
  const eyeY = eyeHeight(d, look);
  let fy = look - eyeY;
  let fz = -d;
  const n = Math.hypot(fy, fz);
  fy /= n;
  fz /= n;
  const tan = Math.tan((c.fovDeg * Math.PI) / 360);
  // The camera looks down a little: the nearer of the top and bottom edges is the wider.
  const scale = Math.max(...[0, c.height].map((y) => viewHeight / 2 / (((y - eyeY) * fy + (c.z - d) * fz) * tan)));
  return c.width * scale;
}

export interface HomeGroup {
  /** Column: left edge and width, px. */
  columnLeft: number;
  columnWidth: number;
  /** The case on screen: visible left edge, width, middle line, top and bottom rows. */
  caseLeft: number;
  caseWidth: number;
  caseCentre: number;
  caseTop: number;
  caseBottom: number;
  /** The group: left edge, width, right edge, px from the left of the window. */
  groupLeft: number;
  groupWidth: number;
  groupRight: number;
  /** The camera: distance and look-at height, mm. */
  d: number;
  look: number;
}

/**
 * Lays out the group in a window `vw` x `vh`. The case is as tall as the height allows (CASE_TOP to the footer's room); if the group
 * would then be wider than the window less its margins, the case shrinks (centred between those two rows) until it fits.
 */
export function homeGroup(vw: number, vh: number, c: CaseShape): HomeGroup {
  const col = columnWidth(vw);
  const room = vw - 2 * OUTER - col - GROUP_GAP;
  const rows = (span: number) => {
    const top = CASE_TOP + (vh - CASE_BOTTOM_ROOM - CASE_TOP - span) / 2;
    return { top, bottom: top + span };
  };
  const pose = (span: number) => {
    const r = rows(span);
    const f = frameBetween({ top: c.height, bottom: 0, z: c.z, topRow: r.top, bottomRow: r.bottom, height: vh, fovDeg: c.fovDeg, min: c.min, max: Math.max(c.max, FAR_MAX) });
    return { ...r, ...f, w: projectedCaseWidth(c, f.d, f.look, vh) };
  };
  const full = Math.max(CASE_MIN_HEIGHT, vh - CASE_BOTTOM_ROOM - CASE_TOP);
  let p = pose(full);
  if (p.w > room) {
    // The width is the limit: the widest case that fits (the width grows with the span).
    let lo = 100;
    let hi = full;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (pose(mid).w > room) hi = mid;
      else lo = mid;
    }
    p = pose(lo);
  }
  const groupWidth = col + GROUP_GAP + p.w;
  const groupLeft = (vw - groupWidth) / 2;
  const caseLeft = groupLeft + col + GROUP_GAP;
  return {
    columnLeft: groupLeft,
    columnWidth: col,
    caseLeft,
    caseWidth: p.w,
    caseCentre: caseLeft + p.w / 2,
    caseTop: p.top,
    caseBottom: p.bottom,
    groupLeft,
    groupWidth,
    groupRight: groupLeft + groupWidth,
    d: p.d,
    look: p.look,
  };
}

/** The same row maths as the camera's: where the case's top edge lands, for a check. */
export const caseTopRow = (c: CaseShape, g: Pick<HomeGroup, 'd' | 'look'>, vh: number): number => screenRow(c.height, c.z, g.d, g.look, c.fovDeg, vh);
