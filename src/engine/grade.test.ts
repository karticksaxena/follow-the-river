import { describe, expect, it } from 'vitest';
import { GRADES, mixGrade } from './grade';

describe('grades', () => {
  it('has every scene preset with finite values', () => {
    expect(Object.keys(GRADES).toSorted()).toEqual([
      'day',
      'dusk',
      'flashback',
      'night',
      'sunrise',
    ]);
    for (const g of Object.values(GRADES)) {
      const all = [
        g.saturation,
        g.contrast,
        g.gamma,
        ...g.lift,
        ...g.gain,
        ...g.shadows,
        ...g.highlights,
      ];
      for (const v of all) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('night is desaturated with cold teal shadows and no lifted blacks', () => {
    const n = GRADES.night;
    expect(n.saturation).toBeLessThan(1);
    expect(n.shadows[0]).toBeLessThan(n.shadows[2]);
    expect(Math.max(...n.lift)).toBeLessThanOrEqual(0.01);
  });

  it('sunrise has warm highlights over blue shadows', () => {
    const s = GRADES.sunrise;
    expect(s.highlights[0]).toBeGreaterThan(s.highlights[2]);
    expect(s.shadows[2]).toBeGreaterThan(s.shadows[0]);
  });

  it('mixGrade blends every field and returns the ends exactly', () => {
    const a = GRADES.night;
    const b = GRADES.sunrise;
    expect(mixGrade(a, b, 0)).toEqual(a);
    expect(mixGrade(a, b, 1)).toEqual(b);
    const mid = mixGrade(a, b, 0.5);
    expect(mid.saturation).toBeCloseTo((a.saturation + b.saturation) / 2);
    expect(mid.highlights[0]).toBeCloseTo((a.highlights[0] + b.highlights[0]) / 2);
  });

  it('mixGrade writes into a target without allocating a new one', () => {
    const out = mixGrade(GRADES.night, GRADES.day, 0.3);
    expect(mixGrade(GRADES.night, GRADES.day, 0.6, out)).toBe(out);
  });

  it('mixGrade clamps t', () => {
    expect(mixGrade(GRADES.night, GRADES.day, 5).saturation).toBeCloseTo(GRADES.day.saturation);
    expect(mixGrade(GRADES.night, GRADES.day, -2).saturation).toBeCloseTo(GRADES.night.saturation);
  });
});
