import { describe, expect, it } from 'vitest';
import { distanceToFit } from '../src/lib/framing.ts';
import { isNarrow, isReading, panelWidth, READING_MIN, wallWidth } from '../src/lib/panel.ts';

describe('narrow screens', () => {
  it('is narrow exactly where reading mode is not', () => {
    for (const w of [320, 375, 390, 430, 768, 899, 900, 1024, 1280, 2000]) expect(isNarrow(w)).toBe(!isReading(w));
    expect(isNarrow(READING_MIN - 1)).toBe(true);
    expect(isNarrow(READING_MIN)).toBe(false);
  });

  it('leaves no room for a left column on a narrow screen, and the usual width on a desktop one', () => {
    for (const w of [375, 390, 430, 768, 899]) expect(wallWidth(w)).toBe(0);
    for (const w of [900, 1280, 1440, 2000]) expect(wallWidth(w)).toBe(panelWidth(w));
  });
});

describe('distanceToFit', () => {
  it('sees the height times the margin, from the field of view', () => {
    const d = distanceToFit(2400, 35, 1.1);
    // The visible height at that distance is 2 * d * tan(fov / 2).
    expect(2 * d * Math.tan((35 * Math.PI) / 360)).toBeCloseTo(2400 * 1.1, 6);
  });

  it('goes back as the thing gets taller, and without a margin sees exactly its height', () => {
    expect(distanceToFit(3000, 35)).toBeGreaterThan(distanceToFit(2000, 35));
    expect(2 * distanceToFit(2000, 35, 1) * Math.tan((35 * Math.PI) / 360)).toBeCloseTo(2000, 6);
  });
});
