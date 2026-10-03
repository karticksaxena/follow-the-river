import { describe, expect, it } from 'vitest';
import { FLICKER_SECONDS, flickerOn, SHAKE_SECONDS, shakeAt, stingSamples } from './scare';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('shakeAt', () => {
  it('hits hardest at the moment of the scare and stops after', () => {
    expect(shakeAt(0)).toBe(1);
    expect(shakeAt(SHAKE_SECONDS / 2)).toBeCloseTo(0.25);
    expect(shakeAt(SHAKE_SECONDS)).toBe(0);
  });

  it('is still before the scare and for broken times', () => {
    expect(shakeAt(-1)).toBe(0);
    expect(shakeAt(Number.NaN)).toBe(0);
  });
});

describe('flickerOn', () => {
  it('stutters off and on right after the scare', () => {
    const states = new Set([0, 0.08, 0.15, 0.22, 0.3].map(flickerOn));
    expect(states).toEqual(new Set([true, false]));
  });

  it('stays on once the flicker is over', () => {
    expect(flickerOn(FLICKER_SECONDS)).toBe(true);
    expect(flickerOn(10)).toBe(true);
  });
});

describe('stingSamples', () => {
  it('is loud at the start, silent-ish at the end, and never clips past -1..1', () => {
    const samples = stingSamples(8000, 1.4, seeded(3));
    const peak = (from: number, to: number): number =>
      samples.slice(from, to).reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    expect(samples.length).toBe(11200);
    expect(peak(0, 800)).toBeGreaterThan(0.5);
    expect(peak(10400, 11200)).toBeLessThan(0.1);
    expect(peak(0, samples.length)).toBeLessThanOrEqual(1);
  });
});
