import { describe, expect, it } from 'vitest';
import { againText } from './death';

describe('againText', () => {
  it('names where you come back: the day, the night, or the last barricade', () => {
    expect(againText({ phase: 'day2', wave: 0 })).toMatch(/day/);
    expect(againText({ phase: 'night1', wave: 0 })).toMatch(/night starts again/);
    expect(againText({ phase: 'night2', wave: 2 })).toMatch(/barricade/);
  });
});
