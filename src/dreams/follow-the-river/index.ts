import * as THREE from 'three/webgpu';
import { boxAt, type Box } from '../../engine/collide';
import { enableShadows } from '../../engine/models';
import { flickerOn, shakeAt, stingBuffer } from '../../engine/scare';
import type { DreamContext, DreamModule } from '../types';
import { createFlashlight, FLASHLIGHT } from './flashlight';
import { applyLighting, createWorldLights, LIGHTING, SKY_NAME } from './lighting';
import { addRiver, EDGE_X, OVERRUN, plane, RIVER_WIDTH, RIVER_X } from './river';
import { addSkyline } from './skyline';
import { loadWatcherFigure, shouldStrike, WATCHER, type WatcherState } from './watcher';

/** How hard the camera rolls during a scare jolt, in radians. Tuning knob. */
const JOLT_ROLL = 0.06;
const SPAWN = { x: 0, z: 0, yaw: 0 } as const;
const BANK_LENGTH = 120;

/** Grey-box crates: [x, z, size]. Plan 1 placeholders; Task 16 rewrites this dream. */
const CRATES: ReadonlyArray<readonly [number, number, number]> = [
  [-2, -6, 1.2],
  [1.5, -11, 1],
  [-3.5, -17, 1.6],
  [0.5, -24, 1.1],
  [-1.5, -32, 1.4],
];

function testColliders(): Box[] {
  const middle = -BANK_LENGTH / 2 + 10;
  return [
    ...CRATES.map(([x, z, size]) => boxAt(x, z, size, size)),
    boxAt(RIVER_X, middle, RIVER_WIDTH, BANK_LENGTH),
    boxAt(-8, middle, 2, BANK_LENGTH),
    boxAt(0, 11, 24, 2),
    boxAt(0, -BANK_LENGTH + 9, 24, 2),
  ];
}

async function buildTestScene(): Promise<THREE.Scene> {
  const scene = new THREE.Scene();
  applyLighting(createWorldLights(scene), LIGHTING.night);
  const fromZ = 10;
  const toZ = fromZ - BANK_LENGTH;
  const ground = plane(120, fromZ - toZ + 2 * OVERRUN, 0x2b2f24);
  ground.position.set(EDGE_X - 60, 0, (fromZ + toZ) / 2);
  scene.add(ground);
  addRiver(scene, fromZ, toZ);
  await addSkyline(scene, 'city', fromZ, toZ);
  const material = new THREE.MeshLambertMaterial({ color: 0x4a3b2a });
  for (const [x, z, size] of CRATES) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
    crate.position.set(x, size / 2, z);
    enableShadows(crate);
    scene.add(crate);
  }
  return scene;
}

/** Plan 1 test dream: walking, collisions, darkness, the flashlight and one scare. Plan 2 replaces it. */
export function createDream(): DreamModule {
  let flashlight: THREE.SpotLight | null = null;
  let stop: (() => void) | null = null;
  let camera: THREE.Camera | null = null;
  let disposed = false;
  return {
    async start(ctx: DreamContext) {
      const scene = await buildTestScene();
      if (disposed) return;
      const view = ctx.stage.camera;
      camera = view;
      scene.add(view);
      ctx.stage.scene = scene;
      const sky = scene.getObjectByName(SKY_NAME);
      ctx.player.setColliders(testColliders());
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
