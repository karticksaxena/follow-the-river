import { describe, expect, it } from 'vitest';
import { canThrow, cruiseHeading, FISH, pickStrike, strikesFor } from './fish';
import {
  cruiseTargetX,
  cruiseYFor,
  nearestTo,
  nextSurfacing,
  sinkPose,
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

  it('takes the zombies nearest the player for the last lunge', () => {
    // id, x, z — the player stands at (0, 0)
    const c = new Float32Array([1, -10, 0, 2, 2, -8, 3, 1.5, -2, 4, -3, 0]);
    const player = { x: 0, z: 0 };
    expect(nearestTo(c, 4, 3, player)).toEqual([3, 4, 2]);
    expect(nearestTo(c, 2, 3, player)).toEqual([2, 1]);
    expect(nearestTo(c, 0, 3, player)).toEqual([]);
  });

  it('rolls over in the first half of the sink and is fully under at the end', () => {
    expect(sinkPose(0)).toEqual({ depth: 0, roll: 0 });
    expect(sinkPose(3).roll).toBeCloseTo(Math.PI);
    expect(sinkPose(3).depth).toBeCloseTo(0.5);
    expect(sinkPose(60)).toEqual({ depth: 1, roll: Math.PI });
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
});
