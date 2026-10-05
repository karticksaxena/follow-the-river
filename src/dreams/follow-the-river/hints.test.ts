import { describe, expect, it } from 'vitest';
import { HINTS } from './hints';

describe('hints', () => {
  it('only Night 1 talks about the houses (Nights 2 and 3 have none)', () => {
    const withHouses = Object.entries(HINTS)
      .filter(([, pages]) => /house/i.test(pages.join(' ')))
      .map(([id]) => id);
    expect(withHouses.toSorted()).toEqual(['night1', 'waveHouse']);
  });

  it('no longer says things glow in the dark (pickups do not)', () => {
    expect(Object.values(HINTS).flat().join(' ')).not.toMatch(/glow/i);
  });

  it('tells Night 1 where the ammo is', () => {
    expect(HINTS.night1.join(' ')).toMatch(/dark houses.*flashlight.*ammo.*crate/);
    expect(HINTS.waveHouse.join(' ')).toMatch(/crate is in one of the houses/);
  });

  it('Day 1 says to search the sheds, feed Dras and keep following the river', () => {
    const text = HINTS.pickup.join(' ');
    expect(text).toMatch(/sheds.*search/i);
    expect(text).toMatch(/Feed Dras.*fish pack.*hungrier/);
    expect(text).toMatch(/follow the river/i);
  });

  it('every day and night says to follow the river and feed Dras', () => {
    for (const id of ['day2', 'day3', 'night1', 'night2', 'night3'] as const) {
      const text = HINTS[id].join(' ');
      expect(text).toMatch(/following the river/i);
      expect(text).toMatch(/feed Dras/i);
    }
  });

  it('the bow hint matches the arrow rule per difficulty', () => {
    expect(HINTS.bowStory.join(' ')).toMatch(/even ones that hit/);
    expect(HINTS.bow.join(' ')).toMatch(/missed.*stays in it/);
  });
});
