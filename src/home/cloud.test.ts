import { describe, expect, it } from 'vitest';
import { easeInOutCubic } from './cloud';

describe('easeInOutCubic', () => {
  it('starts at 0, ends at 1, passes the middle at 0.5', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });

  it('clamps outside 0..1', () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});
