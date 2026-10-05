import { describe, expect, it, vi } from 'vitest';
import { CITY } from './areas/city';
import { DIFFICULTY } from './difficulty';
import { createState, HIT_GRACE } from './play';
import type { Events, Run, Systems } from './run';

vi.mock('./controls', () => ({ createControls: () => ({}) }));

function rig(): {
  run: { health: number };
  die: ReturnType<typeof vi.fn<() => void>>;
  state: ReturnType<typeof createState>;
  damage: number;
} {
  const run = { health: 100, phase: 'night1' };
  const die = vi.fn<() => void>();
  const events = { die, hint: vi.fn<() => void>() };
  const sys = {
    area: CITY,
    hud: { hurt: vi.fn<() => void>() },
    grid: {},
    ctx: { difficulty: () => 'normal' },
  };
  // The few fields onHit touches; the rest of the systems are not needed here.
  const state = createState(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    sys as unknown as Systems,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    run as unknown as Run,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    events as unknown as Events,
  );
  return { run, die, state, damage: DIFFICULTY.normal.damage };
}

describe('a hit does not stack', () => {
  it('two hits in the same instant cost one heart', () => {
    const { run, state, damage } = rig();
    state.onHit(damage);
    state.onHit(damage);
    expect(run.health).toBe(100 - damage);
  });

  it('a hit counts again once the grace has run out', () => {
    const { run, state, damage } = rig();
    state.onHit(damage);
    expect(state.grace).toBe(HIT_GRACE);
    state.grace = 0;
    state.onHit(damage);
    expect(run.health).toBe(100 - 2 * damage);
  });

  it('three separate hits kill on Normal', () => {
    const { run, die, state, damage } = rig();
    for (let i = 0; i < 3; i++) {
      state.grace = 0;
      state.onHit(damage);
    }
    expect(run.health).toBe(0);
    expect(die).toHaveBeenCalledOnce();
  });
});
