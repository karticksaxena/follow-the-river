import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import { DAWN_BANK, groundSurfaces } from './ground';

describe('groundSurfaces', () => {
  it('city streets are asphalt, suburbs grass, the forest leaf litter', () => {
    expect(groundSurfaces(CITY).ground).toBe('asphalt');
    expect(groundSurfaces(SUBURBS).ground).toBe('grass');
    expect(groundSurfaces(FOREST).ground).toBe('leaves');
  });

  it('the far bank matches the land; the city embankment top is pavement', () => {
    expect(groundSurfaces(SUBURBS).far).toBe('grass');
    expect(groundSurfaces(FOREST).far).toBe('leaves');
    expect(groundSurfaces(CITY).kerb).toBe('pavement');
  });

  it('sunrise banks are darkened and more saturated: wet earth, not snow', () => {
    expect(DAWN_BANK.gain).toBeLessThan(1);
    expect(DAWN_BANK.gain).toBeGreaterThan(0.3);
    expect(DAWN_BANK.saturation).toBeGreaterThan(1);
  });
});
