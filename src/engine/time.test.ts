import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampDelta, MAX_FRAME_SECONDS, withTimeout } from './time';

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

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes through a result that arrives in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('passes through a failure that arrives in time', async () => {
    await expect(withTimeout(Promise.reject(new Error('404')), 1000)).rejects.toThrow('404');
  });

  it('gives up on a download that never finishes', async () => {
    vi.useFakeTimers();
    const stalled = withTimeout(new Promise<never>(() => undefined), 20_000);
    vi.advanceTimersByTime(20_000);
    await expect(stalled).rejects.toThrow('Timed out');
  });
});
