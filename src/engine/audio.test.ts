import { describe, expect, it } from 'vitest';
import { brownNoise } from './audio';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('brownNoise', () => {
  it('stays inside -1..1 and is not silent', () => {
    const samples = brownNoise(48000, seeded(7));
    const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.01);
  });
});
