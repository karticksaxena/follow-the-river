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

/** Metres in front of the camera the two warm-up bodies stand (inside the torch's beam). */
const WARM_DISTANCE = 3;

/**
 * Compiles the night's shaders and shadow passes while the screen is black: two bodies in view
 * (both outfits) under the night light, the torch on, then two real frames. The stage skips its
 * own frames throughout (`hold`), so the page stays responsive while the GPU compiles. Never throws:
 * a failed warm-up only means a hitch later.
 */
export async function warmNight(sys: Systems, battery: number): Promise<void> {
  const { stage } = sys.ctx;
  const { camera } = stage;
  stage.hold = true;
  try {
    const sin = Math.sin(camera.rotation.y);
    const cos = Math.cos(camera.rotation.y);
    for (const side of [-0.8, 0.8]) {
      const x = camera.position.x - sin * WARM_DISTANCE + cos * side;
      const z = camera.position.z - cos * WARM_DISTANCE - sin * side;
      sys.horde.spawn(x, z, camera.rotation.y, DAY_TUNING);
    }
    sys.flashlight.apply(battery, 0); // the torch's intensity is set by its update, which the hold skips
    await stage.renderer.compileAsync(stage.scene, camera);
    await compileMist(stage.renderer, stage.scene, camera);
    stage.renderOnce(); // the first draws build the shadow passes
    stage.renderOnce();
  } catch {
    // keep going: the first night frames will compile what is missing
  } finally {
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
