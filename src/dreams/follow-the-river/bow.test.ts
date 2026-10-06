import { describe, expect, it } from 'vitest';
import { BOW, canRecover, settleOnHit, stepArrow, type Arrow } from './bow';
import { DIFFICULTY } from './difficulty';

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

describe('settleOnHit', () => {
  it('an arrow that hit stays in the body on Normal and Hard: nothing to recover', () => {
    const a = arrow();
    settleOnHit(a, DIFFICULTY.normal.keepHitArrows, 1, 2);
    expect(a.state).toBe('idle');
    const b = arrow();
    settleOnHit(b, DIFFICULTY.hard.keepHitArrows, 1, 2);
    expect(b.state).toBe('idle');
  });
  it('on Story it sticks in the ground at the body, to pick up', () => {
    const a = arrow();
    settleOnHit(a, DIFFICULTY.story.keepHitArrows, 1, 2);
    expect([a.state, a.x, a.z]).toEqual(['stuck', 1, 2]);
  });
});

const stuck = (x: number, z: number): Arrow => ({ ...arrow(), x, z, state: 'stuck' });

describe('canRecover (walk over a missed arrow to pick it up)', () => {
  it('picks up a stuck arrow within about a metre of the player', () => {
    expect(canRecover(stuck(0.5, -0.5), { x: 0, z: 0 })).toBe(true);
    expect(canRecover(stuck(3, 0), { x: 0, z: 0 })).toBe(false);
  });

  it('never picks up an arrow still flying or gone', () => {
    expect(canRecover({ ...arrow(), x: 0, z: 0 }, { x: 0, z: 0 })).toBe(false);
    expect(canRecover({ ...arrow(), state: 'idle' }, { x: 0, z: 0 })).toBe(false);
  });

  it('a hit on Normal leaves nothing to pick up; on Story the arrow waits at the body', () => {
    const normal = arrow();
    settleOnHit(normal, false, 2, 2);
    expect(canRecover(normal, { x: 2, z: 2 })).toBe(false);
    const story = arrow();
    settleOnHit(story, true, 2, 2);
    expect(canRecover(story, { x: 2, z: 2 })).toBe(true);
  });
});
