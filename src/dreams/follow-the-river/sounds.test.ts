import { describe, expect, it } from 'vitest';
import {
  clickSamples,
  heartbeatSamples,
  mixHorde,
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
    ['thud', () => thudSamples(RATE)],
    ['heartbeat', () => heartbeatSamples(RATE)],
    ['tape voice', () => tapeVoiceSamples(RATE, 2, seeded())],
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
