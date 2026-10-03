import { color, float, mix, mx_noise_float, positionWorld, time, vec3 } from 'three/tsl';
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

/**
 * Dark water whose long ripples drift downstream (towards -Z, the way the player must follow)
 * and glint where the flashlight hits them. All in the shader: no per-frame JavaScript.
 */
export function createRiverMaterial(look: WaterLook = RIVER_FLOW): THREE.MeshStandardNodeMaterial {
  const downstream = positionWorld.z.add(time.mul(look.speed));
  const ripples = mx_noise_float(
    vec3(positionWorld.x.mul(1.1), downstream.mul(0.18), time.mul(0.2)),
  );
  const streaks = ripples.mul(0.5).add(0.5).pow(2);
  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0.15 });
  material.colorNode = mix(color(look.deep), color(look.streak), streaks);
  material.roughnessNode = float(0.45).sub(streaks.mul(0.35));
  material.emissiveNode = color(look.glow).mul(streaks);
  return material;
}
