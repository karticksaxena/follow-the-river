import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampDelta, MAX_FRAME_SECONDS, withTimeout, type VisibilitySource } from './time';

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

function fakeSource(): VisibilitySource & {
  show(v: boolean): void;
  listeners: Set<() => void>;
} {
  let visible = true;
  const listeners = new Set<() => void>();
  return {
    listeners,
    visible: () => visible,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    show(v) {
      visible = v;
      for (const cb of listeners) cb();
    },
  };
}

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

  describe('visible time only', () => {
    it('does not count a hidden period', async () => {
      vi.useFakeTimers();
      const src = fakeSource();
      const p = withTimeout(new Promise<never>(() => undefined), 1000, src);
      const seen = vi.fn<() => void>();
      p.catch(seen);
      vi.advanceTimersByTime(600);
      src.show(false);
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      expect(seen).not.toHaveBeenCalled();
      src.show(true);
      vi.advanceTimersByTime(399);
      await Promise.resolve();
      expect(seen).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      await expect(p).rejects.toThrow('Timed out after 1000 ms');
    });

    it('resolves in time and drops its listener', async () => {
      const src = fakeSource();
      await expect(withTimeout(Promise.resolve(1), 1000, src)).resolves.toBe(1);
      expect(src.listeners.size).toBe(0);
    });

    it('drops its listener after a failure or a timeout', async () => {
      vi.useFakeTimers();
      const src = fakeSource();
      await expect(withTimeout(Promise.reject(new Error('x')), 1000, src)).rejects.toThrow('x');
      expect(src.listeners.size).toBe(0);
      const stalled = withTimeout(new Promise<never>(() => undefined), 10, src);
      vi.advanceTimersByTime(10);
      await expect(stalled).rejects.toThrow('Timed out');
      expect(src.listeners.size).toBe(0);
    });

    it('starts paused when the page is hidden at the start', () => {
      vi.useFakeTimers();
      const src = fakeSource();
      src.show(false);
      void withTimeout(new Promise<never>(() => undefined), 10, src).catch(() => undefined);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
