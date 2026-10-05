import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLoadingState, LOADER_DELAY_MS, type LoadingState } from './loader';

describe('createLoadingState', () => {
  const log: string[] = [];
  const make = (): LoadingState =>
    createLoadingState(
      (b) => log.push(`busy:${b}`),
      (v) => log.push(`vis:${v}`),
    );
  beforeEach(() => {
    log.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('hides the HUD at once but shows the spinner only after the delay', () => {
    make().start();
    expect(log).toEqual(['busy:true']);
    vi.advanceTimersByTime(LOADER_DELAY_MS);
    expect(log).toEqual(['busy:true', 'vis:true']);
  });

  it('never shows the spinner for a quick load', () => {
    const stop = make().start();
    vi.advanceTimersByTime(LOADER_DELAY_MS - 1);
    stop();
    vi.advanceTimersByTime(1000);
    expect(log).toEqual(['busy:true', 'vis:false', 'busy:false']);
  });

  it('nests: busy until the last wait ends; ending twice is harmless', () => {
    const s = make();
    const a = s.start();
    const b = s.start();
    a();
    a();
    expect(log).toEqual(['busy:true']);
    b();
    expect(log.at(-1)).toBe('busy:false');
  });
});
