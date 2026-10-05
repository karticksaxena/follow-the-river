import type * as THREE from 'three/webgpu';
import type { Stage } from '../../engine/stage';
import { VOLUME_LAYER } from '../../engine/volume';
import type { DreamContext } from '../types';
import { waterlineX } from './banks';
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

/** The warm-up's zombies: one per outfit (the pool's first 13 bodies), in rows on the bank. Tuning knobs. */
const WARM_BODIES = 13;
const WARM_ROW = 5;
const WARM_NEAR = 2;
const WARM_ROW_GAP = 1.2;
const WARM_SPREAD = 1.4;
/** The camera stands this far from the waterline; the orca this far out in the water. */
const WARM_STAND_OFF = 7;
const WARM_ORCA_OUT = 3;
/** Looking toward the river (+x), a little down so the water fills the view. */
const WARM_YAW = -Math.PI / 2;
const WARM_PITCH = -0.2;
/** Real loop frames drawn behind black: the torch, motion, shadows and the water reflection all run. */
const WARM_FRAMES = 25;

/** Resolves after the stage's loop has run `n` frames. */
function frames(stage: Stage, n: number): Promise<void> {
  return new Promise((done) => {
    let left = n;
    const stop = stage.addUpdater(() => {
      if (--left > 0) return;
      stop();
      done();
    });
  });
}

/** Every viewmodel (the bow and each gun, owned or not) on, so their materials compile; returns the undo. */
function showViewmodels(sys: Systems): () => void {
  const views = [sys.bow.view, ...Object.values(sys.armory.guns).map((g) => g.view)];
  const before = views.map((v) => v.visible);
  for (const v of views) v.visible = true;
  return () => views.forEach((v, i) => (v.visible = before[i]));
}

/** Stands the camera on the bank facing the river; returns the undo (exact position and rotation). */
function faceRiver(camera: THREE.PerspectiveCamera, waterline: number): () => void {
  const { x, y, z } = camera.position;
  const { x: rx, y: ry, z: rz } = camera.rotation;
  camera.position.set(waterline - WARM_STAND_OFF, y, z);
  camera.rotation.set(WARM_PITCH, WARM_YAW, 0, 'YXZ');
  return () => {
    camera.position.set(x, y, z);
    camera.rotation.set(rx, ry, rz, 'YXZ');
  };
}

/**
 * Compiles the night's shaders and shadow passes while the screen is black. Every zombie outfit on
 * the bank, the orca at the water's edge and the viewmodels are in view under the night light with
 * the torch on, the camera facing the river (so the planar reflection draws them too). `compileAsync`
 * runs with the stage held; then the real loop runs WARM_FRAMES frames (the run is frozen, but the
 * torch, motion and shadows update), and Auto quality ignores them. Never throws: a failed warm-up
 * only means a hitch later.
 */
export async function warmNight(sys: Systems, battery: number): Promise<void> {
  const { stage } = sys.ctx;
  const { camera } = stage;
  const water = waterlineX(sys.area.bank);
  stage.hold = true;
  stage.warming = true;
  const undoCamera = faceRiver(camera, water);
  const undoViews = showViewmodels(sys);
  let undoOrca: (() => void) | undefined;
  try {
    for (let i = 0; i < WARM_BODIES; i++) {
      const col = (i % WARM_ROW) - (WARM_ROW - 1) / 2;
      const x = camera.position.x + WARM_NEAR + Math.floor(i / WARM_ROW) * WARM_ROW_GAP;
      sys.horde.spawn(x, camera.position.z + col * WARM_SPREAD, WARM_YAW, DAY_TUNING);
    }
    undoOrca = sys.fish.warmShow(water + WARM_ORCA_OUT, camera.position.z);
    sys.flashlight.apply(battery, 0);
    await stage.renderer.compileAsync(stage.scene, camera);
    await compileMist(stage.renderer, stage.scene, camera);
    stage.hold = false;
    await frames(stage, WARM_FRAMES);
  } catch {
    // keep going: the first night frames will compile what is missing
  } finally {
    stage.hold = true; // nothing draws between the undo and the return
    undoOrca?.();
    undoViews();
    undoCamera();
    sys.horde.reset(); // park the bodies so the wave starts clean
    stage.hold = false;
    stage.warming = false;
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
