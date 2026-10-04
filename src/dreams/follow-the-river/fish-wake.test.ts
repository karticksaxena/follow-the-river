import { describe, expect, it } from 'vitest';
import { WAKE_H, WAKE_W, wakeAlpha, wakeFleck, wakeScroll } from './fish-parts';

const rows = (a: Float32Array, y0: number, y1: number): number =>
  a.slice(y0 * WAKE_W, y1 * WAKE_W).reduce((s, v) => s + v, 0);

describe('wake texture', () => {
  const a = wakeAlpha();
  const at = (x: number, y: number): number => a[y * WAKE_W + x] ?? 1;

  it('is at least 128x256', () => {
    expect(WAKE_W).toBeGreaterThanOrEqual(128);
    expect(WAKE_H).toBeGreaterThanOrEqual(256);
  });
  it('has no hard pixels', () => {
    expect(Math.max(...a)).toBeLessThan(0.75);
    expect(Math.max(...a)).toBeGreaterThan(0.1);
  });
  it('fades to nothing at the far end and the arm tips', () => {
    for (let x = 0; x < WAKE_W; x++) expect(at(x, WAKE_H - 1)).toBeLessThan(0.02);
    for (let y = 0; y < WAKE_H; y++) {
      expect(at(0, y)).toBeLessThan(0.02);
      expect(at(WAKE_W - 1, y)).toBeLessThan(0.02);
    }
  });
  it('is strongest near the fin', () => {
    expect(rows(a, 0, WAKE_H / 4)).toBeGreaterThan(rows(a, (WAKE_H * 3) / 4, WAKE_H));
  });
  it('is deterministic and its flecks tile along the length', () => {
    expect(wakeAlpha()).toEqual(a);
    for (let x = 0; x < WAKE_W; x += 7) {
      expect(wakeFleck(x, 0)).toBeCloseTo(wakeFleck(x, WAKE_H), 6);
    }
  });
});

describe('wake scroll', () => {
  it('advances monotonically while time runs', () => {
    let last = -1;
    for (let t = 0; t < 0.5; t += 0.05) {
      const o = wakeScroll(t);
      expect(o).toBeGreaterThan(last);
      last = o;
    }
  });
});
