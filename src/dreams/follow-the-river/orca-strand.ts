import { ANATOMY } from './dras-anatomy';
import type { GrabPose } from './orca-grab';
import { EDGE_X, FAR_EDGE_X, WATER_Y } from './river';

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
  /** She keeps this far (m) from either river bank until she is out in the lake (the banks and the mouth's flare are land to the eye). */
  bankMargin: 4,
  /** Height of the leap above the straight line to its resting pose. */
  arc: 1.6,
  /**
   * Her spine arches a little: each bone turns about its X axis by `-angle` (positive: head and tail down) on top
   * of the Beached clip (which alone curls her back half 17 degrees). Spine1/2 nod her neck down (so her jaw rests
   * low on the bank), Spine3..Tail2 curl her tail down the shore's slope: about 25 degrees in all, 4 or less at any
   * joint, nothing like the 0.13 rad each that folded her into a 55 degree crease behind the head ("broken bones").
   * Seconds: eases in over `settle` after the landing.
   */
  bend: {
    bones: ['Spine1', 'Spine2', 'Spine3', 'Spine4', 'Spine5', 'Tail1', 'Tail2'],
    angles: [0.06, 0.06, 0.01, 0.01, 0.01, 0.01, 0.01],
    settle: 1.2,
  },
} as const;

const HALF_LENGTH = ANATOMY.halfLength;
const PITCH_MIN = -0.3;
const PITCH_MAX = 0.6;
const PITCH_STEP = 0.004;

/**
 * The orca's underside as she lies (the Beached clip's rest pose with `STRAND.bend` on top, 25 degrees of arch in all),
 * measured from the skinned mesh in three.js (`ahead` of the centre, `depth` below the root, m): the nose tip, chin,
 * pectoral tips (the lowest points of her front, 1-1.5), belly, and the tail (its tip, past -3.2, curls out of the table).
 */
export const UNDERSIDE: readonly (readonly [number, number])[] = [
  [3.4, 0.441],
  [3, 0.527],
  [2.5, 0.577],
  [2, 0.65],
  [1.5, 0.88],
  [1.3, 0.88],
  [1, 0.776],
  [0.5, 0.818],
  [0, 0.855],
  [-0.5, 0.873],
  [-1, 0.899],
  [-1.5, 0.933],
  [-2, 1.025],
  [-2.5, 1.112],
  [-3, 1.201],
];
/** The samples by name: her chin, her pectoral tips (they may sink into the pebbles), her tail's end. */
export const CHIN = 1;
export const FINS: readonly number[] = [4, 5, 6];
export const TAIL = UNDERSIDE.length - 1;
/** Her pectoral tips may sink this far (m) into the pebbles (hidden by them), and her tail may hover this far above the bed. */
export const FIN_SINK = 0.12;
const TAIL_HOVER = 0.15;

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

/** The shore counts as land (not shallows) where it stands this far (m) above the water: the wet slope below is water to the eye. */
export const DRY_RISE = 0.5;
const LAND_SAMPLES = 20;

/** Pure: the share (0..1) of her length that lies over land (see `DRY_RISE`), sampled along her centre line. */
export function landShare(rest: GrabPose, ground: (z: number) => number): number {
  let land = 0;
  for (let i = 0; i < LAND_SAMPLES; i++) {
    const ahead = ((i + 0.5) / LAND_SAMPLES - 0.5) * 2 * HALF_LENGTH;
    if (ground(rest.z + ahead * Math.cos(rest.pitch)) >= WATER_Y + DRY_RISE) land++;
  }
  return land / LAND_SAMPLES;
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

/** Pure: the root height that puts every underside sample on or over the shore (the pectoral tips may sink `FIN_SINK`). */
function liftFor(rest: GrabPose, ground: (z: number) => number): number {
  const gaps = restGaps(rest, ground);
  return Math.max(...gaps.map((g, i) => -g - (FINS.includes(i) ? FIN_SINK : 0)));
}

/**
 * Pure: where it comes to rest with its nose at (noseX, noseZ), lying along +z (facing up the
 * shore, its tail back in the lake); `ground(z)` is the shore height at z. It lies ON the pebbles:
 * lowered until nothing is under the shore (the pectoral tips may sink a little), at the pitch that
 * puts her chin lowest while her tail end stays within `TAIL_HOVER` of the bed (her head rests low
 * and her tail is in the shallows; a nearly straight body cannot do both, so the pitch is a compromise).
 */
export function strandRest(noseX: number, noseZ: number, ground: (z: number) => number): GrabPose {
  const z = noseZ - HALF_LENGTH;
  let best: GrabPose = { x: noseX, y: 0, z, yaw: Math.PI, pitch: 0 };
  let bestChin = Infinity;
  let bestTail = Infinity;
  for (let pitch = PITCH_MIN; pitch <= PITCH_MAX; pitch += PITCH_STEP) {
    const rest = { x: noseX, y: 0, z, yaw: Math.PI, pitch };
    rest.y = liftFor(rest, ground);
    const gaps = restGaps(rest, ground);
    const tail = gaps[TAIL] ?? 0;
    const chin = gaps[CHIN] ?? 0;
    // The pitch with the lowest chin whose tail is within reach of the bed; if none is, the lowest tail.
    const ok = tail <= TAIL_HOVER;
    if (ok ? chin < bestChin : bestChin === Infinity && tail < bestTail) {
      if (ok) bestChin = chin;
      bestTail = tail;
      best = rest;
    }
  }
  return best;
}

/**
 * Pure: the swim's corner: straight down the river (kept off the banks) to open water at the launch's z,
 * then across the lake to the launch point. A straight line from the fight to the launch cut the west bank's corner (land).
 */
export function swimCorner(from: GrabPose, rest: GrabPose): { x: number; z: number } {
  const m = STRAND.bankMargin;
  return {
    x: Math.min(FAR_EDGE_X - m, Math.max(EDGE_X + m, from.x)),
    z: rest.z - STRAND.launchOut,
  };
}

/** Pure: where she is `along` (0..1) the swim's path (`swimCorner`), by distance. Writes `out`. */
export function swimPath(
  from: GrabPose,
  rest: GrabPose,
  along: number,
  out: { x: number; z: number },
): void {
  const c = swimCorner(from, rest);
  const first = Math.hypot(c.x - from.x, c.z - from.z);
  const across = Math.abs(rest.x - c.x);
  const d = along * (first + across);
  if (d <= first) {
    const k = first > 0 ? d / first : 1;
    out.x = lerp(from.x, c.x, k);
    out.z = lerp(from.z, c.z, k);
    return;
  }
  out.x = lerp(c.x, rest.x, across > 0 ? (d - first) / across : 1);
  out.z = c.z;
}

/** Pure: the length (m) of her swim's path. */
const swimLength = (from: GrabPose, rest: GrabPose): number => {
  const c = swimCorner(from, rest);
  return Math.hypot(c.x - from.x, c.z - from.z) + Math.abs(rest.x - c.x);
};

export function newStrand(from: GrabPose, rest: GrabPose, cruiseY: number): Strand {
  const swim = Math.min(
    STRAND.swimMax,
    Math.max(STRAND.swimMin, swimLength(from, rest) / STRAND.swimSpeed),
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
  const corner = swimCorner(from, rest);
  const heading = Math.atan2(from.x - corner.x, from.z - launchZ); // nose -z down the river
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
  swimPath(from, rest, along, out); // down the river first, across to the shore only in the lake
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
  return out;
}

/** Pure: how far her spine and tail have sagged (0 flying .. 1 settled on the shore). */
export const strandBend = (s: Strand): number =>
  smooth(clamp01((s.t - s.ends.leap) / STRAND.bend.settle));

/** True once it has landed (the leap is over). */
export const beached = (s: Strand): boolean => s.t >= s.ends.leap;
