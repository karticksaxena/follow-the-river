/** Zombie animation level of detail. Tuning knobs. */
export const LOD = {
  /** Inside this (m) a zombie animates every frame, seen or not. */
  near: 10,
  /** Beyond this (m) even an on-screen zombie is a small figure. */
  far: 25,
  /** Cosine of the angle from the view direction past which a zombie counts as off screen (75 deg: wider than the widest view). */
  offScreenCos: 0.26,
  /** Mixer update interval in frames: mid-range off screen, far on screen, far off screen. */
  midOff: 2,
  farOn: 2,
  farOff: 4,
} as const;

/**
 * Frames between mixer updates (1 = every frame) for a zombie `distance` m away whose direction
 * makes `cosView` with the player's view (flattened to the ground). The dt in between is
 * accumulated by the caller, so the animation speed is unchanged.
 */
export function mixerStep(distance: number, cosView: number): number {
  if (distance <= LOD.near) return 1;
  const off = cosView < LOD.offScreenCos;
  if (distance <= LOD.far) return off ? LOD.midOff : 1;
  return off ? LOD.farOff : LOD.farOn;
}

/** Cosine between the horizontal view direction (`lx`,`lz`) and the offset (`dx`,`dz`) of length `distance`; 1 when undefined (looking straight up or down, or on top of it). */
export function facingCos(
  lx: number,
  lz: number,
  dx: number,
  dz: number,
  distance: number,
): number {
  const lookLen = Math.hypot(lx, lz);
  if (lookLen < 1e-3 || distance < 1e-3) return 1;
  return (dx * lx + dz * lz) / (distance * lookLen);
}

/** The fields `advanceMixer` keeps per body. */
export interface LodClock {
  /** dt owed to the mixer since its last update. */
  owed: number;
  /** Frames since its last update. */
  frames: number;
}

/**
 * Adds `dt` to what the mixer is owed and returns the dt to feed it now (0: skip this frame).
 * `step` 1 always updates; a body that has waited `step` frames takes everything it is owed.
 */
export function advanceMixer(clock: LodClock, dt: number, step: number): number {
  clock.owed += dt;
  if (++clock.frames < step) return 0;
  const due = clock.owed;
  clock.owed = 0;
  clock.frames = 0;
  return due;
}
