import * as THREE from 'three/webgpu';
import { createLightColors, mixColorsInto } from './light-colors';
import {
  applyLighting,
  createFrame,
  LIGHTING,
  mixPresetInto,
  skyDirection,
  type LightFrame,
  type LightPreset,
  type WorldLights,
} from './lighting';

/**
 * The 14 s lake dawn. `moonSets` is the share of it the night takes to go to the predawn (the moon
 * fades and sinks); then the physical sky takes over and the sun rises, warm, over the dam.
 * (The brief's `sunUp` is left out: the sun's rise is one linear climb, nothing needs a second mark.)
 */
export const DAWN = { seconds: 14, moonSets: 0.35, volume: 0.35 } as const;

/** The sun's elevation when the physical sky takes over (about -2 degrees). */
const SUN_START = -0.035;
/** Seconds between image-based light refreshes while the dawn blends (six 128 px faces each). */
const ENV_EVERY = 0.5;
/** How much of the lantern's light is left once the moon has set. */
const LANTERN_LEFT = 0.5;
/** The stars are gone by this share of the dawn (they fade across the switch, never pop). */
const STARS_GONE = 0.5;
/** The painted dome fades out over the physical sky between these shares of phase two. */
const DOME_FADE: readonly [number, number] = [0.2, 0.65];

export interface Fades {
  dome: number;
  stars: number;
  moon: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Opacities of the painted dome, the stars and the moon at `k` (0..1) through the dawn. All continuous. */
export function dawnFades(k: number, out: Fades): Fades {
  const u = clamp01((k - DAWN.moonSets) / (1 - DAWN.moonSets));
  const fade = clamp01((u - DOME_FADE[0]) / (DOME_FADE[1] - DOME_FADE[0]));
  out.dome = 1 - fade * fade * (3 - 2 * fade);
  out.stars = 1 - clamp01(k / STARS_GONE);
  out.moon = 1 - clamp01(k / DAWN.moonSets);
  return out;
}

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
  const frame: LightFrame = createFrame();
  const colors = createLightColors();
  const fades: Fades = { dome: 1, stars: 1, moon: 1 };
  const sun = { x: 0, y: 0, z: 0 };
  const sunrise = LIGHTING.sunrise;
  let lanternFull = -1;
  let nextEnv = 0;
  frame.colors = colors;
  return {
    step(k, t) {
      if (lanternFull < 0) lanternFull = lantern.intensity;
      frame.refreshEnv = k >= 1 || t >= nextEnv;
      if (frame.refreshEnv) nextEnv = t + ENV_EVERY;
      const moon = Math.min(1, k / DAWN.moonSets);
      lantern.intensity = lanternFull * (1 - (1 - LANTERN_LEFT) * moon);
      dawnFades(k, fades);
      frame.dome = fades.dome;
      frame.stars = fades.stars;
      frame.moon = fades.moon;
      if (k < DAWN.moonSets) {
        mixPresetInto(night, LIGHTING.predawn, moon, scratch);
        mixColorsInto(night, LIGHTING.predawn, moon, colors);
        frame.sun = null;
      } else {
        const u = Math.min(1, (k - DAWN.moonSets) / (1 - DAWN.moonSets));
        mixPresetInto(LIGHTING.predawn, sunrise, u, scratch);
        mixColorsInto(LIGHTING.predawn, sunrise, u, colors);
        const elevation = SUN_START + (sunrise.key.elevation - SUN_START) * u;
        frame.sun = skyDirection(elevation, sunrise.key.azimuth, sun); // pinned over the dam
      }
      applyLighting(lights, scratch, frame);
    },
  };
}
