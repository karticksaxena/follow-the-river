import { describe, expect, it } from 'vitest';
import { GROAN_COOLDOWN, GROAN_RANGE, pickGroaner } from './voices';

const none = new Float64Array(3).fill(-1e9);

describe('pickGroaner', () => {
  it('picks the nearest zombie, wherever it is', () => {
    expect(pickGroaner([20, 4, 9], none, 0)).toBe(1);
  });
  it('skips zombies that groaned within the cooldown, then returns to them', () => {
    const said = Float64Array.of(-1e9, 10, -1e9);
    expect(pickGroaner([20, 4, 9], said, 10 + GROAN_COOLDOWN - 0.1)).toBe(2);
    expect(pickGroaner([20, 4, 9], said, 10 + GROAN_COOLDOWN)).toBe(1);
  });
  it('ignores zombies out of range or not alive (distance Infinity)', () => {
    expect(pickGroaner([GROAN_RANGE + 1, Infinity], none, 0)).toBe(-1);
  });
  it('returns -1 when everyone is cooling down', () => {
    expect(pickGroaner([4, 9], Float64Array.of(5, 5), 5.1)).toBe(-1);
  });
});
