import type { GrabPose } from './orca-grab';

/**
 * The orca's last leap (Plan 7): too sick to make it back, it throws itself out of the lake onto
 * the pebble shore beside Mom and stays there, breathing slowly, until it is still. It swims in
 * under the water to a launch point off the shore, then leaps up the slope. Tuning knobs (s, m).
 */
export const STRAND = {
  approach: 1.6,
  leap: 1.5,
  /** The launch point: this far out into the lake from where it comes to rest, and this deep. */
  launchOut: 9,
  launchDepth: 1.8,
  /** Height of the leap above the straight line to its resting pose. */
  arc: 1.6,
  /** Its body lies on the shore with the centre line this high above the ground under it. */
  lift: 0.55,
  /** Slow breaths while it lies there: height (m) and breaths per second. */
  breath: { amp: 0.04, rate: 0.25 },
  /** Roll onto its side (rad) once beached. */
  roll: 0.22,
} as const;

const HALF_LENGTH = 3.5;

export interface Strand {
  t: number;
  from: GrabPose;
  rest: GrabPose;
  /** The breath stopped: it is gone. */
  still: boolean;
}

const smooth = (s: number): number => s * s * (3 - 2 * s);
const clamp01 = (s: number): number => Math.min(1, Math.max(0, s));
const lerp = (a: number, b: number, s: number): number => a + (b - a) * s;
const lerpAngle = (a: number, b: number, s: number): number =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * s;

/**
 * Pure: where it comes to rest with its nose at (noseX, noseZ), lying along +z (facing up the
 * shore, its tail back in the lake); `ground(z)` is the shore height at z.
 */
export function strandRest(noseX: number, noseZ: number, ground: (z: number) => number): GrabPose {
  const z = noseZ - HALF_LENGTH;
  const nose = ground(noseZ);
  const tail = ground(z - HALF_LENGTH);
  const pitch = Math.atan2(nose - tail, 2 * HALF_LENGTH) * 0.8;
  return { x: noseX, y: (nose + tail) / 2 + STRAND.lift, z, yaw: Math.PI, pitch };
}

export function newStrand(from: GrabPose, rest: GrabPose): Strand {
  return { t: 0, from: { ...from }, rest, still: false };
}

/** Pure: the pose `s.t` seconds into the last leap (and after, lying on the shore). */
export function strandPose(s: Strand, out: GrabPose): GrabPose {
  const { from, rest } = s;
  // The launch point, off the shore under the water (no object: this runs every frame).
  const launchY = rest.y - STRAND.launchDepth - 1;
  const launchZ = rest.z - STRAND.launchOut;
  if (s.t < STRAND.approach) {
    const k = smooth(clamp01(s.t / STRAND.approach));
    out.x = lerp(from.x, rest.x, k);
    out.y = lerp(from.y, launchY, k);
    out.z = lerp(from.z, launchZ, k);
    out.yaw = lerpAngle(from.yaw, rest.yaw, k);
    out.pitch = 0;
    return out;
  }
  const u = clamp01((s.t - STRAND.approach) / STRAND.leap);
  const ease = 1 - (1 - u) * (1 - u);
  out.x = rest.x;
  out.z = lerp(launchZ, rest.z, ease);
  out.y = lerp(launchY, rest.y, ease) + STRAND.arc * Math.sin(Math.PI * u);
  out.yaw = rest.yaw;
  out.pitch = lerp(0.6, rest.pitch, u);
  if (u >= 1 && !s.still) {
    out.y +=
      STRAND.breath.amp *
      Math.sin(2 * Math.PI * STRAND.breath.rate * (s.t - STRAND.approach - STRAND.leap));
  }
  return out;
}

/** Pure: how far it has rolled onto its side (it settles over as it lands). */
export function strandRoll(s: Strand): number {
  return STRAND.roll * smooth(clamp01((s.t - STRAND.approach - STRAND.leap * 0.7) / 1.2));
}

/** True once it has landed (the leap is over). */
export const beached = (s: Strand): boolean => s.t >= STRAND.approach + STRAND.leap;
