import { describe, expect, it } from 'vitest';
import { canThrow, cruiseHeading, FISH, pickStrike, strikesFor } from './fish';
import {
  cruiseTargetX,
  cruiseYFor,
  inWaterX,
  nextSurfacing,
  SURFACE_MAX,
  SURFACE_MIN,
  surfaceYFor,
} from './fish-parts';
import { EDGE_X, WATER_Y } from './river';

describe('fish', () => {
  it('gets stronger with every pack thrown in by day', () => {
    expect(strikesFor(0)).toBe(FISH.baseStrikes);
    expect(strikesFor(2)).toBe(FISH.baseStrikes + 2 * FISH.strikesPerPack);
  });

  it('only takes zombies near the water, nearest to the player first', () => {
    const edge = 3;
    // id, x, z
    const c = new Float32Array([1, -10, 0, 2, 2, -8, 3, 1.5, -2]);
    expect(pickStrike(c, 3, { x: 0, z: 0 }, edge)).toBe(3);
    expect(pickStrike(new Float32Array([1, -10, 0]), 1, { x: 0, z: 0 }, edge)).toBeNull();
  });

  it('lets you throw only from the edge and only with a pack', () => {
    expect(canThrow(2, 3, 1)).toBe(true);
    expect(canThrow(-2, 3, 1)).toBe(false);
    expect(canThrow(2, 3, 0)).toBe(false);
  });

  it('rests facing downstream when not swimming along the river', () => {
    expect(cruiseHeading(1.5, 0)).toBe(0);
    expect(Math.abs(cruiseHeading(1, -2.5))).toBeLessThanOrEqual(0.25);
    expect(cruiseHeading(0, 2.5)).toBeCloseTo(Math.PI);
  });

  it('cruises in a lane beside the player bank, all through the weave', () => {
    for (let t = 0; t < 60; t += 0.5) {
      const x = cruiseTargetX(EDGE_X, t);
      expect(x).toBeGreaterThanOrEqual(EDGE_X + 2.5);
      expect(x).toBeLessThanOrEqual(EDGE_X + 5.5);
    }
  });

  it('cruises with the fin above the water and the back under it', () => {
    const finTop = 2; // any measured fin top
    expect(cruiseYFor(finTop) + finTop).toBeGreaterThan(WATER_Y);
    expect(cruiseYFor(finTop) + finTop - 1.45).toBeLessThan(WATER_Y);
    expect(surfaceYFor(finTop) + finTop - 1.45).toBeGreaterThan(WATER_Y);
  });

  it('surfaces every 18 to 30 seconds', () => {
    expect(nextSurfacing(0)).toBe(SURFACE_MIN);
    expect(nextSurfacing(0.999)).toBeLessThan(SURFACE_MAX);
    expect(SURFACE_MIN).toBe(18);
    expect(SURFACE_MAX).toBe(30);
  });

  it('keeps the whole 7 m orca in the river, even turned toward the bank', () => {
    const edge = 3;
    for (const yaw of [0, 0.4, Math.PI / 2, -Math.PI / 2, Math.PI, 2.5]) {
      const x = inWaterX(edge + 0.5, yaw, edge);
      const nose = x - Math.sin(yaw) * 3.5;
      const tail = x + Math.sin(yaw) * 3.5;
      expect(Math.min(nose, tail)).toBeGreaterThan(edge);
    }
    expect(inWaterX(9, 0, edge)).toBe(9); // already well out: unchanged
  });
});
