import type * as THREE from 'three/webgpu';
import { frames } from '../../engine/frames';
import type { Stage } from '../../engine/stage';
import { VOLUME_LAYER } from '../../engine/volume';
import type { DreamContext } from '../types';
import type { PickupDef, PickupKind } from './areas/types';
import { waterlineX } from './banks';
import type { Run, Systems } from './run';
import { DAY_TUNING } from './zombies/brain';
import type { Horde, PlayerSense } from './zombies/horde';

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

/** The warm-up's zombies: one per outfit (the pool's first 13 bodies), in a line down the bank. Tuning knobs. */
const WARM_BODIES = 13;
const WARM_GAP = 2.5;
const WARM_NEAR = 2;
/** The key light's shadow casters are the 4 nearest bodies: the sense walks down the line so every outfit casts once. */
const CAST_SPOTS = [1.5, 5.5, 9.5, 11.5];
/** The camera stands this far from the waterline; the orca this far out in the water. */
const WARM_STAND_OFF = 7;
const WARM_ORCA_OUT = 3;
/** Headings (rad, 'YXZ'): the river (+x), downstream, the land, upstream; a little down so the water fills the view. */
const HEADINGS = [-Math.PI / 2, 0, Math.PI / 2, Math.PI] as const;
const WARM_PITCH = -0.2;
/** Real loop frames drawn behind black per pose: the torch, motion, shadows and the water reflection all run. */
const POSE_FRAMES = 2;
/** Then a few more in the player's own view (what faces downstream: lamp glows, sky discs, the AO pass). */
const VIEW_FRAMES = 4;
/** The warm-up stops posing this long (ms) after its real frames began (the compile before them takes what it takes; the first pose always draws): a slow machine must still get in quickly. */
const BUDGET_MS = 4000;
/** The pickups, the arrow and the splash show this far (m) ahead of the camera. */
const SHOW_AHEAD = 3;

const PICKUP_KINDS: readonly PickupKind[] = [
  'battery',
  'arrows',
  'fishPack',
  'tape',
  'ammo',
  'gun',
  'crate',
];

type Undo = () => void;

/** Phase times (ms) of one warm-up. */
export type WarmTimes = Record<string, number>;

/** Records `name`: ms since `t0`. */
export function mark(times: WarmTimes, name: string, t0: number): void {
  times[name] = Math.round(performance.now() - t0);
}

/** DEV: `window.__kdWarm` lists every warm-up's phase times (ms), newest last: [{ kind, compile, frames, total }]. */
export function logWarm(kind: string, times: WarmTimes): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const log: unknown = Reflect.get(window, '__kdWarm');
  const list = Array.isArray(log) ? log : [];
  list.push({ kind, ...times });
  Object.assign(window, { __kdWarm: list });
}

/** Every viewmodel (the bow and each gun, owned or not) on, so their materials compile. */
function showViewmodels(sys: Systems): Undo {
  const views = [sys.bow.view, ...Object.values(sys.armory.guns).map((g) => g.view)];
  const before = views.map((v) => v.visible);
  for (const v of views) v.visible = true;
  return () => views.forEach((v, i) => (v.visible = before[i]));
}

/**
 * Nothing in the scene is frustum-culled: the camera never sees the whole area at once, but every
 * material, in the main, shadow and reflection passes, must compile now. Returns the undo.
 */
export function unculled(root: THREE.Object3D): Undo {
  const changed: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!o.frustumCulled) return;
    o.frustumCulled = false;
    changed.push(o);
  });
  return () => {
    for (const o of changed) o.frustumCulled = true;
  };
}

/** The sound is off while the warm-up fires and growls things; returns the undo. */
function hush(sys: Systems): Undo {
  const { listener } = sys.ctx.audio;
  const volume = listener.getMasterVolume();
  listener.setMasterVolume(0);
  return () => listener.setMasterVolume(volume);
}

/** The torch on (by day too: its shadow pass compiles now, not at the first dusk); returns the undo. */
function torchOn(sys: Systems, battery: number): Undo {
  const { flashlight } = sys;
  const was = flashlight.on;
  flashlight.on = true;
  flashlight.apply(battery, 0);
  return () => {
    flashlight.on = was;
    flashlight.apply(battery, 0);
  };
}

/** The run is held (gameplay does not tick) while the warm-up draws; returns the undo. */
function holdRun(run: Pick<Run, 'frozen'>): Undo {
  const { frozen } = run;
  run.frozen = true;
  return () => void (run.frozen = frozen);
}

/** One of every pickup template in a row ahead of the camera (the crate, the halo, the gun…); returns the undo. */
function showPickups(
  sys: Systems,
  run: Pick<Run, 'pickups' | 'taken'>,
  at: { x: number; z: number },
): Undo {
  const list = PICKUP_KINDS.map((kind, i): PickupDef => ({
    id: `warm-${kind}`,
    kind,
    x: at.x + SHOW_AHEAD,
    z: at.z + (i - 3) * 1.2,
  }));
  sys.pickups.place(list, new Set());
  sys.pickups.update(0, at);
  return () => {
    sys.pickups.place(run.pickups, run.taken);
    sys.pickups.update(0, at);
  };
}

/** The whole sky on (the dawn's physical sky, sun disc, halo, moon, stars) so none compiles mid-cinematic; returns the undo. */
function showSky(sys: Systems): Undo {
  const { disc, halo, moon, stars, physical } = sys.world.lights;
  const parts = [disc, halo, moon, stars, physical];
  const before = parts.map((p) => p.visible);
  for (const p of parts) p.visible = true;
  return () => parts.forEach((p, i) => (p.visible = before[i] ?? false));
}

const UP = { x: 0, y: 1, z: 0 };

/** The arrow in flight and a big splash, so their materials and particles compile; returns the undo. */
function showEffects(sys: Systems, at: THREE.Vector3): Undo {
  const eye = { x: at.x, y: at.y, z: at.z };
  sys.bow.fire(eye, UP);
  sys.bow.update(0, sys.horde, sys.grid, eye); // shows the arrow (no time passes)
  sys.motion.burst(at.x + SHOW_AHEAD, 0.3, at.z, 40, 4.5);
  return () => sys.bow.reset();
}

const sense: PlayerSense = {
  x: 0,
  z: 0,
  eye: { x: 0, y: 0, z: 0 },
  look: { x: 0, y: 0, z: -1 },
  beamOn: false,
  beamRange: 0,
  beamHalfAngle: 0,
};
const noHit = (): void => undefined;

/** One zombie per outfit, in a line down the bank from the camera. */
function spawnOutfits(horde: Horde, at: THREE.Vector3): void {
  for (let i = 0; i < WARM_BODIES; i++) {
    horde.spawn(at.x + WARM_NEAR, at.z - i * WARM_GAP, 0, DAY_TUNING);
  }
}

/**
 * A frame per spot with the sense walking down the line: every outfit casts a key-light shadow in
 * turn. The horde only re-picks its casters every 0.5 s, and a reset rearms that, so each round
 * starts from a fresh line (the first update of a round always picks).
 */
async function castShadows(sys: Systems, at: THREE.Vector3): Promise<void> {
  for (const spot of CAST_SPOTS) {
    sys.horde.reset();
    spawnOutfits(sys.horde, at);
    sense.x = sense.eye.x = at.x + WARM_NEAR;
    sense.z = sense.eye.z = at.z - spot * WARM_GAP;
    sys.horde.update(0.016, sense, noHit);
    await frames(sys.ctx.stage, 1);
  }
}

/** Where the camera stands for each pose: where it is, the middle and the end (the lake's shore if there is one). */
function vantages(sys: Systems, full: boolean, z0: number): number[] {
  if (!full) return [z0];
  const { startZ, endZ, lake } = sys.area;
  return [z0, (startZ + endZ) / 2, lake ? lake.z + 6 : endZ + 4];
}

/** Stands the camera at (x, z) facing `yaw`. */
function pose(camera: THREE.PerspectiveCamera, x: number, z: number, yaw: number): void {
  camera.position.set(x, camera.position.y, z);
  camera.rotation.set(WARM_PITCH, yaw, 0, 'YXZ');
}

/** Exact position and rotation back; returns the undo. */
function keepCamera(camera: THREE.PerspectiveCamera): Undo {
  const { x, y, z } = camera.position;
  const { x: rx, y: ry, z: rz } = camera.rotation;
  return () => {
    camera.position.set(x, y, z);
    camera.rotation.set(rx, ry, rz, 'YXZ');
  };
}

export interface WarmOptions {
  /** The battery the torch warms with. */
  battery: number;
  /** All vantages and headings (the chapter start); false: one pose only (the night's second pass). */
  full: boolean;
  /** More to show while it draws (the ending's Mom, lights and pack); each returns its undo. */
  extras?: readonly (() => Undo)[];
}

/** Draws the poses (the first also casts every outfit's shadow); stops when the budget is spent. */
async function drawPoses(sys: Systems, x: number, opts: WarmOptions, f0: number): Promise<void> {
  const { stage } = sys.ctx;
  const headings = opts.full ? HEADINGS : HEADINGS.slice(0, 1);
  let first = true;
  for (const z of vantages(sys, opts.full, stage.camera.position.z)) {
    for (const yaw of headings) {
      if (!first && performance.now() - f0 > BUDGET_MS) return;
      pose(stage.camera, x, z, yaw);
      if (first) await castShadows(sys, stage.camera.position);
      first = false;
      await frames(stage, POSE_FRAMES);
    }
  }
}

/**
 * Compiles everything an area will ever draw while the screen is black, so nothing hitches in play.
 * It shows what the player has not met yet (every plant cell, one of each pickup, an arrow and a
 * splash, every zombie outfit, the orca, the viewmodels, the ending's Mom) with the torch on,
 * culling off and the sound off; compiles the main pass and the mist; warms the cinematic graph; then
 * draws real frames from several spots and headings (the shadow passes and the water's reflection
 * build only in real frames). Then everything goes back exactly. Auto quality ignores it. Never
 * throws: a failed warm-up only means a hitch later.
 */
export async function warmArea(
  sys: Systems,
  run: Pick<Run, 'frozen' | 'pickups' | 'taken'>,
  opts: WarmOptions,
): Promise<void> {
  const { stage } = sys.ctx;
  const { camera } = stage;
  const undo: Undo[] = [];
  const t0 = performance.now();
  const times: WarmTimes = {};
  stage.hold = true;
  stage.warming = true;
  try {
    undo.push(keepCamera(camera), holdRun(run), hush(sys), showViewmodels(sys));
    const water = waterlineX(sys.area.bank);
    pose(camera, water - WARM_STAND_OFF, camera.position.z, HEADINGS[0]);
    spawnOutfits(sys.horde, camera.position);
    undo.push(sys.fish.warmShow(water + WARM_ORCA_OUT, camera.position.z));
    const allPlants = sys.world.showAllPlants(); // every cell, for the compile only
    undo.push(torchOn(sys, opts.battery), showSky(sys));
    undo.push(showPickups(sys, run, camera.position), showEffects(sys, camera.position));
    for (const show of opts.extras ?? []) undo.push(show());
    undo.push(unculled(stage.scene));
    await stage.renderer.compileAsync(stage.scene, camera);
    await compileMist(stage.renderer, stage.scene, camera);
    stage.hold = false;
    mark(times, 'compile', t0);
    allPlants();
    undo.push(sys.world.showAllPlants(true)); // real frames: one cell per species, not the whole route
    stage.warmFocus(); // the depth-of-field graph builds here, not at the first cutscene
    await frames(stage, 3);
    await drawPoses(sys, camera.position.x, opts, performance.now());
    mark(times, 'frames', t0);
  } catch {
    // keep going: the first frames will compile what is missing
  } finally {
    stage.hold = true; // nothing draws between the undo and the return
    for (const u of undo.toReversed()) u();
    sys.horde.reset(); // park the bodies so the play starts clean
    stage.hold = false;
    await frames(stage, VIEW_FRAMES); // still behind black: the restored view compiles too
    stage.warming = false;
    mark(times, 'total', t0);
    logWarm('area', times);
  }
}

/**
 * Puts `scene` on the stage held (no frame draws it), runs `prepare` (a failure is ignored), then
 * `warm`: no frame ever draws the scene before its warm-up. The hold is always released.
 */
export async function enterWarm(
  stage: Pick<Stage, 'hold' | 'scene'>,
  scene: THREE.Scene,
  prepare: () => Promise<void>,
  warm: () => Promise<void>,
): Promise<void> {
  stage.hold = true;
  stage.scene = scene;
  try {
    await prepare();
  } catch {
    // the area still warms; the missing part builds in play
  }
  try {
    await warm();
  } finally {
    stage.hold = false;
  }
}

/** Shows `pages` now and resolves when the player has closed them (at once if none) and `warm` is done. */
export async function readWhileWarming(
  ctx: Pick<DreamContext, 'read' | 'overlay'>,
  pages: readonly string[],
  warm: Promise<void>,
): Promise<void> {
  const read = new Promise<void>((done) => {
    if (pages.length > 0) ctx.read(pages, done);
    else done();
  });
  await read;
  const stopLoading = ctx.overlay.loading(); // the pages are closed but the shaders are not ready
  await warm.finally(stopLoading);
}
