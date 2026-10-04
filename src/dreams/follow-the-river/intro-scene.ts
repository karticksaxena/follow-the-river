import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import type { Box } from '../../engine/collide';
import { loadModel, loadSkinned } from '../../engine/models';
import { texturesReady } from '../../engine/surfaces';
import type { DreamContext } from '../types';
import { addBanks, groundEndX } from './banks';
import { createFish, type Fish } from './fish';
import { characterUrl, KIT_SCALE, kitUrl, propUrl } from './kits';
import { applyDim, applyLighting, createWorldLights, LIGHTING, type WorldLights } from './lighting';
import { createNewsScreen } from './news';
import { addRiver, EDGE_X, plane } from './river';
import { loadSounds, type Sounds } from './sounds';
import { addRim } from './zombies/look';

// Tuning knobs (metres). Everything below is in WORLD coordinates. The room sits far from the
// river so fog hides it from outside.
export const ROOM_X = -70;
const TV_SCALE = 1.4;
export const TV_LIGHT = { color: 0x5a6fb8, intensity: 2.6, distance: 8, flicker: 0.35 };
const SCREEN_TINT = 0x8a8a8a;
const PACK_GRIP = 0.12; // m from the wrist to the pack's centre (tuning knob)
export const INSIDE_DIM = 0.7;
const FADE = 0.3;
const FENCE_SCALE = 4;
const FENCE_PIECE = 1.28 * FENCE_SCALE;
const HOUSE_X = -15;

/** Where things stand (x, z), and how close the player must be to use them. */
const PACE_Z = 2.1; // Mom's pacing line: behind the couch back (ends 1.65), short of the wall (2.5)
const HALL_Z = 1.2; // through the middle of the doorway (z 0.65..1.75)
const OUTSIDE_X = -5.5; // out of sight past the door

export const AT = {
  tv: { x: ROOM_X, z: -1.98 },
  momInside: { x: ROOM_X - 1.8, z: PACE_Z },
  momDoor: { x: ROOM_X - 2.6, z: 0.5 },
  door: { x: ROOM_X - 3.2, z: HALL_Z },
  momRiver: { x: EDGE_X - 1.4, z: 0 },
  momRiverStart: { x: EDGE_X - 3, z: 1.2 }, // ahead and to the side of the player, in view
  momRiverNear: { x: EDGE_X - 2.4, z: 0 }, // where she waits before the last steps
  momRiverBack: { x: EDGE_X - 2.2, z: 0 }, // the step back before she films
  spawnRoom: { x: ROOM_X - 1.8, z: 1.05 }, // beside the couch, not on it,
  spawnRiver: { x: EDGE_X - 4, z: 0 },
} as const;
export const REACH = { tv: 2.5, mom: 2.2, door: 1.4 } as const;
/** Camera yaw at the room spawn: looking at the TV (yaw 0 looks along -Z). */
export const YAW_TO_TV = Math.atan2(AT.tv.x - AT.spawnRoom.x, AT.spawnRoom.z - AT.tv.z) * -1;
export const YAW_EAST = -Math.PI / 2; // camera yaw looking toward +X (the river)

/** Mom's indoor routes (world). Every leg stays on open floor; see intro.test.ts. */
export const MOM_PATH = {
  pace: [AT.momInside, { x: ROOM_X + 1.8, z: PACE_Z }, { x: ROOM_X, z: PACE_Z }],
  paceDwell: 4, // seconds of tense idling at each pacing point
  out: [
    { x: ROOM_X - 2.6, z: PACE_Z }, // along the pacing line, valid from anywhere on it
    { x: ROOM_X - 2.6, z: HALL_Z },
    AT.door,
    { x: ROOM_X + OUTSIDE_X, z: HALL_Z },
  ],
  in: [AT.door, AT.momDoor],
  /** What she glances at while idling: the TV, the doorway and the window (knob, unverified). */
  glances: [AT.tv, AT.door, { x: ROOM_X + 3.5, z: 0 }],
} as const;

const box = (x0: number, x1: number, z0: number, z1: number, dx = 0): Box => ({
  minX: x0 + dx,
  maxX: x1 + dx,
  minZ: z0,
  maxZ: z1,
});

/** Blocks the player just outside the doorway; Mom walks through it when she leaves. */
export const DOOR_CAP: Box = box(-4.6, -4, 0.4, 2, ROOM_X);

/** Walls (doorway open at z 0.65..1.75, capped just outside), couch back and the TV. */
export const ROOM_COLLIDERS: readonly Box[] = [
  box(-4, 4, 2.5, 3, ROOM_X),
  box(-4, 4, -3, -2.5, ROOM_X),
  box(3.5, 4, -3, 3, ROOM_X),
  box(-4, -3.5, -3, 0.65, ROOM_X),
  box(-4, -3.5, 1.75, 3, ROOM_X),
  DOOR_CAP,
  box(-1, 1, 1.4, 1.65, ROOM_X),
  box(-0.5, 0.5, -2.5, -1.6, ROOM_X),
];

/** A small fenced strip by the river; the river side is closed at the water's edge. */
export const OUTSIDE_COLLIDERS: readonly Box[] = [
  box(-9, -8, -9, 9),
  box(-9, 4, 8, 9),
  box(-9, 4, -9, -8),
  box(EDGE_X - 0.2, EDGE_X + 2, -9, 9),
];

function findClip(clips: readonly THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const clip = clips.find((c) => c.name === `CharacterArmature|${name}`);
  if (!clip) throw new Error(`character has no ${name} clip`);
  return clip;
}

export interface Character {
  group: THREE.Group;
  pack: THREE.Object3D;
  /** Clip she returns to when a one-shot clip finishes. */
  rest: string;
  /** A bone by name (GLTFLoader strips '.': Wrist.R is WristR); throws if the rig lacks it. */
  bone(name: string): THREE.Object3D;
  /** Parks `prop` in the hand of `bone`, scaled to cancel the rig's x100 and gripped at PACK_GRIP. */
  attach(prop: THREE.Object3D, bone: string): void;
  play(name: string, once?: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

/** A rigged character with cross-faded clips and an optional prop parked in a hand (hidden until needed). */
export function createCharacter(
  asset: { scene: THREE.Object3D; clips: readonly THREE.AnimationClip[] },
  prop?: THREE.Object3D,
  propBone = 'WristR',
): Character {
  const pack = prop ?? new THREE.Group();
  const group = new THREE.Group();
  const body = clone(asset.scene);
  body.traverse((n) => (n.frustumCulled = false));
  addRim(body);
  group.add(body);
  const bone = (name: string): THREE.Object3D => {
    const found =
      body.getObjectByName(name) ?? body.getObjectByName(name.replace(/(?=[LR]$)/, '.'));
    if (!found) throw new Error(`character has no ${name} bone`);
    return found;
  };
  const attach = (item: THREE.Object3D, name: string): void => {
    const hand = bone(name);
    hand.add(item);
    group.updateMatrixWorld(true);
    const handScale = hand.getWorldScale(new THREE.Vector3()).x; // the rig is scaled x100
    item.scale.setScalar(1 / handScale);
    item.position.y = PACK_GRIP / handScale; // wrist +Y runs down the fingers: grip the item's top edge
  };
  pack.visible = false;
  if (prop) attach(prop, propBone);
  const mixer = new THREE.AnimationMixer(body);
  const actions = new Map<string, THREE.AnimationAction>();
  let current: THREE.AnimationAction | null = null;
  const play = (name: string, once = false): void => {
    let next = actions.get(name);
    if (!next) {
      next = mixer.clipAction(findClip(asset.clips, name));
      actions.set(name, next);
    }
    if (next === current) return;
    next.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(FADE).play();
    current?.fadeOut(FADE);
    current = next;
  };
  mixer.addEventListener('finished', (e) => {
    if (e.action === current) play(mom.rest);
  });
  play('Idle');
  const mom: Character = {
    group,
    pack,
    rest: 'Idle',
    bone,
    attach,
    play,
    update: (dt) => void mixer.update(dt),
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(body);
    },
  };
  return mom;
}

function lineOfFence(
  model: THREE.Object3D,
  from: THREE.Vector3,
  along: 'x' | 'z',
  n: number,
): THREE.Object3D[] {
  return Array.from({ length: n }, (_, i) => {
    const piece = model.clone(true);
    piece.scale.setScalar(FENCE_SCALE);
    piece.position.copy(from);
    piece.position[along] += (i - (n - 1) / 2) * FENCE_PIECE;
    piece.rotation.y = along === 'z' ? Math.PI / 2 : 0;
    return piece;
  });
}

function buildOutside(scene: THREE.Scene, house: THREE.Object3D, fence: THREE.Object3D): void {
  const ground = plane(400, 400, 0x1c1a16, 'grass');
  ground.position.set(groundEndX('natural') - 200, -0.03, 0);
  addRiver(scene, 60, -60);
  addBanks(scene, 'natural', [60, -60], [0x1c1a16, 0x24271f]);
  house.scale.setScalar(KIT_SCALE.suburb);
  house.position.set(HOUSE_X, 0, 0);
  house.rotation.y = Math.PI / 2;
  scene.add(ground, house);
  scene.add(...lineOfFence(fence, new THREE.Vector3(-8, 0, 0), 'z', 3));
  scene.add(...lineOfFence(fence, new THREE.Vector3(-5.2, 0, -8), 'x', 2));
  scene.add(...lineOfFence(fence, new THREE.Vector3(-5.2, 0, 8), 'x', 2));
}

function swapScreen(tv: THREE.Object3D, map: THREE.Texture): void {
  tv.traverse((node) => {
    if (
      node instanceof THREE.Mesh &&
      node.material instanceof THREE.Material &&
      node.material.name === 'Screen'
    ) {
      node.material = new THREE.MeshBasicMaterial({ map, color: SCREEN_TINT });
    }
  });
}

export interface IntroScene {
  scene: THREE.Scene;
  lights: WorldLights;
  fish: Fish;
  news: ReturnType<typeof createNewsScreen>;
  tvLight: THREE.PointLight;
  mom: Character;
  sounds: Sounds;
}

/** The window at dusk: dark blue, faintly lit. It was a pale glowing panel that read as a second screen. */
const WINDOW_DUSK = { color: 0x1c2232, emissive: 0x0a0d16 } as const;

function dimWindow(room: THREE.Object3D): void {
  room.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return;
    const m: unknown = n.material;
    const lit = m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial;
    if (!lit || m.name !== 'windowGlass') return;
    m.color.setHex(WINDOW_DUSK.color);
    m.emissive.setHex(WINDOW_DUSK.emissive);
  });
}

/** The living room (a group at ROOM_X), Mom and the riverbank, all added to one dusk scene. */
export async function buildIntroScene(ctx: DreamContext): Promise<IntroScene> {
  const [roomModel, couch, tv, pack, house, fence, momAsset, sounds] = await Promise.all([
    loadModel(propUrl('livingroom')),
    loadModel(propUrl('couch')),
    loadModel(propUrl('tv')),
    loadModel(propUrl('fishpack')),
    loadModel(kitUrl('suburb', 'building-type-a')),
    loadModel(kitUrl('suburb', 'fence-2x3')),
    loadSkinned(characterUrl('mom')),
    loadSounds(ctx.audio),
  ]);
  const scene = new THREE.Scene();
  const lights = createWorldLights(scene);
  applyLighting(lights, LIGHTING.dusk);
  applyDim(lights, LIGHTING.dusk, INSIDE_DIM);
  const fish = await createFish(scene, ctx.audio, sounds);
  const news = createNewsScreen();
  swapScreen(tv, news.texture);
  dimWindow(roomModel);
  tv.scale.setScalar(TV_SCALE);
  tv.position.set(0, 0, AT.tv.z);
  couch.position.set(0, 0, 1.2);
  const tvLight = new THREE.PointLight(TV_LIGHT.color, TV_LIGHT.intensity, TV_LIGHT.distance, 2);
  tvLight.position.set(0, 1, -1.2);
  const room = new THREE.Group();
  room.position.x = ROOM_X;
  room.add(roomModel, couch, tv, tvLight);
  const mom = createCharacter(momAsset, pack);
  mom.group.position.set(AT.momInside.x, 0, AT.momInside.z); // world, not room-local
  scene.add(room, mom.group);
  buildOutside(scene, house, fence);
  await texturesReady();
  return { scene, lights, fish, news, tvLight, mom, sounds };
}
