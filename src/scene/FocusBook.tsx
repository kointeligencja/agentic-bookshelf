import { useKTX2 } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { isReading, readingPanel } from '../lib/panel.ts';
import { useStore } from '../store.ts';
import type { AtlasSheet, Category } from '../types.ts';
import { placementPose } from './Books.tsx';
import { FullBook } from './FullBook.tsx';
import type { Layout, Placement } from './layout.ts';
import { fontsReady, infoPage, titlePage } from './pageTextures.ts';

const FOCUS_DISTANCE = 2300;
const HOLD = 880; // mm in front of the camera
/** In reading mode the book is held this far away at most, so it fits the strip at the left edge. */
const MAX_HOLD = 3000;
/** The dimming plane in front of the case. */
const DIM_Z = 720;
/** Reading mode's backdrop: the bookcase's walnut, a little lighter behind the book. */
const WALNUT_EDGE = '#3b2618';
const WALNUT_GLOW = '#5b3a22';
/** The dim of the room while a book is pulled out and there is no reading mode (a narrow screen). */
const DIM_COLOR = '#1d1813';

/** Draw order of the backdrop and of the held book: after the room and the case (order 0), the book after the backdrop. */
const BACKDROP_ORDER = 5;
const BOOK_ORDER = 6;

/**
 * The plane in front of the case. Out of reading mode it is the dim (a flat colour, mostly transparent). In reading mode it fades
 * to opaque walnut, lighter round the book (a glow in screen space, `uCentre` and `uRadius` in drawing-buffer pixels), so no shelf
 * shows behind the left quarter of the screen. Colours are linear, as the composer expects.
 *
 * The plane stands at DIM_Z in the world, but the room reaches in front of it (the floor runs 6000mm out): with a low book, seen
 * from above, the floor was drawn over the bottom of the walnut. So the backdrop ignores the depth of the room: it is drawn in the
 * opaque pass after the room and before the book (BACKDROP_ORDER, BOOK_ORDER), with no depth test, blended by hand because it fades.
 * In reading mode it also writes a depth just behind the book (`uDepth`), so what is drawn after it (the case's glow layers) is
 * hidden and the depth of field sees a flat backdrop. Out of reading mode it writes no depth.
 */
function backdropMaterial() {
  return new THREE.ShaderMaterial({
    transparent: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    // The test stays on but always passes: with the test off, nothing is written to the depth buffer either.
    depthFunc: THREE.AlwaysDepth,
    depthWrite: false,
    uniforms: {
      uDepth: { value: 1 },
      uOpacity: { value: 0 },
      uRead: { value: 0 },
      uDim: { value: new THREE.Color(DIM_COLOR) },
      uEdge: { value: new THREE.Color(WALNUT_EDGE) },
      uGlow: { value: new THREE.Color(WALNUT_GLOW) },
      uCentre: { value: new THREE.Vector2(0, 0) },
      uRadius: { value: 1 },
    },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uDepth; uniform float uOpacity; uniform float uRead; uniform vec3 uDim; uniform vec3 uEdge; uniform vec3 uGlow; uniform vec2 uCentre; uniform float uRadius;
      void main() {
        float k = 1.0 - smoothstep(0.0, uRadius, distance(gl_FragCoord.xy, uCentre));
        gl_FragColor = vec4(mix(uDim, mix(uEdge, uGlow, k), uRead), uOpacity);
        gl_FragDepth = uDepth;
      }`,
  });
}
const OPEN_ANGLE = THREE.MathUtils.degToRad(-160);
const FACE_CAMERA = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** Closed, the book turns a little so its spine and thickness show; open, it faces square on. */
const SPINE_TURN = 0.34;

/** Critically-damped-ish spring; interruptible because it carries velocity. */
function spring(s: { x: number; v: number }, target: number, dt: number, k = 150, c = 24) {
  const a = k * (target - s.x) - c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}
const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Where a book starts from and returns to. */
function homePose(p: Placement) {
  return placementPose(p);
}

function catName(categories: Category[], slug: string | null) {
  return slug ? (categories.find((c) => c.slug === slug)?.name ?? null) : null;
}

export function FocusBook({ layout, atlas, categories }: { layout: Layout; atlas: AtlasSheet[]; categories: Category[] }) {
  const focused = useStore((s) => s.focused);
  const placement = useMemo(
    () => (focused ? layout.placements.find((p) => p.book.id === focused.id) : undefined),
    [focused, layout],
  );
  const textures = useKTX2(
    atlas.map((s) => s.url),
    '/basis/',
  ) as THREE.Texture[];
  return placement ? (
    <Focused
      key={placement.book.id}
      placement={placement}
      front={layout.bookcase.depth}
      atlas={textures[placement.book.spineAtlas.sheet] ?? null}
      categories={categories}
    />
  ) : null;
}

function Focused({
  placement,
  front,
  atlas,
  categories,
}: {
  placement: Placement;
  /** Front face of the bookcase (z). The book must clear it before it turns or rises. */
  front: number;
  atlas: THREE.Texture | null;
  categories: Category[];
}) {
  const book = placement.book;
  const group = useRef<THREE.Group>(null);
  const cover = useRef<THREE.Group>(null);
  const dim = useMemo(backdropMaterial, []);
  useEffect(() => () => dim.dispose(), [dim]);
  const { camera, gl, invalidate, size } = useThree();
  const buffer = useMemo(() => new THREE.Vector2(), []);
  const state = useRef({ p: { x: 0, v: 0 }, o: { x: 0, v: 0 }, read: 0 });
  const home = useMemo(() => homePose(placement), [placement]);
  const [pages, setPages] = useState<{ left: THREE.Texture; right: THREE.Texture } | null>(null);

  // Inside pages, drawn once the fonts are ready.
  useEffect(() => {
    let alive = true;
    let made: { left: THREE.Texture; right: THREE.Texture } | null = null;
    void fontsReady().then(() => {
      if (!alive) return;
      const pw = book.dims.w - 6;
      const ph = book.dims.h - 6;
      made = {
        left: titlePage(book, pw, ph),
        right: infoPage(book, catName(categories, book.category) ?? '', catName(categories, book.secondaryCategory), pw, ph),
      };
      setPages(made);
      invalidate();
    });
    return () => {
      alive = false;
      made?.left.dispose();
      made?.right.dispose();
    };
  }, [book, categories, invalidate]);

  // Ask the camera for a fixed reading distance, in front of the book. The rig goes back to its home view by itself when the book goes home.
  // Fixed, so the book held in front of the camera is always well clear of the shelves.
  useEffect(() => {
    const s = useStore.getState();
    s.setTargetX(home.position.x);
    s.setTargetY(home.position.y);
    s.setDistance(FOCUS_DISTANCE);
  }, [home]);

  // Where the book has fully left its shelf: its back edge in front of the case.
  const exit = useMemo(() => {
    const k = placement.kind;
    const faceOut = k === 'face' || k === 'display';
    const onCase = k === 'shelf' || k === 'stack' || faceOut;
    const reach = faceOut ? book.dims.h * 0.25 + book.dims.t : book.dims.w / 2;
    return {
      z: onCase ? Math.max(home.position.z, front + reach + 40) : home.position.z + book.dims.w + 40,
      lift: k === 'face' ? 36 : k === 'display' ? 8 : 0,
    };
  }, [placement, home, front, book]);

  const tmp = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      target: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      turn: new THREE.Quaternion(),
      out: new THREE.Vector3(),
      rel: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(delta, 1 / 30);
    const f = useStore.getState().focused;
    const st = state.current;
    const opening = f?.phase === 'open' && !f.closing;
    // Reading mode: the book steps back until it is as wide as `readingPanel(...).book` (a fifth smaller than the strip), against the card, and the room dims behind it.
    const reading = !!f && !f.closing && isReading(size.width);
    st.read += ((reading ? 1 : 0) - st.read) * (1 - Math.exp(-dt * 7));
    const fovTan = Math.tan(THREE.MathUtils.degToRad(((camera as THREE.PerspectiveCamera).fov ?? 35) / 2));
    const fit = (book.dims.w * size.height) / (2 * fovTan * readingPanel(size.width).book);
    const hold = THREE.MathUtils.lerp(HOLD, THREE.MathUtils.clamp(fit, HOLD * 0.8, MAX_HOLD), st.read);
    const pTarget = f && !f.closing ? 1 : 0;
    const oTarget = opening ? 1 : 0;
    spring(st.p, pTarget, dt);
    spring(st.o, oTarget, dt, 120, 21);
    const p = THREE.MathUtils.clamp(st.p.x, 0, 1.05);
    const o = THREE.MathUtils.clamp(st.o.x, -0.02, 1.02);

    // Target: held in front of the camera, front cover towards it; shifted right when open so the spread is centred.
    camera.getWorldDirection(tmp.dir);
    tmp.right.crossVectors(tmp.dir, camera.up).normalize();
    tmp.target
      .copy(camera.position)
      .addScaledVector(tmp.dir, hold - o * 60)
      .addScaledVector(tmp.right, (book.dims.w / 2) * o);
    // Never hold it inside the case or behind the dimming plane, whatever the camera is doing.
    tmp.target.z = Math.max(tmp.target.z, DIM_Z + book.dims.w / 2 + 60);
    tmp.turn.setFromAxisAngle(Y_AXIS, SPINE_TURN * (1 - THREE.MathUtils.clamp(o, 0, 1)));
    tmp.q.copy(camera.quaternion).multiply(tmp.turn).multiply(FACE_CAMERA);

    // Straight out of the shelf first, clear of the case, and only then up and round to face the viewer.
    // Face-out books lift over the shelf lip before they come forward.
    const pull = smooth(0, 0.3, p);
    tmp.out.copy(home.position);
    tmp.out.y += exit.lift * smooth(0, 0.4, pull);
    tmp.out.z = THREE.MathUtils.lerp(home.position.z, exit.z, smooth(0.25, 1, pull));
    g.position.lerpVectors(tmp.out, tmp.target, smooth(0.3, 1, p));
    g.quaternion.slerpQuaternions(home.quaternion, tmp.q, smooth(0.32, 0.9, p));
    if (cover.current) cover.current.rotation.y = OPEN_ANGLE * o;
    // The book is drawn after the backdrop.
    g.traverse((o) => {
      if (o.renderOrder !== BOOK_ORDER) o.renderOrder = BOOK_ORDER;
    });
    // The room dims, and in reading mode becomes walnut, centred where the book is held (middle of the strip, middle of the height).
    const u = dim.uniforms as { uDepth: { value: number }; uOpacity: { value: number }; uRead: { value: number }; uCentre: { value: THREE.Vector2 }; uRadius: { value: number } };
    // The backdrop's depth in reading mode: behind every point of the book, however it turns (its half-diagonal and a margin).
    const behind = tmp.rel.copy(g.position).sub(camera.position).dot(tmp.dir) + Math.hypot(book.dims.w, book.dims.h, book.dims.t) / 2 + 40;
    const ndc = tmp.rel.set(0, 0, -behind).applyMatrix4(camera.projectionMatrix).z;
    u.uDepth.value = THREE.MathUtils.clamp(ndc * 0.5 + 0.5, 0, 1);
    u.uOpacity.value = THREE.MathUtils.lerp(0.16, 1, st.read) * THREE.MathUtils.clamp(p, 0, 1);
    u.uRead.value = st.read;
    dim.depthWrite = st.read > 0.5;
    gl.getDrawingBufferSize(buffer);
    const px = buffer.x / size.width;
    u.uCentre.value.set(readingPanel(size.width).bookCentre * px, buffer.y / 2);
    u.uRadius.value = readingPanel(size.width).strip * px * 1.1;

    if (f?.closing && p < 0.004 && Math.abs(st.p.v) < 0.05) {
      useStore.getState().settle();
    }
    // Keep drawing only while something here is still moving, so a book held still (reading mode) lets the canvas go idle.
    const unsettled =
      Math.abs(st.p.x - pTarget) > 1e-3 || Math.abs(st.p.v) > 1e-3 || Math.abs(st.o.x - oTarget) > 1e-3 || Math.abs(st.o.v) > 1e-3 || Math.abs(st.read - (reading ? 1 : 0)) > 1e-3;
    if (unsettled) invalidate();
  });

  // The book panel covers the right of the screen, so there is no room to open the book: a click on it does nothing.
  const onBook = (e: ThreeEvent<MouseEvent>) => e.stopPropagation();
  const onOutside = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta < 6) useStore.getState().close();
  };

  return (
    <>
      {/* Dims the shelf behind the book and catches "click outside to close". */}
      <mesh position={[home.position.x, 1300, DIM_Z]} onClick={onOutside} renderOrder={BACKDROP_ORDER}>
        <planeGeometry args={[20000, 8000]} />
        <primitive object={dim} attach="material" />
      </mesh>
      <group ref={group} onClick={onBook} position={home.position} quaternion={home.quaternion}>
        <FullBook ref={cover} book={book} atlas={atlas} pages={pages} />
      </group>
    </>
  );
}
