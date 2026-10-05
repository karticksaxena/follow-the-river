import { exp, float, length, max, min, positionWorld, smoothstep, uniform, vec2 } from 'three/tsl';
import * as THREE from 'three/webgpu';

/** A roofed building's footprint (metres, world), roof height and the doorway point on its wall. */
export interface Interior {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  doorX: number;
  doorZ: number;
}

/** How dark interiors get. Tuning knobs. */
export const INTERIOR = {
  /** Share of the outdoor ambient and key light left deep inside. */
  floor: 0.015,
  /** Walls: the mask starts this far inside the footprint edge (the outer wall face stays lit)... */
  edge: 0.15,
  /** ...and reaches full darkness this much further in. */
  feather: 0.35,
  /** Light left at the doorway, and how far (m) it spills before falling to 1/e. */
  doorLight: 0.12,
  doorReach: 0.7,
  /** The mask fades out over this much below `top` (the roof underside stays dark). */
  roofFade: 0.1,
  /** Slots drawn per frame: the nearest few buildings. */
  slots: 4,
} as const;

const FAR = 1e6;

/** Slot 0..3: x = minX, y = maxX, z = minZ, w = maxZ. */
const bounds = Array.from({ length: INTERIOR.slots }, () => uniform(new THREE.Vector4()));
/** Slot 0..3: x = doorX, y = doorZ, z = top. */
const doors = Array.from({ length: INTERIOR.slots }, () => uniform(new THREE.Vector4()));

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** CPU mirror of one box's term in the shader (for tests). */
function outdoorsOne(b: Interior, x: number, y: number, z: number): number {
  const depth = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
  const inside =
    smooth(INTERIOR.edge, INTERIOR.edge + INTERIOR.feather, depth) *
    (1 - smooth(b.top - INTERIOR.roofFade, b.top, y));
  const spill =
    INTERIOR.doorLight * Math.exp(-Math.hypot(x - b.doorX, z - b.doorZ) / INTERIOR.doorReach);
  return 1 + (Math.max(INTERIOR.floor, spill) - 1) * inside;
}

/** The mask at a world point: 1 outdoors, `INTERIOR.floor` deep inside, up to `doorLight` by the door. Pure. */
export function outdoorsAt(list: readonly Interior[], x: number, y: number, z: number): number {
  let out = 1;
  for (const b of list) out *= outdoorsOne(b, x, y, z);
  return out;
}

const centreSq = (b: Interior, x: number, z: number): number =>
  ((b.minX + b.maxX) / 2 - x) ** 2 + ((b.minZ + b.maxZ) / 2 - z) ** 2;

/** Fills `out` with the (up to) `INTERIOR.slots` interiors nearest to (x, z), closest first. No allocation. */
export function nearestInteriors(
  list: readonly Interior[],
  x: number,
  z: number,
  out: Interior[],
): Interior[] {
  out.length = 0;
  for (const b of list) {
    const d = centreSq(b, x, z);
    const last = out[out.length - 1];
    if (last && out.length === INTERIOR.slots && d >= centreSq(last, x, z)) continue;
    if (out.length < INTERIOR.slots) out.push(b);
    else out[out.length - 1] = b;
    for (let i = out.length - 1; i > 0; i--) {
      const a = out[i - 1];
      const c = out[i];
      if (!a || !c || centreSq(a, x, z) <= centreSq(c, x, z)) break;
      out[i - 1] = c;
      out[i] = a;
    }
  }
  return out;
}

/** The mask as a shader node: product of the slots' terms. Unused slots sit far away, so they are 1. */
function buildMask(): THREE.Node<'float'> {
  let mask: THREE.Node<'float'> = float(1);
  const p = positionWorld;
  for (let i = 0; i < INTERIOR.slots; i++) {
    const b = bounds[i];
    const d = doors[i];
    if (!b || !d) continue;
    const depth = min(min(p.x.sub(b.x), b.y.sub(p.x)), min(p.z.sub(b.z), b.w.sub(p.z)));
    const inside = smoothstep(INTERIOR.edge, INTERIOR.edge + INTERIOR.feather, depth).mul(
      float(1).sub(smoothstep(d.z.sub(INTERIOR.roofFade), d.z, p.y)),
    );
    const spill = exp(length(vec2(p.x, p.z).sub(vec2(d.x, d.y))).div(-INTERIOR.doorReach)).mul(
      INTERIOR.doorLight,
    );
    mask = mask.mul(float(1).add(max(float(INTERIOR.floor), spill).sub(1).mul(inside)));
  }
  return mask;
}

let maskNode: THREE.Node<'float'> | null = null;

/**
 * 1 outdoors, dark inside a registered interior (see `outdoorsAt`): multiply it into the ambient
 * occlusion and the key light. Built once.
 */
export function outdoors(): THREE.Node<'float'> {
  maskNode ??= buildMask();
  return maskNode;
}

let registry: readonly Interior[] = [];
const nearest: Interior[] = [];

function upload(x: number, z: number): void {
  nearestInteriors(registry, x, z, nearest);
  for (let i = 0; i < INTERIOR.slots; i++) {
    const b = nearest[i];
    bounds[i]?.value.set(b?.minX ?? FAR, b?.maxX ?? FAR + 1, b?.minZ ?? FAR, b?.maxZ ?? FAR + 1);
    doors[i]?.value.set(b?.doorX ?? 0, b?.doorZ ?? 0, b?.top ?? 0, 0);
  }
}

/** The buildings of the area being played (empty clears: every other scene stays fully lit). */
export function setInteriors(list: readonly Interior[]): void {
  registry = list;
  upload(0, 0);
}

/** Per frame: the nearest four to the player go into the shader's uniforms. */
export function updateInteriors(eye: { x: number; z: number }): void {
  if (registry.length > 0) upload(eye.x, eye.z);
}
