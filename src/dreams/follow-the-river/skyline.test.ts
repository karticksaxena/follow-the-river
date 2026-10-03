import { describe, expect, it } from 'vitest';
import { buildingFor, skylineLayout } from './skyline';

describe('skylineLayout', () => {
  it('is the same every time for the same seed', () => {
    expect(skylineLayout(7, 10, 22, 60)).toEqual(skylineLayout(7, 10, 22, 60));
  });

  it('runs past the fog in both directions, so no row end is ever visible', () => {
    const zs = skylineLayout(7, 60, 22, 60).map((s) => s.z);
    expect(Math.max(...zs)).toBeGreaterThan(70);
    expect(Math.min(...zs)).toBeLessThan(-180);
  });

  it('keeps every silhouette outside the walkable strip', () => {
    for (const s of skylineLayout(7, 60, 22, 60)) {
      expect(s.x).toBeGreaterThanOrEqual(22);
      expect(s.x).toBeLessThanOrEqual(60);
    }
  });
});

describe('buildingFor', () => {
  it('picks taller Blender buildings for taller silhouettes', () => {
    expect(buildingFor(25)).toBe('buildingTall');
    expect(buildingFor(15)).toBe('buildingMid');
    expect(buildingFor(8)).toBe('buildingLow');
  });
});
