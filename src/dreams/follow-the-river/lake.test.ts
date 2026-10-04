import { describe, expect, it } from 'vitest';
import { shoreHeight } from './lake';
import { LAKE, shoreY, WATER_Y } from './river';

describe('shoreHeight', () => {
  it('is the water level at the waterline, level inland and below the water inside', () => {
    expect(shoreHeight(0)).toBe(WATER_Y);
    for (const inland of [-LAKE.slopeStart, -5, -20, -200]) {
      expect(shoreHeight(inland)).toBeGreaterThanOrEqual(0);
    }
    expect(shoreHeight(2)).toBeLessThan(WATER_Y);
    expect(shoreHeight(500)).toBe(shoreHeight(LAKE.slopeRun)); // the bed is flat past the slope
    expect(shoreHeight(-1.5)).toBe(shoreY(1.5));
  });
});
