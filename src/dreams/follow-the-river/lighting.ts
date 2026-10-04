import type { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import * as THREE from 'three/webgpu';
import { refreshEnvironment } from '../../engine/environment';
import { setShadowStrength } from '../../engine/shadows';
import {
  createHalo,
  createMoon,
  createPhysicalSky,
  createSkyDome,
  createStars,
  DISC_REFERENCE,
  MOON_HALO,
  MOON_RADIUS,
  paintSkyDome,
  setDomeLook,
  setPhysicalSky,
  SKY_LAYER_RADIUS,
  SKY_RADIUS,
} from '../../engine/sky';
import type { LightColors } from './light-colors';
import type { LightPreset } from './light-presets';
import { setWaterGlint } from './water';

export * from './light-presets';

export interface WorldLights {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  /** The sun (or day's pale disc): not drawn while the moon is. */
  disc: THREE.Mesh;
  moon: THREE.Mesh;
  halo: THREE.Mesh;
  /** The painted dome; the star field and the physical sky are its children, so they follow the camera. */
  sky: THREE.Mesh;
  physical: SkyMesh;
  stars: THREE.Points;
  scene: THREE.Scene;
}

/** Name of the sky dome, so a dream can keep it centred on the player. */
export const SKY_NAME = 'sky';
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
 * One hemisphere light, one key light, the sky dome and the sun/moon (children of the dome, so they
 * follow the camera with it). The key light stays put (only its direction matters).
 */
export function createWorldLights(scene: THREE.Scene): WorldLights {
  const hemi = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  const sky = createSkyDome(0, 0, SKY_RADIUS);
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
  const [moon, halo] = [createMoon(), createHalo(glowTexture(1))];
  const physical = createPhysicalSky();
  const stars = createStars();
  sky.add(disc, halo, moon, stars, physical);
  scene.fog = new THREE.Fog(0, 1, 2);
  scene.add(sky, hemi, key);
  return { hemi, key, disc, moon, halo, sky, physical, stars, scene };
}

/**
 * Per-call extras for `applyLighting`. A caller that blends every frame keeps one and edits it:
 * `colors` (linear blends, no 8-bit steps), `sun` (the physical sky's and the disc's direction when it
 * is not the key's), and the opacities of the dome, the stars and the moon (default: from the preset).
 */
export interface LightFrame {
  refreshEnv: boolean;
  sun: { x: number; y: number; z: number } | null;
  /** The key light's direction when it is not the sun's (a blend between the moon's and the sun's). */
  key: { x: number; y: number; z: number } | null;
  colors: LightColors | null;
  dome: number | null;
  stars: number | null;
  moon: number | null;
}

/** A still switch: refresh the image-based light, everything else from the preset. */
export const STILL: Readonly<LightFrame> = {
  refreshEnv: true,
  sun: null,
  key: null,
  colors: null,
  dome: null,
  stars: null,
  moon: null,
};

export function createFrame(): LightFrame {
  return { ...STILL };
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

function place(
  mesh: THREE.Object3D,
  dir: { x: number; y: number; z: number },
  scale: number,
): void {
  mesh.position.set(dir.x * SKY_LAYER_RADIUS, dir.y * SKY_LAYER_RADIUS, dir.z * SKY_LAYER_RADIUS);
  // Face the dome's centre (these are children of the dome, so work in dome space).
  mesh.quaternion.setFromUnitVectors(FORWARD, towardCentre.set(-dir.x, -dir.y, -dir.z));
  mesh.scale.setScalar(scale);
}

/** A preset disc size (tuned at `DISC_REFERENCE` m) at the sky layers' distance. */
const discScale = (size: number): number => (size * SKY_LAYER_RADIUS) / DISC_REFERENCE;

function setOpacity(mesh: THREE.Mesh | THREE.Points, opacity: number): void {
  mesh.visible = opacity > 0.001;
  if (mesh.material instanceof THREE.Material) mesh.material.opacity = opacity;
}

/**
 * Switches to a preset (or one frame of a blend): colours, intensities, positions, fog, the sky
 * (painted dome and/or physical), the moon and stars, the image-based light and the key light's
 * shadow strength. Never changes the light count (that would recompile shaders). Allocation-free
 * except the first disc texture and `refreshEnvironment` (six 128 px faces): per-frame callers set
 * `frame.refreshEnv` false and refresh on their own slow clock. Per-frame dimming is `applyDim`.
 */
export function applyLighting(
  lights: WorldLights,
  preset: LightPreset,
  frame: Readonly<LightFrame> = STILL,
): void {
  const { scene, hemi, key, disc, moon, halo, sky, physical, stars } = lights;
  const c = frame.colors;
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.set(c?.fog ?? preset.fog.color);
    scene.fog.near = preset.fog.near;
    scene.fog.far = preset.fog.far;
  }
  hemi.color.set(c?.hemiSky ?? preset.hemi.sky);
  hemi.groundColor.set(c?.hemiGround ?? preset.hemi.ground);
  const d = skyDirection(preset.key.elevation, preset.key.azimuth, sunScratch);
  key.color.set(c?.key ?? preset.key.color);
  applyDim(lights, preset, 0);
  const aim = frame.sun ?? d;
  const lit = frame.key ?? aim; // the sun you see is the sun that lights and shadows
  key.position.set(lit.x * KEY_DISTANCE, lit.y * KEY_DISTANCE, lit.z * KEY_DISTANCE);
  setWaterGlint(key.position, key.color); // the streak on the water follows the light
  setShadowStrength(key, preset.shadow);
  const night = preset.stars ? 1 : 0;
  const moonAmount = frame.moon ?? night;
  paintSkyDome(sky, c?.skyTop ?? preset.skyTop, c?.skyHorizon ?? preset.skyHorizon);
  setDomeLook(sky, frame.dome ?? (preset.sky ? 0 : 1), preset.clouds);
  if (preset.sky) setPhysicalSky(physical, preset.sky, aim);
  physical.visible = !!preset.sky;
  setOpacity(stars, frame.stars ?? night);
  setOpacity(moon, moonAmount);
  setOpacity(halo, moonAmount);
  place(moon, d, MOON_RADIUS);
  place(halo, d, MOON_RADIUS * MOON_HALO);
  applyDisc(disc, preset, c?.disc ?? preset.disc.color, moonAmount <= 0, aim);
  if (frame.refreshEnv) refreshEnvironment(scene, preset, c?.skyTop, c?.skyHorizon);
  else scene.environmentIntensity = preset.environment;
}

function applyDisc(
  disc: THREE.Mesh,
  preset: LightPreset,
  color: THREE.ColorRepresentation,
  shown: boolean,
  aim: { x: number; y: number; z: number },
): void {
  disc.visible = shown;
  if (disc.material instanceof THREE.MeshBasicMaterial) {
    disc.material.color.set(color);
    const map = glowTexture(preset.disc.soft);
    if (map && map !== disc.material.map) disc.material.map = map;
  }
  place(disc, aim, discScale(preset.disc.size));
}
