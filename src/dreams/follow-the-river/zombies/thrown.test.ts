import { describe, expect, it } from 'vitest';
import { EDGE_X, WATER_Y } from '../river';
import { fly } from './body';
import { THROWN, thrownPose } from './thrown';

describe('a zombie the orca knocks aside', () => {
  it('flies into the water, never sinking into the bank', () => {
    const out = { x: 0, y: 0 };
    let landed = false;
    let lowestOverLand = Infinity;
    for (let t = 0; t < 3; t += 1 / 60) {
      const inWater = thrownPose(t, { x: 1.5, z: 0 }, 3.4, out);
      if (out.x < 3.4) lowestOverLand = Math.min(lowestOverLand, out.y);
      if (inWater) landed = true;
    }
    expect(lowestOverLand).toBeGreaterThanOrEqual(0); // over land: above the ground
    expect(landed).toBe(true);
    expect(out.x).toBeGreaterThan(3.4 + 1);
  });

  it('lands 2 m past the waterline, then sinks 1 m/s for 1.2 s and stays down', () => {
    const out = { x: 0, y: 0 };
    expect(thrownPose(THROWN.flight, { x: 0, z: 0 }, 3.4, out)).toBe(true);
    expect(out.x).toBeCloseTo(3.4 + THROWN.pastWater);
    expect(out.y).toBeCloseTo(WATER_Y);
    thrownPose(THROWN.flight + 0.6, { x: 0, z: 0 }, 3.4, out);
    expect(out.y).toBeCloseTo(WATER_Y - 0.6);
    thrownPose(THROWN.flight + 5, { x: 0, z: 0 }, 3.4, out);
    expect(out.y).toBeCloseTo(WATER_Y - THROWN.sink);
  });

  it('is airborne first: up 3.5 m/s under gravity 9.8', () => {
    const out = { x: 0, y: 0 };
    expect(thrownPose(0.1, { x: 0, z: 0 }, 3.4, out)).toBe(false);
    expect(out.y).toBeCloseTo(3.5 * 0.1 - 4.9 * 0.01);
  });

  it('splashes exactly once, on the frame it lands in the water', () => {
    const b = {
      fly: 0,
      fromX: 0,
      fromZ: -40,
      push: THROWN.push,
      x: 0,
      y: 0,
      z: -40,
      splashDue: false,
    };
    let splashes = 0;
    let at = { x: 0, z: 0 };
    for (let t = 0; t < 4; t += 1 / 60) {
      fly(b, 1 / 60);
      if (b.splashDue) {
        splashes++;
        at = { x: b.x, z: b.z };
        b.splashDue = false; // the horde consumes it
      }
    }
    expect(splashes).toBe(1);
    expect(at.x).toBeGreaterThan(EDGE_X);
    expect(b.y).toBeCloseTo(WATER_Y - THROWN.sink);
  });
});
