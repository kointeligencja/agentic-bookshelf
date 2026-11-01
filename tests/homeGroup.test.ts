import { describe, expect, it } from 'vitest';
import { caseTopRow, CASE_BOTTOM_ROOM, CASE_TOP, columnWidth, GROUP_GAP, homeGroup, OUTER, type CaseShape } from '../src/lib/homeGroup.ts';
import { screenRow } from '../src/lib/framing.ts';

const shape: CaseShape = { width: 2192, height: 2314, z: 180, fovDeg: 35, min: 1100, max: 6000 };
const sizes: [number, number][] = [[1280, 800], [1440, 900], [1920, 1080], [2000, 1150], [2560, 1440], [900, 700]];

describe('columnWidth', () => {
  it('is 26% of the window between 380 and 520', () => {
    expect(columnWidth(1000)).toBe(380);
    expect(columnWidth(1440)).toBe(380);
    expect(columnWidth(1920)).toBe(499);
    expect(columnWidth(2560)).toBe(520);
  });
});

describe('homeGroup', () => {
  it.each(sizes)('centres the group and keeps the gap at %i x %i', (w, h) => {
    const g = homeGroup(w, h, shape);
    expect(g.groupLeft + g.groupWidth / 2).toBeCloseTo(w / 2, 5);
    expect(g.caseLeft - (g.columnLeft + g.columnWidth)).toBeCloseTo(GROUP_GAP, 5);
    expect(g.groupLeft).toBeGreaterThanOrEqual(OUTER - 1e-6);
    expect(w - g.groupRight).toBeGreaterThanOrEqual(OUTER - 1e-6);
    expect(g.caseCentre).toBeCloseTo(g.caseLeft + g.caseWidth / 2, 5);
  });
  it.each(sizes)('puts the case top on its row, inside the vertical room, at %i x %i', (w, h) => {
    const g = homeGroup(w, h, shape);
    expect(caseTopRow(shape, g, h)).toBeCloseTo(g.caseTop, 3);
    expect(screenRow(0, shape.z, g.d, g.look, shape.fovDeg, h)).toBeCloseTo(g.caseBottom, 3);
    expect(g.caseTop).toBeGreaterThanOrEqual(CASE_TOP - 1e-6);
    expect(g.caseBottom).toBeLessThanOrEqual(h - CASE_BOTTOM_ROOM + 1e-6);
  });
  it('uses the full height on a wide window and the margins grow', () => {
    const a = homeGroup(2000, 1150, shape);
    const b = homeGroup(2560, 1150, shape);
    expect(a.caseBottom - a.caseTop).toBeCloseTo(1150 - CASE_BOTTOM_ROOM - CASE_TOP, 3);
    expect(b.caseWidth).toBeCloseTo(a.caseWidth, 3);
    expect(b.groupLeft).toBeGreaterThan(a.groupLeft);
  });
  it('shrinks the case so the group fits a narrow window', () => {
    const g = homeGroup(1000, 1400, shape);
    expect(g.groupWidth).toBeLessThanOrEqual(1000 - 2 * OUTER + 1e-3);
    expect(g.caseBottom - g.caseTop).toBeLessThan(1400 - CASE_BOTTOM_ROOM - CASE_TOP);
  });
});
