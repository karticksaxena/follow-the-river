import * as THREE from 'three/webgpu';
import { createSkyDome, paintSkyDome } from '../../engine/sky';

export type LightingName = 'dusk' | 'day' | 'night' | 'dawn';
export interface LightPreset {
  skyTop: number;
  skyHorizon: number;
  fog: { color: number; near: number; far: number };
  hemi: { sky: number; ground: number; intensity: number };
  key: { color: number; intensity: number; elevation: number; azimuth: number };
  /** `soft` 0..1: how much of the disc's radius is a hazy fade (1 = pure glow, 0 = crisp). */
  disc: { color: number; size: number; soft: number };
}

/** Tuning knobs. Never bright: even "day" is overcast. */
export const LIGHTING: Readonly<Record<LightingName, LightPreset>> = {
  // Intro: the evening Mom sends you off. Low, rusty sun behind smoke.
  dusk: {
    skyTop: 0x0b0d14,
    skyHorizon: 0x3a2a2a,
    fog: { color: 0x2a2224, near: 8, far: 80 },
    hemi: { sky: 0x6a5a60, ground: 0x15120f, intensity: 0.55 },
    key: { color: 0xc08060, intensity: 0.35, elevation: 0.14, azimuth: -2.4 },
    disc: { color: 0x8a5a40, size: 6, soft: 0.7 },
  },
  // Overcast day: flat grey, a pale sun disc barely through the haze.
  day: {
    skyTop: 0x2c3136,
    skyHorizon: 0x50565b,
    fog: { color: 0x4a5055, near: 10, far: 90 },
    hemi: { sky: 0x8a9098, ground: 0x24261f, intensity: 0.75 },
    key: { color: 0xd0d4d8, intensity: 0.45, elevation: 0.6, azimuth: -2.0 },
    disc: { color: 0x7d8286, size: 7, soft: 0.95 },
  },
  // Night: blue-black, a small cold moon that blooms.
  night: {
    skyTop: 0x05070b,
    skyHorizon: 0x1b2026,
    fog: { color: 0x141a20, near: 5, far: 55 },
    hemi: { sky: 0x3a4450, ground: 0x0c0e0a, intensity: 0.35 },
    key: { color: 0x9fb4ff, intensity: 0.35, elevation: 0.5, azimuth: -2.6 },
    disc: { color: 0xdfe8ff, size: 4, soft: 0.25 },
  },
  // Ending: still grey and dim, a pale sun low over the dam.
  dawn: {
    skyTop: 0x2a3036,
    skyHorizon: 0x625d5a,
    fog: { color: 0x4e4a4a, near: 8, far: 85 },
    hemi: { sky: 0x8a8a90, ground: 0x1c1c18, intensity: 0.6 },
    key: { color: 0xe0d4c0, intensity: 0.45, elevation: 0.12, azimuth: 3.0 },
    disc: { color: 0xa89c90, size: 6, soft: 0.9 },
  },
};

const channel = (a: number, b: number, t: number, shift: number): number =>
  Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);

/** Per-channel blend of two 0xRRGGBB colours. */
export function mixHex(a: number, b: number, t: number): number {
  return (channel(a, b, t, 16) << 16) | (channel(a, b, t, 8) << 8) | channel(a, b, t, 0);
}

const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

/** A preset `t` (0..1) of the way from `a` to `b`. Allocates: call it a few times a second, not per frame. */
export function mixPreset(a: LightPreset, b: LightPreset, t: number): LightPreset {
  return {
    skyTop: mixHex(a.skyTop, b.skyTop, t),
    skyHorizon: mixHex(a.skyHorizon, b.skyHorizon, t),
    fog: {
      color: mixHex(a.fog.color, b.fog.color, t),
      near: mix(a.fog.near, b.fog.near, t),
      far: mix(a.fog.far, b.fog.far, t),
    },
    hemi: {
      sky: mixHex(a.hemi.sky, b.hemi.sky, t),
      ground: mixHex(a.hemi.ground, b.hemi.ground, t),
      intensity: mix(a.hemi.intensity, b.hemi.intensity, t),
    },
    key: {
      color: mixHex(a.key.color, b.key.color, t),
      intensity: mix(a.key.intensity, b.key.intensity, t),
      elevation: mix(a.key.elevation, b.key.elevation, t),
      azimuth: mix(a.key.azimuth, b.key.azimuth, t),
    },
    disc: {
      color: mixHex(a.disc.color, b.disc.color, t),
      size: mix(a.disc.size, b.disc.size, t),
      soft: t < 0.5 ? a.disc.soft : b.disc.soft,
    },
  };
}

export interface WorldLights {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  disc: THREE.Mesh;
  sky: THREE.Mesh;
  scene: THREE.Scene;
}

/** Name of the sky dome, so a dream can keep it centred on the player. */
export const SKY_NAME = 'sky';
const SKY_DOME_RADIUS = 80;
const DISC_DISTANCE = 70;
const KEY_DISTANCE = 60;
/** How much `dim = 1` darkens the hemisphere and key light (inside shacks). */
const DIM_STRENGTH = 0.7;

const FORWARD = new THREE.Vector3(0, 0, 1);
const towardCentre = new THREE.Vector3();

const GLOW_SIZE = 64;
const glows = new Map<number, THREE.CanvasTexture | null>();

/** Round alpha texture: opaque to (1 - soft) of the radius, then fading out. Null without a DOM. */
function glowTexture(soft: number): THREE.CanvasTexture | null {
  const cached = glows.get(soft);
  if (cached !== undefined) return cached;
  let texture: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = GLOW_SIZE;
    canvas.height = GLOW_SIZE;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const r = GLOW_SIZE / 2;
      const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(Math.min(0.99, 1 - soft), 'rgba(255,255,255,1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
      texture = new THREE.CanvasTexture(canvas);
    }
  }
  glows.set(soft, texture);
  return texture;
}

/** Unit direction toward the sun/moon from elevation/azimuth (radians). */
export function skyDirection(
  elevation: number,
  azimuth: number,
  out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
): { x: number; y: number; z: number } {
  out.x = Math.cos(elevation) * Math.sin(azimuth);
  out.y = Math.sin(elevation);
  out.z = Math.cos(elevation) * Math.cos(azimuth);
  return out;
}

/**
 * One hemisphere light, one key light, the sky dome and the sun/moon disc (a child of the dome).
 * The key light stays put (a shadowless DirectionalLight only uses its direction);
 * only the sky dome follows the camera.
 */
export function createWorldLights(scene: THREE.Scene): WorldLights {
  const hemi = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  const sky = createSkyDome(0, 0, SKY_DOME_RADIUS);
  sky.name = SKY_NAME;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({
      fog: false,
      depthWrite: false,
      transparent: true,
      map: glowTexture(0.5),
    }),
  );
  sky.add(disc);
  scene.fog = new THREE.Fog(0, 1, 2);
  scene.add(sky, hemi, key);
  return { hemi, key, disc, sky, scene };
}

/** Darkens hemi + key by `dim` 0..1 (inside shacks). Allocation-free: safe to call every frame. */
/** Pulls the fog in (an area's tighter night). Rare: called when a phase starts. */
export function setFogFar(lights: WorldLights, far: number): void {
  if (lights.scene.fog instanceof THREE.Fog) lights.scene.fog.far = far;
}

export function applyDim(lights: WorldLights, preset: LightPreset, dim: number): void {
  const factor = 1 - DIM_STRENGTH * dim;
  lights.hemi.intensity = preset.hemi.intensity * factor;
  lights.key.intensity = preset.key.intensity * factor;
}

/**
 * Switches to a preset: colours, intensities, positions, fog and the sky repaint. Rare (allocates,
 * repaints); never changes `visible` or the light count (that would recompile shaders). The key
 * light stays put; only the sky dome follows the camera. Per-frame dimming is `applyDim`.
 */
export function applyLighting(lights: WorldLights, preset: LightPreset): void {
  const { scene, hemi, key, disc, sky } = lights;
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.set(preset.fog.color);
    scene.fog.near = preset.fog.near;
    scene.fog.far = preset.fog.far;
  }
  paintSkyDome(sky, preset.skyTop, preset.skyHorizon);
  hemi.color.set(preset.hemi.sky);
  hemi.groundColor.set(preset.hemi.ground);
  const d = skyDirection(preset.key.elevation, preset.key.azimuth);
  key.color.set(preset.key.color);
  applyDim(lights, preset, 0);
  key.position.set(d.x * KEY_DISTANCE, d.y * KEY_DISTANCE, d.z * KEY_DISTANCE);
  if (disc.material instanceof THREE.MeshBasicMaterial) {
    disc.material.color.set(preset.disc.color);
    const map = glowTexture(preset.disc.soft);
    if (map && map !== disc.material.map) disc.material.map = map;
  }
  disc.position.set(d.x * DISC_DISTANCE, d.y * DISC_DISTANCE, d.z * DISC_DISTANCE);
  // Face the dome's centre (the disc is a child of the dome, so work in dome space).
  disc.quaternion.setFromUnitVectors(FORWARD, towardCentre.set(-d.x, -d.y, -d.z));
  disc.scale.setScalar(preset.disc.size);
}
