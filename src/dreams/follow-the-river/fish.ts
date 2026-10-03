import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import type { AudioBus } from '../../engine/audio';
import { loadModel, loadSkinned, type SkinnedAsset } from '../../engine/models';
import type { Vec3 } from '../../engine/ray';
import { characterUrl, propUrl } from './kits';
import { EDGE_X, RIVER_X } from './river';
import type { Sounds } from './sounds';
import type { Horde } from './zombies/horde';
import { SPAWNER } from './zombies/spawner';

export const FISH = {
  strikesPerPack: 3,
  baseStrikes: 2,
  reach: 3.5,
  cooldown: 1.4,
  follow: 2.5,
};

// Tuning knobs (metres, seconds).
const WATER_Y = -0.15;
const CRUISE_Y = -1.1; // only the ~1.45 m dorsal fin clears the water
const STRIKE_PEAK_Y = 0.4;
const TAKE_PEAK_Y = -0.2;
const STRIKE_TIME = 1;
const TAKE_TIME = 2.6;
const FADE = 0.25;
const LAG_Z = 4;
const WEAVE_X = 1.5;
const THROW_RANGE = 1.5;
const PACK_DISTANCE = 4;
const PACK_TIME = 1;
const PACK_ARC = 1.2;
const SHADOW_OPACITY = 0.35;
const CAPACITY = Math.max(32, SPAWNER.cap);
const MIN_SWIM_SPEED = 0.3; // m/s along the river before the heading follows motion
const MAX_LEAN = 0.25;

export function strikesFor(fed: number): number {
  return FISH.baseStrikes + fed * FISH.strikesPerPack;
}

/** The zombie to take: alive, within `reach` of the edge, nearest to the player. */
export function pickStrike(
  candidates: ArrayLike<number>,
  count: number,
  player: { x: number; z: number },
  edgeX: number,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const x = candidates[i * 3 + 1];
    if (edgeX - x > FISH.reach) continue;
    const dx = x - player.x;
    const dz = candidates[i * 3 + 2] - player.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidates[i * 3];
    }
  }
  return best;
}

/** Within 1.5 m of the edge and holding a pack. */
export function canThrow(x: number, edgeX: number, fishPacks: number): boolean {
  return fishPacks > 0 && edgeX - x <= THROW_RANGE;
}

export interface Fish {
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

/** Yaw for velocity (vx, vz): along the river while swimming, else resting downstream (-Z). */
export function cruiseHeading(vx: number, vz: number): number {
  if (Math.abs(vz) < MIN_SWIM_SPEED) return 0;
  const lean = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, Math.atan2(vx, Math.abs(vz))));
  return vz < 0 ? -lean : Math.PI + lean;
}

const smooth = (s: number): number => s * s * (3 - 2 * s);

function turnToward(current: number, target: number, amount: number): number {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * Math.min(1, amount);
}

function findClip(clips: readonly THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const clip = clips.find((c) => c.name === name);
  if (!clip) throw new Error(`orca.glb has no ${name} clip`);
  return clip;
}

function makeShadow(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, '#000');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const material = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas),
    color: 0x000000,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(3, 8, 1); // rotated by yaw below: long axis follows the orca's body (z)
  mesh.renderOrder = 1;
  return mesh;
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
}

/** All mutable orca state; the functions below operate on it (keeps each under 50 lines). */
interface FishState {
  readonly scene: THREE.Scene;
  readonly root: THREE.Group;
  readonly body: THREE.Object3D;
  readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly packModel: THREE.Object3D;
  readonly splashAt: THREE.Object3D;
  readonly splash: THREE.PositionalAudio;
  readonly mixer: THREE.AnimationMixer;
  readonly swim: THREE.AnimationAction;
  readonly lunge: THREE.AnimationAction;
  readonly buffer: Float32Array;
  readonly packFrom: THREE.Vector3;
  readonly packTo: THREE.Vector3;
  readonly collect: (id: number, x: number, z: number) => void;
  count: number;
  time: number;
  strikes: number;
  cooldown: number;
  placed: boolean;
  yaw: number;
  rise: Rise | null;
  packT: number; // <0: no pack in flight
  takePending: boolean;
}

function playSplash(f: FishState, x: number, z: number): void {
  f.splashAt.position.set(x, WATER_Y, z);
  if (f.splash.isPlaying) f.splash.stop();
  f.splash.play();
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
    ...r,
  };
  f.rise = rise;
  if (rise.lunge) {
    f.lunge.reset().play();
    f.lunge.crossFadeFrom(f.swim, FADE, false);
  }
}

function endRise(f: FishState): void {
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
  f.root.position.set(x, CRUISE_Y + (r.peak - CRUISE_Y) * Math.sin(Math.PI * s), z);
  if (!r.done && s >= 0.5) {
    r.done = true;
    if (r.victim >= 0) horde?.takeByFish(r.victim);
    playSplash(f, x, z);
  }
  if (s >= 1) endRise(f);
}

function cruise(f: FishState, dt: number, player: { x: number; z: number }): void {
  const pos = f.root.position;
  const targetZ = player.z - LAG_Z;
  const targetX = RIVER_X - 2 + Math.sin(f.time * 0.4) * WEAVE_X;
  const dz = targetZ - pos.z;
  const stepZ = Math.sign(dz) * Math.min(Math.abs(dz), FISH.follow * dt);
  const x = pos.x + (targetX - pos.x) * Math.min(1, 2 * dt);
  const dx = x - pos.x;
  f.yaw = turnToward(f.yaw, cruiseHeading(dx / dt, stepZ / dt), 3 * dt);
  const y = pos.y + (CRUISE_Y - pos.y) * Math.min(1, 3 * dt);
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

function placeShadow(f: FishState): void {
  f.shadow.position.set(f.root.position.x, WATER_Y + 0.02, f.root.position.z);
  f.shadow.rotation.set(-Math.PI / 2, f.yaw, 0, 'YXZ');
  f.shadow.visible = f.root.position.y < 0.2;
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

function updateFish(
  f: FishState,
  dt: number,
  player: { x: number; z: number },
  horde: Horde | null,
  night: boolean,
): void {
  f.time += dt;
  f.mixer.update(dt);
  if (!f.placed) {
    f.placed = true;
    f.root.position.set(RIVER_X - 2, CRUISE_Y, player.z - LAG_Z);
  }
  f.cooldown = Math.max(0, f.cooldown - dt);
  if (f.packT >= 0) stepPack(f, dt);
  if (f.rise) stepRise(f, f.rise, dt, horde);
  else {
    if (f.takePending) startTake(f);
    else if (night && f.strikes > 0 && f.cooldown === 0 && horde) tryStrike(f, player, horde);
    if (!f.rise) cruise(f, dt, player);
  }
  f.root.rotation.y = f.yaw;
  placeShadow(f);
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
}

/** Frees the orca's own resources, including its shadow plane's geometry, material and texture. */
function disposeFish(f: FishState): void {
  if (f.splash.isPlaying) f.splash.stop();
  f.splashAt.remove(f.splash);
  f.mixer.stopAllAction();
  f.mixer.uncacheRoot(f.body);
  f.scene.remove(f.root, f.shadow, f.packModel, f.splashAt);
  f.shadow.geometry.dispose();
  f.shadow.material.map?.dispose();
  f.shadow.material.dispose();
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
  root.add(body);
  const shadow = makeShadow();
  scene.add(root, shadow);
  packModel.visible = false;
  scene.add(packModel);
  const splashAt = new THREE.Object3D();
  scene.add(splashAt);
  const splash = audio.positional(splashAt, 4);
  splash.setBuffer(sounds.splash);
  splash.setVolume(1);
  const { mixer, swim, lunge } = makeClips(body, asset);
  const buffer = new Float32Array(CAPACITY * 3);
  const f: FishState = {
    scene,
    root,
    body,
    shadow,
    packModel,
    splashAt,
    splash,
    mixer,
    swim,
    lunge,
    buffer,
    packFrom: new THREE.Vector3(),
    packTo: new THREE.Vector3(),
    collect: (id, x, z) => collectZombie(f, id, x, z),
    count: 0,
    time: 0,
    strikes: 0,
    cooldown: 0,
    placed: false,
    yaw: 0,
    rise: null,
    packT: -1,
    takePending: false,
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
