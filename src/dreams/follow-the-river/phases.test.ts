/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-type-assertion -- partial fakes of big interfaces */
import { describe, expect, it, vi } from 'vitest';
import { MAX_HEALTH } from './flow';
import { beginPhase, checkpoint, hintPages, type Flow } from './phases';
import { freshRun, restartPhase } from './state';

vi.mock('./lighting', async (orig) => ({
  ...(await orig<typeof import('./lighting')>()),
  applyLighting: vi.fn(),
  setFogFar: vi.fn(),
}));

describe('beginPhase', () => {
  it('arms the orca after onReset, so a reset inside it cannot disarm her', () => {
    const fish = {
      strikes: 0,
      reset: vi.fn(() => {
        fish.strikes = 0;
      }),
      arm: vi.fn((n: number) => {
        fish.strikes = n;
      }),
      setSickness: vi.fn(),
      onEat: null as unknown,
    };
    const noop = { reset: vi.fn(), set: vi.fn(), place: vi.fn(), prompt: vi.fn() };
    const lights = {
      sky: { position: { set: vi.fn() } },
      key: { intensity: 0, color: { set: vi.fn(), setHex: vi.fn() } },
    };
    const save = { ...freshRun(), phase: 'night1' as const };
    const f = {
      sys: {
        horde: { reset: vi.fn(), spawn: vi.fn(), setHouses: vi.fn() },
        bow: { reset: vi.fn() },
        fish,
        pickups: { place: vi.fn() },
        ctx: {
          cinematic: vi.fn(),
          grade: vi.fn(),
          difficulty: () => 'normal',
          player: { teleport: vi.fn() },
        },
        area: {
          id: 'a',
          waves: [],
          pickups: [],
          lurkers: [],
          shacks: [],
          nightStart: { x: 0, z: 0, yaw: 0 },
          daySpawn: { x: 0, z: 0, yaw: 0 },
        },
        hud: noop,
        world: { lights, railing: null },
        scares: noop,
        gates: noop,
        flashlight: { on: false },
      },
      lantern: { intensity: 0 },
      run: { live: { hints: [] }, taken: new Set() },
      save,
      onReset: vi.fn(() => fish.reset()), // what ending.cancel() does
    } as unknown as Flow;
    beginPhase(f);
    expect(f.onReset).toHaveBeenCalled();
    expect(fish.strikes).toBe(0); // no strikes until a wave begins
  });
});

const flow = (difficulty: string, dying: string): Flow =>
  ({
    sys: { ctx: { isPaused: () => true, difficulty: () => difficulty } },
    run: { frozen: false, dying, health: 30, live: restartPhase(freshRun()) },
    save: freshRun(),
    store: { save: vi.fn() },
  }) as unknown as Flow;

describe('wave cleared', () => {
  it('restores full health', () => {
    const f = flow('normal', 'no');
    checkpoint(f, 1);
    expect(f.run.health).toBe(MAX_HEALTH);
  });

  it('leaves a dying player alone', () => {
    const f = flow('normal', 'falling');
    checkpoint(f, 1);
    expect(f.run.health).toBe(30);
  });

  it('picks the bow hint by difficulty', () => {
    expect(hintPages(flow('story', 'no'), 'bow').join(' ')).toMatch(/even ones that hit/);
    expect(hintPages(flow('hard', 'no'), 'bow').join(' ')).toMatch(/stays in it/);
  });
});
