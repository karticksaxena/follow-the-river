import { describe, expect, it } from 'vitest';
import { boxAt, resolveCircle, segmentHitsBox } from './collide';

const crate = boxAt(0, 0, 2, 2); // spans -1..1 on both axes

describe('segmentHitsBox', () => {
  const box = boxAt(0, -5, 2, 2);
  it('finds where a segment enters a box', () => {
    expect(segmentHitsBox(0, 0, 0, -10, box)).toBeCloseTo(0.4);
  });
  it('misses boxes off to the side and segments that stop short', () => {
    expect(segmentHitsBox(5, 0, 5, -10, box)).toBeNull();
    expect(segmentHitsBox(0, 0, 0, -3, box)).toBeNull();
  });
  it('reports 0 when the segment starts inside', () => {
    expect(segmentHitsBox(0, -5, 0, -6, box)).toBe(0);
  });
});

describe('resolveCircle', () => {
  it('leaves a far-away player alone', () => {
    expect(resolveCircle(5, 5, 0.3, [crate])).toEqual({ x: 5, z: 5 });
  });

  it('pushes a player out of a side to exactly the radius', () => {
    const out = resolveCircle(1.1, 0, 0.3, [crate]);
    expect(out.x).toBeCloseTo(1.3);
    expect(out.z).toBeCloseTo(0);
  });

  it('pushes a player off a corner diagonally', () => {
    const out = resolveCircle(1.1, 1.1, 0.3, [crate]);
    expect(Math.hypot(out.x - 1, out.z - 1)).toBeCloseTo(0.3);
  });

  it('gets a player whose centre is inside out through the nearest face', () => {
    const out = resolveCircle(0.9, 0, 0.3, [crate]);
    expect(out).toEqual({ x: 1.3, z: 0 });
  });
});
