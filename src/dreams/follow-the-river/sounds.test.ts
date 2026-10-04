import { describe, expect, it } from 'vitest';
import {
  blowSamples,
  clickSamples,
  dawnSamples,
  dryFireSamples,
  gunshotSamples,
  heartbeatSamples,
  mixHorde,
  orcaCrySamples,
  pluckSamples,
  splashSamples,
  tapeVoiceSamples,
  thudSamples,
} from './sounds';

function seeded(seed = 1): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const peak = (a: Float32Array): number => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const RATE = 8000;

describe('procedural sounds', () => {
  it.each([
    ['pluck', () => pluckSamples(RATE, 110, 0.6, seeded())],
    ['splash', () => splashSamples(RATE, 0.8, seeded())],
    ['blow', () => blowSamples(RATE, 0.6, seeded())],
    ['thud', () => thudSamples(RATE)],
    ['heartbeat', () => heartbeatSamples(RATE)],
    ['tape voice', () => tapeVoiceSamples(RATE, 2, seeded())],
    ['gunshot', () => gunshotSamples(RATE, seeded())],
    ['orca cry', () => orcaCrySamples(RATE, 2.5, seeded())],
    ['dawn', () => dawnSamples(RATE, 12)],
  ])('%s stays in range and is not silent', (_, make) => {
    const samples = make();
    expect(samples.length).toBeGreaterThan(RATE * 0.1);
    expect(peak(samples)).toBeLessThanOrEqual(1);
    expect(peak(samples)).toBeGreaterThan(0.05);
  });

  it('click is a short tick in range', () => {
    const samples = clickSamples(RATE, seeded());
    expect(samples.length).toBe(RATE * 0.025);
    expect(peak(samples)).toBeLessThanOrEqual(1);
    expect(peak(samples)).toBeGreaterThan(0.05);
  });

  it('blow is 0.6 s and fades in and out (no click)', () => {
    const s = blowSamples(RATE, 0.6, seeded());
    expect(s.length).toBe(RATE * 0.6);
    expect(Math.abs(s[0] ?? 1)).toBeLessThan(0.01);
    expect(Math.abs(s[s.length - 1] ?? 1)).toBeLessThan(0.01);
  });

  it('gunshot is 0.6 s, orca cry 2.5 s, dawn 12 s', () => {
    expect(gunshotSamples(RATE, seeded()).length).toBe(RATE * 0.6);
    expect(orcaCrySamples(RATE, 2.5, seeded()).length).toBe(RATE * 2.5);
    expect(dawnSamples(RATE, 12).length).toBe(RATE * 12);
  });

  it('dawn loops without a click and stays soft', () => {
    const s = dawnSamples(RATE, 12);
    const step = s.reduce((m, v, i) => Math.max(m, Math.abs(v - (s[i - 1] ?? v))), 0);
    expect(Math.abs((s[0] ?? 0) - (s[s.length - 1] ?? 0))).toBeLessThanOrEqual(step);
    expect(peak(s)).toBeLessThan(0.9);
  });

  it('orca cry fades in and out (no click at either end)', () => {
    const s = orcaCrySamples(RATE, 2.5, seeded());
    expect(Math.abs(s[0] ?? 1)).toBeLessThan(0.01);
    expect(Math.abs(s[s.length - 1] ?? 1)).toBeLessThan(0.01);
  });

  it('dry fire is a short tick in range', () => {
    const s = dryFireSamples(RATE, seeded());
    expect(s.length).toBeLessThan(RATE * 0.1);
    expect(peak(s)).toBeLessThanOrEqual(1);
    expect(peak(s)).toBeGreaterThan(0.05);
  });

  it('is repeatable with the same random source', () => {
    expect(splashSamples(RATE, 0.3, seeded(4))).toEqual(splashSamples(RATE, 0.3, seeded(4)));
  });

  it('plucks fade out (a bow string, not a drone)', () => {
    const s = pluckSamples(RATE, 110, 1, seeded());
    expect(peak(s.subarray(s.length - RATE / 10))).toBeLessThan(peak(s.subarray(0, RATE / 10)) / 4);
  });
});

describe('mixHorde', () => {
  it('layers many groans into a loop of the requested length with a safe peak', () => {
    const groan = new Float32Array(RATE).map((_, i) => Math.sin(i / 10));
    const mix = mixHorde(RATE, [groan, groan], 4, 12, seeded());
    expect(mix.length).toBe(RATE * 4);
    expect(peak(mix)).toBeLessThanOrEqual(0.8 + 1e-6);
    expect(peak(mix)).toBeGreaterThan(0.5);
  });

  it('loops without a click: the last sample flows into the first', () => {
    const groan = new Float32Array(RATE).map((_, i) => Math.sin(i / 10));
    const mix = mixHorde(RATE, [groan], 4, 12, seeded());
    expect(Math.abs((mix[0] ?? 0) - (mix[mix.length - 1] ?? 0))).toBeLessThan(0.05);
  });

  it('returns silence when there are no groans', () => {
    expect(peak(mixHorde(RATE, [], 1, 5, seeded()))).toBe(0);
  });
});
