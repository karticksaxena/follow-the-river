import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import {
  endBootLoader,
  PROGRESS_INTERVAL_MS,
  progressPercent,
  READY_LABEL,
  trackProgress,
  type ProgressSource,
} from './loader';

describe('progressPercent', () => {
  it('floors to an integer and clamps to 0..100', () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(5, 2)).toBe(100);
    expect(progressPercent(-1, 4)).toBe(0);
  });
  it('never shows NaN and never goes backwards', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(Number.NaN, 4)).toBe(0);
    expect(progressPercent(1, 10, 40)).toBe(40);
  });
});

function setup(base: string | null): {
  src: ProgressSource;
  out: string[];
  progress: (u: string, l: number, n: number) => void;
  tick: (ms: number) => number;
} {
  const src: ProgressSource = {};
  const out: string[] = [];
  let t = 0;
  trackProgress(
    src,
    () => base,
    (s) => out.push(s),
    () => t,
  );
  const progress = (u: string, l: number, n: number): void => src.onProgress?.(u, l, n);
  return { src, out, progress, tick: (ms) => (t += ms) };
}
describe('trackProgress', () => {
  it('throttles writes and keeps the percent monotonic', () => {
    const { out, progress, tick } = setup('Falling asleep…');
    progress('a', 1, 2);
    progress('b', 2, 8); // within the interval: skipped
    tick(PROGRESS_INTERVAL_MS);
    progress('c', 2, 8); // total grew: stays at 50
    expect(out).toEqual(['Falling asleep… 50%', 'Falling asleep… 50%']);
  });
  it('switches to the ready label when downloads end, and is silent outside a wait', () => {
    const a = setup('Loading…');
    a.progress('a', 1, 2);
    a.src.onLoad?.();
    expect(a.out.at(-1)).toBe(READY_LABEL);
    const b = setup(null);
    b.progress('a', 1, 2);
    b.src.onLoad?.();
    expect(b.out).toEqual([]);
  });
});

describe('boot loader', () => {
  it('index.html ships the loader markup before the overlay', () => {
    expect(html).toContain('id="boot-loader"');
    expect(html.indexOf('id="boot-loader"')).toBeLessThan(html.indexOf('id="overlay"'));
  });
  it('endBootLoader removes it, and is harmless when absent', () => {
    let removed = 0;
    endBootLoader({
      getElementById: (id) => (id === 'boot-loader' ? { remove: () => removed++ } : null),
    });
    endBootLoader({ getElementById: () => null });
    expect(removed).toBe(1);
  });
});
