import { color, float, normalView, positionViewDirection, uniform } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { raySphere, type Vec3 } from '../../../engine/ray';
import type { Intent } from './brain';

/** Outfit mesh names inside zombie-m.glb / zombie-f.glb. */
export const OUTFITS = {
  m: ['beach', 'casual', 'farmer', 'hoodie', 'punk', 'suit', 'swat', 'worker'],
  f: ['casual', 'punk', 'soldier', 'suit', 'worker'],
} as const;

type Body = 'm' | 'f';

/** Men and women interleaved (5 of 13 are women), fixed order. */
const LIST: readonly { body: Body; outfit: string }[] = [
  { body: 'm', outfit: 'beach' },
  { body: 'f', outfit: 'casual' },
  { body: 'm', outfit: 'casual' },
  { body: 'f', outfit: 'punk' },
  { body: 'm', outfit: 'farmer' },
  { body: 'm', outfit: 'hoodie' },
  { body: 'f', outfit: 'soldier' },
  { body: 'm', outfit: 'punk' },
  { body: 'm', outfit: 'suit' },
  { body: 'f', outfit: 'suit' },
  { body: 'm', outfit: 'swat' },
  { body: 'm', outfit: 'worker' },
  { body: 'f', outfit: 'worker' },
];

/** Outfit for the i-th zombie: every outfit appears before any repeats; about 4 in 10 are women. */
export function pickOutfit(i: number): { body: Body; outfit: string } {
  return LIST[i % LIST.length];
}

export const CLIP_FOR: Readonly<Record<Intent, string>> = {
  lie: 'Death',
  rise: 'GetUp',
  stand: 'Idle',
  walk: 'Walk',
  run: 'Run',
  strike: 'Attack',
  // Frozen in the beam, swaying. ('Hit' is a full knock-down that ends flat on the ground: a
  // stunned zombie looked dead, then sprang up again.)
  stagger: 'Idle',
  fall: 'Death',
  // Knocked aside by the orca: tumbling through the air.
  thrown: 'Hit',
  // Kicking in the orca's jaws (the body is tipped sideways, so running legs read as flailing).
  struggle: 'Run',
};

export const LOOPING: ReadonlySet<string> = new Set(['Idle', 'Walk', 'Run']);

/** Metres per second the feet travel at timeScale 1. Tuning knobs, set by eye in the browser. */
export const CLIP_SPEED: Readonly<{ Walk: number; Run: number }> = { Walk: 0.9, Run: 4.5 };

export function timeScaleFor(clip: string, speed: number): number {
  if (clip === 'Walk') return speed / CLIP_SPEED.Walk;
  if (clip === 'Run') return speed / CLIP_SPEED.Run;
  return 1;
}

/** Tuning knobs (metres). The head sphere sits on the real `Head` bone, raised to cover the skull. */
const HEAD_UP = 0.1;
const HEAD_R = 0.2;
/** Fallback head height above the root for a model with no head bone. */
const HEAD_FALLBACK_Y = 1.6;
const CHEST_R = 0.35;
/** The chest sits this far below the head, halfway between the root and the head sideways. */
const CHEST_BELOW_HEAD = 0.45;
const LYING = { y: 0.25, r: 0.5 } as const;

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** The bone named `Head` (not the head-end/top helpers) of a skinned model, or null. */
export function findHeadBone(root: THREE.Object3D): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((n) => {
    if (!found && n instanceof THREE.Bone && /head/i.test(n.name) && !/end|top/i.test(n.name)) {
      found = n;
    }
  });
  return found;
}

/**
 * Writes the head-sphere centre into `out`: the bone's world position (last render's, one frame
 * stale) raised by HEAD_UP; with no bone, straight above the root at (x, y, z). No allocation.
 */
export function headCentre(
  bone: THREE.Object3D | null,
  x: number,
  y: number,
  z: number,
  out: Point,
): Point {
  if (bone) {
    const e = bone.matrixWorld.elements;
    out.x = e[12];
    out.y = e[13] + HEAD_UP;
    out.z = e[14];
  } else {
    out.x = x;
    out.y = y + HEAD_FALLBACK_Y;
    out.z = z;
  }
  return out;
}

/** Where a ray struck: how far along it, and whether it was the head. */
export interface Strike {
  distance: number;
  head: boolean;
}

/**
 * Distance along a unit ray to a zombie rooted at (x, y, z) whose head centre is `h` (head and
 * chest spheres; head sphere plus one body sphere when lying), or null. Pure.
 */
export function bodyHit(
  origin: Vec3,
  dir: Vec3,
  x: number,
  y: number,
  z: number,
  lying: boolean,
  h: Point,
): Strike | null {
  const sphere = (cx: number, cy: number, cz: number, r: number): number | null =>
    raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, cx, cy, cz, r);
  const head = sphere(h.x, h.y, h.z, HEAD_R);
  const body = lying
    ? sphere(x, y + LYING.y, z, LYING.r)
    : sphere((x + h.x) / 2, h.y - CHEST_BELOW_HEAD, (z + h.z) / 2, CHEST_R);
  if (head !== null && (body === null || head <= body)) return { distance: head, head: true };
  return body === null ? null : { distance: body, head: false };
}

/**
 * The moon's faint rim on people (a fresnel on the emissive channel, so it lights no surface, only
 * the silhouette's edge): `strength` is the most it adds (linear), `power` how thin the edge is,
 * `color` a dim moon blue. Scaled by the moon's opacity, so it is gone by day and at sunrise.
 */
export const RIM = { strength: 0.22, power: 3.5, color: 0x7f9bc4 } as const;

/** Pure: the rim's strength for a moon of opacity `moon` (0..1). */
export const rimStrength = (moon: number): number => RIM.strength * Math.min(1, Math.max(0, moon));

const rimLevel = uniform(0);

/** Per frame from `applyLighting`: one uniform, no allocation. */
export function setRim(moon: number): void {
  rimLevel.value = rimStrength(moon);
}

const rimMade = new WeakMap<THREE.Material, THREE.Material>();

function rimmed(src: THREE.MeshStandardMaterial): THREE.Material {
  if (src.name.startsWith('orca-')) return src;
  let m = rimMade.get(src);
  if (!m) {
    const node = new THREE.MeshStandardNodeMaterial().copy(src);
    const edge = float(1).sub(normalView.dot(positionViewDirection).saturate()).pow(RIM.power);
    node.emissiveNode = color(RIM.color).mul(edge).mul(rimLevel);
    node.userData.cached = true; // shared by every clone, like its source
    m = node;
    rimMade.set(src, m);
  }
  return m;
}

/** Swaps every standard material under `root` for its rim-lit twin (one per source material, shared). */
export function addRim(root: THREE.Object3D): void {
  root.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return;
    // GLTFLoader gives every primitive its own mesh: one material, never an array.
    const m: unknown = n.material;
    if (m instanceof THREE.MeshStandardMaterial) n.material = rimmed(m);
  });
}
