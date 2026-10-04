import {
  cameraPosition,
  color,
  float,
  mix,
  mx_noise_vec3,
  normalize,
  positionWorld,
  reflector,
  saturate,
  screenUV,
  time,
  transformNormalToView,
  vec3,
} from 'three/tsl';
import * as THREE from 'three/webgpu';

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
  resolutionScale: 0.35,
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
 * Schlick fresnel scaled to a cap: `base·cap` looking straight down, `cap` at grazing angles.
 * Pure maths, mirrored in TSL by `fresnelNode`; tests pin the range.
 */
export function fresnel(cosTheta: number, base: number, cap: number): number {
  const c = Math.min(1, Math.max(0, cosTheta));
  return (base + (1 - base) * (1 - c) ** 5) * cap;
}

/**
 * Ripple slope (object-space x,y tilt of the surface) from two noise octaves drifting downstream
 * (-Z: the way the player must follow). Also used as the reflection distortion.
 */
function rippleSlope(look: WaterLook): THREE.Node<'vec2'> {
  const amplitude = look.speed > 0 ? RIPPLE : STILL_RIPPLE;
  const downstream = positionWorld.z.add(time.mul(look.speed));
  const broad = mx_noise_vec3(vec3(positionWorld.x.mul(0.9), downstream.mul(0.3), time.mul(0.12)));
  const fine = mx_noise_vec3(vec3(positionWorld.x.mul(3.2), downstream.mul(1.1), time.mul(0.25)));
  return broad.xy.mul(0.65).add(fine.xy.mul(0.35)).mul(amplitude).toVar();
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
  const slope = rippleSlope(look);
  // Object space: the plane's normal is +Z; the mesh rotation maps it to world +Y.
  const normal = normalize(vec3(slope.x, slope.y, 1));
  const worldNormal = normalize(vec3(slope.x, 1, slope.y.negate()));
  const toEye = normalize(cameraPosition.sub(positionWorld));
  const strength = fresnelNode(toEye.dot(worldNormal), look.speed === 0);

  const reflection = reflector({ resolutionScale: REFLECTION.resolutionScale, bounces: false });
  // The default reflector UV (ReflectorNode._defaultUV) wobbled by the ripples.
  reflection.uvNode = screenUV.flipX().add(slope.mul(REFLECTION.distortion));

  const streaks = slope.y.mul(2).add(0.5).clamp(0, 1).pow(2).toVar();
  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0.15 });
  material.normalNode = transformNormalToView(normal);
  material.colorNode = mix(color(look.deep), color(look.streak), streaks).mul(
    float(1).sub(strength),
  );
  material.roughnessNode = float(0.45).sub(streaks.mul(0.35));
  material.emissiveNode = color(look.glow).mul(streaks).add(reflection.rgb.mul(strength));
  material.userData.reflection = reflection;
  // disposeScene only frees textures it finds on the material; the render target lives in the node.
  material.addEventListener('dispose', () => reflection.dispose());
  return material;
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
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.add(waterReflection(material).target);
  return mesh;
}
