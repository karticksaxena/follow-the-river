import { describe, expect, it } from 'vitest';
import { SPRINT_SPEED } from '../../engine/movement';
import { HORDE_CAPACITY, NIGHT_DIFFICULTY, nightDifficulty, nightTuning } from './difficulty';
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
    expect(nightTuning(3)).toEqual({ ...NIGHT_TUNING, speed: NIGHT_DIFFICULTY[3].speed });
    expect(nightTuning(3)).toBe(nightTuning(3));
  });
});
