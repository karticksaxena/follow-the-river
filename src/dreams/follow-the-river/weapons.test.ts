import { describe, expect, it } from 'vitest';
import { spend, START_SUPPLIES } from './state';
import {
  canFire,
  GUNS,
  newSwitcher,
  nextWeapon,
  spreadDir,
  startSwitch,
  stepSwitch,
  stepTimers,
  SWITCH_HALF,
  tryShot,
  WHEEL_LOCK,
} from './weapons';

describe('nextWeapon', () => {
  it('1–4 pick the bow, pistol, shotgun and rifle, but only the ones you own', () => {
    const two = ['pistol', 'shotgun'] as const;
    expect(nextWeapon('rifle', two, 'Digit1')).toBe('bow');
    expect(nextWeapon('bow', two, 'Digit2')).toBe('pistol');
    expect(nextWeapon('bow', two, 'Digit3')).toBe('shotgun');
    expect(nextWeapon('bow', two, 'Digit4')).toBe('bow');
    expect(nextWeapon('bow', [], 'Digit2')).toBe('bow');
  });
  it('the wheel cycles through what you own, and stays on the bow without a gun', () => {
    const all = ['pistol', 'shotgun', 'rifle'] as const;
    expect(nextWeapon('bow', all, 'WheelUp')).toBe('pistol');
    expect(nextWeapon('rifle', all, 'WheelUp')).toBe('bow');
    expect(nextWeapon('bow', all, 'WheelDown')).toBe('rifle');
    expect(nextWeapon('bow', [], 'WheelUp')).toBe('bow');
  });
});

describe('switch tween', () => {
  it('cannot fire while switching, swaps at the bottom, and ends raised', () => {
    const s = newSwitcher();
    startSwitch(s, 'pistol');
    expect(canFire(s)).toBe(false);
    expect(s.current).toBe('bow');
    expect(stepSwitch(s, SWITCH_HALF - 0.01)).toBeGreaterThan(0.9);
    stepSwitch(s, 0.02);
    expect(s.current).toBe('pistol');
    expect(canFire(s)).toBe(false);
    expect(stepSwitch(s, SWITCH_HALF)).toBe(0);
    expect(canFire(s)).toBe(true);
  });
  it('ignores a switch to the same weapon and a second switch mid-way', () => {
    const s = newSwitcher();
    startSwitch(s, 'bow');
    expect(canFire(s)).toBe(true);
    startSwitch(s, 'pistol');
    startSwitch(s, 'bow');
    expect(s.pending).toBe('pistol');
  });
});

describe('gun', () => {
  it("waits out each gun's cooldown between shots", () => {
    const t = { cooldown: 0 };
    expect(tryShot(t, GUNS.shotgun)).toBe(true);
    expect(tryShot(t, GUNS.shotgun)).toBe(false);
    stepTimers(t, GUNS.shotgun.cooldown);
    expect(tryShot(t, GUNS.shotgun)).toBe(true);
  });
  it('the rifle fires fastest and auto; the shotgun throws pellets; ammo never goes negative', () => {
    expect(GUNS.rifle.auto && !GUNS.pistol.auto && !GUNS.shotgun.auto).toBe(true);
    expect(GUNS.rifle.cooldown).toBeLessThan(GUNS.pistol.cooldown);
    expect(GUNS.shotgun.pellets).toBeGreaterThan(1);
    expect(GUNS.shotgun.range).toBeLessThan(GUNS.pistol.range);
    const empty = { ...START_SUPPLIES, ammo: 0 };
    expect(spend(empty, 'ammo', 1)).toBeNull();
    expect(spend({ ...empty, ammo: 1 }, 'ammo', 1)?.ammo).toBe(0);
  });
});

describe('spreadDir', () => {
  it('stays unit length and within the cone', () => {
    const look = { x: 0.6, y: 0.1, z: -0.79 };
    const l = Math.hypot(look.x, look.y, look.z);
    look.x /= l;
    look.y /= l;
    look.z /= l;
    const out = { x: 0, y: 0, z: 0 };
    for (const [a, b] of [
      [0, 1],
      [0.25, 1],
      [0.6, 0.5],
      [0.9, 0],
    ] as const) {
      spreadDir(look, 0.1, a, b, out);
      expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1);
      const cos = out.x * look.x + out.y * look.y + out.z * look.z;
      expect(Math.acos(Math.min(1, cos))).toBeLessThanOrEqual(0.1 + 1e-6);
    }
  });
});

describe('wheel lock', () => {
  it('a long trackpad flick switches once; keys still switch at once', () => {
    const s = newSwitcher();
    startSwitch(s, 'pistol', 'WheelUp');
    stepSwitch(s, SWITCH_HALF);
    stepSwitch(s, SWITCH_HALF);
    expect(s.current).toBe('pistol');
    startSwitch(s, 'bow', 'WheelDown');
    expect(s.phase).toBe('idle');
    stepSwitch(s, WHEEL_LOCK);
    startSwitch(s, 'bow', 'WheelDown');
    expect(s.phase).toBe('lower');
  });

  it('number keys ignore the lock', () => {
    const s = newSwitcher();
    startSwitch(s, 'pistol', 'Digit2');
    stepSwitch(s, SWITCH_HALF);
    stepSwitch(s, SWITCH_HALF);
    startSwitch(s, 'bow', 'Digit1');
    expect(s.phase).toBe('lower');
  });
});
