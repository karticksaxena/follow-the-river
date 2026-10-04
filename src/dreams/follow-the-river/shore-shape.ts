/**
 * Pure shapes for the river's looks: the lake outline, the far bank's wander and the bend of
 * the river beyond the walkable ends. Nothing here moves a gameplay edge (EDGE_X, the colliders,
 * waterlineX): the walkable strip stays straight, and these only shape what the player sees.
 */
const TAU = Math.PI * 2;

/** One sine of a wobble: wavelength (m), phase (rad) and weight. The weights of a set sum to 1. */
type Wave = readonly [wavelength: number, phase: number, weight: number];

const wobble = (t: number, waves: readonly Wave[]): number => {
  let sum = 0;
  for (const [wavelength, phase, weight] of waves) {
    sum += weight * Math.sin((t * TAU) / wavelength + phase);
  }
  return sum;
};

const smoothstep = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** The lake outline (metres). Tuning knobs. */
export const SHORE = {
  /**
   * The near shore's water line never lies north of the lake's z (the water plane starts there);
   * it wanders up to 2 x nearAmp m south of it: coves between points of land.
   */
  nearAmp: 6,
  nearWaves: [
    [58, 0.4, 0.6],
    [27, 2.1, 0.4],
  ] as readonly Wave[],
  /**
   * The shore stays dead straight (level with the lake's z) from `pinFrom` to `pinTo`: Mom's pebble
   * beach, the canoe, the orca's strand point and the river mouth. It wanders freely `pinRamp` m on.
   */
  pinFrom: -10,
  pinTo: 33,
  pinRamp: 18,
  /** The west and east shores wander this far (m) in x. Pines stand a few metres past it. */
  sideAmp: 3,
  sideWaves: [
    [71, 1.2, 0.6],
    [33, 4, 0.4],
  ] as readonly Wave[],
  /** The far shore lies this far (m) past the near one and wanders by `farAmp`. */
  farDistance: 100,
  farAmp: 10,
  farWaves: [
    [63, 0.9, 0.6],
    [29, 3.3, 0.4],
  ] as readonly Wave[],
  /** Corners where two shores meet are rounded over about this many metres. */
  cornerRadius: 28,
} as const;

/** The lake's frame: the water line of the near shore (z) and the nominal west and east shores (x). */
export interface LakeFrame {
  z: number;
  west: number;
  east: number;
}

/** Pure: z of the near shore at x, in [z - 2 x nearAmp, z]. Equals `z` exactly on the beach and river mouth. */
export function lakeEdgeZ(x: number, z: number): number {
  const away = Math.max(SHORE.pinFrom - x, x - SHORE.pinTo, 0);
  const reach = SHORE.nearAmp * smoothstep(away / SHORE.pinRamp) * (1 + wobble(x, SHORE.nearWaves));
  return z - reach;
}

const sideEdgeX = (nominal: number, z: number): number =>
  nominal + SHORE.sideAmp * wobble(z, SHORE.sideWaves);

const farEdgeZ = (x: number, frame: LakeFrame): number =>
  frame.z - SHORE.farDistance + SHORE.farAmp * wobble(x, SHORE.farWaves);

/** Polynomial smooth minimum: like Math.min, rounding the crease over `k` m. */
const smin = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};

/**
 * Pure: how far (m) inside the lake's outline the point (x, z) lies, negative on land. Zero at the
 * waterline. Continuous, and exactly `lakeEdgeZ(x) - z` wherever the other shores are far away.
 */
export function lakeDepth(x: number, z: number, frame: LakeFrame): number {
  const near = lakeEdgeZ(x, frame.z) - z;
  const west = x - sideEdgeX(frame.west, z);
  const east = sideEdgeX(frame.east, z) - x;
  const far = z - farEdgeZ(x, frame);
  const k = SHORE.cornerRadius;
  return smin(smin(near, far, k), smin(west, east, k), k);
}

/** The far bank's wander: it pushes into the river by up to 2 x amp, never away from it. */
export const FAR_BANK = {
  amp: 2.5,
  waves: [
    [47, 0.7, 0.6],
    [23, 2.9, 0.4],
  ] as readonly Wave[],
} as const;

/** Pure: how far (m) the far bank's water line has moved toward the river's middle at z (0 to 2 x amp). */
export function farBankInset(z: number): number {
  return FAR_BANK.amp * (1 + wobble(z, FAR_BANK.waves));
}

/**
 * The river bends away past the walkable ends: straight for `lead` m (longer than one mesh row, so
 * no vertex inside the strip moves), then turning up to `angleDeg` over `length` m, then straight on.
 */
export const BEND = {
  lead: 12,
  length: 140,
  angleDeg: 30,
  /** Mesh row height (m) of everything that bends. */
  step: 10,
  /** Upstream turns to -x (the land side), downstream to +x (the far side). */
  upstreamSign: -1,
  downstreamSign: 1,
} as const;

const curve = (d: number): number => {
  const e = d - BEND.lead;
  if (e <= 0) return 0;
  const t = Math.tan((BEND.angleDeg * Math.PI) / 180);
  return e < BEND.length ? (t * e * e) / (2 * BEND.length) : t * (e - BEND.length / 2);
};

/** A sideways shift (m, x) of the river as a function of z. */
export type Bend = (z: number) => number;

/** Pure: the river's x shift at z; zero between `endZ` and `startZ` (plus the lead), a bend beyond. */
export function riverBend(z: number, startZ: number, endZ: number, endBends = true): number {
  const up = BEND.upstreamSign * curve(z - startZ);
  return endBends ? up + BEND.downstreamSign * curve(endZ - z) : up;
}

/** The area's bend as a function of z. */
export const bendFor =
  (startZ: number, endZ: number, endBends = true): Bend =>
  (z) =>
    riverBend(z, startZ, endZ, endBends);

export const noBend: Bend = () => 0;

/** Rows for a mesh `length` m long, none taller than `step`. */
export const rowsFor = (length: number, step: number = BEND.step): number =>
  Math.max(1, Math.ceil(length / step));
