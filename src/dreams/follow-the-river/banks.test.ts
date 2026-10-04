import { describe, expect, it } from 'vitest';
import { bankProfile, bankY, reedPlacements } from './banks';
import { EDGE_X, FAR_EDGE_X, RIVER_X, WATER_Y } from './river';

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

describe('reeds', () => {
  const reeds = reedPlacements(20, -300);

  it('stand just above the waterline on both banks, never in the river middle', () => {
    expect(reeds.length).toBeGreaterThan(100);
    for (const r of reeds) {
      expect(r.collide).toBeUndefined();
      expect(r.kit).toBe('nature');
      const near = r.x < RIVER_X;
      const x = near ? r.x : 2 * RIVER_X - r.x;
      expect(x).toBeGreaterThan(EDGE_X);
      expect(r.y ?? 0).toBeGreaterThan(WATER_Y);
      expect(r.y ?? 0).toBeLessThan(0);
      expect(r.z).toBeLessThanOrEqual(20);
      expect(r.z).toBeGreaterThanOrEqual(-300);
      expect(r.x).toBeGreaterThan(near ? EDGE_X : RIVER_X);
      expect(r.x).toBeLessThan(near ? RIVER_X : FAR_EDGE_X);
    }
  });

  it('is the same every visit', () => {
    expect(reedPlacements(20, -300)).toEqual(reeds);
  });
});
