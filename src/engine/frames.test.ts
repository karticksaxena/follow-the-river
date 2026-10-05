/* oxlint-disable typescript/no-unsafe-type-assertion -- partial fake of the Stage */
import { describe, expect, it, vi } from 'vitest';
import { drawBehind, GPU_IDLE_TIMEOUT_MS, gpuIdle } from './frames';
import type { Stage } from './stage';

interface Fake {
  stage: Stage;
  raw: {
    hold: boolean;
    warming: boolean;
    renderer: object;
    addUpdater: (fn: () => void) => () => void;
  };
  step: () => void;
  seen: boolean[];
}

function fake(hold = false): Fake {
  let tick: (() => void) | null = null;
  const seen: boolean[] = [];
  const raw = {
    hold,
    warming: false,
    renderer: { backend: {} },
    addUpdater(fn: () => void) {
      tick = fn;
      return () => {
        tick = null;
      };
    },
  };
  const step = (): void => {
    seen.push(raw.warming);
    tick?.();
  };
  return { stage: raw as unknown as Stage, raw, step, seen };
}

describe('drawBehind', () => {
  it('draws n frames with warming on, then restores it', async () => {
    const f = fake();
    const p = drawBehind(f.stage, 3);
    f.step();
    f.step();
    f.step();
    await p;
    expect(f.seen).toEqual([true, true, true]);
    expect(f.raw.warming).toBe(false);
  });

  it('restores warming when the frames fail', async () => {
    const f = fake();
    f.raw.addUpdater = () => {
      throw new Error('boom');
    };
    await expect(drawBehind(f.stage, 2)).rejects.toThrow('boom');
    expect(f.raw.warming).toBe(false);
  });

  it('does not wait while the stage is held', async () => {
    const f = fake(true);
    await drawBehind(f.stage, 3);
    expect(f.raw.warming).toBe(false);
  });
});

describe('gpuIdle', () => {
  it('returns after the timeout when the GPU never answers', async () => {
    vi.useFakeTimers();
    const renderer = {
      backend: { device: { queue: { onSubmittedWorkDone: () => new Promise(() => undefined) } } },
    };
    let done = false;
    void gpuIdle(renderer).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(GPU_IDLE_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    vi.useRealTimers();
  });

  it('ignores a rejection (device lost)', async () => {
    const queue = { onSubmittedWorkDone: () => Promise.reject(new Error('lost')) };
    await expect(gpuIdle({ backend: { device: { queue } } })).resolves.toBeUndefined();
  });

  it('does not wait on the WebGL 2 backend', async () => {
    await expect(gpuIdle({ backend: { isWebGLBackend: true } })).resolves.toBeUndefined();
  });
});
