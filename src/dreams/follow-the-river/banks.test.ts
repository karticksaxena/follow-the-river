import { describe, expect, it } from 'vitest';
import { bankProfile, bankY, stripGeometry, waterlineX } from './banks';
import { EDGE_X, LAKE, RIVER_X, shoreY, WATER_Y } from './river';
import { noBend } from './shore-shape';

describe('the banks at the lake mouth', () => {
  const lakeZ = -392;
  const cap = (z: number): number => shoreY(Math.max(z - lakeZ, -LAKE.slopeRun));

  it('never stand above the lake shore beside them (no grass slab across the beach)', () => {
    const zs = [lakeZ + 6, lakeZ + 4, lakeZ + 2, lakeZ];
    const g = stripGeometry(bankProfile('natural'), zs, false, { bend: noBend, cap });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      expect(p.getY(i)).toBeLessThanOrEqual(cap(p.getZ(i)) + 1e-9);
    }
    expect(cap(lakeZ + 2)).toBeLessThan(-0.4); // it really does bring the top down
  });
});

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
