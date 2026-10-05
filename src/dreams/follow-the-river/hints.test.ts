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
    expect(HINTS.night1.join(' ')).toMatch(/dark houses.*torch.*ammo.*crate/);
    expect(HINTS.waveHouse.join(' ')).toMatch(/crate is in one of the houses/);
  });
});
