import { ANATOMY } from './dras-anatomy';
import type { GrabPose } from './orca-grab';

/**
 * The orca's last leap (Plan 7, swim-in Plan 9): too sick to make it back, it comes in across the
 * lake at the surface (fin up, wake on), dips, and throws itself out of the water onto the pebble
 * shore beside Mom and stays there, breathing slowly, until it is still. Tuning knobs (s, m, m/s).
 */
export const STRAND = {
  /** Rises from wherever she was to the surface (a blow when she breaks it). */
  rise: 0.8,
  /** She swims in at the surface this fast, for between `swimMin` and `swimMax` seconds. */
  swimSpeed: 3.2,
  swimMin: 4,
  swimMax: 9,
  /** The dip before the leap, and the leap. */
  dip: 0.6,
  leap: 1.5,
  /** The launch point: this far out into the lake from where it comes to rest, and this deep. */
  launchOut: 10,
  launchDepth: 1.8,
  /** Height of the leap above the straight line to its resting pose. */
  arc: 1.6,
  /** Slow breaths while it lies there: height (m) and breaths per second. */
  breath: { amp: 0.04, rate: 0.25 },
} as const;

const HALF_LENGTH = ANATOMY.halfLength;
const PITCH_MAX = 0.6;
const PITCH_STEP = 0.005;

/**
 * The orca's underside, measured from the model (`ahead` of the centre, `depth` below the root, m):
 * chin, belly, the pectoral tips (the lowest points: 0.15 m below the belly), rear belly, tail.
 * The first is the "nose", the third the "middle", the last the "tail".
 */
export const UNDERSIDE: readonly (readonly [number, number])[] = [
  [3.0, 0.54],
  [2.0, 0.65],
  [1.3, 0.844],
  [0, 0.66],
  [-1.5, 0.46],
  [-3.0, 0.18],
];
/** Where a pose's underside sample `[ahead, depth]` is (z along the shore, and height). */
function underside(rest: GrabPose, [ahead, depth]: readonly [number, number]): [number, number] {
  const { pitch } = rest;
  // Facing +z (yaw pi): pitching nose-up lifts what is ahead and tips the underside back.
  return [
    rest.z + ahead * Math.cos(pitch) + depth * Math.sin(pitch),
    rest.y + ahead * Math.sin(pitch) - depth * Math.cos(pitch),
  ];
}

/** Pure: how far each underside sample (see `UNDERSIDE`) of `rest` is above the shore (>= 0: never in it). */
export function restGaps(rest: GrabPose, ground: (z: number) => number): number[] {
  return UNDERSIDE.map((p) => {
    const [z, y] = underside(rest, p);
    return y - ground(z);
  });
}

export interface Strand {
  t: number;
  from: GrabPose;
  rest: GrabPose;
  /** Root height at the surface (the fin shows), and the seconds she swims in at it. */
  cruiseY: number;
  swim: number;
  /** When each phase ends (s): the rise, the swim, the dip, the leap. */
  ends: { rise: number; swim: number; dip: number; leap: number };
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
 * shore, its tail back in the lake); `ground(z)` is the shore height at z. It lies ON the pebbles:
 * pitched so its chin and tail sit lowest over the slope, then lowered until its lowest point (the
 * pectoral tips) touches and nothing is under the shore. The body is rigid here, so on a slope the chin and
 * tail sit above the ground; the Beached clip droops the tail.
 */
export function strandRest(noseX: number, noseZ: number, ground: (z: number) => number): GrabPose {
  const z = noseZ - HALF_LENGTH;
  let best: GrabPose | null = null;
  let bestOver = Infinity;
  // Nose-up from level to steep: the pitch that keeps the chin and tail lowest, resting on the tips.
  for (let pitch = 0; pitch <= PITCH_MAX; pitch += PITCH_STEP) {
    const rest = { x: noseX, y: 0, z, yaw: Math.PI, pitch };
    const gaps = restGaps(rest, ground);
    rest.y = -Math.min(...gaps);
    const over = Math.max(gaps[0], gaps[gaps.length - 1]) + rest.y;
    if (over < bestOver) {
      bestOver = over;
      best = rest;
    }
  }
  return best ?? { x: noseX, y: 0, z, yaw: Math.PI, pitch: 0 };
}

export function newStrand(from: GrabPose, rest: GrabPose, cruiseY: number): Strand {
  const launchZ = rest.z - STRAND.launchOut;
  const swim = Math.min(
    STRAND.swimMax,
    Math.max(STRAND.swimMin, Math.hypot(rest.x - from.x, launchZ - from.z) / STRAND.swimSpeed),
  );
  const rise = STRAND.rise;
  const ends = { rise, swim: rise + swim, dip: rise + swim + STRAND.dip, leap: 0 };
  ends.leap = ends.dip + STRAND.leap;
  return { t: 0, from: { ...from }, rest, cruiseY, swim, ends, still: false };
}

/** When each phase of the last leap ends (seconds from its start). */
export const strandPhases = (s: Strand): Strand['ends'] => s.ends;

/** True while she is swimming in at the surface (the wake shows). */
export const swimming = (s: Strand): boolean => s.t < s.ends.swim;

/** The swim and the dip: at the surface, then down to the launch point, turning to face the shore. */
function swimIn(s: Strand, out: GrabPose): GrabPose {
  const { from, rest, ends } = s;
  const launchZ = rest.z - STRAND.launchOut;
  const launchY = rest.y - STRAND.launchDepth - 1;
  const heading = Math.atan2(from.x - rest.x, from.z - launchZ); // nose -z toward the launch
  if (s.t < ends.rise) {
    const k = smooth(clamp01(s.t / ends.rise));
    out.x = from.x;
    out.z = from.z;
    out.y = lerp(from.y, s.cruiseY, k);
    out.yaw = lerpAngle(from.yaw, heading, k);
    out.pitch = 0;
    return out;
  }
  const along = clamp01((s.t - ends.rise) / (ends.swim - ends.rise));
  // Down the river first, sliding across to the shore only in the lake.
  out.x = lerp(from.x, rest.x, smooth(clamp01((along - 0.6) / 0.4)));
  out.z = lerp(from.z, launchZ, along);
  const dip = smooth(clamp01((s.t - ends.swim) / STRAND.dip));
  out.y = lerp(s.cruiseY, launchY, dip);
  // Turns around to face the shore over the last of the swim and the dip.
  const turn = smooth(
    clamp01(
      (s.t - lerp(ends.rise, ends.swim, 0.75)) / (ends.dip - lerp(ends.rise, ends.swim, 0.75)),
    ),
  );
  out.yaw = lerpAngle(heading, rest.yaw, turn);
  out.pitch = 0.6 * dip; // nose up into the leap
  return out;
}

/** Pure: the pose `s.t` seconds into the last leap (and after, lying on the shore). */
export function strandPose(s: Strand, out: GrabPose): GrabPose {
  const { rest, ends } = s;
  if (s.t < ends.dip) return swimIn(s, out);
  const launchY = rest.y - STRAND.launchDepth - 1;
  const launchZ = rest.z - STRAND.launchOut;
  const u = clamp01((s.t - ends.dip) / STRAND.leap);
  const ease = 1 - (1 - u) * (1 - u);
  out.x = rest.x;
  out.z = lerp(launchZ, rest.z, ease);
  out.y = lerp(launchY, rest.y, ease) + STRAND.arc * Math.sin(Math.PI * u);
  out.yaw = rest.yaw;
  out.pitch = lerp(0.6, rest.pitch, u);
  if (u >= 1 && !s.still) {
    out.y += STRAND.breath.amp * Math.sin(2 * Math.PI * STRAND.breath.rate * (s.t - ends.leap));
  }
  return out;
}

/** True once it has landed (the leap is over). */
export const beached = (s: Strand): boolean => s.t >= s.ends.leap;
