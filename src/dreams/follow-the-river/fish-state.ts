import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import type { AudioBus } from '../../engine/audio';
import type { SkinnedAsset } from '../../engine/models';
import {
  cruiseYFor,
  findClip,
  makeWake,
  makeWet,
  nextSurfacing,
  NIGHT_STRIKE,
  surfaceYFor,
  topOf,
} from './fish-parts';
import type { Grab, GrabHooks, GrabPose, StrikeStyle } from './orca-grab';
import type { Sounds } from './sounds';
import { SPAWNER } from './zombies/spawner';

const CAPACITY = Math.max(32, SPAWNER.cap);

/** Where the ending has the orca: cruising/striking as usual, the last lunge, sinking, or gone. */
export type Finale = 'no' | 'lunge' | 'sink' | 'gone';

export interface Rise {
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
export interface FishState {
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
  /** Seconds between strikes while armed, and how far from the water (m) it can take one. */
  /** How it strikes this night (see orca-grab.ts). */
  style: StrikeStyle;
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
  /** Taking a zombie off the bank (see orca-grab.ts), and its reused pose. */
  grab: Grab | null;
  readonly pose: GrabPose;
  /** Bank (or water) height at x, and what to break where the orca bursts out at z. */
  readonly ground: (x: number) => number;
  readonly onBreach: (z: number) => void;
  /** Set once by createFish (they play the orca's sounds). */
  hooks: GrabHooks;
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

export function createState(
  scene: THREE.Scene,
  audio: AudioBus,
  sounds: Sounds,
  asset: SkinnedAsset,
  packModel: THREE.Object3D,
  bank: Pick<FishState, 'ground' | 'onBreach'>,
): FishState {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ'; // pitch (x) about the body's own axis, after the heading
  root.visible = false; // until the first update places it beside the player
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
    style: { ...NIGHT_STRIKE },
    placed: false,
    yaw: 0,
    rise: null,
    packT: -1,
    takePending: false,
    finale: 'no',
    sinkT: 0,
    sinkFromY: cruiseY,
    victims: [],
    grab: null,
    pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
    ground: bank.ground,
    onBreach: bank.onBreach,
    hooks: { breach: () => undefined, splash: () => undefined },
  };
  return f;
}
