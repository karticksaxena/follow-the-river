import { describe, expect, it } from 'vitest';
import { canThrow, cruiseHeading, FISH, pickStrike, strikesFor } from './fish';
import { nearestToEdge, sinkPose } from './fish-parts';

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

  it('takes the zombies nearest the water for the last lunge', () => {
    const c = new Float32Array([1, -10, 0, 2, 2, -8, 3, 1.5, -2, 4, -3, 0]);
    expect(nearestToEdge(c, 4, 3)).toEqual([2, 3, 4]);
    expect(nearestToEdge(c, 2, 3)).toEqual([2, 1]);
    expect(nearestToEdge(c, 0, 3)).toEqual([]);
  });

  it('rolls over in the first half of the sink and is fully under at the end', () => {
    expect(sinkPose(0)).toEqual({ depth: 0, roll: 0 });
    expect(sinkPose(3).roll).toBeCloseTo(Math.PI);
    expect(sinkPose(3).depth).toBeCloseTo(0.5);
    expect(sinkPose(60)).toEqual({ depth: 1, roll: Math.PI });
  });
});
