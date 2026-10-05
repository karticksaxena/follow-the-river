import type * as THREE from 'three/webgpu';
import { VOLUME_LAYER } from '../../engine/volume';
import type { DreamContext } from '../types';
import type { Systems } from './run';
import { DAY_TUNING } from './zombies/brain';

/** `compileAsync` skips objects off the camera's layers, so compile the mist box with only its layer on. */
export async function compileMist(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<void> {
  const mask = camera.layers.mask;
  camera.layers.set(VOLUME_LAYER);
  try {
    await renderer.compileAsync(scene, camera);
  } finally {
    camera.layers.mask = mask;
  }
}

/** The warm-up's zombies: one per outfit (the pool's first 13 bodies), in rows 3-8 m ahead. Tuning knobs. */
const WARM_BODIES = 13;
const WARM_ROW = 5;
const WARM_NEAR = 3;
const WARM_ROW_GAP = 1.8;
const WARM_SPREAD = 1.4;
/** The orca stands this far ahead and this far to the side of the camera while it compiles. */
const WARM_ORCA = { ahead: 6, side: 3 };

/** Metres `ahead` and `side` of the camera on the ground plane (camera looks down -z at yaw 0). */
function ahead(camera: THREE.Camera, d: number, side: number, out: { x: number; z: number }): void {
  const yaw = camera.rotation.y;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  out.x = camera.position.x - sin * d + cos * side;
  out.z = camera.position.z - cos * d - sin * side;
}

/** Every viewmodel (the bow and each gun, owned or not) on, so their materials compile; returns the undo. */
function showViewmodels(sys: Systems): () => void {
  const views = [sys.bow.view, ...Object.values(sys.armory.guns).map((g) => g.view)];
  const before = views.map((v) => v.visible);
  for (const v of views) v.visible = true;
  return () => views.forEach((v, i) => (v.visible = before[i]));
}

/**
 * Compiles the night's shaders and shadow passes while the screen is black: every zombie outfit,
 * the orca and the viewmodels in view under the night light, the torch on, then two real frames.
 * The stage skips its own frames throughout (`hold`), so the page stays responsive while the GPU
 * compiles. Never throws: a failed warm-up only means a hitch later.
 */
export async function warmNight(sys: Systems, battery: number): Promise<void> {
  const { stage } = sys.ctx;
  const { camera } = stage;
  const at = { x: 0, z: 0 };
  stage.hold = true;
  const undoViews = showViewmodels(sys);
  let undoOrca: (() => void) | undefined;
  try {
    for (let i = 0; i < WARM_BODIES; i++) {
      const col = (i % WARM_ROW) - (WARM_ROW - 1) / 2;
      ahead(camera, WARM_NEAR + Math.floor(i / WARM_ROW) * WARM_ROW_GAP, col * WARM_SPREAD, at);
      sys.horde.spawn(at.x, at.z, camera.rotation.y, DAY_TUNING);
    }
    ahead(camera, WARM_ORCA.ahead, WARM_ORCA.side, at);
    undoOrca = sys.fish.warmShow(at.x, at.z);
    sys.flashlight.apply(battery, 0); // the torch's intensity is set by its update, which the hold skips
    await stage.renderer.compileAsync(stage.scene, camera);
    await compileMist(stage.renderer, stage.scene, camera);
    stage.renderOnce(); // the first draws build the shadow passes
    stage.renderOnce();
  } catch {
    // keep going: the first night frames will compile what is missing
  } finally {
    undoOrca?.();
    undoViews();
    sys.horde.reset(); // park the bodies so the wave starts clean
    stage.hold = false;
  }
}

/** Shows `pages` now and resolves when the player has closed them (at once if none) and `warm` is done. */
export async function readWhileWarming(
  ctx: Pick<DreamContext, 'read'>,
  pages: readonly string[],
  warm: Promise<void>,
): Promise<void> {
  const read = new Promise<void>((done) => {
    if (pages.length > 0) ctx.read(pages, done);
    else done();
  });
  await Promise.all([read, warm]);
}
