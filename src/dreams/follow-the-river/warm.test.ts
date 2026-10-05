/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-type-assertion -- partial fakes of big interfaces */
import { describe, expect, it, vi } from 'vitest';
import type { Systems } from './run';
import { readWhileWarming, warmNight } from './warm';

const bow = { visible: false };
const gunA = { visible: true };
const gunB = { visible: false };
const camera = {
  rotation: { x: 0.1, y: 0.2, z: 0, set: vi.fn() },
  position: { x: 3, y: 1.7, z: -4, set: vi.fn() },
  layers: { mask: 1, set: vi.fn() },
};

const fakeSys = (compile: () => Promise<void>, log: string[]): Systems => {
  const stage = {
    hold: false,
    warming: false,
    scene: { name: 'scene' },
    camera,
    renderer: { compileAsync: vi.fn(compile) },
    // the loop: each updater is called a few times, as the real loop does every frame
    addUpdater: vi.fn((fn: (dt: number) => void) => {
      queueMicrotask(() => {
        for (let i = 0; i < 40; i++) {
          log.push(
            `frame hold=${String(stage.hold)} warming=${String(stage.warming)} views=${[bow, gunA, gunB].map((v) => v.visible).join()}`,
          );
          fn(0.016);
        }
      });
      return () => undefined;
    }),
  };
  return {
    ctx: { stage },
    area: { bank: 'natural' },
    horde: { spawn: vi.fn(() => log.push('spawn')), reset: vi.fn(() => log.push('reset')) },
    flashlight: { apply: vi.fn() },
    fish: {
      warmShow: vi.fn(() => {
        log.push('orca on');
        return () => log.push('orca off');
      }),
    },
    bow: { view: bow },
    armory: { guns: { a: { view: gunA }, b: { view: gunB } } },
  } as unknown as Systems;
};

describe('warmNight', () => {
  it('shows every outfit, the orca and the viewmodels for real loop frames, then restores all', async () => {
    const log: string[] = [];
    const sys = fakeSys(() => Promise.resolve(), log);
    await warmNight(sys, 100);
    expect(log.filter((l) => l === 'spawn')).toHaveLength(13); // one per outfit
    expect(log.indexOf('orca on')).toBeLessThan(
      log.indexOf('frame hold=false warming=true views=true,true,true'),
    );
    expect(log.some((l) => l.startsWith('frame hold=true'))).toBe(false); // the loop runs
    expect(log.slice(-2)).toEqual(['orca off', 'reset']);
    expect([bow.visible, gunA.visible, gunB.visible]).toEqual([false, true, false]);
    expect(camera.position.set).toHaveBeenLastCalledWith(3, 1.7, -4); // exactly where it was
    expect(camera.rotation.set).toHaveBeenLastCalledWith(0.1, 0.2, 0, 'YXZ');
    expect(sys.ctx.stage.hold).toBe(false);
    expect(sys.ctx.stage.warming).toBe(false);
  });

  it('lets go even when the compile fails', async () => {
    const log: string[] = [];
    const sys = fakeSys(() => Promise.reject(new Error('gpu')), log);
    await warmNight(sys, 100);
    expect(sys.ctx.stage.hold).toBe(false);
    expect(sys.ctx.stage.warming).toBe(false);
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
