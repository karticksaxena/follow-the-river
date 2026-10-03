import { describe, expect, it } from 'vitest';
import { internalResolution } from './resolution';

describe('internalResolution', () => {
  it('scales a 16:9 window down to the target height', () => {
    expect(internalResolution(1920, 1080, 360)).toEqual({ width: 640, height: 360 });
  });

  it('never upscales a window smaller than the target', () => {
    expect(internalResolution(400, 300, 360)).toEqual({ width: 400, height: 300 });
  });

  it('survives a zero-size window', () => {
    expect(internalResolution(0, 0, 360)).toEqual({ width: 1, height: 1 });
  });
});
