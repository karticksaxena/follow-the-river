import { describe, expect, it } from 'vitest';
import { boxAt, resolveCircle } from './collide';

const crate = boxAt(0, 0, 2, 2); // spans -1..1 on both axes

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
