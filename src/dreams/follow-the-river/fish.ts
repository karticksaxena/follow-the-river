import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import type { AudioBus } from '../../engine/audio';
import { loadModel, loadSkinned, type SkinnedAsset } from '../../engine/models';
import type { Vec3 } from '../../engine/ray';
import {
  cruiseHeading,
  cruiseTargetX,
  cruiseYFor,
  findClip,
  FISH,
  makeWake,
  makeWet,
  nearestTo,
  nextSurfacing,
  pickStrike,
  SINK_TIME,
  sinkPose,
  smooth,
  SURFACE_TIME,
  surfaceRoll,
  surfaceYFor,
  topOf,
  turnToward,
  WAKE_SIZE,
} from './fish-parts';
import { characterUrl, propUrl } from './kits';
import { EDGE_X, WATER_Y } from './river';
import type { Sounds } from './sounds';
import type { Horde } from './zombies/horde';
import { SPAWNER } from './zombies/spawner';
export { canThrow, cruiseHeading, FISH, pickStrike, strikesFor } from './fish-parts';

// Tuning knobs (metres, seconds); heights are relative to the river's WATER_Y.
const STRIKE_PEAK_Y = WATER_Y + 0.55;
const TAKE_PEAK_Y = WATER_Y - 0.05;
const WAKE_HIDE_Y = WATER_Y + 0.35; // the orca is airborne above this: no shadow
const STRIKE_TIME = 1;
const TAKE_TIME = 2.6;
const FADE = 0.25;
const LAG_Z = 6;
const PACK_DISTANCE = 4;
const PACK_TIME = 1;
const PACK_ARC = 1.2;
const CAPACITY = Math.max(32, SPAWNER.cap);
// The ending: the last lunge takes this many at once, then the orca rolls over and sinks.
const FINALE_TAKES = 3;
const SINK_Y = WATER_Y - 3.85;
const SURFACE_DRIFT = 1.5; // metres downstream while surfacing
const SINK_DRIFT = 0.3; // m/s downstream while sinking

/** Where the ending has the orca: cruising/striking as usual, the last lunge, sinking, or gone. */
export type Finale = 'no' | 'lunge' | 'sink' | 'gone';

export interface Fish {
  /** The ending's state (read it each frame; it only moves forward). */
  readonly finale: Finale;
  /** The last lunge: takes up to three zombies at once, then it rolls over and sinks (6 s). */
  lastLunge(horde: Horde, player: { x: number; z: number }): void;
  /** Night: strikes left this phase. */
  readonly strikes: number;
  arm(strikes: number): void;
  /** Throw a pack: arc into the water, splash, the orca surfaces once to take it. */
  feed(from: Vec3): void;
  /** Swims alongside the player (fin just breaking the surface); strikes zombies at night. */
  update(dt: number, player: { x: number; z: number }, horde: Horde | null, night: boolean): void;
  reset(): void;
  dispose(): void;
}

interface Rise {
  t: number;
  dur: number;
  peak: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  lunge: boolean;
  victim: number; // horde id, or -1 when taking a pack
  done: boolean; // the mid-rise effect has fired
  surface: boolean; // a surfacing: blow at the top, slow roll
}

/** All mutable orca state; the functions below operate on it (keeps each under 50 lines). */
interface FishState {
  readonly scene: THREE.Scene;
  readonly root: THREE.Group;
  readonly body: THREE.Object3D;
  readonly wake: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly packModel: THREE.Object3D;
  readonly splashAt: THREE.Object3D;
  readonly splash: THREE.PositionalAudio;
  readonly blow: THREE.PositionalAudio;
  readonly cruiseY: number;
  readonly surfaceY: number;
  readonly mixer: THREE.AnimationMixer;
  readonly swim: THREE.AnimationAction;
  readonly lunge: THREE.AnimationAction;
  readonly buffer: Float32Array;
  readonly packFrom: THREE.Vector3;
  readonly packTo: THREE.Vector3;
  readonly collect: (id: number, x: number, z: number) => void;
  count: number;
  time: number;
  surfaceIn: number; // seconds until the next surfacing
  strikes: number;
  cooldown: number;
  placed: boolean;
  yaw: number;
  rise: Rise | null;
  packT: number; // <0: no pack in flight
  takePending: boolean;
  finale: Finale;
  sinkT: number;
  sinkFromY: number;
  /** Zombies the last lunge takes when it breaks the surface. */
  victims: number[];
}

function playSplash(f: FishState, x: number, z: number): void {
  f.splashAt.position.set(x, WATER_Y, z);
  if (f.splash.isPlaying) f.splash.stop();
  f.splash.play();
}

/** Plays at `splashAt`, which playSplash has just placed. */
function playBlow(f: FishState): void {
  if (f.blow.isPlaying) f.blow.stop();
  f.blow.play();
}

function startRise(
  f: FishState,
  r: Partial<Rise> & { toX: number; toZ: number; dur: number; peak: number },
): void {
  const rise: Rise = {
    t: 0,
    fromX: f.root.position.x,
    fromZ: f.root.position.z,
    lunge: false,
    victim: -1,
    done: false,
    surface: false,
    ...r,
  };
  f.rise = rise;
  if (rise.lunge) {
    f.lunge.reset().play();
    f.lunge.crossFadeFrom(f.swim, FADE, false);
  }
}

function endRise(f: FishState): void {
  f.root.rotation.z = 0;
  if (f.rise?.lunge) {
    f.swim.enabled = true;
    f.swim.crossFadeFrom(f.lunge, FADE, false);
  }
  f.rise = null;
}

function stepRise(f: FishState, r: Rise, dt: number, horde: Horde | null): void {
  r.t += dt;
  const s = Math.min(1, r.t / r.dur);
  const move = smooth(Math.min(1, s * 2));
  const x = r.fromX + (r.toX - r.fromX) * move;
  const z = r.fromZ + (r.toZ - r.fromZ) * move;
  const dx = x - f.root.position.x;
  const dz = z - f.root.position.z;
  if (dx * dx + dz * dz > 1e-6) f.yaw = turnToward(f.yaw, Math.atan2(-dx, -dz), 6 * dt);
  f.root.position.set(x, f.cruiseY + (r.peak - f.cruiseY) * Math.sin(Math.PI * s), z);
  if (r.surface) f.root.rotation.z = surfaceRoll(s);
  if (!r.done && s >= 0.5) {
    r.done = true;
    if (r.victim >= 0) horde?.takeByFish(r.victim);
    for (const id of f.victims) horde?.takeByFish(id);
    f.victims.length = 0;
    playSplash(f, x, z);
    if (r.surface) playBlow(f);
  }
  if (s >= 1) endRise(f);
}

function cruise(f: FishState, dt: number, player: { x: number; z: number }): void {
  const pos = f.root.position;
  const targetZ = player.z - LAG_Z;
  const targetX = cruiseTargetX(EDGE_X, f.time);
  const dz = targetZ - pos.z;
  const stepZ = Math.sign(dz) * Math.min(Math.abs(dz), FISH.follow * dt);
  const x = pos.x + (targetX - pos.x) * Math.min(1, 2 * dt);
  const dx = x - pos.x;
  f.yaw = turnToward(f.yaw, cruiseHeading(dx / dt, stepZ / dt), 3 * dt);
  const y = pos.y + (f.cruiseY - pos.y) * Math.min(1, 3 * dt);
  pos.set(x, y, pos.z + stepZ);
}

function tryStrike(f: FishState, player: { x: number; z: number }, horde: Horde): void {
  f.count = 0;
  horde.forEachAlive(f.collect);
  const id = pickStrike(f.buffer, f.count, player, EDGE_X);
  if (id === null) return;
  let zx = 0;
  let zz = 0;
  for (let i = 0; i < f.count; i++) {
    if (f.buffer[i * 3] === id) {
      zx = f.buffer[i * 3 + 1];
      zz = f.buffer[i * 3 + 2];
    }
  }
  f.strikes--;
  f.cooldown = FISH.cooldown;
  startRise(f, {
    toX: Math.max(zx, EDGE_X + 1),
    toZ: zz,
    dur: STRIKE_TIME,
    peak: STRIKE_PEAK_Y,
    lunge: true,
    victim: id,
  });
}

function stepPack(f: FishState, dt: number): void {
  f.packT += dt;
  const s = Math.min(1, f.packT / PACK_TIME);
  f.packModel.position.lerpVectors(f.packFrom, f.packTo, s);
  f.packModel.position.y += PACK_ARC * 4 * s * (1 - s);
  f.packModel.rotation.y += 6 * dt;
  if (s < 1) return;
  f.packT = -1;
  f.packModel.visible = false;
  playSplash(f, f.packTo.x, f.packTo.z);
  f.takePending = true;
}

function placeWake(f: FishState): void {
  // The V's tip sits by the fin and opens out behind the orca (its back is +z turned by yaw).
  const behind = WAKE_SIZE.length / 2 - 1;
  const { x, z } = f.root.position;
  f.wake.position.set(x + Math.sin(f.yaw) * behind, WATER_Y + 0.02, z + Math.cos(f.yaw) * behind);
  f.wake.rotation.set(-Math.PI / 2, f.yaw, 0, 'YXZ');
  f.wake.visible = f.root.position.y < WAKE_HIDE_Y && f.finale !== 'gone';
}

function startTake(f: FishState): void {
  f.takePending = false;
  startRise(f, {
    toX: f.packTo.x + 1.2,
    toZ: f.packTo.z + 1.5,
    dur: TAKE_TIME,
    peak: TAKE_PEAK_Y,
  });
}

function startSurface(f: FishState): void {
  const { x, z } = f.root.position;
  f.surfaceIn = nextSurfacing(Math.random());
  startRise(f, {
    toX: x,
    toZ: z - SURFACE_DRIFT,
    dur: SURFACE_TIME,
    peak: f.surfaceY,
    surface: true,
  });
}

function startFinale(f: FishState, horde: Horde, player: { x: number; z: number }): void {
  f.count = 0;
  horde.forEachAlive(f.collect);
  f.victims = nearestTo(f.buffer, f.count, FINALE_TAKES, player);
  let toX = EDGE_X + 1;
  let toZ = player.z;
  for (let i = 0; i < f.count; i++) {
    if (f.buffer[i * 3] !== f.victims[0]) continue;
    toX = Math.max(f.buffer[i * 3 + 1], EDGE_X + 1);
    toZ = f.buffer[i * 3 + 2];
  }
  if (f.rise) endRise(f);
  f.strikes = 0;
  f.takePending = false;
  f.finale = 'lunge';
  startRise(f, { toX, toZ, dur: STRIKE_TIME, peak: STRIKE_PEAK_Y, lunge: true });
}

function stepSink(f: FishState, dt: number): void {
  f.sinkT += dt;
  const { depth, roll } = sinkPose(f.sinkT);
  const pos = f.root.position;
  pos.set(pos.x, f.sinkFromY + (SINK_Y - f.sinkFromY) * depth, pos.z - SINK_DRIFT * dt);
  f.root.rotation.set(0, f.yaw, roll);
  if (f.sinkT < SINK_TIME) return;
  f.finale = 'gone';
  f.root.visible = false;
}

function updateFish(
  f: FishState,
  dt: number,
  player: { x: number; z: number },
  horde: Horde | null,
  night: boolean,
): void {
  // A zero-length frame (the first one, or right after a pause) would make cruise() divide 0 by 0:
  // the heading turned NaN for good and the orca was never drawn again.
  if (!(dt > 0)) return;
  f.time += dt;
  f.mixer.update(dt);
  if (!f.placed) {
    f.placed = true;
    f.root.position.set(cruiseTargetX(EDGE_X, 0), f.cruiseY, player.z - LAG_Z);
    f.surfaceIn = nextSurfacing(Math.random());
  }
  f.cooldown = Math.max(0, f.cooldown - dt);
  if (f.finale === 'sink') {
    stepSink(f, dt);
    placeWake(f);
    return;
  }
  if (f.packT >= 0) stepPack(f, dt);
  if (f.rise) stepRise(f, f.rise, dt, horde);
  else if (f.finale === 'lunge') {
    f.finale = 'sink'; // the lunge is over: it goes under for good
    f.sinkT = 0;
    f.sinkFromY = f.root.position.y;
  } else {
    if (f.takePending) startTake(f);
    else if (night && f.strikes > 0 && f.cooldown === 0 && horde) tryStrike(f, player, horde);
    if (!f.rise) {
      f.surfaceIn -= dt;
      if (f.surfaceIn <= 0 && f.finale === 'no') startSurface(f);
      else cruise(f, dt, player);
    }
  }
  if (f.finale !== 'sink') f.root.rotation.y = f.yaw;
  placeWake(f);
}

function feedFish(f: FishState, from: Vec3): void {
  f.packFrom.set(from.x, from.y, from.z);
  f.packTo.set(EDGE_X + PACK_DISTANCE, WATER_Y, from.z);
  f.packT = 0;
  f.packModel.visible = true;
  f.packModel.position.copy(f.packFrom);
}

function resetFish(f: FishState): void {
  f.strikes = 0;
  f.cooldown = 0;
  f.placed = false;
  f.packT = -1;
  f.takePending = false;
  f.packModel.visible = false;
  if (f.splash.isPlaying) f.splash.stop();
  if (f.rise?.lunge) {
    f.lunge.stop();
    f.swim.reset().play();
  }
  f.rise = null;
  f.root.rotation.z = 0;
  f.finale = 'no';
  f.surfaceIn = nextSurfacing(Math.random());
  f.victims.length = 0;
  f.root.visible = true;
  f.root.rotation.set(0, f.yaw, 0);
}

/** Frees the orca's own resources, including its wake plane's geometry, material and texture. */
function disposeFish(f: FishState): void {
  if (f.splash.isPlaying) f.splash.stop();
  if (f.blow.isPlaying) f.blow.stop();
  f.splashAt.remove(f.splash, f.blow);
  f.mixer.stopAllAction();
  f.mixer.uncacheRoot(f.body);
  f.scene.remove(f.root, f.wake, f.packModel, f.splashAt);
  f.wake.geometry.dispose();
  f.wake.material.map?.dispose();
  f.wake.material.dispose();
}

function makeClips(
  body: THREE.Object3D,
  asset: SkinnedAsset,
): Pick<FishState, 'mixer' | 'swim' | 'lunge'> {
  const mixer = new THREE.AnimationMixer(body);
  const swim = mixer.clipAction(findClip(asset.clips, 'Swim'));
  const lunge = mixer.clipAction(findClip(asset.clips, 'Lunge'));
  lunge.setLoop(THREE.LoopOnce, 1);
  lunge.clampWhenFinished = true;
  swim.play();
  return { mixer, swim, lunge };
}

function collectZombie(f: FishState, id: number, x: number, z: number): void {
  if (f.count >= CAPACITY) return;
  f.buffer[f.count * 3] = id;
  f.buffer[f.count * 3 + 1] = x;
  f.buffer[f.count * 3 + 2] = z;
  f.count++;
}

function createState(
  scene: THREE.Scene,
  audio: AudioBus,
  sounds: Sounds,
  asset: SkinnedAsset,
  packModel: THREE.Object3D,
): FishState {
  const root = new THREE.Group();
  const body = clone(asset.scene);
  body.traverse((n) => (n.frustumCulled = false));
  makeWet(body);
  const finTop = topOf(body);
  const cruiseY = cruiseYFor(finTop);
  root.add(body);
  const wake = makeWake();
  scene.add(root, wake);
  packModel.visible = false;
  scene.add(packModel);
  const splashAt = new THREE.Object3D();
  scene.add(splashAt);
  const splash = audio.positional(splashAt, 4);
  splash.setBuffer(sounds.splash);
  splash.setVolume(1);
  const blow = audio.positional(splashAt, 4);
  blow.setBuffer(sounds.blow);
  blow.setVolume(1);
  const { mixer, swim, lunge } = makeClips(body, asset);
  const buffer = new Float32Array(CAPACITY * 3);
  const f: FishState = {
    scene,
    root,
    body,
    wake,
    packModel,
    splashAt,
    splash,
    blow,
    cruiseY,
    surfaceY: surfaceYFor(finTop),
    mixer,
    swim,
    lunge,
    buffer,
    packFrom: new THREE.Vector3(),
    packTo: new THREE.Vector3(),
    collect: (id, x, z) => collectZombie(f, id, x, z),
    count: 0,
    time: 0,
    surfaceIn: nextSurfacing(Math.random()),
    strikes: 0,
    cooldown: 0,
    placed: false,
    yaw: 0,
    rise: null,
    packT: -1,
    takePending: false,
    finale: 'no',
    sinkT: 0,
    sinkFromY: cruiseY,
    victims: [],
  };
  return f;
}

export async function createFish(
  scene: THREE.Scene,
  audio: AudioBus,
  sounds: Sounds,
): Promise<Fish> {
  const [asset, packModel] = await Promise.all([
    loadSkinned(characterUrl('orca')),
    loadModel(propUrl('fishpack')),
  ]);
  const f = createState(scene, audio, sounds, asset, packModel);
  return {
    get finale() {
      return f.finale;
    },
    lastLunge: (horde, player) => startFinale(f, horde, player),
    get strikes() {
      return f.strikes;
    },
    arm(n) {
      f.strikes = n;
    },
    // A second feed() before the first pack lands replaces it (one pack in flight at a time).
    feed: (from) => feedFish(f, from),
    update: (dt, player, horde, night) => updateFish(f, dt, player, horde, night),
    reset: () => resetFish(f),
    dispose: () => disposeFish(f),
  };
}
