import { describe, expect, it } from 'vitest';
import { baysNear } from './railing';

describe('baysNear', () => {
  it('picks the bays around z (bay i runs from z0 − i·spacing toward −z)', () => {
    // Bays every 2.5 m from z 10: bay 4 spans 0 to −2.5, bay 3 spans 2.5 to 0.
    expect(baysNear(-1, 10, 2.5, 100, 2.6)).toEqual([3, 5]);
  });

  it('stays inside the railing at either end', () => {
    expect(baysNear(11, 10, 2.5, 8, 2.6)).toEqual([0, 0]);
    const [first, last] = baysNear(30, 10, 2.5, 8, 2.6); // past the end: nothing
    expect(first).toBeGreaterThan(last);
    expect(baysNear(-100, 10, 2.5, 8, 2.6)[1]).toBe(7);
  });
});
