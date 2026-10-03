import { describe, expect, it } from 'vitest';
import { spawnInterval } from './difficulty';
import { spend } from './state';
import {
  canFire,
  GUN,
  newSwitcher,
  nextWeapon,
  startSwitch,
  stepSwitch,
  stepTimers,
  SWITCH_HALF,
  tryShot,
  WHEEL_LOCK,
} from './weapons';

describe('nextWeapon', () => {
  it('1 is the bow; 2 is the gun only when owned', () => {
    expect(nextWeapon('gun', true, 'Digit1')).toBe('bow');
    expect(nextWeapon('bow', true, 'Digit2')).toBe('gun');
    expect(nextWeapon('bow', false, 'Digit2')).toBe('bow');
  });
  it('the wheel cycles, and stays on the bow without a gun', () => {
    expect(nextWeapon('bow', true, 'WheelUp')).toBe('gun');
    expect(nextWeapon('gun', true, 'WheelDown')).toBe('bow');
    expect(nextWeapon('bow', false, 'WheelUp')).toBe('bow');
  });
});

describe('switch tween', () => {
  it('cannot fire while switching, swaps at the bottom, and ends raised', () => {
    const s = newSwitcher();
    startSwitch(s, 'gun');
    expect(canFire(s)).toBe(false);
    expect(s.current).toBe('bow');
    expect(stepSwitch(s, SWITCH_HALF - 0.01)).toBeGreaterThan(0.9);
    stepSwitch(s, 0.02);
    expect(s.current).toBe('gun');
    expect(canFire(s)).toBe(false);
    expect(stepSwitch(s, SWITCH_HALF)).toBe(0);
    expect(canFire(s)).toBe(true);
  });
  it('ignores a switch to the same weapon and a second switch mid-way', () => {
    const s = newSwitcher();
    startSwitch(s, 'bow');
    expect(canFire(s)).toBe(true);
    startSwitch(s, 'gun');
    startSwitch(s, 'bow');
    expect(s.pending).toBe('gun');
  });
});

describe('gun', () => {
  it('reloads between shots and keeps the noise for noiseSeconds', () => {
    const t = { cooldown: 0, noise: 0 };
    expect(tryShot(t)).toBe(true);
    expect(tryShot(t)).toBe(false);
    stepTimers(t, GUN.cooldown);
    expect(tryShot(t)).toBe(true);
    stepTimers(t, GUN.noiseSeconds - 1);
    expect(spawnInterval(2, t.noise)).toBe(1);
    stepTimers(t, 2);
    expect(spawnInterval(2, t.noise)).toBe(2);
  });
  it('ammo never goes negative', () => {
    const supplies = { battery: 0, arrows: 0, ammo: 0, fishPacks: 0 };
    expect(spend(supplies, 'ammo', 1)).toBeNull();
    expect(spend({ ...supplies, ammo: 1 }, 'ammo', 1)?.ammo).toBe(0);
  });
});

describe('wheel lock', () => {
  it('a long trackpad flick switches once; keys still switch at once', () => {
    const s = newSwitcher();
    startSwitch(s, 'gun', 'WheelUp');
    stepSwitch(s, SWITCH_HALF);
    stepSwitch(s, SWITCH_HALF);
    expect(s.current).toBe('gun');
    startSwitch(s, 'bow', 'WheelDown');
    expect(s.phase).toBe('idle');
    stepSwitch(s, WHEEL_LOCK);
    startSwitch(s, 'bow', 'WheelDown');
    expect(s.phase).toBe('lower');
  });

  it('number keys ignore the lock', () => {
    const s = newSwitcher();
    startSwitch(s, 'gun', 'Digit2');
    stepSwitch(s, SWITCH_HALF);
    stepSwitch(s, SWITCH_HALF);
    startSwitch(s, 'bow', 'Digit1');
    expect(s.phase).toBe('lower');
  });
});
