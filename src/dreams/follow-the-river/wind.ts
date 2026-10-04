import {
  attribute,
  cameraPosition,
  clamp,
  distance,
  positionGeometry,
  positionLocal,
  sin,
  smoothstep,
  time,
  vec3,
} from 'three/tsl';
import type * as THREE from 'three/webgpu';

/** How one kind of plant sways: `strength` metres at `reach` metres above its base. */
export interface WindLook {
  strength: number;
  reach: number;
}

/** Wind knobs (metres, seconds). Gentle: the dream is still, the leaves only breathe. */
export const WIND = {
  /** Radians of phase per second, and per metre across the ground (neighbours differ). */
  speed: 1.1,
  phaseX: 0.31,
  phaseZ: 0.23,
  tree: { strength: 0.22, reach: 9 },
  plant: { strength: 0.1, reach: 1 },
  grass: { strength: 0.12, reach: 0.45 },
} as const satisfies Record<string, WindLook | number>;

/** Pure: sideways sway (m) at `height` m above the base: nothing at the root, a squared ramp up. */
export function windAmplitude(height: number, look: WindLook): number {
  const t = Math.min(1, Math.max(0, height / look.reach));
  return look.strength * t * t;
}

/** Grass thins out between these camera distances (m): sunk into the ground, so it never pops. */
export interface Fade {
  from: number;
  to: number;
}

/** Name of the per-instance scale attribute (`InstancedBufferAttribute`, 1 float per instance). */
export const SCALE_ATTRIBUTE = 'instScale';

/**
 * A `positionNode` that sways a plant by its height above the base. Meshes using it sit at the
 * origin with their instance matrices in world space, so after instancing `positionLocal` is the
 * world position: its xz is the phase (a gust rolls across the ground). `positionGeometry.y`
 * times the instance scale is the height above the plant's base. With `fade` the plant sinks
 * into the ground past a camera distance. Mirrors `windAmplitude`.
 */
export function windNode(look: WindLook, fade?: Fade): THREE.Node<'vec3'> {
  const height = positionGeometry.y.mul(attribute(SCALE_ATTRIBUTE, 'float'));
  const t = clamp(height.div(look.reach), 0, 1);
  const amplitude = t.mul(t).mul(look.strength);
  const p = positionLocal;
  const phase = p.x.mul(WIND.phaseX).add(p.z.mul(WIND.phaseZ));
  const clock = time.mul(WIND.speed);
  const gust = sin(clock.add(phase)).add(sin(clock.mul(2.7).add(phase.mul(1.9))).mul(0.35));
  const side = sin(clock.mul(0.8).add(phase).add(1.7)).mul(0.7);
  const sink = fade
    ? smoothstep(fade.from, fade.to, distance(p.xz, cameraPosition.xz)).mul(height)
    : height.mul(0);
  return vec3(p.x.add(gust.mul(amplitude)), p.y.sub(sink), p.z.add(side.mul(amplitude)));
}
