import * as THREE from 'three/webgpu';
import {
  applyLighting,
  LIGHTING,
  mixPresetInto,
  skyDirection,
  type LightPreset,
  type WorldLights,
} from './lighting';

/**
 * The 14 s lake dawn. `moonSets` is the share of it the night takes to go to the predawn (the moon
 * fades and sinks); then the physical sky takes over and the sun rises, warm, over the dam.
 */
export const DAWN = { seconds: 14, moonSets: 0.35, volume: 0.35 } as const;

/** The sun's elevation when the physical sky takes over (about -4 degrees: a dark blue twilight). */
const SUN_START = -0.07;
/** Seconds between image-based light refreshes while the dawn blends (six 128 px faces each). */
const ENV_EVERY = 0.5;
/** How much of the lantern's light is left once the moon has set. */
const LANTERN_LEFT = 0.5;

export interface Dawn {
  /** One frame: `k` 0..1 through the dawn, `t` seconds in. Allocation-free. */
  step(k: number, t: number): void;
}

/** Night to sunrise, every frame: the moon sets, the sun comes up warm, the sky turns blue. */
export function createDawn(
  lights: WorldLights,
  night: LightPreset,
  lantern: THREE.PointLight,
): Dawn {
  const scratch = structuredClone(night);
  const sun = { x: 0, y: 0, z: 0 };
  const sunrise = LIGHTING.sunrise;
  let lanternFull = -1;
  let nextEnv = 0;
  return {
    step(k, t) {
      if (lanternFull < 0) lanternFull = lantern.intensity;
      const refresh = k >= 1 || t >= nextEnv;
      if (refresh) nextEnv = t + ENV_EVERY;
      const moon = Math.min(1, k / DAWN.moonSets);
      lantern.intensity = lanternFull * (1 - (1 - LANTERN_LEFT) * moon);
      if (k < DAWN.moonSets) {
        mixPresetInto(night, LIGHTING.predawn, moon, scratch);
        applyLighting(lights, scratch, refresh);
        if (lights.disc.material instanceof THREE.MeshBasicMaterial) {
          lights.disc.material.opacity = 1 - moon; // the moon fades as it sinks
        }
        return;
      }
      const u = Math.min(1, (k - DAWN.moonSets) / (1 - DAWN.moonSets));
      mixPresetInto(LIGHTING.predawn, sunrise, u, scratch);
      const elevation = SUN_START + (sunrise.key.elevation - SUN_START) * u;
      skyDirection(elevation, sunrise.key.azimuth, sun); // pinned over the dam
      applyLighting(lights, scratch, refresh, sun);
    },
  };
}
