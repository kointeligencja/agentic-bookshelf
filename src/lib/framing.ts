/**
 * Framing the bookcase against the left column: the camera's distance and the height it looks at, found so that the case's
 * top edge and bottom edge land on two given screen rows. Pure maths, the same pose rule as `cameraPose` in scene/CameraRig.tsx.
 */

/** The eye sits a little above what it looks at, as a standing person's would, and a little higher the further back it is. */
export const EYE_LIFT = 150;
export const EYE_SLOPE = 0.04;
/** The distance at which the eye is exactly `EYE_LIFT` above the point it looks at, mm. */
export const EYE_REF_DISTANCE = 3500;

/** Height of the eye for a camera `d` mm from the wall looking at height `look`, mm. */
export const eyeHeight = (d: number, look: number): number => look + EYE_LIFT + (d - EYE_REF_DISTANCE) * EYE_SLOPE;

/**
 * The screen row, in pixels from the top of a viewport `height` high, of the point at height `y` and depth `z` (mm), seen from
 * a camera `d` mm from the wall that looks at height `look` with a vertical field of view of `fovDeg`.
 */
export function screenRow(y: number, z: number, d: number, look: number, fovDeg: number, height: number): number {
  const eyeY = eyeHeight(d, look);
  // The forward direction in the (y, z) plane, and the camera's up, perpendicular to it.
  let fy = look - eyeY;
  let fz = -d;
  const n = Math.hypot(fy, fz);
  fy /= n;
  fz /= n;
  const uy = -fz;
  const uz = fy;
  const ry = y - eyeY;
  const rz = z - d;
  const depth = ry * fy + rz * fz;
  const ndc = (ry * uy + rz * uz) / (depth * Math.tan((fovDeg * Math.PI) / 360));
  return ((1 - ndc) / 2) * height;
}

export interface FrameInput {
  /** Height of the case's top edge and of its bottom edge (mm), and the depth of its front face. */
  top: number;
  bottom: number;
  z: number;
  /** The screen rows (px) the top edge and the bottom edge should land on, in a viewport `height` px high. */
  topRow: number;
  bottomRow: number;
  height: number;
  fovDeg: number;
  /** Limits of the distance, mm. */
  min: number;
  max: number;
}

/** Bisection of an increasing function on [lo, hi]. */
function solve(f: (x: number) => number, target: number, lo: number, hi: number): number {
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The distance and the look-at height that put the case's top edge on `topRow` and its bottom edge on `bottomRow`. If the
 * distance would fall outside [min, max] it is clamped, and the look-at height then centres the span between the two rows.
 */
export function frameBetween(i: FrameInput): { d: number; look: number } {
  const lookFor = (d: number) => solve((look) => screenRow(i.top, i.z, d, look, i.fovDeg, i.height), i.topRow, -6000, 12000);
  const span = (d: number) => screenRow(i.bottom, i.z, d, lookFor(d), i.fovDeg, i.height) - i.topRow;
  const want = i.bottomRow - i.topRow;
  // The span shrinks as the camera goes back.
  const d = solve((x) => -span(x), -want, i.min, i.max);
  if (d <= i.min + 1e-6 || d >= i.max - 1e-6) {
    // Out of range: keep the middle of the case on the middle of the two rows.
    const mid = (i.topRow + i.bottomRow) / 2;
    const dd = d <= i.min + 1e-6 ? i.min : i.max;
    const look = solve((l) => screenRow((i.top + i.bottom) / 2, i.z, dd, l, i.fovDeg, i.height), mid, -6000, 12000);
    return { d: dd, look };
  }
  return { d, look: lookFor(d) };
}

/**
 * The distance (mm) at which a camera with vertical field of view `fovDeg` sees `height` mm of the wall, times `margin` (1.1: a tenth to spare).
 * Used for a shelf block of its own on a narrow screen, where the whole case is shown from top to bottom.
 */
export function distanceToFit(height: number, fovDeg: number, margin = 1.1): number {
  return (height * margin) / (2 * Math.tan((fovDeg * Math.PI) / 360));
}

/** Where the middle of the span between the case's top and bottom edges lands on screen is `height / 2` for this look-at height (mm). */
function centredLook(top: number, bottom: number, z: number, d: number, fovDeg: number, height: number): number {
  return solve((look) => (screenRow(top, z, d, look, fovDeg, height) + screenRow(bottom, z, d, look, fovDeg, height)) / 2, height / 2, -6000, 12000);
}

export interface WholeInput {
  /** Width and height of the case (mm) and the depth of its front face, which is the part that sticks out furthest on screen. */
  width: number;
  height: number;
  z: number;
  /** Size of the view, px. */
  viewWidth: number;
  viewHeight: number;
  fovDeg: number;
  /** Space kept free between the case and each edge of the view, px. */
  margin: number;
  /** Limits of the distance, mm. */
  min: number;
  max: number;
}

/**
 * The distance and the look-at height that show the whole case, front face included, inside the view with `margin` px to spare at the
 * sides, top and bottom, and centred on the page's vertical axis (the caller looks at the case's middle line). The tighter of the two
 * limits decides: a view narrower than the case is as wide as the case allows, a wide one is as high.
 */
export function frameWhole(i: WholeInput): { d: number; look: number } {
  const tanH = Math.tan((i.fovDeg * Math.PI) / 360) * (i.viewWidth / i.viewHeight);
  // How far a front corner of the case is from the middle of the view, as a share of half the view's width (1 is the edge). The camera is tilted
  // down a little, so the corner that is nearer along the line of sight (the top one or the bottom one) is the widest.
  const reach = (d: number) => {
    const look = centredLook(i.height, 0, i.z, d, i.fovDeg, i.viewHeight);
    const eyeY = eyeHeight(d, look);
    let fy = look - eyeY;
    let fz = -d;
    const n = Math.hypot(fy, fz);
    fy /= n;
    fz /= n;
    return Math.max(...[0, i.height].map((y) => i.width / 2 / (((y - eyeY) * fy + (i.z - d) * fz) * tanH)));
  };
  const room = 1 - (2 * i.margin) / i.viewWidth;
  // The reach shrinks as the camera goes back.
  const dWidth = solve((d) => -reach(d), -room, i.min, i.max);
  const byHeight = frameBetween({
    top: i.height,
    bottom: 0,
    z: i.z,
    topRow: i.margin,
    bottomRow: i.viewHeight - i.margin,
    height: i.viewHeight,
    fovDeg: i.fovDeg,
    min: i.min,
    max: i.max,
  });
  if (dWidth <= byHeight.d) return byHeight;
  const d = Math.min(i.max, dWidth);
  return { d, look: centredLook(i.height, 0, i.z, d, i.fovDeg, i.viewHeight) };
}
