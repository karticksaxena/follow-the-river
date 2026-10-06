import * as THREE from 'three/webgpu';
import { createSkyDome, paintSkyDome } from './sky';

/** What `refreshEnvironment` needs from a lighting preset (the engine knows nothing of the game's presets). */
export interface SkyLook {
  skyTop: number;
  skyHorizon: number;
  environment: number;
}

const SIZE = 128;
const ENV_DOME = 60;
const FAR = 100;

/** The sky captured into a cube map and blurred (PMREM) lights every material: image-based light. */
interface Rig {
  generator: THREE.PMREMGenerator;
  scene: THREE.Scene;
  dome: THREE.Mesh;
}

let rig: Rig | null = null;
const targets = new WeakMap<THREE.Object3D, THREE.RenderTarget>();

/** Call once, right after `renderer.init()`: before it, `refreshEnvironment` does nothing. */
export function initEnvironment(renderer: THREE.WebGPURenderer): void {
  const scene = new THREE.Scene();
  const dome = createSkyDome(0, 0, ENV_DOME);
  scene.add(dome);
  warmed = false;
  rig = { generator: new THREE.PMREMGenerator(renderer), scene, dome };
}

/**
 * Captures `look` (always the painted gradient: it is continuous through the dawn, where the physical
 * sky is not, and a blurred sky has no use for the sun's glare) into `scene.environment`
 * and sets `environmentIntensity`. Renders six faces at 128 px: call when the preset changes (or a
 * few times a second in a blend), never every frame. The previous map is freed.
 */
export function refreshEnvironment(
  scene: THREE.Scene,
  look: SkyLook,
  top: THREE.ColorRepresentation = look.skyTop,
  horizon: THREE.ColorRepresentation = look.skyHorizon,
): void {
  scene.environmentIntensity = look.environment;
  if (!rig) return;
  paintSkyDome(rig.dome, top, horizon);
  // Re-render into the scene's existing target: a new texture would change every lit material's
  // environment node, so three recompiled the whole scene on each refresh (night falling, every
  // step of the sunrise): the "freezes" at waves and dawn. Same texture, new pixels: no recompile.
  const kept = targets.get(scene);
  const target = rig.generator.fromScene(rig.scene, 0, 0.1, FAR, {
    size: SIZE,
    ...(kept ? { renderTarget: kept } : {}),
  });
  if (target === kept) return;
  kept?.dispose();
  targets.set(scene, target);
  scene.environment = target.texture;
}

let warmed = false;

/**
 * Builds the PMREM programs once (a throwaway capture of the rig's dome, touching no scene). They do
 * not depend on the look, so one warm-up behind black makes every later `refreshEnvironment` in play
 * free of compiles (on WebGL 2 each program links in the frame that first uses it). No-op after that.
 */
export function warmEnvironment(): void {
  if (!rig || warmed) return;
  warmed = true;
  rig.generator.fromScene(rig.scene, 0, 0.1, FAR, { size: SIZE }).dispose();
}

/** Frees a scene's environment map (called when the scene is disposed). */
export function releaseEnvironment(root: THREE.Object3D): void {
  targets.get(root)?.dispose();
  targets.delete(root);
  if (root instanceof THREE.Scene) root.environment = null;
}
