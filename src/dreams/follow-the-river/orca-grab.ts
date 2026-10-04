import { EDGE_X, WATER_Y } from './river';
import type { Horde } from './zombies/horde';

/** All a grab needs from the horde. */
export type Prey = Pick<
  Horde,
  'locate' | 'seize' | 'hold' | 'drown' | 'forEachAlive' | 'takeByFish'
>;

/**
 * How the orca strikes: seconds between grabs, reach from the water (m), pace (1 normal, below 1
 * faster) and sweep: zombies this close to its jaws when it lands are knocked into the river too
 * (0 = only the one it bites). The ending's last stand is far, fast and sweeping.
 */
export interface StrikeStyle {
  cooldown: number;
  reach: number;
  pace: number;
  sweep: number;
}

/**
 * The orca taking a zombie, like orcas snatching seals off a beach: it rushes in under the water,
 * bursts out over the edge (the city railing breaks), bites, thrashes with the zombie in its jaws,
 * then slides back into the river and drags it under. Tuning knobs (seconds, metres, radians).
 */
export const GRAB = {
  /** Underwater rush to the launch point: this fast (m/s), within these bounds (s). */
  rushSpeed: 12,
  approachMin: 0.5,
  approachMax: 1.6,
  burst: 0.5,
  shake: 1.1,
  back: 1.6,
  /** The way back: this share of it is a crawl over the ground (wriggling side to side, heaving),
   * the rest the drop off the edge into the water. */
  crawlShare: 0.7,
  crawlWriggles: 3,
  crawlYaw: 0.14,
  crawlHeave: 0.08,
  /** Distance off the edge where it starts the burst, and how far below cruise depth it comes in. */
  launchOut: 4,
  dive: 0.8,
  /** Height of the leap above its landing pose, and its nose-up pitch at the top. */
  arc: 0.9,
  maxPitch: 0.5,
  /** The centre line's height above the ground under the jaws when beached. */
  lift: 0.55,
  /** Thrash: yaw swing each way, how fast, and how high it lifts its head (nose-up pitch). */
  shakeYaw: 0.35,
  shakeHz: 3.2,
  shakeLift: 0.15,
  /** Where the jaws hold the zombie: at the nose tip, just below the centre line. */
  jawAhead: 3.5,
  jawBelow: 0.1,
  /** A zombie further than this from the jaws when they close got away. */
  biteRange: 2.5,
  /** Root depth it slides back to, below cruise depth: the zombie goes under too. */
  sink: 1.4,
} as const;

/** Facing the land (−x): the orca's nose points along −x. */
export const FACE_LAND = Math.PI / 2;
const HALF_LENGTH = 3.5;
/** Feet to the middle of a zombie: the part the jaws hold. */
const ZOMBIE_MID = 0.9;

export interface Grab {
  t: number;
  /** Seconds of the underwater rush (by distance). */
  approach: number;
  victim: number;
  /** The victim's last known spot (followed until the bite). */
  vx: number;
  vz: number;
  /** Where the approach starts: position, depth, heading. */
  fromX: number;
  fromY: number;
  fromZ: number;
  fromYaw: number;
  cruiseY: number;
  /** Where the water starts (x): the rush launches from `water + GRAB.launchOut`. */
  water: number;
  reach: number;
  sweep: number;
  /** Seconds of the leap, the thrash and the slide back (all shorter in the ending's frenzy). */
  burst: number;
  shake: number;
  back: number;
  bitten: boolean;
  breached: boolean;
  underAgain: boolean;
}

export interface GrabPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

const smooth = (s: number): number => s * s * (3 - 2 * s);
const clamp01 = (s: number): number => Math.min(1, Math.max(0, s));
const lerp = (a: number, b: number, s: number): number => a + (b - a) * s;
const lerpAngle = (a: number, b: number, s: number): number =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * s;

export function newGrab(
  from: GrabPose,
  victim: number,
  vx: number,
  vz: number,
  cruiseY: number,
  style: StrikeStyle,
  water: number,
): Grab {
  const { reach, pace, sweep } = style;
  const distance = Math.hypot(water + GRAB.launchOut - from.x, vz - from.z);
  const approach = Math.min(
    GRAB.approachMax,
    Math.max(GRAB.approachMin, distance / GRAB.rushSpeed),
  );
  return {
    t: 0,
    approach,
    victim,
    vx,
    vz,
    fromX: from.x,
    fromY: from.y,
    fromZ: from.z,
    fromYaw: from.yaw,
    cruiseY,
    water,
    reach,
    sweep,
    burst: GRAB.burst * pace,
    shake: GRAB.shake * pace,
    back: GRAB.back * pace,
    bitten: false,
    breached: false,
    underAgain: false,
  };
}

export const grabSeconds = (g: Grab): number => g.approach + g.burst + g.shake + g.back;

/** Root x when beached: the jaws reach the victim, at most `reach` inland. */
export function landX(vx: number, reach: number): number {
  return Math.min(Math.max(vx, EDGE_X - reach), EDGE_X) + GRAB.jawAhead;
}

/** Beached: the jaws rest on the ground; the body tilts nose-up toward a lower tail (the water). */
function beached(x: number, ground: (x: number) => number, out: GrabPose): void {
  const nose = ground(x - GRAB.jawAhead);
  const tail = ground(x + HALF_LENGTH);
  out.pitch = Math.atan2(nose - tail, GRAB.jawAhead + HALF_LENGTH) * 0.6;
  out.y = nose + GRAB.lift - GRAB.jawAhead * Math.sin(out.pitch);
}

/**
 * Back to the river with the zombie: it wriggles backwards over the ground (its belly following
 * the land, never sinking into it) until its jaws reach the edge, then drops off into the water.
 */
function crawlBack(
  g: Grab,
  u: number,
  land: number,
  ground: (x: number) => number,
  out: GrabPose,
): void {
  // Root x with the jaws still just on the land at the edge.
  const edge = EDGE_X - 0.05 + GRAB.jawAhead;
  out.yaw = FACE_LAND;
  if (u < GRAB.crawlShare) {
    const s = u / GRAB.crawlShare;
    out.x = lerp(land, Math.max(edge, land), smooth(s));
    beached(out.x, ground, out);
    const wriggle = Math.sin(2 * Math.PI * GRAB.crawlWriggles * s);
    out.yaw += GRAB.crawlYaw * wriggle;
    out.y += GRAB.crawlHeave * Math.abs(wriggle);
    return;
  }
  const s = smooth((u - GRAB.crawlShare) / (1 - GRAB.crawlShare));
  const from = Math.max(edge, land);
  beached(from, ground, out);
  out.x = lerp(from, g.water + GRAB.launchOut, s);
  out.y = lerp(out.y, g.cruiseY - GRAB.sink, s);
  out.pitch = lerp(out.pitch, -0.35, s);
}

/** Pure: the orca's pose `g.t` seconds into a grab. `ground(x)` is the bank or water height. */
export function grabPose(g: Grab, ground: (x: number) => number, out: GrabPose): GrabPose {
  const land = landX(g.vx, g.reach);
  const launch = g.water + GRAB.launchOut;
  const deep = g.cruiseY - GRAB.dive;
  const t1 = g.approach;
  const t2 = t1 + g.burst;
  const t3 = t2 + g.shake;
  out.z = g.vz;
  if (g.t < t1) {
    const s = smooth(clamp01(g.t / t1));
    out.x = lerp(g.fromX, launch, s);
    out.y = lerp(g.fromY, deep, s);
    out.z = lerp(g.fromZ, g.vz, s);
    out.yaw = lerpAngle(g.fromYaw, FACE_LAND, s);
    out.pitch = 0;
    return out;
  }
  out.yaw = FACE_LAND;
  beached(land, ground, out);
  const restY = out.y;
  const restPitch = out.pitch;
  if (g.t < t2) {
    const s = clamp01((g.t - t1) / g.burst);
    const ease = 1 - (1 - s) * (1 - s);
    out.x = lerp(launch, land, ease);
    out.y = lerp(deep, restY, ease) + GRAB.arc * Math.sin(Math.PI * s);
    out.pitch = GRAB.maxPitch * Math.sin(Math.PI * s) + restPitch * s;
  } else if (g.t < t3) {
    const u = (g.t - t2) / g.shake;
    const swing = Math.sin(2 * Math.PI * GRAB.shakeHz * u) * Math.sin(Math.PI * u);
    out.x = land;
    out.yaw = FACE_LAND + GRAB.shakeYaw * swing;
    // Head up fast, held high through the thrash, back down at the end.
    out.pitch = restPitch + GRAB.shakeLift * smooth(Math.min(1, u * 4, (1 - u) * 4));
  } else crawlBack(g, clamp01((g.t - t3) / g.back), land, ground, out);
  return out;
}

/** Pure: where the jaws are for `pose` (the nose points along local −z; Euler order YXZ). */
export function jawOf(pose: GrabPose, out: { x: number; y: number; z: number }): void {
  const { yaw, pitch } = pose;
  const along = -GRAB.jawBelow * Math.sin(pitch) - GRAB.jawAhead * Math.cos(pitch);
  out.x = pose.x + along * Math.sin(yaw);
  out.y = pose.y - GRAB.jawBelow * Math.cos(pitch) + GRAB.jawAhead * Math.sin(pitch);
  out.z = pose.z + along * Math.cos(yaw);
}

export interface GrabHooks {
  /** The body crosses the edge at z: the railing breaks there, the water bursts. */
  breach(z: number): void;
  /** Back under the water at (x, z). */
  splash(x: number, z: number): void;
}

const jaw = { x: 0, y: 0, z: 0 };
const spot = { x: 0, z: 0 };

/** The jaws close: false if the victim is gone or has run out of reach. */
function bite(g: Grab, horde: Prey): boolean {
  if (!horde.locate(g.victim, spot)) return false;
  if (Math.hypot(spot.x - jaw.x, spot.z - jaw.z) > GRAB.biteRange) return false;
  return horde.seize(g.victim);
}

/** The orca lands among them: the ones beside its jaws are knocked into the river. Allocates: rare. */
function sweepAside(g: Grab, horde: Prey): void {
  if (g.sweep <= 0) return;
  horde.forEachAlive((id, x, z) => {
    if (id !== g.victim && Math.hypot(x - jaw.x, z - jaw.z) <= g.sweep) horde.takeByFish(id);
  });
}

/**
 * A zombie crosswise in the jaws, tipped on its side, swinging with the thrash. Its feet sit
 * ZOMBIE_MID from the jaws along its tipped "up" (zombie root rotation (0, yaw, tilt), order XYZ).
 */
function holdVictim(g: Grab, pose: GrabPose, horde: Prey): void {
  const tilt = Math.PI / 2 + (pose.yaw - FACE_LAND) * 1.5;
  const x = jaw.x + ZOMBIE_MID * Math.sin(tilt) * Math.cos(pose.yaw);
  const y = jaw.y - ZOMBIE_MID * Math.cos(tilt);
  const z = jaw.z - ZOMBIE_MID * Math.sin(tilt) * Math.sin(pose.yaw);
  horde.hold(g.victim, x, y, z, pose.yaw, tilt);
}

/** Advances a grab and fires its moments; returns false once it is over. */
export function stepGrab(
  g: Grab,
  dt: number,
  horde: Prey | null,
  ground: (x: number) => number,
  hooks: GrabHooks,
  out: GrabPose,
): boolean {
  // Follow the victim until the bite, so the orca lands where it is, not where it was.
  if (!g.bitten && horde?.locate(g.victim, spot)) {
    g.vx = spot.x;
    g.vz = spot.z;
  }
  g.t += dt;
  grabPose(g, ground, out);
  jawOf(out, jaw);
  const bites = g.approach + g.burst;
  if (!g.breached && g.t >= g.approach + g.burst * 0.35) {
    g.breached = true;
    hooks.breach(g.vz);
  }
  if (!g.bitten && g.t >= bites) {
    g.bitten = true;
    if (!horde || !bite(g, horde)) g.victim = -1; // it got away: back in empty-mouthed
    if (horde) sweepAside(g, horde);
  }
  if (horde && g.victim >= 0 && g.bitten) holdVictim(g, out, horde);
  if (!g.underAgain && jaw.y < WATER_Y && g.t > bites + g.shake) {
    g.underAgain = true;
    hooks.splash(jaw.x, jaw.z);
  }
  if (g.t < grabSeconds(g)) return true;
  if (horde && g.victim >= 0) horde.drown(g.victim);
  return false;
}
