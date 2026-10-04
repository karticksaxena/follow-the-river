import type { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import * as THREE from 'three/webgpu';
import { createPhysicalSky, createSkyDome, paintSkyDome, setPhysicalSky } from './sky';

/** What `refreshEnvironment` needs from a lighting preset (the engine knows nothing of the game's presets). */
export interface SkyLook {
  skyTop: number;
  skyHorizon: number;
  environment: number;
  sky?: { turbidity: number; rayleigh: number; mie: number; mieG: number };
}

const SIZE = 128;
const ENV_DOME = 60;
const ENV_SKY_SCALE = 40;
const FAR = 100;

/** The sky captured into a cube map and blurred (PMREM) lights every material: image-based light. */
interface Rig {
  generator: THREE.PMREMGenerator;
  scene: THREE.Scene;
  dome: THREE.Mesh;
  physical: SkyMesh;
}

let rig: Rig | null = null;
const targets = new WeakMap<THREE.Object3D, THREE.RenderTarget>();

/** Call once, right after `renderer.init()`: before it, `refreshEnvironment` does nothing. */
export function initEnvironment(renderer: THREE.WebGPURenderer): void {
  const scene = new THREE.Scene();
  const dome = createSkyDome(0, 0, ENV_DOME);
  const physical = createPhysicalSky();
  physical.scale.setScalar(ENV_SKY_SCALE);
  physical.showSunDisc.value = 0; // the sun disc would be a hot spot in the blur
  scene.add(dome, physical);
  rig = { generator: new THREE.PMREMGenerator(renderer), scene, dome, physical };
}

/**
 * Captures `look` (the painted dome, or the physical sky when it has one) into `scene.environment`
 * and sets `environmentIntensity`. Renders six faces at 128 px: call when the preset changes (or a
 * few times a second in a blend), never every frame. The previous map is freed.
 */
export function refreshEnvironment(
  scene: THREE.Scene,
  look: SkyLook,
  sun: { x: number; y: number; z: number },
): void {
  scene.environmentIntensity = look.environment;
  if (!rig) return;
  paintSkyDome(rig.dome, look.skyTop, look.skyHorizon);
  rig.dome.visible = !look.sky;
  rig.physical.visible = !!look.sky;
  if (look.sky) setPhysicalSky(rig.physical, look.sky, sun);
  const target = rig.generator.fromScene(rig.scene, 0, 0.1, FAR, { size: SIZE });
  targets.get(scene)?.dispose();
  targets.set(scene, target);
  scene.environment = target.texture;
}

/** Frees a scene's environment map (called when the scene is disposed). */
export function releaseEnvironment(root: THREE.Object3D): void {
  targets.get(root)?.dispose();
  targets.delete(root);
  if (root instanceof THREE.Scene) root.environment = null;
}
