import type { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import * as THREE from 'three/webgpu';
import { refreshEnvironment } from '../../engine/environment';
import { setShadowStrength } from '../../engine/shadows';
import {
  createPhysicalSky,
  createSkyDome,
  createStars,
  paintSkyDome,
  setPhysicalSky,
} from '../../engine/sky';
import type { LightPreset } from './light-presets';

export * from './light-presets';

export interface WorldLights {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  disc: THREE.Mesh;
  /** The painted dome; the star field and the physical sky are its children, so they follow the camera. */
  sky: THREE.Mesh;
  physical: SkyMesh;
  stars: THREE.Points;
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
const sunScratch = { x: 0, y: 0, z: 0 };

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
  const physical = createPhysicalSky();
  const stars = createStars();
  sky.add(disc, stars, physical);
  scene.fog = new THREE.Fog(0, 1, 2);
  scene.add(sky, hemi, key);
  return { hemi, key, disc, sky, physical, stars, scene };
}

/** Pulls the fog in (an area's tighter night). Rare: called when a phase starts. */
export function setFogFar(lights: WorldLights, far: number): void {
  if (lights.scene.fog instanceof THREE.Fog) lights.scene.fog.far = far;
}

/** Darkens hemi + key by `dim` 0..1 (inside shacks). Allocation-free: safe to call every frame. */
export function applyDim(lights: WorldLights, preset: LightPreset, dim: number): void {
  const factor = 1 - DIM_STRENGTH * dim;
  lights.hemi.intensity = preset.hemi.intensity * factor;
  lights.key.intensity = preset.key.intensity * factor;
}

/**
 * Switches to a preset: colours, intensities, positions, fog, the sky (painted dome or physical),
 * the star field, the image-based light and the key light's shadow strength. Never changes the
 * light count (that would recompile shaders). Allocation-free except the first disc texture and
 * `refreshEnvironment` (six 128 px faces): per-frame callers pass `refreshEnv` false and refresh
 * on their own slow clock. `sun` overrides the physical sky's sun direction (default: the key's).
 * Per-frame dimming is `applyDim`.
 */
export function applyLighting(
  lights: WorldLights,
  preset: LightPreset,
  refreshEnv = true,
  sun?: { x: number; y: number; z: number },
): void {
  const { scene, hemi, key, disc } = lights;
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.set(preset.fog.color);
    scene.fog.near = preset.fog.near;
    scene.fog.far = preset.fog.far;
  }
  hemi.color.set(preset.hemi.sky);
  hemi.groundColor.set(preset.hemi.ground);
  const d = skyDirection(preset.key.elevation, preset.key.azimuth, sunScratch);
  key.color.set(preset.key.color);
  applyDim(lights, preset, 0);
  key.position.set(d.x * KEY_DISTANCE, d.y * KEY_DISTANCE, d.z * KEY_DISTANCE);
  setShadowStrength(key, preset.shadow);
  applySky(lights, preset, sun ?? d);
  if (disc.material instanceof THREE.MeshBasicMaterial) {
    disc.material.color.set(preset.disc.color);
    disc.material.opacity = 1;
    const map = glowTexture(preset.disc.soft);
    if (map && map !== disc.material.map) disc.material.map = map;
  }
  disc.visible = !preset.sky; // the physical sky draws its own sun
  disc.position.set(d.x * DISC_DISTANCE, d.y * DISC_DISTANCE, d.z * DISC_DISTANCE);
  // Face the dome's centre (the disc is a child of the dome, so work in dome space).
  disc.quaternion.setFromUnitVectors(FORWARD, towardCentre.set(-d.x, -d.y, -d.z));
  disc.scale.setScalar(preset.disc.size);
  if (refreshEnv) refreshEnvironment(scene, preset, sun ?? d);
  else scene.environmentIntensity = preset.environment;
}

/** The painted dome (with or without stars) or the physical sky, whichever the preset asks for. */
function applySky(lights: WorldLights, preset: LightPreset, sun: THREE.Vector3Like): void {
  const { sky, physical, stars } = lights;
  if (preset.sky) setPhysicalSky(physical, preset.sky, sun);
  else paintSkyDome(sky, preset.skyTop, preset.skyHorizon);
  physical.visible = !!preset.sky;
  stars.visible = !!preset.stars && !preset.sky;
  if (sky.material instanceof THREE.Material) sky.material.visible = !preset.sky;
}
