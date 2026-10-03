import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import {
  atSafeSpot,
  MAX_HEALTH,
  nearSpot,
  phaseTitle,
  spawnFor,
  takeDamage,
  waitQuestion,
} from './flow';
import { PHASES } from './state';

describe('chapter flow', () => {
  it('takes damage down to zero, never below', () => {
    expect(takeDamage(MAX_HEALTH, 34)).toBe(66);
    expect(takeDamage(10, 34)).toBe(0);
  });

  it('knows when the night is survived', () => {
    expect(atSafeSpot(CITY.safeZ - 1, CITY.safeZ)).toBe(true);
    expect(atSafeSpot(CITY.safeZ + 10, CITY.safeZ)).toBe(false);
  });

  it('spawns days at the day spawn and nights past the barricade', () => {
    expect(spawnFor('day1', CITY)).toEqual(CITY.daySpawn);
    expect(spawnFor('night1', CITY)).toEqual(CITY.nightStart);
  });

  it('titles phases for the title cards', () => {
    expect(PHASES.map(phaseTitle)).toEqual([
      '',
      'Day 1',
      'Night 1',
      'Day 2',
      'Night 2',
      'Day 3',
      'Night 3',
      '',
    ]);
  });

  it('warns only about what still applies before waiting for dark', () => {
    expect(waitQuestion(0, false)).toBe('Wait for dark? You cannot come back here.');
    expect(waitQuestion(1, false)).toContain('1 fish pack — throw it');
    expect(waitQuestion(2, true)).toContain('2 fish packs — throw them');
    expect(waitQuestion(2, true)).toContain('tape');
  });

  it('checks closeness on the ground plane', () => {
    expect(nearSpot(1, 1, { x: 0, z: 0 }, 2)).toBe(true);
    expect(nearSpot(3, 0, { x: 0, z: 0 }, 2)).toBe(false);
  });
});
