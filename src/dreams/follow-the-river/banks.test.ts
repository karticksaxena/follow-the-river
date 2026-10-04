import { describe, expect, it } from 'vitest';
import { bankProfile, bankY, waterlineX } from './banks';
import { EDGE_X, RIVER_X, WATER_Y } from './river';

describe('bank profiles', () => {
  it('starts both kinds level with the ground at the river edge', () => {
    expect(bankY('natural', EDGE_X)).toBe(0);
    expect(bankY('embankment', EDGE_X)).toBe(0);
  });

  it('a natural bank is a short cut bank: water within a metre of where you stand', () => {
    expect(waterlineX('natural')).toBeGreaterThan(EDGE_X);
    expect(waterlineX('natural') - EDGE_X).toBeLessThan(0.6);
    expect(waterlineX('embankment')).toBe(EDGE_X);
    expect(bankY('natural', waterlineX('natural'))).toBeCloseTo(WATER_Y, 2);
  });

  it('drops the embankment wall below the water and ends every profile on the riverbed', () => {
    const wall = bankProfile('embankment').filter((p) => p.x === EDGE_X);
    expect(Math.min(...wall.map((p) => p.y))).toBeLessThan(WATER_Y);
    for (const kind of ['natural', 'embankment'] as const) {
      const last = bankProfile(kind).at(-1);
      expect(last?.y).toBeLessThan(WATER_Y);
      expect(last?.x).toBeLessThan(RIVER_X);
    }
  });
});
