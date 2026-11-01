import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { setCaseCx } from '../lib/caseAxis.ts';
import { EYE_LIFT, EYE_REF_DISTANCE, EYE_SLOPE, frameWhole } from '../lib/framing.ts';
import { isNarrow, isReading, readingPanel } from '../lib/panel.ts';
import { mark } from '../lib/marks.ts';
import { useStore } from '../store.ts';
import { EYE_HEIGHT, FOV, groupFor, MAX_DISTANCE, MIN_DISTANCE, PHONE_MARGIN } from './camera.ts';
import { caseHeight, caseWidth, type Layout } from './layout.ts';

export { EYE_HEIGHT, FOV, MAX_DISTANCE, MIN_DISTANCE, PHONE_MARGIN };

/** Camera position and look-at point for a dolly position x and wall distance d. */
export function cameraPose(x: number, d: number, y: number, out: { eye: THREE.Vector3; look: THREE.Vector3 }) {
  // The eye sits a little above what it looks at, as a standing person's would.
  out.eye.set(x, y + EYE_LIFT + (d - EYE_REF_DISTANCE) * EYE_SLOPE, d);
  out.look.set(x, y, 0);
  return out;
}

/**
 * The opening view. On a desktop screen: the case's top and bottom edges on the rows of the home group (`homeGroup`) and its middle on the
 * group's case slot (the rig shifts the picture sideways, see `useFrame`). On a narrow screen the shelf is a block of its own (`view` px
 * big): the whole case is framed inside the block, centred, with PHONE_MARGIN px to spare on every side.
 */
export function homeView(layout: Layout, view: { width: number; height: number }, narrow: boolean): { x: number; d: number; look: number; cx: number } {
  const c = layout.bookcase;
  const x = c.x0 + caseWidth(c) / 2;
  if (narrow) {
    const { d, look } = frameWhole({ width: caseWidth(c), height: caseHeight(c), z: c.depth, viewWidth: view.width, viewHeight: view.height, fovDeg: FOV, margin: PHONE_MARGIN, min: MIN_DISTANCE, max: MAX_DISTANCE });
    return { x, d, look, cx: view.width / 2 };
  }
  const g = groupFor(layout, view.width, view.height);
  return { x, d: g.d, look: g.look, cx: g.caseCentre };
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
  const home = useRef({ x: 0, d: EYE_REF_DISTANCE, y: 1100, cx: 0 });
  const caseW = caseWidth(layout.bookcase);
  const caseH = caseHeight(layout.bookcase);
  const depth = layout.bookcase.depth;
  const caseMid = useMemo(() => new THREE.Vector3(), []);
  const { camera, invalidate, size } = useThree();
  const current = useRef<{ x: number; d: number; y: number; cx: number } | null>(null);
  const pose = useRef({ eye: new THREE.Vector3(), look: new THREE.Vector3() });

  // Frame the room for this layout on first load and after a resize or a change of view: the group's case slot on a desktop screen,
  // the shelf's own block on a narrow one.
  useEffect(() => {
    const h = homeView(layout, size, isNarrow(size.width));
    home.current = { x: h.x, d: h.d, y: h.look, cx: h.cx };
    invalidate();
  }, [size, layout, invalidate]);

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
    // The first frame: the mark after the render that follows this callback (the shaders compile inside it).
    requestAnimationFrame(() => mark('first-frame-drawn'));
    const s = useStore.getState();
    const { width, height } = size;
    // A book held out sets the target (a fixed reading distance in front of it); otherwise the camera is at home.
    const held = !!s.focused && !s.focused.closing;
    const hm = home.current;
    const tx = held ? s.targetX : hm.x;
    const td = held ? s.distance : hm.d;
    const ty = held && s.targetY !== null ? Math.min(yRange[1], Math.max(yRange[0], s.targetY)) : hm.y;
    const c = (current.current ??= { x: tx, d: td, y: ty, cx: hm.cx });
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 5);
    c.x += (tx - c.x) * k;
    c.d += (td - c.d) * k;
    c.y += (ty - c.y) * k;
    // The picture is shifted sideways so that the case's middle lands in its slot in the home group (the column is left of it, and the page's
    // margins grow on a wide window). In reading mode the left column is gone and the book is held in a strip at the left edge, so the middle
    // of the picture goes there. On a narrow screen the middle of the picture is the middle of the shelf's block.
    const cxTarget = held && isReading(width) ? readingPanel(width).bookCentre : hm.cx;
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
