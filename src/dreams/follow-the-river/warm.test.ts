/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-type-assertion -- partial fakes of big interfaces */
import { describe, expect, it, vi } from 'vitest';
import type { Systems } from './run';
import { readWhileWarming, warmNight } from './warm';

const fakeSys = (compile: () => Promise<void>, log: string[]): Systems => {
  const stage = {
    hold: false,
    scene: { name: 'scene' },
    camera: { rotation: { y: 0 }, position: { x: 0, z: 0 }, layers: { mask: 1, set: vi.fn() } },
    renderer: { compileAsync: vi.fn(compile) },
    renderOnce: vi.fn(() => log.push(`render hold=${String(stage.hold)}`)),
  };
  return {
    ctx: { stage },
    horde: { spawn: vi.fn(() => log.push('spawn')), reset: vi.fn(() => log.push('reset')) },
    flashlight: { apply: vi.fn() },
  } as unknown as Systems;
};

describe('warmNight', () => {
  it('holds the stage, shows two bodies, renders twice, parks them and lets go', async () => {
    const log: string[] = [];
    const sys = fakeSys(() => Promise.resolve(), log);
    await warmNight(sys, 100);
    expect(log).toEqual(['spawn', 'spawn', 'render hold=true', 'render hold=true', 'reset']);
    expect(sys.ctx.stage.hold).toBe(false);
  });

  it('lets go even when the compile fails', async () => {
    const log: string[] = [];
    const sys = fakeSys(() => Promise.reject(new Error('gpu')), log);
    await warmNight(sys, 100);
    expect(sys.ctx.stage.hold).toBe(false);
    expect(log).toContain('reset');
  });
});

describe('readWhileWarming', () => {
  it('shows the pages at once and waits for both the reader and the warm-up', async () => {
    const hooks = { closeReader: (): void => undefined, endWarm: (): void => undefined };
    const read = vi.fn((_p: readonly string[], done?: () => void) => {
      hooks.closeReader = done ?? hooks.closeReader;
    });
    const warm = new Promise<void>((r) => (hooks.endWarm = r));
    let done = false;
    const run = readWhileWarming({ read }, ['Night 1'], warm).then(() => (done = true));
    expect(read).toHaveBeenCalledOnce();
    hooks.closeReader();
    await Promise.resolve();
    expect(done).toBe(false); // read closed, still compiling
    hooks.endWarm();
    await run;
    expect(done).toBe(true);
  });

  it('with no pages waits for the warm-up alone', async () => {
    const read = vi.fn();
    await readWhileWarming({ read }, [], Promise.resolve());
    expect(read).not.toHaveBeenCalled();
  });
});
