import { describe, expect, it } from 'vitest';
import { BOW, stepArrow, type Arrow } from './bow';

const arrow = (): Arrow => ({
  x: 0,
  y: 1.5,
  z: 0,
  vx: 0,
  vy: 0,
  vz: -BOW.speed,
  age: 0,
  state: 'flying',
});

describe('stepArrow', () => {
  it('flies forward and drops under gravity', () => {
    const a = arrow();
    stepArrow(a, 0.1);
    expect(a.z).toBeCloseTo(-BOW.speed * 0.1);
    expect(a.vy).toBeLessThan(0);
  });

  it('is gone (idle) after its life', () => {
    const a = arrow();
    for (let i = 0; i < 40; i++) stepArrow(a, 0.1);
    expect(a.state).toBe('idle');
  });

  it('does not move once stuck', () => {
    const a = { ...arrow(), state: 'stuck' as const };
    stepArrow(a, 1);
    expect([a.x, a.y, a.z]).toEqual([0, 1.5, 0]);
  });
});
