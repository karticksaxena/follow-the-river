import { FLASHLIGHT, torchAim } from './flashlight';

type Rgb = readonly [number, number, number];
export const MOTES = {
  reach: 16,
  size: [0.02, 0.04],
  drift: 0.06,
  fadeIn: 0.5,
  day: 0.4,
  color: [1, 0.92, 0.78] as Rgb,
};

// ---- the torch's beam, in camera space (the camera looks down -z) ----

export interface V3 {
  x: number;
  y: number;
  z: number;
}
interface Settable extends V3 {
  set(x: number, y: number, z: number): Settable;
}
const settable = (x = 0, y = 0, z = 0): Settable => ({
  x,
  y,
  z,
  set(a, b, c) {
    this.x = a;
    this.y = b;
    this.z = c;
    return this;
  },
});
const AIM = torchAim(settable());
const AXIS = settable(...unit(AIM.x, AIM.y, AIM.z));
/** Two unit vectors across the beam: U = AXIS x up, V = U x AXIS. */
const U = settable(...unit(-AXIS.z, 0, AXIS.x));
const V = settable(
  U.y * AXIS.z - U.z * AXIS.y,
  U.z * AXIS.x - U.x * AXIS.z,
  U.x * AXIS.y - U.y * AXIS.x,
);
const COS_OUTER = Math.cos(FLASHLIGHT.angle);
const COS_INNER = Math.cos(FLASHLIGHT.angle * (1 - FLASHLIGHT.penumbra));
/** Motes are born this far (of the half-angle) inside the cone's edge, so they are not recycled at once. */
const SPAWN_ANGLE = 0.9;

function unit(x: number, y: number, z: number): [number, number, number] {
  const n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
}

/** Pure: 0..1 how much of the torch's light reaches camera-space point (x, y, z): the cone's soft edge times its falloff. */
export function beamBrightness(x: number, y: number, z: number): number {
  const d = Math.hypot(x, y, z);
  if (d >= FLASHLIGHT.distance || d < 1e-3) return 0;
  const c = (x * AXIS.x + y * AXIS.y + z * AXIS.z) / d;
  const t = Math.min(1, Math.max(0, (c - COS_OUTER) / (COS_INNER - COS_OUTER)));
  const near = Math.min(1, Math.max(0, d - 0.4));
  return t * t * (3 - 2 * t) * near * (1 - d / FLASHLIGHT.distance) ** FLASHLIGHT.decay;
}

/** Pure: a camera-space point inside the beam: `depth`, `radius`, `around` all 0..1. Writes `out`. */
export function conePoint(depth: number, radius: number, around: number, out: V3): V3 {
  const d = 0.8 + (MOTES.reach - 0.8) * depth;
  const r = d * Math.tan(FLASHLIGHT.angle * SPAWN_ANGLE) * Math.sqrt(radius);
  const a = around * Math.PI * 2;
  const cu = Math.cos(a) * r;
  const sv = Math.sin(a) * r;
  out.x = AXIS.x * d + U.x * cu + V.x * sv;
  out.y = AXIS.y * d + U.y * cu + V.y * sv;
  out.z = AXIS.z * d + U.z * cu + V.z * sv;
  return out;
}
