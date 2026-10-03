import { describe, expect, it } from 'vitest';
import { clampDelta, MAX_FRAME_SECONDS } from './time';

describe('clampDelta', () => {
  it('keeps a normal frame', () => {
    expect(clampDelta(0.016)).toBe(0.016);
  });

  it('clamps the huge gap after a tab switch', () => {
    expect(clampDelta(180)).toBe(MAX_FRAME_SECONDS);
  });

  it('treats negative and NaN as no time', () => {
    expect(clampDelta(-1)).toBe(0);
    expect(clampDelta(Number.NaN)).toBe(0);
  });
});
