import { describe, expect, it } from 'vitest';
import { shaftEnvelope, shaftFacing, VOLUME, volumeSteps } from './volume';

describe('volumeSteps', () => {
  it('is off on Low, 8 on Medium and 12 on High (WebGPU)', () => {
    expect(volumeSteps('low', true)).toBe(0);
    expect(volumeSteps('medium', true)).toBe(8);
    expect(volumeSteps('high', true)).toBe(12);
  });
  it('is off everywhere on WebGL 2', () => {
    for (const t of ['low', 'medium', 'high'] as const) expect(volumeSteps(t, false)).toBe(0);
  });
});

describe('shaftEnvelope', () => {
  it('is dark before the sun comes up, peaks mid-rise and is gone at the end of the dawn', () => {
    expect(shaftEnvelope(0)).toBe(0);
    expect(shaftEnvelope(0.35)).toBe(0);
    expect(shaftEnvelope(0.65)).toBeGreaterThan(0.9);
    expect(shaftEnvelope(1)).toBe(0);
  });
});

describe('shaftFacing', () => {
  it('is 1 looking at the sun and 0 looking away', () => {
    expect(shaftFacing(1)).toBe(1);
    expect(shaftFacing(0)).toBe(0);
    expect(shaftFacing(-1)).toBe(0);
  });
});

describe('the mist ceiling (it was once a white wall)', () => {
  it('adds at most a small cap per channel', () => {
    expect(VOLUME.strength).toBeLessThanOrEqual(1);
    expect(VOLUME.cap).toBeLessThanOrEqual(0.2);
  });
});
