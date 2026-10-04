import {
  attribute,
  cameraPosition,
  color,
  float,
  fract,
  min,
  mix,
  mx_noise_vec3,
  normalize,
  positionWorld,
  reflector,
  saturate,
  screenUV,
  smoothstep,
  time,
  transformNormalToView,
  uniform,
  vec3,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { TIERS, type Tier } from '../../engine/quality';
import { NO_REFLECTION_LAYER } from '../../engine/volume';

/** Downstream speed in m/s and the water's colours. Tuning knobs. */
export const RIVER_FLOW = {
  speed: 1.6,
  deep: 0x0a1a26,
  streak: 0x5b8296,
  /** Faint self-glow of the ripples so the flow reads even outside the flashlight. */
  glow: 0x12303e,
} as const;

/** Still, darker lake water (the Night 3 ending). Same shader, no drift. */
export const LAKE_FLOW = { speed: 0, deep: 0x050c12, streak: 0x2a3f4c, glow: 0x08161d } as const;

export interface WaterLook {
  speed: number;
  deep: number;
  streak: number;
  glow: number;
}

/** Reflection tuning: fraction of the frame the reflector renders at, and how much of it shows. */
export const REFLECTION = {
  /** Low has no reflection pass: this flat colour (dim sky-blue, HDR) stands in for it. */
  lowColor: 0x0a141c,
  /** Reflectivity looking straight down (Schlick F0 for water is ~0.02; a touch more reads better). */
  base: 0.06,
  /** Cap at grazing angles. A lit window reflects; the water never glows. */
  cap: 0.45,
  /** Still water is closer to a mirror: more reflection looking down too. */
  stillBase: 0.2,
  stillCap: 0.5,
  /** Screen-space UV wobble of the reflection per unit of ripple slope. */
  distortion: 0.03,
} as const;

/** Ripple slope amplitude; still water only shivers. */
const RIPPLE = 0.35;
const STILL_RIPPLE = 0.08;

/**
 * The current. Speed is `look.speed` mid-river and `bankSlow` of it at the bank, easing in over
 * `bankWidth` m. Patterns are advected in two phases `period` s long, cross-faded, so the faster
 * middle slides past the slower banks without the pattern ever shearing out of shape.
 */
export const FLOW = { bankSlow: 0.3, bankWidth: 6, period: 4 } as const;

/** Shoreline foam: its band's width (m), its colour, and how much of it self-glows at night. */
export const FOAM = { width: 1.4, feather: 0.15, color: 0x6f8791, glow: 0.12 } as const;

/** Floating specks (leaves, froth) carried by the current: how many (noise threshold) and how dim. */
export const SPECKS = { threshold: 0.78, glow: 0.1, color: 0x6a808a } as const;

/** Water further than `deepAt` m from a bank has faded to `deepDarken` of its colour. */
export const DEPTH = { deepAt: 10, deepDarken: 0.5 } as const;

/**
 * The moon/sun streak: a Blinn highlight of the key light on the ripple normals. `max` is its HDR
 * ceiling: under the bloom threshold, so it only haloes and never blooms a character white.
 */
export const GLINT = { power: 600, gain: 3, max: 0.55, fadeElevation: 0.12 } as const;

/**
 * Schlick fresnel scaled to a cap: `base·cap` looking straight down, `cap` at grazing angles.
 * Pure maths, mirrored in TSL by `fresnelNode`; tests pin the range.
 */
export function fresnel(cosTheta: number, base: number, cap: number): number {
  const c = Math.min(1, Math.max(0, cosTheta));
  return (base + (1 - base) * (1 - c) ** 5) * cap;
}

/** Pure: current speed (m/s) `shore` m from the nearest bank. Mirrored in `flowSpeedNode`. */
export function flowSpeed(shore: number, speed: number): number {
  const t = Math.min(1, Math.max(0, shore / FLOW.bankWidth));
  return speed * (FLOW.bankSlow + (1 - FLOW.bankSlow) * t * t * (3 - 2 * t));
}

/** Pure: foam strength 0..1 `shore` m from the waterline: full at the edge, gone at `FOAM.width`. */
export function foamFalloff(shore: number): number {
  const k = Math.min(1, Math.max(0, 1 - shore / FOAM.width));
  return k * k;
}

/** Pure: the glint's HDR value held under `GLINT.max`. */
export function clampGlint(v: number): number {
  return Math.min(GLINT.max, Math.max(0, v));
}

/**
 * Fills the `water` attribute: (signed distance to the nearest waterline in metres, position across
 * the river in its own straight frame). Do it before bending the rows. `acrossOffset` turns a
 * plane-local x into the across coordinate (a lake: the plane's world x).
 */
export function setWaterAttribute(
  geo: THREE.BufferGeometry,
  shoreAt: (x: number, y: number) => number,
  acrossOffset = 0,
): void {
  const p = geo.attributes.position;
  const data = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    data[i * 2] = shoreAt(p.getX(i), p.getY(i));
    data[i * 2 + 1] = p.getX(i) + acrossOffset;
  }
  geo.setAttribute('water', new THREE.BufferAttribute(data, 2));
}

/** The key light's direction (towards it) and colour: the glint's. `lighting.ts` keeps them current. */
const glintDirection = uniform(new THREE.Vector3(0, 1, 0));
const glintColor = uniform(new THREE.Color(0, 0, 0));

/** Points the glint at `light` (the key light's position; any distance) in its colour. */
export function setWaterGlint(light: THREE.Vector3, tint: THREE.Color): void {
  glintDirection.value.copy(light).normalize();
  glintColor.value.copy(tint);
}

/** The two cross-fading phases (0..1 sawtooth, half a period apart) and their weights. */
const phase0 = fract(time.div(FLOW.period));
const phase1 = fract(time.div(FLOW.period).add(0.5));
const weight0 = float(1).sub(phase0.mul(2).sub(1).abs());
const weight1 = float(1).sub(weight0);
const fadeNorm = weight0.mul(weight0).add(weight1.mul(weight1)).sqrt();

function flowSpeedNode(shore: THREE.Node<'float'>, speed: number): THREE.Node<'float'> {
  const t = smoothstep(float(0), float(FLOW.bankWidth), shore);
  return t
    .mul(1 - FLOW.bankSlow)
    .add(FLOW.bankSlow)
    .mul(speed);
}

/** Noise at (`scale.x` across, `scale.y` downstream), carried by `speed` m/s along -Z. */
function flowNoise(
  across: THREE.Node<'float'>,
  speed: THREE.Node<'float'>,
  scale: readonly [number, number],
  tScale: number,
): THREE.Node<'vec3'> {
  const sample = (phase: THREE.Node<'float'>): THREE.Node<'vec3'> =>
    mx_noise_vec3(
      vec3(
        across.mul(scale[0]),
        positionWorld.z.add(speed.mul(phase).mul(FLOW.period)).mul(scale[1]),
        time.mul(tScale),
      ),
    );
  // Uncorrelated samples lose contrast mid-fade: divide by the weights' length so it never pulses.
  return sample(phase0).mul(weight0).add(sample(phase1).mul(weight1)).div(fadeNorm);
}

function fresnelNode(cosTheta: THREE.Node<'float'>, still: boolean): THREE.Node<'float'> {
  const grazing = float(1).sub(saturate(cosTheta)).pow(5);
  const base = still ? REFLECTION.stillBase : REFLECTION.base;
  const cap = still ? REFLECTION.stillCap : REFLECTION.cap;
  return mix(float(base), float(1), grazing).mul(cap).toVar();
}

/**
 * Dark water whose ripples drift downstream and mirror the moon, lit windows and the flashlight.
 * The planar reflection is composited unlit (emissive) so it survives the night lighting; the lit
 * body colour keeps the flashlight glints. All in the shader: no per-frame JavaScript.
 *
 * The reflector node is stored on `material.userData.reflection`; callers add its `target` to the
 * water mesh (`createWaterMesh` does). Disposing the material frees the reflection render target.
 */
export function createRiverMaterial(look: WaterLook = RIVER_FLOW): THREE.MeshStandardNodeMaterial {
  const reflection = reflector({ resolutionScale: reflectionScale(waterTier), bounces: false });
  // The virtual camera is a clone of the player's: it must not see the unreflected layer.
  const base = reflection.reflector;
  const virtualCamera = base.getVirtualCamera.bind(base);
  base.getVirtualCamera = (camera) => {
    const virtual = virtualCamera(camera);
    virtual.layers.disable(NO_REFLECTION_LAYER);
    return virtual;
  };
  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0.15 });
  material.userData.reflection = reflection;
  buildNodes(material, look, reflection);
  live.set(material, look);
  // disposeScene only frees textures it finds on the material; the render target lives in the node.
  material.addEventListener('dispose', () => {
    live.delete(material);
    reflection.dispose();
  });
  return material;
}

/** The reflector's resolution share for a tier (Low never renders it: any value, kept above 0). */
function reflectionScale(tier: Tier): number {
  return Math.max(0.1, TIERS[tier].reflectionScale);
}

/** Water materials alive now, so a tier change can rebuild their shaders. */
const live = new Map<THREE.MeshStandardNodeMaterial, WaterLook>();
let waterTier: Tier = 'high';

/**
 * Low drops the broad swell layer (half the noise) and the planar reflection (a flat colour instead);
 * Medium and High differ in the reflection's resolution (`TIERS`). Rebuilds the
 * live water shaders on a change (it happens when the Graphics setting or Auto steps).
 */
export function setWaterTier(tier: Tier): void {
  if (tier === waterTier) return;
  waterTier = tier;
  for (const [m, look] of live) {
    const reflection = waterReflection(m);
    reflection.reflector.resolutionScale = reflectionScale(tier);
    buildNodes(m, look, reflection);
    m.needsUpdate = true;
  }
}

function buildNodes(
  material: THREE.MeshStandardNodeMaterial,
  look: WaterLook,
  reflection: THREE.ReflectorNode,
): void {
  const still = look.speed === 0;
  const waterAttr = attribute('water', 'vec2');
  const shore = waterAttr.x.toVar();
  const speed = flowSpeedNode(shore, look.speed).toVar();
  // Broad swells (not on Low) and fine ripples, both carried downstream at the local current's speed.
  const fine = flowNoise(waterAttr.y, speed, [5.5, 1.8], 0.25).toVar();
  const ripples =
    waterTier === 'low'
      ? fine.xy
      : flowNoise(waterAttr.y, speed, [0.9, 0.3], 0.12).xy.mul(0.55).add(fine.xy.mul(0.45));
  const slope = ripples.mul(still ? STILL_RIPPLE : RIPPLE).toVar();
  // Object space: the plane's normal is +Z; the mesh rotation maps it to world +Y.
  const normal = normalize(vec3(slope.x, slope.y, 1));
  const worldNormal = normalize(vec3(slope.x, 1, slope.y.negate()));
  const toEye = normalize(cameraPosition.sub(positionWorld));
  const strength = fresnelNode(toEye.dot(worldNormal), still);

  // The default reflector UV (ReflectorNode._defaultUV) wobbled by the ripples.
  reflection.uvNode = screenUV.flipX().add(slope.mul(REFLECTION.distortion));

  const streaks = slope.y.mul(2).add(0.5).clamp(0, 1).pow(2).toVar();
  // Foam: a band along the waterline, broken up by the fine noise that drifts with the current.
  const breakup = fine.z.mul(0.5).add(0.5);
  const edge = saturate(float(1).sub(shore.div(FOAM.width))).pow(2);
  const foam = smoothstep(float(0.3), float(0.7), edge.mul(1.3).add(breakup.sub(0.5).mul(0.7))).mul(
    smoothstep(float(0), float(FOAM.feather), edge),
  );
  const specks = still ? float(0) : smoothstep(float(SPECKS.threshold), float(1), breakup);
  // Out in the middle the water is deeper and darker.
  const deep = float(1).sub(
    smoothstep(float(0), float(DEPTH.deepAt), shore).mul(1 - DEPTH.deepDarken),
  );
  // The moon's (or the sun's) streak: tight, cut off below the horizon, held under the bloom.
  const half = normalize(glintDirection.add(toEye));
  const glint = min(
    saturate(worldNormal.dot(half)).pow(GLINT.power).mul(GLINT.gain),
    float(GLINT.max),
  ).mul(smoothstep(float(0), float(GLINT.fadeElevation), glintDirection.y));

  material.normalNode = transformNormalToView(normal);
  material.colorNode = mix(
    mix(color(look.deep), color(look.streak), streaks).mul(deep),
    color(FOAM.color),
    foam,
  ).mul(float(1).sub(strength));
  material.roughnessNode = float(0.45).sub(streaks.mul(0.35)).add(foam.mul(0.5));
  material.emissiveNode = color(look.glow)
    .mul(streaks)
    .add((waterTier === 'low' ? color(REFLECTION.lowColor) : reflection.rgb).mul(strength))
    .add(color(FOAM.color).mul(foam.mul(FOAM.glow)))
    .add(color(SPECKS.color).mul(specks.mul(SPECKS.glow)))
    .add(glintColor.mul(glint));
}

/** The planar reflection a water material owns. */
export function waterReflection(material: THREE.Material): THREE.ReflectorNode {
  const reflection: unknown = material.userData.reflection;
  if (!(reflection instanceof THREE.ReflectorNode)) throw new Error('not a water material');
  return reflection;
}

/**
 * A flat water surface `width` (x) by `length` (z), lying in the xz plane, centred on its origin.
 * The caller only positions it. Everything about how water looks (reflections included) lives here.
 */
export function createWaterMesh(
  width: number,
  length: number,
  look: WaterLook = RIVER_FLOW,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardNodeMaterial> {
  const material = createRiverMaterial(look);
  const geo = new THREE.PlaneGeometry(width, length);
  setWaterAttribute(geo, (x) => width / 2 - Math.abs(x));
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.add(waterReflection(material).target);
  return mesh;
}
