import { describe, expect, it } from 'vitest';
import {
  adaptQuality,
  frameCost,
  isHitch,
  lowerTier,
  pixelRatio,
  QUALITY,
  settleTier,
  stepQuality,
  tierDue,
  TIERS,
  type Quality,
  type Tier,
} from './quality';

const fresh = (): Quality => ({ step: 0, slow: 0, fast: 0, since: 10, ema: 16, raises: 0 });

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
      traa: false,
      bloom: true,
      mistSteps: 0,
      maxPixelRatio: 1,
      dropStep: 3,
    });
  });

  it('Medium: quarter-ish reflection, one 1024 cascade, half-res 10-sample AO, SMAA, 6 mist steps, 512 torch', () => {
    expect(TIERS.medium).toEqual({
      reflectionScale: 0.2,
      keyShadow: { cascades: 1, mapSize: 1024 },
      torchShadowMap: 512,
      ao: { scale: 0.5, samples: 10 },
      traa: false,
      bloom: true,
      mistSteps: 6,
      maxPixelRatio: 1,
      dropStep: 1,
    });
  });

  it('High: 2 x 1536 cascades, half-res 16-sample AO, TRAA', () => {
    expect(TIERS.high).toEqual({
      reflectionScale: 0.35,
      keyShadow: { cascades: 2, mapSize: 1536 },
      torchShadowMap: 1024,
      ao: { scale: 0.5, samples: 16 },
      traa: true,
      bloom: true,
      mistSteps: 12,
      maxPixelRatio: 1.5,
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

describe('tierDue / settleTier (a tier change waits for the next warm-up)', () => {
  it('judges without touching the state; settling applies it later', () => {
    const q = { ...fresh(), step: QUALITY.steps.length - 1, slow: 5 };
    const before = { ...q };
    expect(tierDue(q, 'high', true)).toBe('tier');
    expect(tierDue(q, 'high', false)).toBeNull(); // a fixed tier never changes
    expect(q).toEqual(before); // play goes on at the same tier and resolution
    expect(settleTier(q, 'high', 'tier')).toBe('medium');
    expect(q.step).toBe(TIERS.medium.dropStep);
  });

  it('a raise counts toward the cap', () => {
    const q = { ...fresh(), fast: QUALITY.raiseFor };
    expect(tierDue(q, 'low', true, 'high')).toBe('raise');
    expect(settleTier(q, 'low', 'raise')).toBe('medium');
    expect(q.raises).toBe(1);
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

describe('isHitch (a stall is not slowness)', () => {
  it('flags only frames far longer than a slow GPU would give', () => {
    expect(isHitch(0.033)).toBe(false);
    expect(isHitch(0.1)).toBe(false);
    expect(isHitch(2.4)).toBe(true); // a pipeline-compile stall must not drop the tier
  });
});

describe('pixelRatio', () => {
  it('caps the device ratio per tier: 1.0 on Low/Medium, 1.5 on High', () => {
    const q = fresh();
    expect(pixelRatio(q, 2, 'low')).toBe(1);
    expect(pixelRatio(q, 2, 'medium')).toBe(1);
    expect(pixelRatio(q, 2, 'high')).toBe(1.5);
    expect(pixelRatio(q, 1, 'high')).toBe(1);
  });
});

const run = (q: Quality, tier: Tier, ceiling: Tier, seconds: number): string | null => {
  let last: string | null = null;
  for (let t = 0; t < seconds; t += 1 / 60) {
    const c = adaptQuality(q, tier, true, 8, 1 / 60, ceiling);
    if (c) last = c;
  }
  return last;
};

describe('Auto raise', () => {
  it('climbs one tier after 20 s of headroom at the best step, never above the ceiling', () => {
    expect(run(fresh(), 'low', 'medium', 19)).toBeNull();
    const q = fresh();
    expect(run(q, 'low', 'medium', 21)).toBe('raise');
    expect(q.raises).toBe(1);
    expect(q.step).toBe(TIERS.medium.dropStep);
    expect(run(fresh(), 'medium', 'medium', 60)).toBeNull();
  });

  it('raises only once a session, and not while at a lower resolution step', () => {
    const q = { ...fresh(), raises: 1 };
    expect(run(q, 'low', 'high', 60)).toBeNull();
    expect(run({ ...fresh(), step: 2 }, 'low', 'high', 8)).toBe('res');
  });
});
