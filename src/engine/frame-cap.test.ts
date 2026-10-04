import { describe, expect, it } from 'vitest';
import { capPeriod, MAX_FPS, newPacer, shouldRender } from './frame-cap';

/** Simulates a display of `hz` for `seconds`; returns how many frames were rendered. */
function run(hz: number, cap: (typeof MAX_FPS)[number], seconds: number): number {
  const p = newPacer();
  let rendered = 0;
  for (let i = 0; i < hz * seconds; i++) if (shouldRender(p, 1 / hz, cap)) rendered++;
  return rendered;
}

describe('frame cap', () => {
  it('the period is 1/cap, or 0 for display', () => {
    expect(capPeriod('90')).toBeCloseTo(1 / 90);
    expect(capPeriod('60')).toBeCloseTo(1 / 60);
    expect(capPeriod('display')).toBe(0);
  });

  it('a 120 Hz screen at 90 renders about 90 frames a second, without drift', () => {
    expect(run(120, '90', 10)).toBeGreaterThanOrEqual(880);
    expect(run(120, '90', 10)).toBeLessThanOrEqual(905);
  });

  it('a 120 Hz screen at 60 renders every other frame', () => {
    expect(run(120, '60', 10)).toBeGreaterThanOrEqual(595);
    expect(run(120, '60', 10)).toBeLessThanOrEqual(605);
  });

  it('a 60 Hz screen is never skipped at 60 or 90 (jitter included)', () => {
    expect(run(60, '60', 10)).toBe(600);
    expect(run(60, '90', 10)).toBe(600);
    const p = newPacer();
    let skipped = 0;
    for (let i = 0; i < 600; i++) if (!shouldRender(p, i % 2 ? 0.0172 : 0.0161, '60')) skipped++;
    expect(skipped).toBe(0);
  });

  it('display never skips, and a zero delta (hidden tab) still renders', () => {
    expect(run(144, 'display', 5)).toBe(720);
    expect(shouldRender(newPacer(), 0, '60')).toBe(true);
  });

  it('hands out the time since the last rendered frame', () => {
    const p = newPacer();
    expect(shouldRender(p, 1 / 240, '60')).toBe(true); // first frame
    expect(shouldRender(p, 1 / 240, '60')).toBe(false);
    expect(shouldRender(p, 1 / 240, '60')).toBe(false);
    expect(shouldRender(p, 1 / 240, '60')).toBe(true);
    expect(p.dt).toBeCloseTo(3 / 240);
  });

  it('a long hitch does not cause a burst of frames afterwards', () => {
    const p = newPacer();
    shouldRender(p, 1, '60');
    let burst = 0;
    for (let i = 0; i < 10; i++) if (shouldRender(p, 1 / 240, '60')) burst++;
    expect(burst).toBeLessThanOrEqual(3);
  });
});
