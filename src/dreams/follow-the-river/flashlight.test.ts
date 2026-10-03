import { describe, expect, it } from 'vitest';
import { BATTERY, beamLevel, drainBattery } from './flashlight';

describe('battery', () => {
  it('drains only while on and never below zero', () => {
    expect(drainBattery(50, false, 10)).toBe(50);
    expect(drainBattery(50, true, 10)).toBeCloseTo(50 - 10 * BATTERY.drainPerSecond);
    expect(drainBattery(1, true, 100)).toBe(0);
  });

  it('shines fully above the low mark and not at all when empty', () => {
    expect(beamLevel(80, 3.3)).toBe(1);
    expect(beamLevel(0, 3.3)).toBe(0);
  });

  it('stutters when low: sometimes dimmed, never above full', () => {
    const levels = Array.from({ length: 200 }, (_, i) => beamLevel(BATTERY.low / 2, i * 0.05));
    expect(Math.min(...levels)).toBeLessThan(0.6);
    expect(Math.max(...levels)).toBeLessThanOrEqual(1);
  });
});
