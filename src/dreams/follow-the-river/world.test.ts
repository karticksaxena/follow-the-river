import { describe, expect, it } from 'vitest';
import { KIT_SCALE, kitUrl } from './kits';

describe('kits', () => {
  it('keeps each kit in its own folder (their colormap.png files differ)', () => {
    expect(kitUrl('city', 'building-a')).toMatch(/assets\/kits\/city\/building-a\.glb$/);
    expect(kitUrl('cars', 'police')).toMatch(/assets\/kits\/cars\/police\.glb$/);
  });

  it('scales every kit to metres', () => {
    expect(KIT_SCALE).toEqual({ city: 10, roads: 6, cars: 1, survival: 6, suburb: 8 });
  });
});
