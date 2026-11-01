import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { setCaseCx } from '../lib/caseAxis.ts';
import { EYE_LIFT, EYE_REF_DISTANCE, EYE_SLOPE, frameBetween, frameWhole } from '../lib/framing.ts';
import { cardWidth, isNarrow, isReading, readingPanel, wallWidth } from '../lib/panel.ts';
import { useStore } from '../store.ts';
import { caseHeight, caseWidth, type Layout } from './layout.ts';

export const EYE_HEIGHT = 1250;
export const MIN_DISTANCE = 1100;
export const MAX_DISTANCE = 6000;
export const FOV = 35;
/** On a phone the case is framed with this much space between it and the edges of the shelf's block, px. */
export const PHONE_MARGIN = 8;

/** Camera position and look-at point for a dolly position x and wall distance d. */
export function cameraPose(x: number, d: number, y: number, out: { eye: THREE.Vector3; look: THREE.Vector3 }) {
  // The eye sits a little above what it looks at, as a standing person's would.
  out.eye.set(x, y + EYE_LIFT + (d - EYE_REF_DISTANCE) * EYE_SLOPE, d);
  out.look.set(x, y, 0);
  return out;
}

/**
 * The opening view: the case from its left edge, as much as fits in the space right of the panel. With `wall` (the rows of
 * the search pill's top and the theme card's bottom, in a window `viewHeight` high) the case's top and bottom edges are put on
 * those two rows, so the bookcase lines up with the left column; without `wall` (a narrow screen, the shelf is a block of its own, `view` px
 * big) the whole case is framed inside the block, centred, with PHONE_MARGIN px to spare on every side.
 */
export function homeView(
  layout: Layout,
  aspect: number,
  wall?: { top: number; bottom: number; viewHeight: number },
  view?: { width: number; height: number },
): { x: number; d: number; look: number } {
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const H = caseHeight(layout.bookcase);
  // The opening view starts just left of the case.
  const left = -300;
  const right = caseWidth(layout.bookcase) + 250;
  let look = H / 2 + 40;
  let d: number;
  if (!wall) {
    // No left column to line up with (a narrow screen): the whole case, both columns and both side panels, inside the shelf's block.
    const c = layout.bookcase;
    const w = view ?? { width: H * aspect, height: H };
    ({ d, look } = frameWhole({ width: caseWidth(c), height: H, z: c.depth, viewWidth: w.width, viewHeight: w.height, fovDeg: FOV, margin: PHONE_MARGIN, min: MIN_DISTANCE, max: MAX_DISTANCE }));
    return { x: c.x0 + caseWidth(c) / 2, d, look };
  } else if (wall.bottom - wall.top > 100) {
    ({ d, look } = frameBetween({
      top: H,
      bottom: 0,
      z: layout.bookcase.depth,
      topRow: wall.top,
      bottomRow: wall.bottom,
      height: wall.viewHeight,
      fovDeg: FOV,
      min: MIN_DISTANCE,
      max: MAX_DISTANCE,
    }));
  } else {
    const dHeight = (H / 2 + 260) / tan;
    const dWidth = (right - left) / 2 / (tan * aspect);
    d = THREE.MathUtils.clamp(Math.min(Math.max(dHeight, dWidth), dHeight * 1.25), MIN_DISTANCE, MAX_DISTANCE);
  }
  const halfW = d * tan * aspect;
  const x = right - left <= halfW * 2 ? (left + right) / 2 : left + halfW;
  return { x, d, look };
}

/**
 * The camera stands still: it frames the whole bookcase (see `homeView`) once per viewport size and layout, and stays there. The only
 * moves are the one-off shift that makes room for a pulled-out book's card (and back), and the same easing when the window is resized.
 * With nothing to ease the rig draws nothing, so the canvas is idle between book animations.
 */
export function CameraRig({ layout }: { layout: Layout }) {
  // From the middle of the bottom compartments to the middle of the top ones: where a pulled-out book may ask the camera to look.
  const yRange = useMemo<[number, number]>(() => {
    const c = layout.bookcase;
    return [c.plinth + c.panel + c.compH / 2, caseHeight(c) - c.panel - c.compH / 2];
  }, [layout]);
  const home = useRef({ x: 0, d: EYE_REF_DISTANCE, y: 1100 });
  const caseW = caseWidth(layout.bookcase);
  const caseH = caseHeight(layout.bookcase);
  const depth = layout.bookcase.depth;
  const caseMid = useMemo(() => new THREE.Vector3(), []);
  const { camera, invalidate, size } = useThree();
  const current = useRef<{ x: number; d: number; y: number; cx: number } | null>(null);
  const pose = useRef({ eye: new THREE.Vector3(), look: new THREE.Vector3() });

  // Frame the room for this layout on first load and after a resize or a change of view. The case is framed between the left column's
  // search pill and theme card (the store's `wallBox`), or inside the shelf's own block on a narrow screen.
  const wallBox = useStore((st) => st.wallBox);
  useEffect(() => {
    const aspect = camera instanceof THREE.PerspectiveCamera ? (size.width - wallWidth(size.width)) / size.height : 1.6;
    // Until the column is measured: its top is the title block's height down, its bottom above the footer.
    const wall = isNarrow(size.width) ? undefined : (wallBox ?? { top: 112, bottom: size.height - 48 });
    const h = homeView(layout, aspect, wall && { ...wall, viewHeight: size.height }, size);
    home.current = { x: h.x, d: h.d, y: h.look };
    invalidate();
  }, [camera, size, layout, wallBox, invalidate]);

  // The view offset (see the frame loop) is cleared when the rig goes.
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    return () => camera.clearViewOffset();
  }, [camera]);

  // A book going out or home changes the target: that needs a frame. Other store changes do not.
  useEffect(
    () =>
      useStore.subscribe((now, before) => {
        if (now.focused !== before.focused || now.targetX !== before.targetX || now.targetY !== before.targetY || now.distance !== before.distance) invalidate();
      }),
    [invalidate],
  );

  useFrame((_, dt) => {
    const s = useStore.getState();
    const { width, height } = size;
    // A book held out sets the target (a fixed reading distance in front of it); otherwise the camera is at home.
    const held = !!s.focused && !s.focused.closing;
    const hm = home.current;
    const tx = held ? s.targetX : hm.x;
    const td = held ? s.distance : hm.d;
    const ty = held && s.targetY !== null ? Math.min(yRange[1], Math.max(yRange[0], s.targetY)) : hm.y;
    const c = (current.current ??= { x: tx, d: td, y: ty, cx: (wallWidth(width) + width) / 2 });
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 5);
    c.x += (tx - c.x) * k;
    c.d += (td - c.d) * k;
    c.y += (ty - c.y) * k;
    // The left panel takes the left of the screen, and a pulled-out book's panel the right: shift the picture
    // so the scene is centred in the space between them. In reading mode the left column is gone and the book is
    // held in a strip at the left edge, so the middle of the picture goes there.
    // On a narrow screen there is no column and the page covers the whole screen: the middle of the picture is the middle of the shelf's block.
    const cxTarget = held && isReading(width) ? readingPanel(width).bookCentre : isNarrow(width) ? width / 2 : (wallWidth(width) + width - (held ? cardWidth(width) : 0)) / 2;
    c.cx += (cxTarget - c.cx) * k;
    if (camera instanceof THREE.PerspectiveCamera) camera.setViewOffset(width, height, width / 2 - c.cx, 0, width, height);
    const { eye, look } = cameraPose(c.x, c.d, c.y, pose.current);
    camera.position.copy(eye);
    camera.lookAt(look);
    // Where the bookcase's middle line is on screen: the category nav centres itself on it.
    camera.updateMatrixWorld();
    caseMid.set(caseW / 2, caseH / 2, depth).project(camera);
    setCaseCx(((caseMid.x + 1) / 2) * width);
    const moving = Math.abs(tx - c.x) > 0.3 || Math.abs(td - c.d) > 0.3 || Math.abs(ty - c.y) > 0.3 || Math.abs(cxTarget - c.cx) > 0.5;
    if (moving) invalidate();
  });

  return null;
}
