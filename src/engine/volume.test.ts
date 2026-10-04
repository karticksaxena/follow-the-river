import { describe, expect, it } from 'vitest';
import { VOLUME, volumeSteps } from './volume';

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

describe('the mist ceiling (it was once a white wall)', () => {
  it('adds at most a small cap per channel', () => {
    expect(VOLUME.strength).toBeLessThanOrEqual(1);
    expect(VOLUME.cap).toBeLessThanOrEqual(0.2);
  });
});
