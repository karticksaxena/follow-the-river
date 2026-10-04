import { describe, expect, it } from 'vitest';
import { MIST, mistDensity } from './atmosphere';

describe('mistDensity', () => {
  it('is thickest at the ground and thins with height', () => {
    expect(mistDensity(0, 0.5)).toBeGreaterThan(mistDensity(2, 0.5));
    expect(mistDensity(2, 0.5)).toBeGreaterThan(mistDensity(8, 0.5));
  });
  it('is almost nothing far above the mist and does not grow below the floor', () => {
    expect(mistDensity(MIST.height * 20, 0.5)).toBeLessThan(0.01 * MIST.density);
    expect(mistDensity(-5, 0.5)).toBe(mistDensity(0, 0.5));
  });
  it('is thicker where the drifting noise is high, never negative', () => {
    expect(mistDensity(1, 1)).toBeGreaterThan(mistDensity(1, 0));
    expect(mistDensity(1, 0)).toBeGreaterThan(0);
  });
});
