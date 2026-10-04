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
export const DAWN = { seconds: 14, moonSets: 0.35, volume: 0.3, water: 0.25 } as const;

/**
 * The sun's path: elevation when the physical sky takes over (about -2 degrees) and when the dawn
 * ends (about 11 degrees: clear of the far pines), and its azimuth (radians; the camera faces pi, so
 * this is about 42 degrees left of the dam, over the pine line). Tuning knobs.
 */
const SUN_START = -0.035;
const SUN_END = 0.2;
const SUN_AZIMUTH = -2.4;
/** The key light takes this share of the dawn after the moon sets to swing from the moon's direction to the sun's. */
const HANDOVER = 0.1;
/** Seconds between image-based light refreshes while the dawn blends (six 128 px faces each). */
const ENV_EVERY = 0.5;
/** How much of the lantern's light is left once the moon has set. */
const LANTERN_LEFT = 0.15;
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

/** The sun's direction `k` (0..1) through the dawn, or null while the moon is still up. One source for the key light, the sky and the god rays. */
export function dawnSun(k: number, out: { x: number; y: number; z: number }): typeof out | null {
  if (k < DAWN.moonSets) return null;
  const u = Math.min(1, (k - DAWN.moonSets) / (1 - DAWN.moonSets));
  return skyDirection(SUN_START + (SUN_END - SUN_START) * u, SUN_AZIMUTH, out);
}

/** Share 0..1 of the way the key light has swung from the moon's direction to the sun's. Pure. */
export function handover(k: number): number {
  const t = clamp01((k - DAWN.moonSets) / HANDOVER);
  return t * t * (3 - 2 * t);
}

/** The key light's direction: the unit blend of the moon's and the sun's, `s` of the way to the sun. Writes `out`. */
export function swingKey(
  sun: { x: number; y: number; z: number },
  moon: { x: number; y: number; z: number },
  s: number,
  out: { x: number; y: number; z: number },
): typeof out {
  const x = moon.x + (sun.x - moon.x) * s;
  const y = moon.y + (sun.y - moon.y) * s;
  const z = moon.z + (sun.z - moon.z) * s;
  const len = Math.hypot(x, y, z) || 1;
  out.x = x / len;
  out.y = y / len;
  out.z = z / len;
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
  const lit = { x: 0, y: 0, z: 0 };
  const moonDir = skyDirection(LIGHTING.predawn.key.elevation, LIGHTING.predawn.key.azimuth, {
    x: 0,
    y: 0,
    z: 0,
  });
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
        frame.key = null;
      } else {
        const u = Math.min(1, (k - DAWN.moonSets) / (1 - DAWN.moonSets));
        mixPresetInto(LIGHTING.predawn, sunrise, u, scratch);
        mixColorsInto(LIGHTING.predawn, sunrise, u, colors);
        frame.sun = dawnSun(k, sun);
        frame.key = swingKey(sun, moonDir, handover(k), lit);
      }
      applyLighting(lights, scratch, frame);
    },
  };
}
