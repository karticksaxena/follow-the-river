import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { TAPES } from './tapes';

describe('tapes', () => {
  it('has a transcript for every tape placed in an area', () => {
    const lengths = CITY.pickups
      .filter((p) => p.kind === 'tape')
      .map((p) => TAPES[p.tape ?? -1]?.length ?? 0);
    expect(lengths.length).toBeGreaterThan(0);
    expect(lengths.every((n) => n > 2)).toBe(true);
  });

  it.each([1, 2, 3])('tape %i has a label first and short player-paced pages', (n) => {
    const pages = TAPES[n] ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(5);
    expect(pages[0]).toMatch(/^The label says/);
    expect(pages.every((p) => p.length <= 180)).toBe(true);
  });
});
