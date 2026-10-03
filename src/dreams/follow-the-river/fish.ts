import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import type { AudioBus } from '../../engine/audio';
import { loadModel, loadSkinned } from '../../engine/models';
import type { Vec3 } from '../../engine/ray';
import { characterUrl, propUrl } from './kits';
import { EDGE_X, RIVER_X } from './river';
import type { Sounds } from './sounds';
import type { Horde } from './zombies/horde';

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
const CAPACITY = 32;

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

export async function createFish(
  scene: THREE.Scene,
  audio: AudioBus,
  sounds: Sounds,
): Promise<Fish> {
  const [asset, packModel] = await Promise.all([
    loadSkinned(characterUrl('orca')),
    loadModel(propUrl('fishpack')),
  ]);
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

  const mixer = new THREE.AnimationMixer(body);
  const swim = mixer.clipAction(findClip(asset.clips, 'Swim'));
  const lunge = mixer.clipAction(findClip(asset.clips, 'Lunge'));
  lunge.setLoop(THREE.LoopOnce, 1);
  lunge.clampWhenFinished = true;
  swim.play();

  const buffer = new Float32Array(CAPACITY * 3);
  let count = 0;
  const collect = (id: number, x: number, z: number): void => {
    if (count >= CAPACITY) return;
    buffer[count * 3] = id;
    buffer[count * 3 + 1] = x;
    buffer[count * 3 + 2] = z;
    count++;
  };

  let time = 0;
  let strikes = 0;
  let cooldown = 0;
  let placed = false;
  let yaw = 0;
  let rise: Rise | null = null;
  let packT = -1; // <0: no pack in flight
  let takePending = false;
  const packFrom = new THREE.Vector3();
  const packTo = new THREE.Vector3();

  function playSplash(x: number, z: number): void {
    splashAt.position.set(x, WATER_Y, z);
    if (splash.isPlaying) splash.stop();
    splash.play();
  }

  function startRise(
    r: Partial<Rise> & { toX: number; toZ: number; dur: number; peak: number },
  ): void {
    rise = {
      t: 0,
      fromX: root.position.x,
      fromZ: root.position.z,
      lunge: false,
      victim: -1,
      done: false,
      ...r,
    };
    if (rise.lunge) {
      lunge.reset().play();
      lunge.crossFadeFrom(swim, FADE, false);
    }
  }

  function endRise(): void {
    if (rise?.lunge) {
      swim.enabled = true;
      swim.crossFadeFrom(lunge, FADE, false);
    }
    rise = null;
  }

  function stepRise(r: Rise, dt: number, horde: Horde | null): void {
    r.t += dt;
    const s = Math.min(1, r.t / r.dur);
    const move = smooth(Math.min(1, s * 2));
    const x = r.fromX + (r.toX - r.fromX) * move;
    const z = r.fromZ + (r.toZ - r.fromZ) * move;
    const dx = x - root.position.x;
    const dz = z - root.position.z;
    if (dx * dx + dz * dz > 1e-6) yaw = turnToward(yaw, Math.atan2(-dx, -dz), 6 * dt);
    root.position.set(x, CRUISE_Y + (r.peak - CRUISE_Y) * Math.sin(Math.PI * s), z);
    if (!r.done && s >= 0.5) {
      r.done = true;
      if (r.victim >= 0) horde?.takeByFish(r.victim);
      playSplash(x, z);
    }
    if (s >= 1) endRise();
  }

  function cruise(dt: number, player: { x: number; z: number }): void {
    const targetZ = player.z - LAG_Z;
    const targetX = RIVER_X - 2 + Math.sin(time * 0.4) * WEAVE_X;
    const dz = targetZ - root.position.z;
    const stepZ = Math.sign(dz) * Math.min(Math.abs(dz), FISH.follow * dt);
    const x = root.position.x + (targetX - root.position.x) * Math.min(1, 2 * dt);
    const dx = x - root.position.x;
    if (dx * dx + stepZ * stepZ > 1e-8) yaw = turnToward(yaw, Math.atan2(-dx, -stepZ), 3 * dt);
    const y = root.position.y + (CRUISE_Y - root.position.y) * Math.min(1, 3 * dt);
    root.position.set(x, y, root.position.z + stepZ);
  }

  function tryStrike(player: { x: number; z: number }, horde: Horde): void {
    count = 0;
    horde.forEachAlive(collect);
    const id = pickStrike(buffer, count, player, EDGE_X);
    if (id === null) return;
    let zx = 0;
    let zz = 0;
    for (let i = 0; i < count; i++) {
      if (buffer[i * 3] === id) {
        zx = buffer[i * 3 + 1];
        zz = buffer[i * 3 + 2];
      }
    }
    strikes--;
    cooldown = FISH.cooldown;
    startRise({
      toX: Math.max(zx, EDGE_X + 1),
      toZ: zz,
      dur: STRIKE_TIME,
      peak: STRIKE_PEAK_Y,
      lunge: true,
      victim: id,
    });
  }

  function stepPack(dt: number): void {
    packT += dt;
    const s = Math.min(1, packT / PACK_TIME);
    packModel.position.lerpVectors(packFrom, packTo, s);
    packModel.position.y += PACK_ARC * 4 * s * (1 - s);
    packModel.rotation.y += 6 * dt;
    if (s < 1) return;
    packT = -1;
    packModel.visible = false;
    playSplash(packTo.x, packTo.z);
    takePending = true;
  }

  function placeShadow(): void {
    shadow.position.set(root.position.x, WATER_Y + 0.02, root.position.z);
    shadow.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
    shadow.visible = root.position.y < 0.2;
  }

  return {
    get strikes() {
      return strikes;
    },
    arm(n) {
      strikes = n;
    },
    feed(from) {
      packFrom.set(from.x, from.y, from.z);
      packTo.set(EDGE_X + PACK_DISTANCE, WATER_Y, from.z);
      packT = 0;
      packModel.visible = true;
      packModel.position.copy(packFrom);
    },
    update(dt, player, horde, night) {
      time += dt;
      mixer.update(dt);
      if (!placed) {
        placed = true;
        root.position.set(RIVER_X - 2, CRUISE_Y, player.z - LAG_Z);
      }
      cooldown = Math.max(0, cooldown - dt);
      if (packT >= 0) stepPack(dt);
      if (rise) stepRise(rise, dt, horde);
      else {
        if (takePending) {
          takePending = false;
          startRise({
            toX: packTo.x + 1.2,
            toZ: packTo.z + 1.5,
            dur: TAKE_TIME,
            peak: TAKE_PEAK_Y,
          });
        } else if (night && strikes > 0 && cooldown === 0 && horde) tryStrike(player, horde);
        if (!rise) cruise(dt, player);
      }
      root.rotation.y = yaw;
      placeShadow();
    },
    reset() {
      strikes = 0;
      cooldown = 0;
      placed = false;
      packT = -1;
      takePending = false;
      packModel.visible = false;
      if (rise?.lunge) {
        lunge.stop();
        swim.reset().play();
      }
      rise = null;
    },
    dispose() {
      if (splash.isPlaying) splash.stop();
      splashAt.remove(splash);
      mixer.stopAllAction();
      scene.remove(root, shadow, packModel, splashAt);
      shadow.geometry.dispose();
      shadow.material.map?.dispose();
      shadow.material.dispose();
    },
  };
}
