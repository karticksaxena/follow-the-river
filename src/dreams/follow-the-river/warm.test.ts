/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-type-assertion -- partial fakes of big interfaces */
import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import type { Overlay } from '../../engine/ui';
import type { Run, Systems } from './run';
import { readWhileWarming, unculled, warmArea } from './warm';

const bow = { visible: false };
const gunA = { visible: true };
const gunB = { visible: false };
const camera = {
  rotation: { x: 0.1, y: 0.2, z: 0, set: vi.fn() },
  position: { x: 3, y: 1.7, z: -4, set: vi.fn() },
  layers: { mask: 1, set: vi.fn() },
};

function fakeSys(compile: () => Promise<void>, log: string[]): Systems {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh();
  scene.add(mesh);
  const stage = {
    hold: false,
    warming: false,
    scene,
    camera,
    warmFocus: vi.fn(() => log.push('focus')),
    renderer: { compileAsync: vi.fn(compile) },
    // the loop: each updater is called a few times, as the real loop does every frame
    addUpdater: vi.fn((fn: (dt: number) => void) => {
      queueMicrotask(() => {
        for (let i = 0; i < 80; i++) {
          log.push(
            `frame hold=${String(stage.hold)} warming=${String(stage.warming)} culled=${String(mesh.frustumCulled)} views=${String(bow.visible)}`,
          );
          fn(0.016);
        }
      });
      return () => undefined;
    }),
  };
  const volume = { v: 0.7 };
  return {
    ctx: {
      stage,
      audio: {
        listener: {
          getMasterVolume: () => volume.v,
          setMasterVolume: (v: number) => {
            log.push(`volume ${v}`);
            volume.v = v;
          },
        },
      },
    },
    area: { bank: 'natural', startZ: 0, endZ: -300 },
    grid: {},
    horde: {
      spawn: vi.fn(() => log.push('spawn')),
      update: vi.fn(() => log.push('cast')),
      reset: vi.fn(() => log.push('reset')),
    },
    flashlight: {
      on: false,
      apply: vi.fn(function (this: { on: boolean }) {
        log.push(`torch ${String(this.on)}`);
      }),
    },
    fish: {
      warmShow: vi.fn(() => {
        log.push('orca on');
        return () => log.push('orca off');
      }),
    },
    world: {
      lights: Object.fromEntries(
        ['disc', 'halo', 'moon', 'stars', 'physical'].map((k) => [k, { visible: false }]),
      ),
      showAllPlants: vi.fn(() => {
        log.push('plants on');
        return () => log.push('plants off');
      }),
    },
    pickups: {
      place: vi.fn((list: readonly { kind: string }[]) => log.push(`place ${list.length}`)),
      update: vi.fn(),
    },
    bow: {
      view: bow,
      fire: vi.fn(() => log.push('arrow')),
      update: vi.fn(),
      reset: vi.fn(() => log.push('arrow off')),
    },
    motion: { burst: vi.fn(() => log.push('splash')) },
    armory: { guns: { a: { view: gunA }, b: { view: gunB } } },
  } as unknown as Systems;
}

const run = (): Pick<Run, 'frozen' | 'pickups' | 'taken'> => ({
  frozen: false,
  pickups: [{ id: 'a', kind: 'arrows', x: 0, z: 0 }],
  taken: new Set<string>(),
});

describe('unculled', () => {
  it('turns culling off everywhere and the undo puts back only what it changed', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh();
    const b = new THREE.Mesh();
    b.frustumCulled = false; // was never culled: stays so
    root.add(a, b);
    const undo = unculled(root);
    expect(root.frustumCulled || a.frustumCulled).toBe(false);
    undo();
    expect([root.frustumCulled, a.frustumCulled, b.frustumCulled]).toEqual([true, true, false]);
  });
});

describe('warmArea', () => {
  it('shows everything for real loop frames, then restores all of it exactly', async () => {
    const log: string[] = [];
    const sys = fakeSys(() => Promise.resolve(), log);
    const r = run();
    const extra = vi.fn(() => {
      log.push('extra on');
      return () => log.push('extra off');
    });
    await warmArea(sys, r, { battery: 100, full: true, extras: [extra] });
    expect(log.filter((l) => l === 'spawn').length % 13).toBe(0); // 13 outfits, again every shadow round
    expect(log.filter((l) => l === 'spawn').length).toBeGreaterThanOrEqual(13);
    expect(log.filter((l) => l === 'cast').length).toBeGreaterThanOrEqual(4); // every outfit casts in turn
    for (const on of ['orca on', 'plants on', 'extra on', 'arrow', 'splash', 'torch true']) {
      expect(log).toContain(on);
    }
    expect(log).toContain('focus'); // the cinematic graph builds behind black
    // the loop runs with culling off, and the stage is not held while it draws
    expect(log.some((l) => l.includes('hold=false warming=true culled=false'))).toBe(true);
    expect(log.some((l) => l.startsWith('frame hold=true'))).toBe(false);
    // everything back: sound, torch off again, pickups of the run, hidden viewmodels, the camera
    expect(log.filter((l) => l.startsWith('volume'))).toEqual(['volume 0', 'volume 0.7']);
    expect(log).toContain('torch false');
    expect(log).toContain('arrow off');
    expect(log.filter((l) => l.startsWith('place')).at(-1)).toBe('place 1'); // the run's own pickups
    expect(r.frozen).toBe(false);
    expect([bow.visible, gunA.visible, gunB.visible]).toEqual([false, true, false]);
    expect(camera.position.set).toHaveBeenLastCalledWith(3, 1.7, -4); // exactly where it was
    expect(camera.rotation.set).toHaveBeenLastCalledWith(0.1, 0.2, 0, 'YXZ');
    const reset = log.lastIndexOf('reset');
    expect(log[reset - 1]).toBe('volume 0.7'); // the last thing undone is the sound
    // a few frames in the player's own view, still warming, everything back, culling on again
    expect(
      log
        .slice(reset + 1)
        .every((l) => l === 'frame hold=false warming=true culled=true views=false'),
    ).toBe(true);
    expect(sys.ctx.stage.hold).toBe(false);
    expect(sys.ctx.stage.warming).toBe(false);
  });

  it('a short pass (the night) draws one pose, not every heading', async () => {
    const full: string[] = [];
    const short: string[] = [];
    await warmArea(
      fakeSys(() => Promise.resolve(), full),
      run(),
      { battery: 1, full: true },
    );
    await warmArea(
      fakeSys(() => Promise.resolve(), short),
      run(),
      { battery: 1, full: false },
    );
    expect(short.length).toBeLessThan(full.length);
  });

  it('lets go even when the compile fails', async () => {
    const log: string[] = [];
    const sys = fakeSys(() => Promise.reject(new Error('gpu')), log);
    const r = run();
    await warmArea(sys, r, { battery: 100, full: true });
    expect(sys.ctx.stage.hold).toBe(false);
    expect(sys.ctx.stage.warming).toBe(false);
    expect(log).toContain('reset');
    expect(log).toContain('volume 0.7'); // the sound is back
  });
});

describe('readWhileWarming', () => {
  it('shows the pages at once and waits for both the reader and the warm-up', async () => {
    const hooks = { closeReader: (): void => undefined, endWarm: (): void => undefined };
    const read = vi.fn((_p: readonly string[], done?: () => void) => {
      hooks.closeReader = done ?? hooks.closeReader;
    });
    const warm = new Promise<void>((r) => (hooks.endWarm = r));
    const stop = vi.fn();
    const loading = vi.fn(() => stop);
    const overlay = { loading } as unknown as Overlay;
    let done = false;
    const wait = readWhileWarming({ read, overlay }, ['Night 1'], warm).then(() => (done = true));
    expect(read).toHaveBeenCalledOnce();
    hooks.closeReader();
    await Promise.resolve();
    expect(done).toBe(false); // read closed, still compiling
    expect(loading).toHaveBeenCalledOnce(); // so the loader shows, not a bare black screen
    expect(stop).not.toHaveBeenCalled();
    hooks.endWarm();
    await wait;
    expect(stop).toHaveBeenCalledOnce();
    expect(done).toBe(true);
  });

  it('with no pages waits for the warm-up alone', async () => {
    const read = vi.fn();
    const overlay = { loading: () => () => undefined } as unknown as Overlay;
    await readWhileWarming({ read, overlay }, [], Promise.resolve());
    expect(read).not.toHaveBeenCalled();
  });
});
