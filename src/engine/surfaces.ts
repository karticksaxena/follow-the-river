import {
  abs,
  attribute,
  cameraViewMatrix,
  color,
  float,
  mix,
  mx_noise_float,
  normalWorldGeometry,
  positionWorld,
  saturation,
  select,
  smoothstep,
  texture,
  uv,
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
export const PUDDLE = { lo: 0.54, hi: 0.64, freq: 0.08, roughness: 0.2, darken: 0.6 } as const;
/** Normal-map strength on up-facing ground; the slopes and walls stay smooth. */
const NORMAL_STRENGTH = 0.8;
const DRY_ROUGHNESS = 0.92;
const ANISOTROPY = 4;

/** Pure: the puddle amount (0 dry .. 1 puddle) for a noise value in 0..1; the shader mirrors it. */
export function puddleAmount(noise01: number): number {
  const t = Math.min(1, Math.max(0, (noise01 - PUDDLE.lo) / (PUDDLE.hi - PUDDLE.lo)));
  return t * t * (3 - 2 * t);
}

/** A ragged seam (`SurfaceLook.ragged`): how far noise shifts it (blend units) and its noise per metre. */
export const RAGGED = { shift: 0.8, freq: 0.45 } as const;

/**
 * Pure: the blend (0 base .. 1 second surface) from the geometry's smooth blend `m` and a noise
 * `n` (0..1): 0 stays 0 and 1 stays 1, the seam between wanders with the noise. The shader mirrors it.
 */
export function raggedBlend(m: number, n: number): number {
  const x = Math.min(1, Math.max(0, m * (1 + RAGGED.shift) - (1 - n) * RAGGED.shift));
  return x * x * (3 - 2 * x);
}

/** Pure: which maps a tier reads. Low drops ARM (and with it AO, roughness and puddles). */
export function tierMaps(tier: Tier): { normal: boolean; arm: boolean; puddles: boolean } {
  const rich = tier !== 'low';
  return { normal: true, arm: rich, puddles: rich };
}

/**
 * Kenney's road tile is one flat colour per part, read from its palette texture (sRGB 0..255):
 * the road quad, the raised kerb tops and sides, and the painted lines. The road becomes asphalt,
 * the kerb concrete, and the lines keep their palette colour.
 */
export const WALKWAY_PALETTE = [
  { rgb: [157, 164, 196], kind: 'asphalt' },
  { rgb: [189, 198, 238], kind: 'concrete' },
  { rgb: [102, 107, 128], kind: 'concrete' },
  { rgb: [125, 130, 156], kind: 'concrete' },
  { rgb: [142, 149, 179], kind: 'marking' },
  { rgb: [81, 85, 102], kind: 'marking' },
] as const;
export type WalkwayKind = (typeof WALKWAY_PALETTE)[number]['kind'];
/** Linear colour distance within which a texel counts as a palette entry (a smooth edge to 2x this). */
const WALKWAY_TOLERANCE = 0.03;

/** Pure: which surface a palette colour (sRGB 0..255) gets: the nearest palette entry's kind. */
export function walkwayClass(rgb: readonly [number, number, number]): WalkwayKind {
  let best: WalkwayKind = 'marking';
  let bestD = Infinity;
  for (const p of WALKWAY_PALETTE) {
    const d = (p.rgb[0] - rgb[0]) ** 2 + (p.rgb[1] - rgb[1]) ** 2 + (p.rgb[2] - rgb[2]) ** 2;
    if (d < bestD) [best, bestD] = [p.kind, d];
  }
  return best;
}

export interface SurfaceLook {
  base: SurfaceName;
  /** A second set that the geometry's `blend` attribute (0 base .. 1 this) fades to. */
  blend?: SurfaceName;
  /** Flat tint (sRGB hex) for meshes without vertex colours. */
  tint?: number;
  /** Break the `blend` seam up with world-space noise (a ragged edge, never a straight line). */
  ragged?: boolean;
  /** The geometry carries per-vertex colours (multiplied in). */
  vertexColors?: boolean;
  /** Wet puddle patches (asphalt); Medium and High only. */
  puddles?: boolean;
  /**
   * The Kenney road tile's palette texture: `base` (asphalt) goes on the road colour, `blend`
   * (concrete) on the kerb colours, and the painted lines keep their palette colour.
   */
  walkway?: THREE.Texture;
  /** A colour grade over the textured ground: gain darkens, saturation (1 = none) enriches. */
  grade?: { gain: number; saturation: number };
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
  const coord = worldUV.div(SURFACES[name].metres);
  return {
    rgb: texture(map(name, 'diff'), coord).rgb.mul(SURFACES[name].gain),
    nor: texture(map(name, 'nor'), coord).rgb.mul(2).sub(1),
    arm: maps.arm ? texture(map(name, 'arm'), coord).rgb : null,
  };
}

const linear = new THREE.Color();

/** 0..1 where the walkway palette texel is (near) one of `kind`'s colours. */
function walkwayMask(paint: THREE.Node<'vec3'>, kind: WalkwayKind): THREE.Node<'float'> {
  let mask: THREE.Node<'float'> = float(0);
  for (const p of WALKWAY_PALETTE) {
    if (p.kind !== kind) continue;
    linear.setRGB(p.rgb[0] / 255, p.rgb[1] / 255, p.rgb[2] / 255, THREE.SRGBColorSpace);
    const d = paint.sub(vec3(linear.r, linear.g, linear.b)).length();
    mask = mask.max(smoothstep(WALKWAY_TOLERANCE * 2, WALKWAY_TOLERANCE, d));
  }
  return mask;
}

/** The shader twin of `raggedBlend`: two octaves of world-space noise, stretched to span 0..1. */
function raggedNode(m: THREE.Node<'float'>): THREE.Node<'float'> {
  const p = positionWorld.xz.mul(RAGGED.freq);
  const n = mx_noise_float(p)
    .mul(0.6)
    .add(mx_noise_float(p.mul(2.7)).mul(0.4))
    .mul(0.7)
    .add(0.5);
  const x = m.mul(1 + RAGGED.shift).sub(float(1).sub(n.saturate()).mul(RAGGED.shift));
  return smoothstep(0, 1, x);
}

/** The base set's maps, faded to the second set by `w` (default: the geometry's `blend` attribute). */
function sampleLook(look: SurfaceLook, maps: Maps, w?: THREE.Node<'float'>): Sample {
  const a = sample(look.base, maps);
  if (!look.blend) return a;
  const b = sample(look.blend, maps);
  w ??= look.ragged ? raggedNode(attribute('blend', 'float')) : attribute('blend', 'float');
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
  const paint = look.walkway ? texture(look.walkway, uv()).rgb : null;
  const road = paint ? walkwayMask(paint, 'asphalt') : null;
  const kerb = paint ? walkwayMask(paint, 'concrete') : null;
  const { rgb, nor, arm } = sampleLook(look, maps, kerb ?? undefined);
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
      const wet = road ? puddles.mul(road) : puddles;
      material.roughnessNode = mix(arm.g, PUDDLE.roughness, wet);
      colour = colour.mul(mix(1, PUDDLE.darken, wet));
    }
  }
  if (look.grade) {
    colour = saturation(colour.mul(look.grade.gain), look.grade.saturation);
  }
  // Painted lines: wherever the texel is neither road nor kerb, the tile's own colour shows.
  if (paint && road && kerb) colour = mix(paint, colour, road.max(kerb));
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
