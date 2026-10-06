import * as THREE from 'three/webgpu';
import { frames, gpuIdle, revealInBatches } from '../../engine/frames';
import type { Pose, Ride } from './canoe-ride';
import { Vegetation } from './nature';
import { logWarm, mark, unculled, type WarmTimes } from './warm';

/** The ride's warm-up: frames drawn per spot along the river, and where the splash shows ahead of the camera (m). Tuning knobs. */
const SPOT_FRAMES = 2;
const EYE_HEIGHT = 1.5;
const SPLASH_AHEAD = 3;
/** Stop moving down the river this long (ms) after the real frames began (the compile before them takes what it takes; the first spot always draws). */
const BUDGET_MS = 3000;

type Undo = () => void;

/** Every plant cell on show, or `sample`: one per species (the cull follows the camera as the canoe moves); returns the undo. */
function showPlants(scene: THREE.Scene, sample: boolean): Undo {
  const undo: Undo[] = [];
  scene.traverse((o) => {
    if (o instanceof Vegetation) undo.push(o.showAll(sample));
  });
  return () => undo.forEach((u) => u());
}

/** Kartik, the calf and the paddle on show (the ride reveals them later); returns the undo. */
function showActors(r: Ride): Undo {
  const { cs } = r;
  const shown = [cs.kartik.group, cs.calf.root, cs.paddle];
  const before = shown.map((o) => o.visible);
  for (const o of shown) o.visible = true;
  return () => shown.forEach((o, i) => (o.visible = before[i] ?? false));
}

/** Exact camera position and rotation back; returns the undo. */
function keepCamera(camera: THREE.PerspectiveCamera): Undo {
  const { x, y, z } = camera.position;
  const { x: rx, y: ry, z: rz } = camera.rotation;
  return () => {
    camera.position.set(x, y, z);
    camera.rotation.set(rx, ry, rz, 'YXZ');
  };
}

/**
 * Compiles the whole ride while the screen is black and the loader shows: the scene is compiled with
 * the loop held (the loader's CSS keeps animating), then real frames are drawn from `spots` down the
 * river (sunrise lights, shadow cascades, the water's reflection, the sky, the banks' plants, Mom
 * rowing, Kartik, the calf, the paddle, the spray and the fireflies), all culling off. The stage gets
 * `previous` back; the ride's own `begin` puts its scene on. Never throws.
 */
export async function warmRide(
  r: Ride,
  previous: THREE.Scene,
  spots: readonly Pose[],
): Promise<void> {
  const { stage } = r.ctx;
  const { camera, renderer } = stage;
  const { cs } = r;
  const undo: Undo[] = [keepCamera(camera)];
  const t0 = performance.now();
  const times: WarmTimes = {};
  stage.hold = true;
  stage.warming = true;
  try {
    stage.scene = cs.scene;
    const allPlants = showPlants(cs.scene, false); // every cell, for the compile only
    undo.push(showActors(r), unculled(cs.scene));
    r.motion.env.tier = stage.tier;
    r.motion.burst(0, 0.3, 0, 40, 4.5);
    await renderer.compileAsync(cs.scene, camera);
    stage.hold = false;
    mark(times, 'compile', t0);
    allPlants();
    undo.push(showPlants(cs.scene, true)); // real frames: one cell per species, not the whole route
    await revealInBatches(stage);
    const f0 = performance.now();
    for (const at of spots) {
      if (at !== spots[0] && performance.now() - f0 > BUDGET_MS) break;
      camera.position.set(at.x, at.y + EYE_HEIGHT, at.z);
      camera.rotation.set(0, at.yaw + Math.PI, 0, 'YXZ');
      cs.sky.position.copy(camera.position);
      r.motion.burst(at.x, at.y, at.z - SPLASH_AHEAD, 10, 2.6);
      r.motion.update(0.016);
      await frames(stage, SPOT_FRAMES);
    }
  } catch {
    // keep going: the first frames of the ride will compile what is missing
  } finally {
    stage.hold = true; // nothing draws between the undo and the return
    for (const u of undo.toReversed()) u();
    stage.scene = previous;
    stage.hold = false;
    await gpuIdle(stage.renderer);
    stage.warming = false;
    mark(times, 'total', t0);
    logWarm('ride', times);
  }
}
