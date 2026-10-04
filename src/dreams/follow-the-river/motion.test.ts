import { describe, expect, it } from 'vitest';
import { FLASHLIGHT } from './flashlight';
import { beamBrightness, conePoint, MOTION } from './motion';

const TIERS = ['low', 'medium', 'high'] as const;

describe('MOTION counts per tier', () => {
  it('never grows when the tier drops', () => {
    for (const c of Object.values(MOTION)) {
      expect(c.low).toBeLessThanOrEqual(c.medium);
      expect(c.medium).toBeLessThanOrEqual(c.high);
    }
  });
  it('turns the optional extras off on Low and keeps a few hundred motes on High', () => {
    expect(MOTION.motes.low).toBe(0);
    expect(MOTION.fireflies.low).toBe(0);
    expect(MOTION.leaves.low).toBe(0);
    expect(MOTION.mist.low).toBe(0);
    expect(MOTION.motes.high).toBeGreaterThanOrEqual(200);
    expect(MOTION.motes.high).toBeLessThanOrEqual(400);
  });
  it('has a pool for every tier', () => {
    for (const t of TIERS) expect(MOTION.spray[t]).toBeGreaterThan(0);
    for (const t of TIERS) expect(MOTION.embers[t]).toBeGreaterThan(0);
  });
});

describe('beamBrightness (camera space, the torch looks down -z)', () => {
  it('is lit on the axis and dark behind the camera', () => {
    expect(beamBrightness(-0.05 * 8, -0.35 * 8, -8)).toBeGreaterThan(0.1);
    expect(beamBrightness(0, 0, 5)).toBe(0);
  });
  it('is dark outside the cone and beyond the reach', () => {
    expect(beamBrightness(9, 0, -3)).toBe(0);
    expect(beamBrightness(0, -0.3 * 30, -30)).toBe(0);
    expect(FLASHLIGHT.distance).toBeLessThan(30);
  });
  it('fades with distance', () => {
    expect(beamBrightness(-0.4, -2.8, -8)).toBeGreaterThan(beamBrightness(-1, -7, -20));
  });
});

describe('conePoint', () => {
  it('always lands inside the beam, whatever the random inputs', () => {
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        conePoint(i / 20, j / 20, (i * 7 + j) / 20, out);
        const d = Math.hypot(out.x, out.y, out.z);
        expect(d).toBeLessThanOrEqual(FLASHLIGHT.distance);
        expect(out.z).toBeLessThan(0);
        expect(beamBrightness(out.x, out.y, out.z)).toBeGreaterThan(0);
      }
    }
  });
});
