import { describe, expect, it } from 'vitest';
import { SPRINT_SPEED } from '../../engine/movement';
import {
  DIFFICULTY,
  HORDE_CAPACITY,
  NIGHT_DIFFICULTY,
  nightDifficulty,
  nightTuning,
} from './difficulty';
import { NIGHT_TUNING } from './zombies/brain';

describe('night difficulty', () => {
  it('ramps up every night', () => {
    for (const [a, b] of [
      [1, 2],
      [2, 3],
    ] as const) {
      expect(NIGHT_DIFFICULTY[b].cap).toBeGreaterThan(NIGHT_DIFFICULTY[a].cap);
      expect(NIGHT_DIFFICULTY[b].speed).toBeGreaterThan(NIGHT_DIFFICULTY[a].speed);
    }
  });
  it('can always be outrun and fits the pool', () => {
    for (const d of Object.values(NIGHT_DIFFICULTY)) {
      expect(d.speed).toBeLessThan(SPRINT_SPEED);
      expect(d.cap).toBeLessThanOrEqual(HORDE_CAPACITY);
    }
  });
  it('clamps unknown chapters to Night 1', () => {
    for (const c of [0, 4, -1, NaN]) expect(nightDifficulty(c)).toBe(NIGHT_DIFFICULTY[1]);
  });
  it('tunes speed per chapter, keeping sight and giveUp', () => {
    expect(nightTuning(3, 'normal')).toEqual({
      ...NIGHT_TUNING,
      speed: NIGHT_DIFFICULTY[3].speed,
    });
    expect(nightTuning(3, 'normal')).toBe(nightTuning(3, 'normal'));
  });
  it('carries the difficulty into the zombies', () => {
    const t = nightTuning(1, 'hard');
    expect([t.stun, t.damage, t.bodyHits]).toEqual([
      DIFFICULTY.hard.stun,
      DIFFICULTY.hard.damage,
      DIFFICULTY.hard.bodyHits,
    ]);
    expect(nightTuning(1, 'story').speed).toBeCloseTo(NIGHT_DIFFICULTY[1].speed - 0.5);
  });
});

describe('difficulty', () => {
  it('each step up is harder on every knob', () => {
    const [s, n, h] = (['story', 'normal', 'hard'] as const).map((d) => DIFFICULTY[d]);
    for (const [a, b] of [
      [s, n],
      [n, h],
    ] as const) {
      expect(b.quota).toBeGreaterThan(a.quota);
      expect(b.speed).toBeGreaterThan(a.speed);
      expect(b.interval).toBeLessThan(a.interval);
      expect(b.stun.seconds).toBeLessThan(a.stun.seconds);
      expect(b.stun.exposure).toBeGreaterThan(a.stun.exposure);
      expect(b.damage).toBeGreaterThanOrEqual(a.damage);
      expect(b.supplies).toBeLessThan(a.supplies);
    }
    expect(DIFFICULTY.normal.stun.seconds).toBeLessThanOrEqual(1);
  });
  it('night chase speed stays under the sprint on Hard', () => {
    for (const c of [1, 2, 3])
      expect(nightTuning(c, 'hard').speed).toBeLessThan(SPRINT_SPEED - 0.3);
  });
});
