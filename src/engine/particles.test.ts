import { describe, expect, it } from 'vitest';
import { createPool, stepParticle } from './particles';

describe('stepParticle', () => {
  it('falls under gravity and slows with drag', () => {
    const p = createPool(1).spawn();
    p.life = 5;
    p.vx = 2;
    p.vy = 0;
    stepParticle(p, 0.5, -10, 0.5);
    expect(p.vy).toBeCloseTo(-5);
    expect(p.vx).toBeCloseTo(1.5);
    expect(p.y).toBeCloseTo(-2.5);
    expect(p.x).toBeCloseTo(0.75);
  });
  it('dies once its life is used up', () => {
    const p = createPool(1).spawn();
    p.life = 1;
    expect(stepParticle(p, 0.6, 0, 0)).toBe(true);
    expect(stepParticle(p, 0.6, 0, 0)).toBe(false);
    expect(p.alive).toBe(false);
  });
});

describe('createPool', () => {
  it('hands out free slots, then recycles the oldest, never growing', () => {
    const pool = createPool(3);
    const a = pool.spawn();
    const b = pool.spawn();
    const c = pool.spawn();
    expect(new Set([a, b, c]).size).toBe(3);
    expect(pool.spawn()).toBe(a);
    expect(pool.items).toHaveLength(3);
  });
  it('reuses a dead slot and resets it', () => {
    const pool = createPool(2);
    const a = pool.spawn();
    pool.spawn();
    a.alive = false;
    a.vy = 9;
    a.age = 4;
    const again = pool.spawn();
    expect(again).toBe(a);
    expect(again.vy).toBe(0);
    expect(again.age).toBe(0);
    expect(again.alive).toBe(true);
  });
});
