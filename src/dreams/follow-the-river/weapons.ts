import type { GunKind } from './state';

export type Weapon = 'bow' | GunKind;
/** Number keys 1–4 in order. */
export const SLOTS: readonly Weapon[] = ['bow', 'pistol', 'shotgun', 'rifle'];

export interface GunSpec {
  /** The prop model (public/assets/props) and where it sits in view (camera space, m). */
  model: string;
  view: { x: number; y: number; z: number };
  /** Reach (m) and seconds between shots. A hit kills. */
  range: number;
  cooldown: number;
  /** Pellets per shot and their cone's half-angle (rad). */
  pellets: number;
  spread: number;
  /** Keeps firing while the button is held. */
  auto: boolean;
  /** How far a shot is heard (m), and how hard it kicks (m). */
  alertRadius: number;
  kick: number;
  volume: number;
}

/** Gun tuning knobs. */
export const GUNS: Readonly<Record<GunKind, GunSpec>> = {
  pistol: {
    model: 'pistol',
    view: { x: 0.26, y: -0.26, z: -0.5 },
    range: 40,
    cooldown: 0.35,
    pellets: 1,
    spread: 0,
    auto: false,
    alertRadius: 40,
    kick: 0.08,
    volume: 0.9,
  },
  // Close and wide: one blast can drop a group.
  shotgun: {
    model: 'shotgun',
    view: { x: 0.24, y: -0.27, z: -0.62 },
    range: 16,
    cooldown: 0.9,
    pellets: 7,
    spread: 0.09,
    auto: false,
    alertRadius: 45,
    kick: 0.14,
    volume: 1,
  },
  rifle: {
    model: 'rifle',
    view: { x: 0.25, y: -0.26, z: -0.55 },
    range: 50,
    cooldown: 0.11,
    pellets: 1,
    spread: 0.015,
    auto: true,
    alertRadius: 45,
    kick: 0.035,
    volume: 0.6,
  },
};

/** Seconds to lower the old weapon, then to raise the new one. */
export const SWITCH_HALF = 0.125;

/** After a switch, wheel notches are ignored this long (s) so one trackpad flick switches once. */
export const WHEEL_LOCK = 0.5;

export type WeaponKey = 'Digit1' | 'Digit2' | 'Digit3' | 'Digit4' | 'WheelUp' | 'WheelDown';
export const WEAPON_KEYS: readonly WeaponKey[] = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'WheelUp',
  'WheelDown',
];
const SLOT_OF: Partial<Record<WeaponKey, number>> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };

export const owns = (guns: readonly GunKind[], w: Weapon): boolean =>
  w === 'bow' || guns.includes(w);

/** The weapon a key asks for: 1–4 pick a slot you own; the wheel cycles through what you own. */
export function nextWeapon(current: Weapon, guns: readonly GunKind[], key: WeaponKey): Weapon {
  const slot = SLOT_OF[key];
  if (slot !== undefined) {
    const w = SLOTS[slot];
    return w !== undefined && owns(guns, w) ? w : current;
  }
  const list = SLOTS.filter((w) => owns(guns, w));
  const i = Math.max(0, list.indexOf(current));
  const step = key === 'WheelUp' ? 1 : -1;
  return list[(i + step + list.length) % list.length] ?? 'bow';
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

/** Gun reload timer. */
export interface GunTimers {
  cooldown: number;
}

export function stepTimers(t: GunTimers, dt: number): void {
  t.cooldown = Math.max(0, t.cooldown - dt);
}

/** Records a shot; false (and no change) while still reloading. */
export function tryShot(t: GunTimers, spec: GunSpec): boolean {
  if (t.cooldown > 0) return false;
  t.cooldown = spec.cooldown;
  return true;
}

/**
 * Pure: a pellet's direction, `look` turned by up to `spread` rad; (a, b) in [0, 1) pick where in
 * the cone. Writes `out` (unit length).
 */
export function spreadDir(
  look: { x: number; y: number; z: number },
  spread: number,
  a: number,
  b: number,
  out: { x: number; y: number; z: number },
): void {
  // Two axes across the look direction (any vector not parallel to it works for the first).
  const ux = -look.z;
  const uz = look.x;
  const ul = Math.hypot(ux, uz) || 1;
  const rx = ux / ul;
  const rz = uz / ul;
  const vx = look.y * rz;
  const vy = rx * look.z - rz * look.x;
  const vz = -look.y * rx;
  const angle = 2 * Math.PI * a;
  const r = Math.tan(spread) * Math.sqrt(b);
  const ox = Math.cos(angle) * r;
  const oy = Math.sin(angle) * r;
  out.x = look.x + rx * ox + vx * oy;
  out.y = look.y + vy * oy;
  out.z = look.z + rz * ox + vz * oy;
  const l = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= l;
  out.y /= l;
  out.z /= l;
}
