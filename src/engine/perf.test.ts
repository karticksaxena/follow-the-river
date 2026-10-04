import type * as THREE from 'three/webgpu';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { createPerf, groupPasses, percentile, summarize, type Perf } from './perf';

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

/** A renderer whose frame counter never advances (a hand-stepped loop: nothing resets `info`). */
function fakeRenderer(
  passMs: readonly number[],
  draws: number,
  tris: number,
): {
  perf: Perf;
  frame: () => void;
  info: {
    frame: number;
    reset: Mock<() => void>;
    render: { drawCalls: number; triangles: number };
  };
} {
  const stamps = new Map<string, number>();
  const info = { frame: 7, reset: vi.fn<() => void>(), render: { drawCalls: 0, triangles: 0 } };
  const renderer = {
    info,
    backend: { trackTimestamp: true, timestampQueryPool: { render: { timestamps: stamps } } },
    resolveTimestampsAsync: vi.fn<() => Promise<number>>(() => Promise.resolve(0)),
  };
  /** One frame: begin, the renderer counts and stamps, end. */
  const frame = (): void => {
    perf.begin(performance.now());
    info.render.drawCalls += draws; // nothing resets it between frames
    info.render.triangles += tris;
    passMs.forEach((ms, i) => stamps.set(`r:${i}:${i}:f${info.frame}`, ms));
    perf.end();
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const perf = createPerf(renderer as unknown as THREE.WebGPURenderer);
  return { perf, frame, info };
}

describe('kd.perf.sample is per frame', () => {
  it("gpuMs is the sum of one frame's passes, draw and triangle counts are one frame's", async () => {
    vi.useFakeTimers();
    const { perf, frame, info } = fakeRenderer([1, 2, 3], 100, 5000);
    // Reset like three's loop does between frames, so counts are per frame.
    info.reset.mockImplementation(() => {
      info.render.drawCalls = 0;
      info.render.triangles = 0;
    });
    const sampled = perf.sample(1);
    for (let i = 0; i < 5; i++) {
      frame();
      await vi.advanceTimersByTimeAsync(0);
    }
    await vi.advanceTimersByTimeAsync(1000);
    const report = await sampled;
    vi.useRealTimers();
    expect(report.gpuMs?.median).toBe(6);
    expect(report.gpuPassMs).toEqual([1, 2, 3]);
    expect(report.drawCalls).toBe(100);
    expect(report.triangles).toBe(5000);
  });
});
