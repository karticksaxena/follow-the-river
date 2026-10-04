import { WATER_Y } from '../river';

/** A zombie the orca knocks aside flies into the lake (tuning knobs: m, s, m/s, rad/s). */
export const THROWN = {
  /** Launch speed up, gravity, and where it lands: this far past the waterline. */
  launch: 3.5,
  gravity: 9.8,
  pastWater: 2,
  /** Once in the water it sinks at this speed (m/s) for this many seconds, then is parked. */
  sinkSpeed: 1,
  sinkSeconds: 1.2,
  /** Tumble about its own z axis (rad/s) and the sideways push away from the jaws (m/s). */
  tumble: 3,
  push: 1.5,
  /** Seconds in the air: until it falls to the water's surface. */
  flight: (3.5 + Math.sqrt(3.5 * 3.5 - 2 * 9.8 * WATER_Y)) / 9.8,
  /** How deep it ends up. */
  sink: 1.2,
} as const;

/** Seconds from the throw until it is gone. */
export const THROWN_SECONDS = THROWN.flight + THROWN.sinkSeconds;

/**
 * Pure: where the zombie is `t` seconds after the throw, from the ground at `from`: a parabola
 * toward a landing point `pastWater` m beyond the waterline, never below the ground while over the
 * land, then sinking where it fell. Writes x and y; true once it is in the water.
 */
export function thrownPose(
  t: number,
  from: { x: number; z: number },
  waterline: number,
  out: { x: number; y: number },
): boolean {
  const { launch, gravity, flight } = THROWN;
  const k = Math.min(t, flight);
  const landing = Math.max(waterline + THROWN.pastWater, from.x);
  out.x = from.x + ((landing - from.x) * k) / flight;
  out.y = launch * k - 0.5 * gravity * k * k;
  if (out.x < waterline) out.y = Math.max(out.y, 0);
  if (t < flight) return false;
  out.y = WATER_Y - Math.min(THROWN.sink, THROWN.sinkSpeed * (t - flight));
  return true;
}

/** Pure: the tumble angle (about z) `t` seconds after the throw: it stops when it lands. */
export const thrownTilt = (t: number): number => THROWN.tumble * Math.min(t, THROWN.flight);
