import { describe, expect, it } from 'vitest';
import { SEPARATION, steer } from './steer';

describe('steer', () => {
  const out = { x: 0, z: 0 };
  it('heads straight for the target with no neighbours', () => {
    steer(0, 0, 0, -10, new Float32Array(0), 0, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-1);
  });

  it('is pushed sideways by a neighbour that is too close', () => {
    steer(0, 0, 0, -10, new Float32Array([-SEPARATION / 2, 0]), 1, out);
    expect(out.x).toBeGreaterThan(0.1);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(1);
  });

  it('ignores neighbours that are far enough away, and itself', () => {
    steer(0, 0, 0, -10, new Float32Array([5, 5, 0, 0]), 2, out);
    expect(out.x).toBeCloseTo(0);
  });

  it('stands still when already on the target', () => {
    steer(1, 1, 1, 1, new Float32Array(0), 0, out);
    expect([out.x, out.z]).toEqual([0, 0]);
  });
});
