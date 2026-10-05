/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-type-assertion -- partial fakes of big interfaces */
import { describe, expect, it, vi } from 'vitest';
import { playCanoeRide } from './canoe-ride';
import { CLOSING_PAGES } from './canoe-timing';

const dispose = vi.fn();
vi.mock('./canoe-scene', async (orig) => ({
  ...(await orig<typeof import('./canoe-scene')>()),
  // Mom has no Head bone: makeRide throws after the fade-out.
  buildCanoeScene: vi.fn(() =>
    Promise.resolve({
      scene: {},
      mom: {
        bone: () => {
          throw new Error('no Head');
        },
        group: {},
      },
      kartik: { bone: () => null },
      dispose,
    }),
  ),
}));

describe('playCanoeRide', () => {
  it('a throw after the fade fades back in and reads the closing pages, then resolves', async () => {
    const previous = {};
    const fade = vi.fn(() => Promise.resolve());
    const read = vi.fn((_pages: readonly string[], done?: () => void) => done?.());
    const stage = { scene: previous, camera: {}, addUpdater: vi.fn(() => () => undefined) };
    const ctx = {
      stage,
      overlay: { fade, root: {}, loading: () => (): void => undefined },
      read,
      hold: vi.fn(),
    };
    await playCanoeRide(ctx as never, {} as never);
    expect(dispose).toHaveBeenCalled();
    expect(stage.scene).toBe(previous);
    expect(fade).toHaveBeenLastCalledWith(false, expect.any(Number));
    expect(read).toHaveBeenCalledWith(CLOSING_PAGES, expect.any(Function));
  });
});
