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

const HEAD = { y: 1.6, r: 0.2 } as const;
const CHEST = { y: 1.15, r: 0.38 } as const;
const LYING = { y: 0.25, r: 0.5 } as const;

/** Where a ray struck: how far along it, and whether it was the head. */
export interface Strike {
  distance: number;
  head: boolean;
}

/** Distance along a unit ray to a zombie standing at (x, y, z) (head and chest spheres; one sphere when lying), or null. */
export function bodyHit(
  origin: Vec3,
  dir: Vec3,
  x: number,
  y: number,
  z: number,
  lying: boolean,
): Strike | null {
  const sphere = (s: { readonly y: number; readonly r: number }): number | null =>
    raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, x, y + s.y, z, s.r);
  if (lying) {
    const d = sphere(LYING);
    return d === null ? null : { distance: d, head: false };
  }
  const head = sphere(HEAD);
  const chest = sphere(CHEST);
  if (head !== null && (chest === null || head <= chest)) return { distance: head, head: true };
  return chest === null ? null : { distance: chest, head: false };
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
