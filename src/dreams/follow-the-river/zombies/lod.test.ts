import { describe, expect, it } from 'vitest';
import { advanceMixer, facingCos, LOD, mixerStep } from './lod';

describe('mixerStep', () => {
  it('near zombies animate every frame, seen or not', () => {
    expect(mixerStep(3, 1)).toBe(1);
    expect(mixerStep(LOD.near, -1)).toBe(1);
  });

  it('mid-range: every frame on screen, every 2nd off screen', () => {
    expect(mixerStep(18, 0.9)).toBe(1);
    expect(mixerStep(18, -0.5)).toBe(2);
  });

  it('far: every 2nd frame on screen, every 4th off screen', () => {
    expect(mixerStep(40, 0.9)).toBe(2);
    expect(mixerStep(40, -0.9)).toBe(4);
  });
});

describe('facingCos', () => {
  it('is 1 ahead, -1 behind, 0 beside; 1 when the view is vertical', () => {
    expect(facingCos(0, 1, 0, 5, 5)).toBeCloseTo(1);
    expect(facingCos(0, 1, 0, -5, 5)).toBeCloseTo(-1);
    expect(facingCos(0, 1, 5, 0, 5)).toBeCloseTo(0);
    expect(facingCos(0, 0, 5, 0, 5)).toBe(1);
  });
});

describe('advanceMixer', () => {
  it('step 1 passes every dt through', () => {
    const c = { owed: 0, frames: 0 };
    expect(advanceMixer(c, 0.016, 1)).toBeCloseTo(0.016);
    expect(advanceMixer(c, 0.02, 1)).toBeCloseTo(0.02);
  });

  it('step 3 updates every 3rd frame with the whole dt owed, so the speed is unchanged', () => {
    const c = { owed: 0, frames: 0 };
    let total = 0;
    let updates = 0;
    for (let i = 0; i < 12; i++) {
      const due = advanceMixer(c, 0.01, 3);
      if (due > 0) updates++;
      total += due;
    }
    expect(updates).toBe(4);
    expect(total).toBeCloseTo(0.12);
  });

  it('a step that drops to 1 pays the debt at once', () => {
    const c = { owed: 0, frames: 0 };
    advanceMixer(c, 0.01, 4);
    advanceMixer(c, 0.01, 4);
    expect(advanceMixer(c, 0.01, 1)).toBeCloseTo(0.03);
  });
});
