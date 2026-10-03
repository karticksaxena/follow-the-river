import { describe, expect, it } from 'vitest';
import { moveDelta, moveIntent, SPRINT_SPEED, WALK_SPEED } from './movement';

const held =
  (...codes: string[]) =>
  (code: string): boolean =>
    codes.includes(code);

describe('moveIntent', () => {
  it('walks forward with W', () => {
    expect(moveIntent(held('KeyW'))).toEqual({ forward: 1, right: 0, sprint: false });
  });

  it('normalises diagonals', () => {
    const intent = moveIntent(held('KeyW', 'KeyD'));
    expect(Math.hypot(intent.forward, intent.right)).toBeCloseTo(1);
  });

  it('cancels opposite keys', () => {
    expect(moveIntent(held('KeyW', 'KeyS')).forward).toBe(0);
  });

  it('sprints with either Shift', () => {
    expect(moveIntent(held('ShiftRight')).sprint).toBe(true);
  });
});

describe('moveDelta', () => {
  it('walks one second forward when facing -Z', () => {
    const step = moveDelta({ forward: 1, right: 0, sprint: false }, 0, -1, 1);
    expect(step.dx).toBeCloseTo(0);
    expect(step.dz).toBeCloseTo(-WALK_SPEED);
  });

  it('strafes right to +X when facing -Z', () => {
    const step = moveDelta({ forward: 0, right: 1, sprint: true }, 0, -1, 1);
    expect(step.dx).toBeCloseTo(SPRINT_SPEED);
    expect(step.dz).toBeCloseTo(0);
  });
});
