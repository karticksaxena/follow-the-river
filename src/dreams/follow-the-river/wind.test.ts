import { describe, expect, it } from 'vitest';
import { WIND, windAmplitude } from './wind';

describe('windAmplitude', () => {
  it('is zero at the base: trunks and roots stay still', () => {
    for (const look of [WIND.tree, WIND.plant, WIND.grass]) {
      expect(windAmplitude(0, look)).toBe(0);
      expect(windAmplitude(-0.3, look)).toBe(0);
    }
  });

  it('grows with height and stops growing at the reach', () => {
    const look = WIND.tree;
    let last = 0;
    for (let h = 1; h <= look.reach; h += 1) {
      const a = windAmplitude(h, look);
      expect(a).toBeGreaterThan(last);
      last = a;
    }
    expect(windAmplitude(look.reach, look)).toBeCloseTo(look.strength);
    expect(windAmplitude(look.reach * 3, look)).toBeCloseTo(look.strength);
  });

  it('bends low (a quarter of the way up) far less than the tip', () => {
    expect(windAmplitude(WIND.tree.reach / 4, WIND.tree)).toBeLessThan(WIND.tree.strength / 10);
  });

  it('keeps every sway gentle: under a metre', () => {
    for (const look of [WIND.tree, WIND.plant, WIND.grass]) expect(look.strength).toBeLessThan(1);
  });
});
