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
});
