import { describe, expect, it } from 'vitest';
import {
  adaptQuality,
  frameCost,
  lowerTier,
  QUALITY,
  stepQuality,
  TIERS,
  type Quality,
  type Tier,
} from './quality';

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

  it('steps down within 3 s when frames miss 60 FPS, even only just (18 ms)', () => {
    const q: Quality = { ...fresh(), ema: 12 };
    let t = 0;
    for (; t < 3 && !stepQuality(q, 18, 1 / 55); t += 1 / 55);
    expect(q.step).toBe(1);
    expect(t).toBeLessThan(3);
  });
});

describe('TIERS (what each graphics tier turns on)', () => {
  it('Low: no reflection pass, no key shadows, no AO/TRAA, no mist; only a small torch shadow', () => {
    expect(TIERS.low).toEqual({
      reflectionScale: 0,
      keyShadow: null,
      torchShadowMap: 512,
      ao: null,
      bloom: true,
      mistSteps: 0,
      dropStep: 3,
    });
  });

  it('Medium: quarter-ish reflection, one 1024 cascade, half-res 12-sample AO, 512 torch', () => {
    expect(TIERS.medium).toEqual({
      reflectionScale: 0.2,
      keyShadow: { cascades: 1, mapSize: 1024 },
      torchShadowMap: 512,
      ao: { scale: 0.5, samples: 12 },
      bloom: true,
      mistSteps: 8,
      dropStep: 1,
    });
  });

  it('High: the full look', () => {
    expect(TIERS.high).toEqual({
      reflectionScale: 0.35,
      keyShadow: { cascades: 3, mapSize: 2048 },
      torchShadowMap: 1024,
      ao: { scale: 0.75, samples: 24 },
      bloom: true,
      mistSteps: 12,
      dropStep: 0,
    });
  });

  it('never costs more on a lower tier', () => {
    const order: Tier[] = ['low', 'medium', 'high'];
    for (let i = 1; i < order.length; i++) {
      const [lo, hi] = [TIERS[order[i - 1]], TIERS[order[i]]];
      expect(lo.reflectionScale).toBeLessThanOrEqual(hi.reflectionScale);
      expect(lo.torchShadowMap).toBeLessThanOrEqual(hi.torchShadowMap);
      expect(lo.mistSteps).toBeLessThanOrEqual(hi.mistSteps);
      expect(lo.keyShadow?.cascades ?? 0).toBeLessThanOrEqual(hi.keyShadow?.cascades ?? 0);
      expect(lo.ao?.samples ?? 0).toBeLessThanOrEqual(hi.ao?.samples ?? 0);
    }
  });

  it('a drop to Low restarts at 0.6 resolution, to Medium at 0.85', () => {
    expect(QUALITY.steps[TIERS.low.dropStep]).toBe(0.6);
    const q = { ...fresh(), step: QUALITY.steps.length - 1, slow: 5 };
    expect(adaptQuality(q, 'medium', true, 40, 1 / 60)).toBe('tier');
    expect(q.step).toBe(TIERS.low.dropStep);
  });
});

describe('frameCost (what Auto is fed)', () => {
  it('a cap-paced frame is judged by its work time, so Auto can climb under the cap', () => {
    expect(frameCost(16.7, 6, 16.7)).toBe(6);
    const q = { ...fresh(), step: 2, ema: 16.7 };
    let up = false;
    for (let t = 0; t < 10 && !up; t += 1 / 60) {
      up = stepQuality(q, frameCost(16.7, 6, 16.7), 1 / 60);
    }
    expect(q.step).toBe(1);
  });

  it('a frame that overran the cap is judged by its interval', () => {
    expect(frameCost(25, 6, 16.7)).toBe(25);
    expect(frameCost(18.1, 3, 11.1)).toBe(18.1);
  });

  it('with no cap the interval is used', () => {
    expect(frameCost(8.3, 3, 0)).toBe(8.3);
  });
});
