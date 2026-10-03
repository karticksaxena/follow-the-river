import { describe, expect, it, vi } from 'vitest';
import { createLoadCache, loopBounds } from './audio';

describe('loopBounds', () => {
  it('trims 50 ms from each end of a long loop', () => {
    expect(loopBounds(4)).toEqual({ start: 0.05, end: 3.95 });
  });

  it('leaves short sounds untouched', () => {
    expect(loopBounds(0.4)).toEqual({ start: 0, end: 0.4 });
  });
});

describe('createLoadCache', () => {
  it('loads each key once', async () => {
    const load = vi.fn<(key: string) => Promise<number>>(async (key) => key.length);
    const get = createLoadCache(load);
    expect(await get('abc')).toBe(3);
    expect(await get('abc')).toBe(3);
    expect(load).toHaveBeenCalledOnce();
  });

  it('forgets a failed load so the next call retries', async () => {
    const load = vi
      .fn<(key: string) => Promise<number>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(7);
    const get = createLoadCache<number>(load);
    await expect(get('x')).rejects.toThrow('offline');
    expect(await get('x')).toBe(7);
  });
});
