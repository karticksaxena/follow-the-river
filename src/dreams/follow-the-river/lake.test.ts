import { describe, expect, it } from 'vitest';
import { beachBlend, shoreHeight, waterlineDistance } from './lake';
import { EDGE_X, FAR_EDGE_X, LAKE, shoreY, WATER_Y } from './river';

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

describe('waterlineDistance (the foam band)', () => {
  const frame = { z: -400, west: LAKE.west, east: LAKE.east };
  it('is zero at the beach and large across the open river mouth', () => {
    expect(waterlineDistance(-6, frame.z, frame)).toBeCloseTo(0);
    expect(waterlineDistance((EDGE_X + FAR_EDGE_X) / 2, frame.z - 0.01, frame)).toBeGreaterThan(10);
  });
  it('follows the flared bank in the mouth, not the lake line', () => {
    expect(waterlineDistance(EDGE_X + 2, frame.z + 20, frame)).toBeCloseTo(2);
  });
});

describe('beachBlend (pebbles to land)', () => {
  it('is pebbles on the slope and fully land by the shore mesh edge, so no seam against the ground', () => {
    expect(beachBlend(0)).toBe(0);
    expect(beachBlend(-LAKE.slopeStart)).toBe(0);
    expect(beachBlend(-LAKE.pebbleDepth)).toBe(1); // the ground plane starts here
    expect(beachBlend(-30)).toBe(1);
    expect(beachBlend(-5)).toBeGreaterThan(0);
  });
});
