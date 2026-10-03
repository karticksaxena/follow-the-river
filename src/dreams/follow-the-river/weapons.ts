export type Weapon = 'bow' | 'gun';

/** Gun tuning knobs: reach (m), reload (s), how far a shot is heard (m), how long the noise lingers (s). A hit kills. */
export const GUN = { range: 40, cooldown: 0.35, alertRadius: 40, noiseSeconds: 8 } as const;

/** Seconds to lower the old weapon, then to raise the new one. */
export const SWITCH_HALF = 0.125;

/** After a switch, wheel notches are ignored this long (s) so one trackpad flick switches once. */
export const WHEEL_LOCK = 0.5;

export type WeaponKey = 'Digit1' | 'Digit2' | 'WheelUp' | 'WheelDown';
export const WEAPON_KEYS: readonly WeaponKey[] = ['Digit1', 'Digit2', 'WheelUp', 'WheelDown'];

/** The weapon a key asks for (1 = bow, 2 = gun if owned, wheel cycles between what you own). */
export function nextWeapon(current: Weapon, hasGun: boolean, key: WeaponKey): Weapon {
  if (key === 'Digit1') return 'bow';
  if (key === 'Digit2') return hasGun ? 'gun' : current;
  if (!hasGun) return 'bow';
  return current === 'bow' ? 'gun' : 'bow';
}

/** Which weapon is up and whether it is being swapped (lower the old one, then raise the new). */
export interface Switcher {
  current: Weapon;
  pending: Weapon;
  phase: 'idle' | 'lower' | 'raise';
  t: number;
  /** Seconds left in which wheel presses are ignored. */
  wheelLock: number;
}

export function newSwitcher(): Switcher {
  return { current: 'bow', pending: 'bow', phase: 'idle', t: 0, wheelLock: 0 };
}

export const canFire = (s: Switcher): boolean => s.phase === 'idle';

/** Starts lowering toward `to`; ignored when already there or mid-switch. */
export function startSwitch(s: Switcher, to: Weapon, key?: WeaponKey): void {
  if (s.phase !== 'idle' || to === s.current) return;
  if (s.wheelLock > 0 && (key === 'WheelUp' || key === 'WheelDown')) return;
  s.pending = to;
  s.phase = 'lower';
  s.t = 0;
}

/** Back to the bow with no animation (restart). */
export function resetSwitcher(s: Switcher): void {
  s.current = 'bow';
  s.pending = 'bow';
  s.phase = 'idle';
  s.t = 0;
  s.wheelLock = 0;
}

/** Advances the tween; returns how far down the viewmodel is (0 up, 1 fully lowered). */
export function stepSwitch(s: Switcher, dt: number): number {
  if (s.phase === 'idle') {
    s.wheelLock = Math.max(0, s.wheelLock - dt);
    return 0;
  }
  s.t += dt;
  if (s.phase === 'lower' && s.t >= SWITCH_HALF) {
    s.current = s.pending;
    s.phase = 'raise';
    s.t -= SWITCH_HALF;
  }
  if (s.phase === 'raise' && s.t >= SWITCH_HALF) {
    s.phase = 'idle';
    s.t = 0;
    s.wheelLock = WHEEL_LOCK;
    return 0;
  }
  const f = Math.min(1, s.t / SWITCH_HALF);
  return s.phase === 'lower' ? f : 1 - f;
}

/** Gun reload and noise timers. */
export interface GunTimers {
  cooldown: number;
  noise: number;
}

export function stepTimers(t: GunTimers, dt: number): void {
  t.cooldown = Math.max(0, t.cooldown - dt);
  t.noise = Math.max(0, t.noise - dt);
}

/** Records a shot; false (and no change) while still reloading. */
export function tryShot(t: GunTimers): boolean {
  if (t.cooldown > 0) return false;
  t.cooldown = GUN.cooldown;
  t.noise = GUN.noiseSeconds;
  return true;
}
