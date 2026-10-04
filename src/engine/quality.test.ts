import { describe, expect, it } from 'vitest';
import { adaptQuality, lowerTier, QUALITY, stepQuality, type Quality, type Tier } from './quality';

const fresh = (): Quality => ({ step: 0, slow: 0, fast: 0, since: 10, ema: 16 });

describe('stepQuality', () => {
  it('drops one step after 2 s of slow frames, never twice within the gap', () => {
    const q = fresh();
    let changes = 0;
    for (let t = 0; t < 3; t += 1 / 40) if (stepQuality(q, 25, 1 / 40)) changes++;
    expect(q.step).toBe(1);
    expect(changes).toBe(1);
  });

  it('climbs back only after 5 s of fast frames', () => {
    const q: Quality = { ...fresh(), step: 2 };
    let t = 0;
    for (; t < 4.9; t += 1 / 60) stepQuality(q, 8, 1 / 60);
    expect(q.step).toBe(2);
    for (; t < 6; t += 1 / 60) stepQuality(q, 8, 1 / 60);
    expect(q.step).toBe(1);
  });

  it('never goes past the last step, and does not oscillate around the thresholds', () => {
    const q = fresh();
    let flips = 0;
    for (let t = 0; t < 60; t += 1 / 60) if (stepQuality(q, t % 2 < 1 ? 17 : 14, 1 / 60)) flips++;
    expect(flips).toBe(0);
    for (let t = 0; t < 60; t += 1 / 60) stepQuality(q, 40, 1 / 60);
    expect(q.step).toBe(QUALITY.steps.length - 1);
  });

  it('changes at most every minGap seconds', () => {
    const q = fresh();
    const times: number[] = [];
    for (let t = 0; t < 40; t += 1 / 60) if (stepQuality(q, 40, 1 / 60)) times.push(t);
    expect(times.length).toBeGreaterThan(1);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(QUALITY.minGap - 0.02);
    }
  });
});

describe('adaptQuality', () => {
  it('auto lowers the tier only after the resolution is at its last step', () => {
    const q = fresh();
    const log: string[] = [];
    let tier: Tier = 'high';
    for (let t = 0; t < 80; t += 1 / 60) {
      const change = adaptQuality(q, tier, true, 40, 1 / 60);
      if (change === 'tier') tier = lowerTier(tier);
      if (change) log.push(`${change}:${q.step}`);
    }
    expect(log.slice(0, 5)).toEqual(['res:1', 'res:2', 'res:3', 'res:4', 'tier:1']);
    expect(tier).toBe('low');
  });

  it('a fixed tier only ever steps the resolution', () => {
    const q = fresh();
    for (let t = 0; t < 60; t += 1 / 60) {
      expect(adaptQuality(q, 'high', false, 40, 1 / 60)).not.toBe('tier');
    }
  });

  it('low is the floor', () => {
    expect(lowerTier('low')).toBe('low');
    expect(lowerTier('high')).toBe('medium');
  });
});
