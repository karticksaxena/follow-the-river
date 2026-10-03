import { describe, expect, it } from 'vitest';
import { BREATH, BREATH_SECONDS, breathEnvelope, breathSamples } from './breath';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('breathEnvelope', () => {
  it('is silent at both ends of the cycle, so the loop never clicks', () => {
    expect(breathEnvelope(0)).toBe(0);
    expect(breathEnvelope(BREATH_SECONDS - 0.001)).toBe(0);
  });

  it('breathes in, pauses, then breathes out louder', () => {
    const inhalePeak = breathEnvelope(BREATH.inhale / 2);
    const pause = breathEnvelope(BREATH.inhale + BREATH.pause / 2);
    const exhalePeak = breathEnvelope(BREATH.inhale + BREATH.pause + BREATH.exhale / 2);
    expect(inhalePeak).toBeGreaterThan(0.4);
    expect(pause).toBe(0);
    expect(exhalePeak).toBeGreaterThan(inhalePeak);
  });
});

describe('breathSamples', () => {
  it('is one cycle long, stays in range and is quiet at the loop point', () => {
    const samples = breathSamples(8000, seeded(5));
    const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    expect(samples.length).toBe(Math.floor(8000 * BREATH_SECONDS));
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.01);
    expect(Math.abs(samples[0])).toBeLessThan(0.001);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.001);
  });
});
