/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-type-assertion , typescript/explicit-function-return-type, unicorn/consistent-function-scoping -- partial fakes of big interfaces */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freeHeldFlashback, playFlashback } from './flashback';

const built: { dispose: ReturnType<typeof vi.fn>; scene: object }[] = [];
vi.mock('./flashback-scene', () => ({
  buildFlashback: vi.fn(() => {
    const fb = {
      scene: {},
      camera: { position: {}, quaternion: {} },
      update: vi.fn(),
      dispose: vi.fn(),
    };
    built.push(fb);
    return Promise.resolve(fb);
  }),
}));
vi.mock('../../engine/frames', () => ({ drawBehind: vi.fn(() => Promise.resolve()) }));
vi.mock('three/webgpu', () => ({
  Vector3: class {
    copy = (): this => this;
  },
  Quaternion: class {
    copy = (): this => this;
  },
}));

/** A stage and reader fake: `close()` ends the pages like the player pressing Enter on the last. */
function setup() {
  const previous = {};
  const stage = {
    scene: previous,
    camera: { position: { copy: vi.fn() }, quaternion: { copy: vi.fn() } },
    renderer: { compileAsync: vi.fn(() => Promise.resolve()) },
    addUpdater: vi.fn(() => (): void => undefined),
  };
  let close = (): void => undefined; // set by ctx.read below
  const ctx = {
    stage,
    overlay: {
      fade: vi.fn(() => Promise.resolve()),
      loading: () => (): void => undefined,
      root: { classList: { add: vi.fn(), remove: vi.fn() } },
    },
    hold: vi.fn(),
    grade: vi.fn(() => 'day'),
    read: vi.fn((_pages: readonly string[], done: () => void) => void (close = done)),
  };
  return { ctx, stage, previous, close: () => close() };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

describe('held flashback', () => {
  beforeEach(() => {
    freeHeldFlashback();
    built.length = 0;
  });

  it('is not freed at the cut back, but when the next tape starts', async () => {
    const a = setup();
    void playFlashback(a.ctx as never, 1, ['x']);
    await flush();
    a.close();
    expect(a.stage.scene).toBe(a.previous);
    expect(built[0]?.dispose).not.toHaveBeenCalled();

    const b = setup();
    void playFlashback(b.ctx as never, 2, ['x']);
    await flush();
    expect(built[0]?.dispose).toHaveBeenCalledOnce();
    expect(built[1]?.dispose).not.toHaveBeenCalled();
  });

  it('is freed when the chapter or dream is disposed, once', async () => {
    const a = setup();
    void playFlashback(a.ctx as never, 3, ['x']);
    await flush();
    a.close();
    freeHeldFlashback();
    freeHeldFlashback();
    expect(built[0]?.dispose).toHaveBeenCalledOnce();
  });
});
