import {
  abs,
  attribute,
  cameraViewMatrix,
  color,
  mix,
  mx_noise_float,
  normalWorldGeometry,
  positionWorld,
  select,
  smoothstep,
  texture,
  vec2,
  vec3,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { assetUrl } from './assets';
import type { Tier } from './quality';

/**
 * Real ground: Poly Haven CC0 PBR sets (diff sRGB, nor linear OpenGL, arm = R AO / G roughness /
 * B metal) at `public/assets/textures/<dir>/`. Mapped in world space (no UVs on the strips), so one
 * tiling holds on every mesh. `metres` is one tile's size; `gain` lifts the (mid-grey) texture back
 * to the old flat colour's brightness, so the area's dark palette colour stays the tint. Tuning knobs.
 */
export const SURFACES = {
  asphalt: { dir: 'asphalt_02', metres: 4, gain: 2.2 },
  pavement: { dir: 'concrete_pavement', metres: 3, gain: 2.2 },
  mud: { dir: 'mud_forest', metres: 3, gain: 2.5 },
  grass: { dir: 'sparse_grass', metres: 3, gain: 2.5 },
  leaves: { dir: 'forest_leaves_02', metres: 3, gain: 2.5 },
  pebbles: { dir: 'river_small_rocks', metres: 2, gain: 2.2 },
  dirt: { dir: 'forest_ground_04', metres: 3, gain: 2.5 },
} as const;
export type SurfaceName = keyof typeof SURFACES;

/** Pure: texture repeats per metre (what `uv * repeat` is for a tile `metres` wide). */
export const repeatPerMetre = (name: SurfaceName): number => 1 / SURFACES[name].metres;

/** Wet-asphalt patches: noise (0..1) between lo and hi fades dry to puddle. Tuning knobs. */
export const PUDDLE = { lo: 0.54, hi: 0.64, freq: 0.08, roughness: 0.05, darken: 0.6 } as const;
/** Normal-map strength on up-facing ground; the slopes and walls stay smooth. */
const NORMAL_STRENGTH = 0.8;
const DRY_ROUGHNESS = 0.92;
const ANISOTROPY = 4;

/** Pure: the puddle amount (0 dry .. 1 puddle) for a noise value in 0..1; the shader mirrors it. */
export function puddleAmount(noise01: number): number {
  const t = Math.min(1, Math.max(0, (noise01 - PUDDLE.lo) / (PUDDLE.hi - PUDDLE.lo)));
  return t * t * (3 - 2 * t);
}

/** Pure: which maps a tier reads. Low drops ARM (and with it AO, roughness and puddles). */
export function tierMaps(tier: Tier): { normal: boolean; arm: boolean; puddles: boolean } {
  const rich = tier !== 'low';
  return { normal: true, arm: rich, puddles: rich };
}

export interface SurfaceLook {
  base: SurfaceName;
  /** A second set that the geometry's `blend` attribute (0 base .. 1 this) fades to. */
  blend?: SurfaceName;
  /** Flat tint (sRGB hex) for meshes without vertex colours. */
  tint?: number;
  /** The geometry carries per-vertex colours (multiplied in). */
  vertexColors?: boolean;
  /** Wet puddle patches (asphalt); Medium and High only. */
  puddles?: boolean;
}

// Textures are cached for the whole session (marked `cached`, so `disposeScene` keeps them) and
// shared by every material. 7 sets x 3 maps at 512 px is about 30 MB at most; Low loads 2 of 3.
const cache = new Map<string, THREE.Texture>();
const pending: Promise<void>[] = [];
const loader = new THREE.TextureLoader();

function map(name: SurfaceName, kind: 'diff' | 'nor' | 'arm'): THREE.Texture {
  const key = `${name}/${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let done!: () => void;
  pending.push(new Promise<void>((resolve) => (done = resolve)));
  // A missing file leaves the placeholder: never a crash.
  const tex = loader.load(
    assetUrl(`textures/${SURFACES[name].dir}/${kind}.jpg`),
    done,
    undefined,
    done,
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = kind === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = ANISOTROPY;
  tex.userData.cached = true;
  cache.set(key, tex);
  return tex;
}

/** Resolves when every texture asked for so far has loaded: builders await it so the ground never pops in. */
export const texturesReady = (): Promise<void> => Promise.all(pending).then(() => undefined);

/** Ground maps flat in world x/z; a vertical face (the embankment wall) maps in z/y instead. */
const worldUV = select(
  abs(normalWorldGeometry.x).greaterThan(0.7),
  vec2(positionWorld.z, positionWorld.y),
  positionWorld.xz,
);

type Maps = ReturnType<typeof tierMaps>;
type Sample = ReturnType<typeof sample>;

function sample(
  name: SurfaceName,
  maps: Maps,
): {
  rgb: THREE.Node<'vec3'>;
  nor: THREE.Node<'vec3'>;
  arm: THREE.Node<'vec3'> | null;
} {
  const uv = worldUV.div(SURFACES[name].metres);
  return {
    rgb: texture(map(name, 'diff'), uv).rgb.mul(SURFACES[name].gain),
    nor: texture(map(name, 'nor'), uv).rgb.mul(2).sub(1),
    arm: maps.arm ? texture(map(name, 'arm'), uv).rgb : null,
  };
}

/** The base set's maps, faded to the second set by the geometry's `blend` attribute. */
function sampleLook(look: SurfaceLook, maps: Maps): Sample {
  const a = sample(look.base, maps);
  if (!look.blend) return a;
  const b = sample(look.blend, maps);
  const w = attribute('blend', 'float');
  return {
    rgb: mix(a.rgb, b.rgb, w),
    nor: mix(a.nor, b.nor, w),
    arm: a.arm && b.arm ? mix(a.arm, b.arm, w) : null,
  };
}

/** Wet patches: 0 dry .. 1 puddle, from cheap world-space noise (`puddleAmount` is its CPU twin). */
const puddles = smoothstep(
  PUDDLE.lo,
  PUDDLE.hi,
  mx_noise_float(positionWorld.xz.mul(PUDDLE.freq)).mul(0.5).add(0.5),
);

function apply(material: THREE.MeshStandardNodeMaterial, look: SurfaceLook, tier: Tier): void {
  const maps = tierMaps(tier);
  const { rgb, nor, arm } = sampleLook(look, maps);
  // The normal map tilts the world normal along the world x/z axes it is mapped to; steep faces keep theirs.
  const flat = smoothstep(0.6, 0.9, normalWorldGeometry.y);
  const tilt = vec2(nor.x, nor.y).mul(NORMAL_STRENGTH).mul(flat);
  material.normalNode = normalWorldGeometry
    .add(vec3(tilt.x, 0, tilt.y))
    .normalize()
    .transformDirection(cameraViewMatrix);
  material.vertexColors = look.vertexColors === true;
  material.metalness = 0;
  material.roughness = DRY_ROUGHNESS;
  material.roughnessNode = null;
  material.aoNode = null;
  let colour = look.tint === undefined || look.vertexColors ? rgb : rgb.mul(color(look.tint));
  if (arm) {
    material.aoNode = arm.r;
    material.roughnessNode = arm.g;
    if (look.puddles && maps.puddles) {
      material.roughnessNode = mix(arm.g, PUDDLE.roughness, puddles);
      colour = colour.mul(mix(1, PUDDLE.darken, puddles));
    }
  }
  material.colorNode = colour;
  material.needsUpdate = true;
}

const live = new Map<THREE.MeshStandardNodeMaterial, SurfaceLook>();
let current: Tier = 'high';

/** A receiving-shadows standard material textured by `look`. `disposeScene` frees it (textures stay cached). */
export function surfaceMaterial(look: SurfaceLook): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial();
  apply(material, look, current);
  live.set(material, look);
  material.addEventListener('dispose', () => live.delete(material));
  return material;
}

/** The stage calls this whenever the tier changes (a shader rebuild, like the post graph's own). */
export function setSurfaceTier(tier: Tier): void {
  if (tier === current) return;
  current = tier;
  for (const [material, look] of live) apply(material, look, tier);
}
