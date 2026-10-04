import { describe, expect, it } from 'vitest';
import {
  PUDDLE,
  puddleAmount,
  repeatPerMetre,
  SURFACES,
  tierMaps,
  WALKWAY_PALETTE,
  walkwayClass,
} from './surfaces';

const files = Object.keys(import.meta.glob('/public/assets/textures/*/*.jpg'));

describe('surfaces', () => {
  it('repeats once per tile size: 1 / metres', () => {
    expect(repeatPerMetre('asphalt')).toBeCloseTo(1 / SURFACES.asphalt.metres);
    expect(repeatPerMetre('pebbles')).toBeCloseTo(1 / SURFACES.pebbles.metres);
    expect(repeatPerMetre('pebbles')).toBeGreaterThan(repeatPerMetre('asphalt')); // finer stones tile smaller
  });

  it('every surface has its three committed maps', () => {
    for (const { dir } of Object.values(SURFACES)) {
      for (const file of ['diff', 'nor', 'arm']) {
        expect(files).toContain(`/public/assets/textures/${dir}/${file}.jpg`);
      }
    }
  });

  it('puddles: none on dry noise, full on the wettest, smooth between', () => {
    expect(puddleAmount(0)).toBe(0);
    expect(puddleAmount(PUDDLE.lo)).toBe(0);
    expect(puddleAmount(1)).toBe(1);
    const mid = puddleAmount((PUDDLE.lo + PUDDLE.hi) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(puddleAmount(PUDDLE.lo + 0.01)).toBeLessThan(mid);
  });

  it('puddles are never a mirror: a torch beam on them stays a soft sheen', () => {
    expect(PUDDLE.roughness).toBeGreaterThanOrEqual(0.15);
  });

  it('Low is the cheapest: colour and normal only, no ARM, no puddles', () => {
    expect(tierMaps('low')).toEqual({ normal: true, arm: false, puddles: false });
    expect(tierMaps('medium')).toEqual({ normal: true, arm: true, puddles: true });
    expect(tierMaps('high')).toEqual({ normal: true, arm: true, puddles: true });
  });

  it('Kenney road tile: road to asphalt, kerb tops to concrete, the painted lines keep their colour', () => {
    expect(walkwayClass([157, 164, 196])).toBe('asphalt'); // the road quad
    expect(walkwayClass([189, 198, 238])).toBe('concrete'); // the raised kerb tops
    expect(walkwayClass([142, 149, 179])).toBe('marking'); // centre line
    expect(walkwayClass([81, 85, 102])).toBe('marking'); // edge lines
    expect(WALKWAY_PALETTE.some((p) => p.kind === 'marking')).toBe(true);
  });
});
