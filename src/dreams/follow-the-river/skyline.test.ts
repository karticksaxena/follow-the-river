import { describe, expect, it } from 'vitest';
import { buildingFor, skylineLayout } from './skyline';

describe('skylineLayout', () => {
  it('is the same every time for the same seed', () => {
    expect(skylineLayout(7, 10, 22, 60)).toEqual(skylineLayout(7, 10, 22, 60));
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
