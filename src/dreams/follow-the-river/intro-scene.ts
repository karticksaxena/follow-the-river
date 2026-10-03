import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import type { Box } from '../../engine/collide';
import { loadModel, loadSkinned } from '../../engine/models';
import type { DreamContext } from '../types';
import { createFish, type Fish } from './fish';
import { characterUrl, KIT_SCALE, kitUrl, propUrl } from './kits';
import { applyDim, applyLighting, createWorldLights, LIGHTING, type WorldLights } from './lighting';
import { createNewsScreen } from './news';
import { addRiver, EDGE_X, plane } from './river';
import { loadSounds, type Sounds } from './sounds';

// Tuning knobs (metres). Everything below is in WORLD coordinates. The room sits far from the
// river so fog hides it from outside.
export const ROOM_X = -70;
const TV_SCALE = 1.4;
export const TV_LIGHT = { color: 0x5a6fb8, intensity: 2.6, distance: 8, flicker: 0.35 };
const SCREEN_TINT = 0x8a8a8a;
export const INSIDE_DIM = 0.7;
const FADE = 0.3;
const FENCE_SCALE = 4;
const FENCE_PIECE = 1.28 * FENCE_SCALE;
const HOUSE_X = -15;

/** Where things stand (x, z), and how close the player must be to use them. */
export const AT = {
  tv: { x: ROOM_X, z: -2.1 },
  momInside: { x: ROOM_X + 1.5, z: -1.9 },
  momDoor: { x: ROOM_X - 2.6, z: 0.5 },
  door: { x: ROOM_X - 3.2, z: 1.2 },
  momRiver: { x: EDGE_X - 1.4, z: 0 },
  spawnRoom: { x: ROOM_X, z: 1.05 },
  spawnRiver: { x: EDGE_X - 4, z: 0 },
} as const;
export const REACH = { tv: 2.5, mom: 2.2, door: 1.4 } as const;
export const YAW_EAST = -Math.PI / 2; // camera yaw looking toward +X (the river)

const box = (x0: number, x1: number, z0: number, z1: number, dx = 0): Box => ({
  minX: x0 + dx,
  maxX: x1 + dx,
  minZ: z0,
  maxZ: z1,
});

/** Walls (doorway open at z 0.65..1.75, capped just outside), couch back and the TV. */
export const ROOM_COLLIDERS: readonly Box[] = [
  box(-4, 4, 2.5, 3, ROOM_X),
  box(-4, 4, -3, -2.5, ROOM_X),
  box(3.5, 4, -3, 3, ROOM_X),
  box(-4, -3.5, -3, 0.65, ROOM_X),
  box(-4, -3.5, 1.75, 3, ROOM_X),
  box(-4.6, -4, 0.4, 2, ROOM_X),
  box(-1, 1, 1.4, 1.65, ROOM_X),
  box(-0.5, 0.5, -2.5, -1.7, ROOM_X),
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
  if (!clip) throw new Error(`mom.glb has no ${name} clip`);
  return clip;
}

export interface Mom {
  group: THREE.Group;
  pack: THREE.Object3D;
  play(name: string, once?: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

/** Mom with cross-faded clips and the fish pack parked in her right hand (hidden until needed). */
export function createMom(
  asset: { scene: THREE.Object3D; clips: readonly THREE.AnimationClip[] },
  pack: THREE.Object3D,
): Mom {
  const group = new THREE.Group();
  const body = clone(asset.scene);
  body.traverse((n) => (n.frustumCulled = false));
  group.add(body);
  // GLTFLoader strips '.' from node names, so Wrist.R arrives as WristR.
  const hand = body.getObjectByName('WristR') ?? body.getObjectByName('Wrist.R') ?? group;
  hand.add(pack);
  pack.visible = false;
  group.updateMatrixWorld(true);
  pack.scale.setScalar(1 / hand.getWorldScale(new THREE.Vector3()).x);
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
    if (e.action === current) play('Idle');
  });
  play('Idle');
  return {
    group,
    pack,
    play,
    update: (dt) => void mixer.update(dt),
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(body);
    },
  };
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
  const ground = plane(400, 400, 0x1c1a16);
  ground.position.set(EDGE_X - 200, -0.03, 0);
  addRiver(scene, 60, -60);
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
  mom: Mom;
  sounds: Sounds;
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
  tv.scale.setScalar(TV_SCALE);
  tv.position.set(0, 0, AT.tv.z);
  couch.position.set(0, 0, 1.2);
  const tvLight = new THREE.PointLight(TV_LIGHT.color, TV_LIGHT.intensity, TV_LIGHT.distance, 2);
  tvLight.position.set(0, 1, -1.2);
  const room = new THREE.Group();
  room.position.x = ROOM_X;
  room.add(roomModel, couch, tv, tvLight);
  const mom = createMom(momAsset, pack);
  mom.group.position.set(AT.momInside.x, 0, AT.momInside.z); // world, not room-local
  scene.add(room, mom.group);
  buildOutside(scene, house, fence);
  return { scene, lights, fish, news, tvLight, mom, sounds };
}
