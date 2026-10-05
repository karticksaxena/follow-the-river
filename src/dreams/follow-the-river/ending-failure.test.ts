import { describe, expect, it, vi, type Mock } from 'vitest';

const mocks = vi.hoisted(() => ({
  build: vi.fn<() => Promise<unknown>>(),
  pack: vi.fn<() => Promise<unknown>>(),
  cast: vi.fn<() => unknown>(),
}));
vi.mock('./ending-scene', async (orig) => ({
  ...(await orig<typeof import('./ending-scene')>()),
  buildEndingScene: mocks.build,
}));
vi.mock('./ending-farewell', async (orig) => ({
  ...(await orig<typeof import('./ending-farewell')>()),
  loadPackOnWater: mocks.pack,
}));
vi.mock('./farewell-cast', () => ({ createCast: mocks.cast }));

const { createEnding } = await import('./ending');
type EndingHost = Parameters<typeof createEnding>[0];

const sceneStub = (): Record<string, Mock<() => void>> => ({
  dispose: vi.fn<() => void>(),
  place: vi.fn<() => void>(),
  update: vi.fn<() => void>(),
  remove: vi.fn<() => void>(),
  lightFarewell: vi.fn<() => void>(),
  releaseReflection: vi.fn<() => void>(),
});

function host(): {
  h: EndingHost;
  run: { frozen: boolean };
  ctx: { warmFocus: Mock; cinematic: Mock; finish: Mock };
  log: string[];
} {
  const log: string[] = [];
  const run = { ending: 'no', frozen: false, cutscene: false, interact: null, live: {} };
  const ctx = {
    overlay: {
      loading: () => (): void => undefined,
      fade: vi.fn<(b: boolean) => Promise<void>>(async (b) => void log.push(b ? 'black' : 'clear')),
    },
    hold: vi.fn<() => void>(),
    cinematic: vi.fn<() => void>(),
    focus: vi.fn<() => void>(),
    warmFocus: vi.fn<() => void>(),
    isPaused: () => false,
    audio: {},
    difficulty: () => 'normal',
    stage: {
      camera: { position: { x: 0, z: 0 } },
      renderer: { compileAsync: vi.fn<() => void>() },
    },
    player: { teleport: vi.fn<() => void>() },
    read: vi.fn<(pages: string[], done: () => void) => void>((pages, done) => {
      log.push(`read:${pages[0]}`);
      done();
    }),
    finish: vi.fn<() => void>(() => void log.push('finish')),
  };
  const sys = {
    ctx,
    horde: { reset: vi.fn<() => void>() },
    fish: {
      lookAtTarget: vi.fn<() => void>(),
      setJaw: vi.fn<() => void>(),
      setGuards: vi.fn<() => void>(),
      reset: vi.fn<() => void>(),
    },
    world: { scene: {} },
    area: { meetAt: { x: 0, z: 0 }, lake: { z: -5 } },
  };
  const h = { sys, run, lantern: {}, persist: vi.fn<() => void>() };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a partial fake host
  return { h: h as unknown as EndingHost, run, ctx, log };
}

const noop = (): void => undefined;
const settle = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

describe('the ending when loading fails', () => {
  it('never soft-locks: unfreezes, fades back in, reads on and finishes', async () => {
    mocks.build.mockRejectedValue(new Error('network'));
    const { h, run, ctx, log } = host();
    createEnding(h).start();
    await settle();
    expect(run.frozen).toBe(false);
    expect(ctx.cinematic).toHaveBeenCalledWith(false);
    expect(log).toContain('clear');
    expect(log.some((l) => l.startsWith('read:Mom: "Come on'))).toBe(true);
    expect(log[log.length - 1]).toBe('finish');
  });
});

describe('a quit during the loads', () => {
  it('stops before it builds the cast on a disposed scene', async () => {
    mocks.cast.mockClear();
    mocks.build.mockResolvedValue(sceneStub());
    let open: (o: object) => void = noop;
    mocks.pack.mockReturnValue(new Promise<object>((r) => (open = r)));
    const { h, ctx } = host();
    const ending = createEnding(h);
    ending.start();
    await settle();
    ending.cancel();
    open({ visible: false });
    await settle();
    expect(mocks.cast).not.toHaveBeenCalled();
    expect(ctx.warmFocus).not.toHaveBeenCalled();
    expect(ctx.finish).not.toHaveBeenCalled();
  });
});
