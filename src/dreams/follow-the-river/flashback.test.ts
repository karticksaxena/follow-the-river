import { describe, expect, it } from 'vitest';
import {
  LAB_LIGHT,
  lampPulse,
  shotProgress,
  SHOTS,
  SPILLWAY,
  TANK_SWIM,
  tankSwim,
  type Glide,
  type Tape,
} from './flashback-scene';

const TAPES: readonly Tape[] = [1, 2, 3];

describe('shots', () => {
  it('has one slow move per tape, above the floor and long enough to outlast a read', () => {
    for (const tape of TAPES) {
      const shot = SHOTS[tape];
      expect(shot.seconds).toBeGreaterThanOrEqual(30);
      expect(shot.from[1]).toBeGreaterThan(1);
      expect(shot.to[1]).toBeGreaterThan(1);
      const dist = Math.hypot(...shot.from.map((v, i) => v - (shot.to[i] ?? 0)));
      expect(dist).toBeGreaterThan(0.3);
      expect(dist).toBeLessThan(2); // a drift, not a dolly
    }
  });

  it('eases from 0 to 1, clamps, and never goes backwards', () => {
    expect(shotProgress(0, 40)).toBe(0);
    expect(shotProgress(40, 40)).toBe(1);
    expect(shotProgress(99, 40)).toBe(1);
    expect(shotProgress(-5, 40)).toBe(0);
    let last = 0;
    for (let t = 0; t <= 40; t += 0.5) {
      const k = shotProgress(t, 40);
      expect(k).toBeGreaterThanOrEqual(last);
      last = k;
    }
    expect(shotProgress(20, 40)).toBeCloseTo(0.5);
  });
});

describe('lamp pulse', () => {
  it('throbs between its dim bounds with the set period', () => {
    const { min, max, period } = LAB_LIGHT.pulse;
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < period; t += 0.01) {
      const v = lampPulse(t);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeCloseTo(min, 2);
    expect(hi).toBeCloseTo(max, 2);
    expect(max).toBeLessThan(1.5); // never bright
    expect(lampPulse(1.3)).toBeCloseTo(lampPulse(1.3 + period));
  });
});

describe('tank swim', () => {
  it('stays inside the tank and faces Mom (+Z) when it reaches the glass', () => {
    const out: Glide = { x: 0, z: 0, yaw: 0 };
    const half = TANK_SWIM.halfWidth;
    let faced = false;
    for (let t = 0; t < TANK_SWIM.period; t += 0.05) {
      tankSwim(t, out);
      expect(Math.abs(out.x)).toBeLessThanOrEqual(half + 1e-9);
      expect(Math.abs(out.z)).toBeLessThan(1.35); // inner glass is at ±1.35
      // Yaw π points the nose at +Z: toward the front glass and Mom.
      if (Math.abs(Math.abs(out.yaw) - Math.PI) < 0.6 && out.z > TANK_SWIM.depth) faced = true;
    }
    expect(faced).toBe(true);
  });

  it('reuses the caller’s object (no per-frame allocation)', () => {
    const out: Glide = { x: 0, z: 0, yaw: 0 };
    expect(tankSwim(3, out)).toBe(out);
  });
});

describe('spillway', () => {
  it('sends the orca downstream (−Z) and keeps the dam far and dim', () => {
    const { from, to, seconds } = SPILLWAY.orca;
    expect(to[1]).toBeLessThan(from[1]);
    expect(seconds).toBeGreaterThanOrEqual(SHOTS[3].seconds);
    expect(Math.hypot(SPILLWAY.dam.at[0], SPILLWAY.dam.at[2])).toBeGreaterThan(25);
    expect(SPILLWAY.fogFar).toBeLessThanOrEqual(100);
  });
});
