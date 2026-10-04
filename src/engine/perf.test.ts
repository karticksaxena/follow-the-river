import { describe, expect, it } from 'vitest';
import { groupPasses, percentile, summarize } from './perf';

describe('perf maths', () => {
  it('percentile picks from the sorted samples', () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(percentile([], 0.5)).toBe(0);
  });

  it('summarize gives median, p95 and max', () => {
    const s = summarize([10, 11, 12, 13, 40]);
    expect(s.median).toBe(12);
    expect(s.p95).toBe(40);
    expect(s.max).toBe(40);
  });

  it('groupPasses sums each frame and splits it by pass order', () => {
    const stamps = new Map([
      ['r:0:7:f1', 1],
      ['r:1:8:f1', 2],
      ['r:0:7:f2', 1.5],
      ['r:1:8:f2', 2.5],
      ['c:0:9:f2', 9], // compute is not a render pass
    ]);
    const g = groupPasses(stamps, 'r');
    expect(g.totals).toEqual([3, 4]);
    expect(g.passes).toEqual([
      [1, 1.5],
      [2, 2.5],
    ]);
  });
});
