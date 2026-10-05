import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import type { AudioBus } from '../../engine/audio';
import type { SkinnedAsset } from '../../engine/models';
import { HORDE_CAPACITY } from './difficulty';
import { newFarewell, type Farewell } from './fish-farewell';
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
import { makeMist, makeSick, type Blow, type Sickness } from './orca-sick';
import { STRAND, type Strand } from './orca-strand';
import { picker, type Sounds } from './sounds';

const CAPACITY = Math.max(32, HORDE_CAPACITY);

/** Where the ending has the orca: cruising/striking as usual, or stranded on the shore. */
export type Finale = 'no' | 'stranded';

export interface Rise {
  t: number;
  dur: number;
  peak: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
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
  /** The low body-thump layered under a big splash, and her short calls (riding on the body). */
  readonly thump: THREE.PositionalAudio;
  readonly voice: THREE.PositionalAudio;
  /** Random recordings, never the same twice running (null while a list is empty). */
  readonly pick: Record<'blow' | 'splash' | 'big' | 'call', () => AudioBuffer | null>;
  /** `time` of her last short call (they are rationed). */
  lastCall: number;
  readonly cruiseY: number;
  readonly surfaceY: number;
  readonly mixer: THREE.AnimationMixer;
  readonly swim: THREE.AnimationAction;
  readonly lunge: THREE.AnimationAction;
  /** The Beached clip she lies in, and the bones that sag on top of it (see orca-strand.ts). */
  readonly settled: THREE.AnimationAction;
  /** Her weak tail lift and her last breath (see fish-farewell.ts). */
  readonly lift: THREE.AnimationAction;
  readonly exhale: THREE.AnimationAction;
  readonly end: Farewell;
  /** Her head bone and its child the trunk (what her head turns on), and her eye's material. */
  readonly head: THREE.Object3D | null;
  readonly trunk: THREE.Object3D | null;
  /** The trunk's position as loaded (the clips never move it, so the head turn works from this). */
  readonly trunkRest: THREE.Vector3;
  readonly eye: THREE.MeshStandardNodeMaterial | null;
  readonly sagBones: readonly THREE.Object3D[];
  /** The sag (0..1) applied to those bones last frame (see `unsag`). */
  sagK: number;
  /** Where the zombie she struck last was (read-only for the ending), or null. */
  lastStrike: { x: number; z: number } | null;
  readonly buffer: Float32Array;
  readonly packFrom: THREE.Vector3;
  readonly packTo: THREE.Vector3;
  readonly collect: (id: number, x: number, z: number) => void;
  count: number;
  time: number;
  surfaceIn: number; // seconds until the next surfacing
  strikes: number;
  /** Out of ammo (see `Fish.dry`). */
  dry: boolean;
  cooldown: number;
  /** How it strikes this night (see orca-grab.ts). */
  style: StrikeStyle;
  placed: boolean;
  yaw: number;
  rise: Rise | null;
  packT: number; // <0: no pack in flight
  takePending: boolean;
  finale: Finale;
  /** Its last leap and its rest on the shore (see orca-strand.ts). */
  strand: Strand | null;
  /** 0 well .. 1 dying (see orca-sick.ts). */
  sickness: number;
  /** Her skin and wasting, driven by `sickness` (see orca-sick.ts). */
  readonly sick: Sickness;
  /** Called when a zombie she took drowns (the run counts it). */
  onEat: (() => void) | null;
  /** The blow's mist, seconds into it (-1: none), and its reused pose. */
  readonly mist: THREE.Sprite;
  mistT: number;
  readonly blowOut: Blow;
  /** Taking a zombie off the bank (see orca-grab.ts), and its reused pose. */
  grab: Grab | null;
  readonly pose: GrabPose;
  /** Bank (or water) height at x, and what to break where the orca bursts out at z. */
  readonly ground: (x: number) => number;
  /** Where the water starts (x): the cruise lane and the swim limit are measured from it. */
  readonly waterline: number;
  readonly onBreach: (z: number) => void;
  /** Set once by createFish (they play the orca's sounds). */
  hooks: GrabHooks;
  /** The big splash where a zombie she threw hits the water (the horde calls it). */
  onThrown: (x: number, z: number) => void;
  /** Her jaw bone (null if the model has none), and what she may take: only zombies near these points. */
  readonly jaw: THREE.Object3D | null;
  guards: readonly { x: number; z: number }[];
}

function makeClips(
  body: THREE.Object3D,
  asset: SkinnedAsset,
): Pick<FishState, 'mixer' | 'swim' | 'lunge' | 'settled' | 'lift' | 'exhale'> {
  const mixer = new THREE.AnimationMixer(body);
  const swim = mixer.clipAction(findClip(asset.clips, 'Swim'));
  const lunge = mixer.clipAction(findClip(asset.clips, 'Lunge'));
  lunge.setLoop(THREE.LoopOnce, 1);
  lunge.clampWhenFinished = true;
  const settled = mixer.clipAction(findClip(asset.clips, 'Beached'));
  const lift = mixer.clipAction(findClip(asset.clips, 'TailLift'));
  const exhale = mixer.clipAction(findClip(asset.clips, 'Exhale'));
  for (const once of [lift, exhale]) {
    once.setLoop(THREE.LoopOnce, 1);
    once.clampWhenFinished = true; // she holds the last frame
  }
  swim.play();
  return { mixer, swim, lunge, settled, lift, exhale };
}

/** Her eye's material (it keeps its own after `makeSick`), or null. */
function eyeOf(body: THREE.Object3D): THREE.MeshStandardNodeMaterial | null {
  let eye: THREE.MeshStandardNodeMaterial | null = null;
  body.traverse((n) => {
    if (!(n instanceof THREE.Mesh) || !(n.material instanceof THREE.MeshStandardNodeMaterial))
      return;
    if (n.material.name === 'orca-eye') eye = n.material;
  });
  return eye;
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
  bank: Pick<FishState, 'ground' | 'onBreach' | 'waterline'>,
): FishState {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ'; // pitch (x) about the body's own axis, after the heading
  root.visible = false; // until the first update places it beside the player
  const body = clone(asset.scene);
  body.traverse((n) => {
    n.frustumCulled = false;
    // Its own materials: makeWet must not reach another orca (the calf at the end).
    if (n instanceof THREE.Mesh && n.material instanceof THREE.Material)
      n.material = n.material.clone();
  });
  makeWet(body);
  const sick = makeSick(body); // swaps those clones for node materials of her own
  const finTop = topOf(body);
  const cruiseY = cruiseYFor(finTop);
  root.add(body);
  const wake = makeWake();
  scene.add(root, wake);
  packModel.visible = false;
  scene.add(packModel);
  const splashAt = new THREE.Object3D();
  const mist = makeMist();
  scene.add(splashAt, mist);
  const splash = audio.positional(splashAt, 4);
  const blow = audio.positional(splashAt, 4);
  const thump = audio.positional(splashAt, 4);
  const voice = audio.positional(root, 6);
  const { mixer, swim, lunge, settled, lift, exhale } = makeClips(body, asset);
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
    thump,
    voice,
    pick: {
      blow: picker(sounds.blows),
      splash: picker(sounds.splashes),
      big: picker(sounds.splashesBig),
      call: picker(sounds.callsShort),
    },
    lastCall: -Infinity,
    cruiseY,
    surfaceY: surfaceYFor(finTop),
    mixer,
    swim,
    lunge,
    settled,
    lift,
    exhale,
    end: newFarewell(),
    head: body.getObjectByName('Head') ?? null,
    trunk: body.getObjectByName('Spine1') ?? null,
    trunkRest: (body.getObjectByName('Spine1')?.position ?? new THREE.Vector3()).clone(),
    eye: eyeOf(body),
    sagBones: STRAND.bend.bones.flatMap((n) => body.getObjectByName(n) ?? []),
    sagK: 0,
    lastStrike: null,
    buffer,
    packFrom: new THREE.Vector3(),
    packTo: new THREE.Vector3(),
    collect: (id, x, z) => collectZombie(f, id, x, z),
    count: 0,
    time: 0,
    surfaceIn: nextSurfacing(Math.random()),
    strikes: 0,
    dry: false,
    cooldown: 0,
    style: { ...NIGHT_STRIKE },
    placed: false,
    yaw: 0,
    rise: null,
    packT: -1,
    takePending: false,
    finale: 'no',
    strand: null,
    sickness: 0,
    sick,
    onEat: null,
    mist,
    mistT: -1,
    blowOut: { rise: 0, size: 0, opacity: 0 },
    grab: null,
    pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
    ground: bank.ground,
    waterline: bank.waterline,
    onBreach: bank.onBreach,
    hooks: { breach: () => undefined, splash: () => undefined },
    onThrown: () => undefined,
    jaw: body.getObjectByName('Jaw') ?? null,
    guards: [],
  };
  return f;
}
