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

  it('ignores itself far downriver, where Float32 rounding moves its own entry', () => {
    // The neighbour list is a Float32Array: at z ≈ -340 its own entry is ~1e-5 m off.
    const x = -1.36;
    const z = -338.73; // rounds toward the target, so a self-push points away from it
    steer(x, z, -4, -378.5, new Float32Array([x, z]), 1, out);
    expect(out.z).toBeLessThan(-0.99);
  });

  it('stands still when already on the target', () => {
    steer(1, 1, 1, 1, new Float32Array(0), 0, out);
    expect([out.x, out.z]).toEqual([0, 0]);
  });
});
