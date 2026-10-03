import type * as THREE from 'three/webgpu';
import type { DreamContext, DreamModule } from '../types';
import { createFlashlight } from './flashlight';
import { buildRiverbank, riverbankColliders, SKY_NAME, SPAWN } from './riverbank';

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
      const sky = scene.getObjectByName(SKY_NAME);
      ctx.player.colliders = riverbankColliders();
      ctx.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
      const light = createFlashlight(camera);
      flashlight = light;
      let toldAboutLight = false;
      stop = ctx.stage.addUpdater(() => {
        // Keep the sky centred on the player so it never ends, wherever they walk.
        sky?.position.set(ctx.stage.camera.position.x, 0, ctx.stage.camera.position.z);
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
