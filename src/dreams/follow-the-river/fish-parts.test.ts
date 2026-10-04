import { describe, expect, it } from 'vitest';
import { ANATOMY } from './dras-anatomy';
import { headPoint, WET } from './fish-parts';

describe('Dras head point (for the torch)', () => {
  const out = { x: 0, y: 0, z: 0 };
  it('is the eye, ahead of the centre along the heading', () => {
    headPoint(2, -1, 5, 0, out);
    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(-1 + ANATOMY.eye.up);
    expect(out.z).toBeCloseTo(5 - ANATOMY.eye.ahead);
    headPoint(0, 0, 0, Math.PI / 2, out); // yaw pi/2: nose toward -X
    expect(out.x).toBeCloseTo(-ANATOMY.eye.ahead);
    expect(out.z).toBeCloseTo(0);
  });
  it('wet skin is glossier than the old 0.3 and the eye glossier still', () => {
    expect(WET.skin).toBe(0.25);
    expect(WET.eye).toBeLessThan(WET.skin);
  });
});
