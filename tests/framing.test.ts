import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clampedLeft } from '../src/lib/caseAxis.ts';
import { eyeHeight, frameBetween, frameWhole, screenRow } from '../src/lib/framing.ts';

const FOV = 35;

/** The row of a point on screen, from a real three.js camera posed the way cameraPose does. */
function threeRow(y: number, z: number, d: number, look: number, height: number): number {
  const cam = new THREE.PerspectiveCamera(FOV, 1.6, 10, 50000);
  cam.position.set(0, eyeHeight(d, look), d);
  cam.lookAt(0, look, 0);
  cam.updateMatrixWorld();
  const v = new THREE.Vector3(0, y, z).project(cam);
  return ((1 - v.y) / 2) * height;
}

describe('screenRow', () => {
  it('agrees with a three.js camera', () => {
    for (const [d, look] of [
      [2300, 900],
      [3500, 1100],
      [4300, 700],
    ] as const) {
      for (const [y, z] of [
        [0, 320],
        [1800, 320],
        [900, 0],
      ] as const) expect(screenRow(y, z, d, look, FOV, 800), `${d} ${look} ${y} ${z}`).toBeCloseTo(threeRow(y, z, d, look, 800), 6);
    }
  });
});

describe('frameBetween', () => {
  const input = (height: number, topRow: number, bottomRow: number) => ({ top: 2600, bottom: 0, z: 320, topRow, bottomRow, height, fovDeg: FOV, min: 1100, max: 6000 });
  it('puts the case top and bottom on the two rows, at both laptop sizes', () => {
    for (const [h, top, bottom] of [
      [800, 107, 752],
      [900, 107, 852],
      [1080, 120, 1010],
    ] as const) {
      const { d, look } = frameBetween(input(h, top, bottom));
      expect(threeRow(2600, 320, d, look, h)).toBeCloseTo(top, 1);
      expect(threeRow(0, 320, d, look, h)).toBeCloseTo(bottom, 1);
    }
  });
  it('goes back as the rows get closer together', () => {
    const near = frameBetween(input(800, 100, 700));
    const far = frameBetween(input(800, 300, 500));
    expect(far.d).toBeGreaterThan(near.d);
  });
  it('stays inside the distance limits and keeps the case between the rows', () => {
    const { d, look } = frameBetween({ ...input(800, 100, 700), min: 1100, max: 3000 });
    expect(d).toBe(3000);
    // The middle of the case lands on the middle of the two rows.
    expect(threeRow(1300, 320, d, look, 800)).toBeCloseTo(400, 1);
  });
});

describe('clampedLeft', () => {
  it('centres a box on a point', () => {
    expect(clampedLeft(600, 200, 100, 1100)).toBe(500);
  });
  it('keeps it inside the room it has, on both sides', () => {
    expect(clampedLeft(150, 200, 100, 1100)).toBe(100);
    expect(clampedLeft(1050, 200, 100, 1100)).toBe(900);
  });
  it('starts at the left bound when the box is wider than the room', () => {
    expect(clampedLeft(600, 2000, 100, 1100)).toBe(100);
  });
  it('is centred in the room while the point is not known yet', () => {
    expect(clampedLeft(Number.NaN, 200, 100, 1100)).toBe(500);
  });
});

describe('frameWhole', () => {
  /** The case's front corners on screen (px), from a real three.js camera posed the way cameraPose does, looking at the case's middle line. */
  function corners(width: number, height: number, z: number, d: number, look: number, vw: number, vh: number) {
    const cam = new THREE.PerspectiveCamera(FOV, vw / vh, 10, 50000);
    cam.position.set(width / 2, eyeHeight(d, look), d);
    cam.lookAt(width / 2, look, 0);
    cam.updateMatrixWorld();
    const pts = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ].map(([x, y]) => new THREE.Vector3(x, y, z).project(cam));
    const xs = pts.map((p) => ((p.x + 1) / 2) * vw);
    const ys = pts.map((p) => ((1 - p.y) / 2) * vh);
    return { left: Math.min(...xs), right: vw - Math.max(...xs), top: Math.min(...ys), bottom: vh - Math.max(...ys) };
  }
  const base = { width: 1512, height: 2154, z: 320, fovDeg: FOV, margin: 8, min: 1100, max: 6000 };

  it('keeps the margin at both sides when the view is narrower than the case is wide', () => {
    for (const [vw, vh] of [
      [375, 536],
      [390, 557],
      [430, 615],
    ] as const) {
      const { d, look } = frameWhole({ ...base, viewWidth: vw, viewHeight: vh });
      const m = corners(base.width, base.height, base.z, d, look, vw, vh);
      // The widest corner (the camera is tilted) is the margin from the edge, the case is centred sideways.
      expect(Math.abs(m.left - base.margin), `${vw} left`).toBeLessThan(0.5);
      expect(Math.abs(m.right - base.margin), `${vw} right`).toBeLessThan(0.5);
      expect(m.top, `${vw} top`).toBeGreaterThan(0);
      expect(m.bottom, `${vw} bottom`).toBeGreaterThan(0);
    }
  });
  it('is bound by the height in a view wider than the case, with the margin above and below', () => {
    const { d, look } = frameWhole({ ...base, viewWidth: 768, viewHeight: 676 });
    const m = corners(base.width, base.height, base.z, d, look, 768, 676);
    expect(m.top).toBeCloseTo(8, 0);
    expect(m.bottom).toBeCloseTo(8, 0);
    expect(m.left).toBeGreaterThan(60);
  });
  it('shows the whole case in a wide short case too (covers view)', () => {
    const wide = { ...base, width: 2192, height: 2314 };
    const { d, look } = frameWhole({ ...wide, viewWidth: 390, viewHeight: 557 });
    const m = corners(wide.width, wide.height, wide.z, d, look, 390, 557);
    expect(Math.min(m.left, m.right, m.top, m.bottom)).toBeGreaterThan(6);
    // The case is centred up and down.
    expect(Math.abs(m.top - m.bottom)).toBeLessThan(2);
  });
  it('goes back for a narrower view', () => {
    const a = frameWhole({ ...base, viewWidth: 430, viewHeight: 615 });
    const b = frameWhole({ ...base, viewWidth: 340, viewHeight: 615 });
    expect(b.d).toBeGreaterThan(a.d);
  });
});
