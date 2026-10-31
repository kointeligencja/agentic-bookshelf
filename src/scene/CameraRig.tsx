import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { setCaseCx } from '../lib/caseAxis.ts';
import { distanceToFit, EYE_LIFT, EYE_REF_DISTANCE, EYE_SLOPE, frameBetween } from '../lib/framing.ts';
import { cardWidth, isNarrow, isReading, readingPanel, wallWidth } from '../lib/panel.ts';
import { useStore } from '../store.ts';
import { caseHeight, caseWidth, type Layout } from './layout.ts';

export const EYE_HEIGHT = 1250;
/** Where the camera looks at the wall when it's back far enough to see the whole case. Set per layout. */
let lookHeight = 1100;
export const MIN_DISTANCE = 1100;
export const MAX_DISTANCE = 6000;
export const DEFAULT_DISTANCE = EYE_REF_DISTANCE;
export const FOV = 35;

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
 * those two rows, so the bookcase lines up with the left column; without `wall` (a narrow screen, the shelf is a block of its own) the case is
 * shown from top to bottom, as close as that allows.
 */
export function homeView(
  layout: Layout,
  aspect: number,
  wall?: { top: number; bottom: number; viewHeight: number },
): { x: number; d: number; look: number } {
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const H = caseHeight(layout.bookcase);
  // The opening view starts just left of the case.
  const left = -300;
  const right = caseWidth(layout.bookcase) + 250;
  let look = H / 2 + 40;
  let d: number;
  if (!wall) {
    // No left column to line up with (a narrow screen): the case from top to bottom in the shelf's block, as close as that allows.
    d = THREE.MathUtils.clamp(distanceToFit(H, FOV, 1.1), MIN_DISTANCE, MAX_DISTANCE);
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
 * Dolly along the wall and up and down the case. Wheel / trackpad / drag / arrow and page keys move a target;
 * the camera eases towards it. The pointer nudges the eye a little for parallax.
 * Input is ignored while a book is pulled out.
 */
export function CameraRig({ layout }: { layout: Layout }) {
  const { minX, maxX } = layout;
  // From the middle of the bottom compartments to the middle of the top ones.
  const yRange = useMemo<[number, number]>(() => {
    const c = layout.bookcase;
    return [c.plinth + c.panel + c.compH / 2, caseHeight(c) - c.panel - c.compH / 2];
  }, [layout]);
  const homeD = useRef(DEFAULT_DISTANCE);
  const caseW = caseWidth(layout.bookcase);
  const caseH = caseHeight(layout.bookcase);
  const depth = layout.bookcase.depth;
  const caseMid = useMemo(() => new THREE.Vector3(), []);
  const { camera, gl, invalidate, size } = useThree();
  const pointer = useRef(new THREE.Vector2());
  const current = useRef<{ x: number; d: number; y: number; px: number; py: number; cx: number } | null>(null);
  const pose = useRef({ eye: new THREE.Vector3(), look: new THREE.Vector3() });

  useEffect(() => {
    const el = gl.domElement;
    const clampX = (x: number) => Math.min(maxX, Math.max(minX, x));
    const clampD = (d: number) => Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, d));
    const locked = () => useStore.getState().focused !== null;
    const clampY = (y: number) => Math.min(yRange[1], Math.max(yRange[0], y));

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (locked()) return;
      const s = useStore.getState();
      if (e.ctrlKey || e.metaKey) {
        // Pinch on a trackpad arrives as ctrl+wheel. Zoom towards the point under the cursor.
        zoomAt(e.clientX, e.clientY, clampD(s.distance * Math.exp(e.deltaY * 0.01)));
      } else {
        const k = s.distance / 1400;
        // Line-mode wheels (Firefox with a mouse) report lines, not pixels.
        const unit = e.deltaMode === 1 ? 40 : 1;
        const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit;
        const dy = e.shiftKey ? 0 : e.deltaY * unit;
        // Vertical scrolling moves up and down the case once it's taller than the view;
        // from further back the whole case is in frame, so it moves along the wall instead.
        const canScrollY = s.distance < homeD.current * 0.9;
        if (canScrollY) {
          s.setTargetX(clampX(s.targetX + dx * k));
          s.setTargetY(clampY((s.targetY ?? lookHeight) - dy * k));
        } else {
          s.setTargetX(clampX(s.targetX + (Math.abs(dx) > Math.abs(dy) ? dx : dy) * k));
        }
      }
      invalidate();
    };

    /** Change the distance keeping the point of the wall under the cursor where it is on screen. */
    const zoomAt = (clientX: number, clientY: number, d: number) => {
      const s = useStore.getState();
      const rect = el.getBoundingClientRect();
      const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      // The panel pushes the middle of the view to the right (see the view offset below).
      const nx = ((clientX - rect.left - wallWidth(rect.width) / 2) / rect.width) * 2 - 1;
      const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
      const halfH = s.distance * tan;
      const k = 1 - d / s.distance;
      const y0 = s.targetY ?? lookHeight;
      s.setTargetX(clampX(s.targetX + nx * halfH * (rect.width / rect.height) * k));
      if (d >= homeD.current * 0.95) s.setTargetY(null);
      else s.setTargetY(clampY(y0 + ny * halfH * k));
      s.setDistance(d);
    };
    const onDouble = (e: MouseEvent) => {
      if (locked()) return;
      const s = useStore.getState();
      zoomAt(e.clientX, e.clientY, clampD(Math.min(s.distance * 0.55, 2000)));
      invalidate();
    };

    let drag: { x: number; y: number; tx: number; ty: number } | null = null;
    const onDown = (e: PointerEvent) => {
      const s = useStore.getState();
      drag = locked() ? null : { x: e.clientX, y: e.clientY, tx: s.targetX, ty: s.targetY ?? lookHeight };
    };
    const onMove = (e: PointerEvent) => {
      pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      if (drag && e.buttons === 1) {
        const s = useStore.getState();
        const mmPerPx = (2 * s.distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / el.clientHeight;
        s.setTargetX(clampX(drag.tx - (e.clientX - drag.x) * mmPerPx));
        // Vertical drag only once the camera is close enough that the case doesn't fit.
        if (s.distance < homeD.current * 0.9) s.setTargetY(clampY(drag.ty + (e.clientY - drag.y) * mmPerPx));
      }
      invalidate();
    };
    const onUp = () => {
      drag = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT' || locked()) return;
      const s = useStore.getState();
      if (e.key === 'ArrowRight') s.setTargetX(clampX(s.targetX + 460));
      else if (e.key === 'ArrowLeft') s.setTargetX(clampX(s.targetX - 460));
      else if (e.key === 'PageUp') s.setTargetY(clampY((s.targetY ?? lookHeight) + 340));
      else if (e.key === 'PageDown') s.setTargetY(clampY((s.targetY ?? lookHeight) - 340));
      else if (e.key === 'ArrowUp' || e.key === '+') s.setDistance(clampD(s.distance * 0.85));
      else if (e.key === 'ArrowDown' || e.key === '-') s.setDistance(clampD(s.distance / 0.85));
      else return;
      e.preventDefault();
      invalidate();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('dblclick', onDouble);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('dblclick', onDouble);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [gl, invalidate, minX, maxX, yRange]);

  // On a narrow screen the shelf is a block in a page that scrolls: vertical swipes belong to the page while the whole case is in view,
  // and to the camera once it is zoomed in (then the swipe moves up and down the case).
  useEffect(() => {
    const el = gl.domElement;
    const set = () => {
      const zoomed = useStore.getState().distance < homeD.current * 0.9;
      el.style.touchAction = isNarrow(el.clientWidth) && !zoomed ? 'pan-y' : 'none';
    };
    set();
    return useStore.subscribe(set);
  }, [gl]);

  // Frame the room for this layout on first load and after switching views or resizing; otherwise keep the target in range.
  // The case is framed between the left column's search pill and theme card (the store's `wallBox`). The framing is only
  // redone while the visitor has not moved the camera, so that late font loads or a resize do not undo what they did.
  const wallBox = useStore((st) => st.wallBox);
  const lastHome = useRef<{ x: number; d: number } | null>(null);
  useEffect(() => {
    const s = useStore.getState();
    const aspect = camera instanceof THREE.PerspectiveCamera ? (size.width - wallWidth(size.width)) / size.height : 1.6;
    // Until the column is measured: its top is the title block's height down, its bottom above the footer. On a narrow screen the column
    // is not beside the shelf, so the case is framed in the shelf's own block.
    const wall = isNarrow(size.width) ? undefined : (wallBox ?? { top: 112, bottom: size.height - 48 });
    const home = homeView(layout, aspect, wall && { ...wall, viewHeight: size.height });
    lookHeight = home.look;
    homeD.current = home.d;
    const last = lastHome.current;
    const untouched = s.targetX === 0 || (last !== null && s.targetY === null && Math.abs(s.targetX - last.x) < 1 && Math.abs(s.distance - last.d) < 1);
    if (untouched && !s.focused) {
      const first = s.targetX === 0;
      s.setTargetX(home.x);
      s.setDistance(home.d);
      if (first) current.current = null;
    } else {
      s.setTargetX(Math.min(maxX, Math.max(minX, s.targetX)));
    }
    lastHome.current = { x: home.x, d: home.d };
    invalidate();
  }, [camera, size, layout, minX, maxX, invalidate, wallBox]);

  // The view offset (see the frame loop) is cleared when the rig goes.
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    return () => camera.clearViewOffset();
  }, [camera]);

  // Subscriptions don't re-render; a change of target just needs a frame.
  useEffect(() => useStore.subscribe(() => invalidate()), [invalidate]);

  useFrame((_, dt) => {
    const s = useStore.getState();
    const { width, height } = size;
    const ty = s.targetY === null ? lookHeight : Math.min(yRange[1], Math.max(yRange[0], s.targetY));
    const c = (current.current ??= { x: s.targetX, d: s.distance, y: ty, px: 0, py: 0, cx: (wallWidth(width) + width) / 2 });
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 5);
    const kp = 1 - Math.exp(-Math.min(dt, 0.1) * 3);
    c.x += (s.targetX - c.x) * k;
    c.d += (s.distance - c.d) * k;
    c.y += (ty - c.y) * k;
    // The left panel takes the left of the screen, and a pulled-out book's panel the right: shift the picture
    // so the scene is centred in the space between them. In reading mode the left column is gone and the book is
    // held in a strip at the left edge, so the middle of the picture goes there.
    const out = !!s.focused && !s.focused.closing;
    // On a narrow screen there is no column and the page covers the whole screen: the middle of the picture is the middle of the shelf's block.
    const cxTarget = out && isReading(width) ? readingPanel(width).bookCentre : isNarrow(width) ? width / 2 : (wallWidth(width) + width - (out ? cardWidth(width) : 0)) / 2;
    c.cx += (cxTarget - c.cx) * k;
    if (camera instanceof THREE.PerspectiveCamera) camera.setViewOffset(width, height, width / 2 - c.cx, 0, width, height);
    const still = s.focused ? 0.25 : isNarrow(width) ? 0 : 1;
    const px = pointer.current.x * 45 * still;
    const py = -pointer.current.y * 30 * still;
    c.px += (px - c.px) * kp;
    c.py += (py - c.py) * kp;
    const { eye, look } = cameraPose(c.x, c.d, c.y, pose.current);
    camera.position.set(eye.x + c.px, eye.y + c.py, eye.z);
    camera.lookAt(look);
    // Where the bookcase's middle line is on screen: the category nav centres itself on it.
    camera.updateMatrixWorld();
    caseMid.set(caseW / 2, caseH / 2, depth).project(camera);
    setCaseCx(((caseMid.x + 1) / 2) * width);
    const moving =
      Math.abs(s.targetX - c.x) > 0.3 || Math.abs(s.distance - c.d) > 0.3 || Math.abs(ty - c.y) > 0.3 || Math.abs(px - c.px) > 0.2 || Math.abs(py - c.py) > 0.2 || Math.abs(cxTarget - c.cx) > 0.5;
    if (moving) invalidate();
  });

  return null;
}
