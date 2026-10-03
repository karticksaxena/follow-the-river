import type * as THREE from 'three/webgpu';
import { flickerOn, shakeAt, stingBuffer } from '../../engine/scare';
import type { DreamContext, DreamModule } from '../types';
import { createFlashlight, FLASHLIGHT } from './flashlight';
import { buildRiverbank, riverbankColliders, SKY_NAME, SPAWN } from './riverbank';
import { loadWatcherFigure, shouldStrike, WATCHER, type WatcherState } from './watcher';

/** How hard the camera rolls during a scare jolt, in radians. Tuning knob. */
const JOLT_ROLL = 0.06;

/** Plan 1 test dream: walking, collisions, darkness, the flashlight and one scare. Plan 2 replaces it. */
export function createDream(): DreamModule {
  let flashlight: THREE.SpotLight | null = null;
  let stop: (() => void) | null = null;
  let camera: THREE.Camera | null = null;
  let disposed = false;
  return {
    async start(ctx: DreamContext) {
      const scene = await buildRiverbank();
      if (disposed) return;
      const view = ctx.stage.camera;
      camera = view;
      scene.add(view);
      ctx.stage.scene = scene;
      const sky = scene.getObjectByName(SKY_NAME);
      ctx.player.colliders = riverbankColliders();
      ctx.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
      const light = createFlashlight(view);
      flashlight = light;
      const figure = await loadWatcherFigure();
      if (disposed) return;
      figure.position.set(WATCHER.x, 0, WATCHER.z);
      scene.add(figure);
      const sting = stingBuffer(ctx.audio.listener.context);
      let toldAboutLight = false;
      let watcher: WatcherState = 'waiting';
      let since = 0;
      stop = ctx.stage.addUpdater((dt) => {
        // Keep the sky centred on the player so it never ends, wherever they walk.
        sky?.position.set(view.position.x, 0, view.position.z);
        // Drop key taps made while reading or paused, so they don't fire on resume.
        if (ctx.isPaused()) {
          ctx.keys.consumePress('KeyF');
          return;
        }
        if (ctx.keys.consumePress('KeyF')) light.visible = !light.visible;
        if (!toldAboutLight && view.position.z < -8) {
          toldAboutLight = true;
          ctx.read(['It is getting dark. Press F to turn your flashlight on or off.']);
        }
        const distance = Math.hypot(view.position.x - WATCHER.x, view.position.z - WATCHER.z);
        if (shouldStrike(watcher, distance)) {
          watcher = 'struck';
          ctx.audio.once(sting, 0.9);
        }
        if (watcher !== 'struck') return;
        since += dt;
        figure.visible = since < WATCHER.vanishAfter;
        view.rotation.z = shakeAt(since) * JOLT_ROLL * Math.sin(since * 70);
        light.intensity = flickerOn(since) ? FLASHLIGHT.intensity : 0;
      });
    },
    dispose() {
      disposed = true;
      stop?.();
      if (flashlight && camera) camera.remove(flashlight, flashlight.target);
      camera?.rotation.set(0, camera.rotation.y, 0);
      camera?.removeFromParent();
    },
  };
}
