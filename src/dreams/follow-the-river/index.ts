import type * as THREE from 'three/webgpu';
import type { DreamContext, DreamModule } from '../types';
import { createFlashlight } from './flashlight';
import { buildRiverbank, riverbankColliders, SPAWN } from './riverbank';

/** Plan 1 grey box: proves walking, collisions, darkness and the flashlight. Plan 2 replaces it. */
export function createDream(): DreamModule {
  let flashlight: THREE.SpotLight | null = null;
  let stop: (() => void) | null = null;
  let camera: THREE.Camera | null = null;
  return {
    async start(ctx: DreamContext) {
      const scene = await buildRiverbank();
      camera = ctx.stage.camera;
      scene.add(camera);
      ctx.stage.scene = scene;
      ctx.player.colliders = riverbankColliders();
      ctx.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
      const light = createFlashlight(camera);
      flashlight = light;
      let toldAboutLight = false;
      stop = ctx.stage.addUpdater(() => {
        // Drop key taps made while reading or paused, so they don't fire on resume.
        if (ctx.isPaused()) {
          ctx.keys.consumePress('KeyF');
          return;
        }
        if (ctx.keys.consumePress('KeyF')) light.visible = !light.visible;
        if (!toldAboutLight && camera && camera.position.z < -8) {
          toldAboutLight = true;
          ctx.read(['It is getting dark. Press F to turn your flashlight on or off.']);
        }
      });
    },
    dispose() {
      stop?.();
      if (flashlight && camera) camera.remove(flashlight, flashlight.target);
      camera?.removeFromParent();
    },
  };
}
