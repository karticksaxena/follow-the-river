import { describe, expect, it } from 'vitest';
import {
  holdStep,
  LAB_LIGHT,
  lampPulse,
  shotProgress,
  SHOTS,
  SPILLWAY,
  TANK_HOLD_PAGE,
  TANK_SWIM,
  tankSwim,
  type Glide,
  type Tape,
} from './flashback-scene';
import { TAPES as TAPE_TEXT } from './tapes';

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

describe('tank swim hold', () => {
  it('holds at the glass facing Mom when fully held', () => {
    const out: Glide = { x: 9, z: 9, yaw: 0 };
    tankSwim(24, out, 1);
    expect(out.x).toBeCloseTo(0, 9); // not toBe: x * 0 can be -0
    expect(out.yaw).toBeCloseTo(Math.PI);
    expect(out.z).toBeGreaterThan(TANK_SWIM.depth);
    tankSwim(5, out, 0.5); // half way: between swimming and held
    expect(Math.abs(out.x)).toBeLessThan(TANK_SWIM.halfWidth);
  });

  it('is named by the right page of tape 1', () => {
    expect(TAPE_TEXT[1]?.[TANK_HOLD_PAGE]).toBe(
      '"She comes to the glass when I sing. Every single time."',
    );
  });

  it('ramps 0 to 1 over the blend after the page, and back on Back', () => {
    let hold = 0;
    for (let i = 0; i < 100; i++) hold = holdStep(hold, TANK_HOLD_PAGE - 1, 0.1);
    expect(hold).toBe(0);
    hold = holdStep(hold, TANK_HOLD_PAGE, TANK_SWIM.blend / 2);
    expect(hold).toBeCloseTo(0.5);
    hold = holdStep(hold, TANK_HOLD_PAGE + 1, TANK_SWIM.blend);
    expect(hold).toBe(1);
    hold = holdStep(hold, TANK_HOLD_PAGE - 1, TANK_SWIM.blend / 2);
    expect(hold).toBeCloseTo(0.5);
    hold = holdStep(hold, 0, TANK_SWIM.blend);
    expect(hold).toBe(0);
  });

  it('never snaps while the hold ramps', () => {
    const out: Glide = { x: 0, z: 0, yaw: 0 };
    let hold = 0;
    tankSwim(0, out, hold);
    let px = out.x;
    let pz = out.z;
    for (let t = 0.01; t < 20; t += 0.01) {
      hold = holdStep(hold, t > 6 ? TANK_HOLD_PAGE : 0, 0.01);
      tankSwim(t, out, hold);
      expect(Math.hypot(out.x - px, out.z - pz)).toBeLessThan(0.05);
      px = out.x;
      pz = out.z;
    }
  });

  it('tape 1 is the tank, tape 2 the lab', () => {
    expect(SHOTS[1].from[2]).toBeGreaterThan(4);
    expect(SHOTS[2].from[2]).toBeLessThan(2);
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
