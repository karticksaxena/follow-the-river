import { describe, expect, it } from 'vitest';
import { canThrow, FISH, pickStrike, strikesFor } from './fish';

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
});
