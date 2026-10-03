import { describe, expect, it } from 'vitest';
import { inCone, raySphere } from './ray';

describe('raySphere', () => {
  it('hits a sphere straight ahead at its near surface', () => {
    expect(raySphere(0, 0, 0, 0, 0, -1, 0, 0, -10, 1)).toBeCloseTo(9);
  });

  it('misses a sphere off to the side or behind', () => {
    expect(raySphere(0, 0, 0, 0, 0, -1, 3, 0, -10, 1)).toBeNull();
    expect(raySphere(0, 0, 0, 0, 0, -1, 0, 0, 10, 1)).toBeNull();
  });

  it('reports 0 when starting inside the sphere', () => {
    expect(raySphere(0, 0, 0, 0, 0, -1, 0, 0, -0.5, 1)).toBe(0);
  });
});

describe('inCone', () => {
  const eye = { x: 0, y: 1.6, z: 0 };
  const look = { x: 0, y: 0, z: -1 };
  it('sees a target straight ahead in range', () => {
    expect(inCone(eye, look, { x: 0, y: 1.6, z: -8 }, 14, 0.35)).toBe(true);
  });
  it('ignores targets outside the angle, beyond range, or behind', () => {
    expect(inCone(eye, look, { x: 6, y: 1.6, z: -6 }, 14, 0.35)).toBe(false);
    expect(inCone(eye, look, { x: 0, y: 1.6, z: -20 }, 14, 0.35)).toBe(false);
    expect(inCone(eye, look, { x: 0, y: 1.6, z: 5 }, 14, 0.35)).toBe(false);
  });
});
