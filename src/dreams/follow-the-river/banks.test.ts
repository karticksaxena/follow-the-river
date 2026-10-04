import { describe, expect, it } from 'vitest';
import { bankProfile, bankY } from './banks';
import { EDGE_X, RIVER_X, WATER_Y } from './river';

describe('bank profiles', () => {
  it('starts both kinds level with the ground at the river edge', () => {
    expect(bankY('natural', EDGE_X)).toBe(0);
    expect(bankY('embankment', EDGE_X)).toBe(0);
  });

  it('slopes the natural bank under the water between x 4.2 and 7', () => {
    expect(bankY('natural', 4.2)).toBeGreaterThan(WATER_Y);
    expect(bankY('natural', 7)).toBeLessThan(WATER_Y);
    let crossing = 0;
    for (let x = 4.2; x <= 7; x += 0.01) if (bankY('natural', x) > WATER_Y) crossing = x;
    expect(crossing).toBeGreaterThan(4.2);
    expect(crossing).toBeLessThan(7);
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
