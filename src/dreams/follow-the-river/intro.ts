import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import { type Box } from '../../engine/collide';
import { disposeScene } from '../../engine/dispose';
import { loadModel, loadSkinned } from '../../engine/models';
import type { DreamContext } from '../types';
import { createFish, type Fish } from './fish';
import { createHud } from './hud';
import { characterUrl, KIT_SCALE, kitUrl, propUrl } from './kits';
import { applyDim, applyLighting, createWorldLights, LIGHTING, type WorldLights } from './lighting';
import { createNewsScreen } from './news';
import { addRiver, EDGE_X, plane } from './river';
import { loadSounds, type Sounds } from './sounds';

export type IntroStep =
  'news' | 'mom-leaves' | 'mom-back' | 'outside' | 'throw' | 'goodbye' | 'done';
type ActiveStep = Exclude<IntroStep, 'done'>;

const ORDER: readonly IntroStep[] = [
  'news',
  'mom-leaves',
  'mom-back',
  'outside',
  'throw',
  'goodbye',
  'done',
];

/** Pure: the next step after the player finishes the current step's pages. */
export function nextIntroStep(step: IntroStep): IntroStep {
  return ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)] ?? 'done';
}

export const INTRO_PAGES: Readonly<Record<ActiveStep, readonly string[]>> = {
  news: [
    'BREAKING NEWS — An unknown infection is spreading through the city.',
    '"…patients become violent within hours. Hospitals are not accepting new cases…"',
    '"…residents are urged to stay indoors and lock their doors…"',
  ],
  'mom-leaves': [
    'Mom: "No. No, no, no. That\'s… I know what that is."',
    'Mom: "Stay here. Lock the door. I\'m going to the store. I\'ll be right back."',
  ],
  'mom-back': ['An hour later.', 'Mom: "Come with me. Now. To the river. Don\'t ask."'],
  outside: ['Mom is holding a pack of fish from the store. Her hands are shaking.'],
  throw: [
    'Mom: "Here. Here, girl."',
    'Something enormous moves under the water. Black and white. It takes the fish and is gone.',
  ],
  goodbye: [
    'Mom: "It knows me. It will know you."',
    'Mom: "Listen to me. Whatever happens — run. Always follow the river."',
    'Mom: "Feed it, and it will keep you safe at night. Go!"',
    'She lifts her phone and starts filming the water. You hear her whisper: "What have we done…"',
  ],
};

export interface Intro {
  dispose(): void;
}

// Tuning knobs (metres, seconds). The room sits far from the river so fog hides it from outside.
const ROOM_X = -70;
const TV_SCALE = 1.4;
const TV_LIGHT = { color: 0x4060ff, intensity: 5, distance: 8, flicker: 0.35 };
const SCREEN_TINT = 0x8a8a8a;
const INSIDE_DIM = 0.7;
const FADE = 0.3;
const THROW_DELAY = 0.7; // Mom's wind-up before the pack leaves her hand
const TAKE_WAIT = 4.6; // pack flight + the orca rising and sinking
const WATER_VOLUME = 0.4;
const FENCE_SCALE = 4;
const FENCE_PIECE = 1.28 * FENCE_SCALE;
const HOUSE_X = -15;
const OUTSIDE_SPAWN_X = EDGE_X - 4;
const MOM_OUT_X = EDGE_X - 1.4;
const HAND_REACH = 0.4;
const HAND_HEIGHT = 1.2;
const YAW_EAST = -Math.PI / 2; // camera yaw looking toward +X (the river)

const box = (x0: number, x1: number, z0: number, z1: number): Box => ({
  minX: x0,
  maxX: x1,
  minZ: z0,
  maxZ: z1,
});
const inRoom = (b: Box): Box => ({ ...b, minX: b.minX + ROOM_X, maxX: b.maxX + ROOM_X });

/** Walls (doorway open at z 0.65..1.75, capped just outside), couch back and the TV. */
const ROOM_COLLIDERS: readonly Box[] = [
  box(-4, 4, 2.5, 3),
  box(-4, 4, -3, -2.5),
  box(3.5, 4, -3, 3),
  box(-4, -3.5, -3, 0.65),
  box(-4, -3.5, 1.75, 3),
  box(-4.6, -4, 0.4, 2),
  box(-1, 1, 1.4, 1.65),
  box(-0.5, 0.5, -2.5, -1.7),
].map(inRoom);

/** A small fenced strip by the river; the river side is closed at the water's edge. */
const OUTSIDE_COLLIDERS: readonly Box[] = [
  box(-9, -8, -9, 9),
  box(-9, 4, 8, 9),
  box(-9, 4, -9, -8),
  box(EDGE_X - 0.2, EDGE_X + 2, -9, 9),
];

interface Spot {
  at: { x: number; z: number };
  reach: number;
  prompt: string;
  hint: string;
}

function findClip(clips: readonly THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const clip = clips.find((c) => c.name === `CharacterArmature|${name}`);
  if (!clip) throw new Error(`mom.glb has no ${name} clip`);
  return clip;
}

interface Mom {
  group: THREE.Group;
  pack: THREE.Object3D;
  play(name: string, once?: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

/** Mom with cross-faded clips and the fish pack parked in her right hand (hidden until needed). */
function createMom(
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

async function buildScene(ctx: DreamContext): Promise<IntroScene> {
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
  tv.position.set(0, 0, -2.1);
  couch.position.set(0, 0, 1.2);
  const tvLight = new THREE.PointLight(TV_LIGHT.color, TV_LIGHT.intensity, TV_LIGHT.distance, 2);
  tvLight.position.set(0, 1, -1.2);
  const room = new THREE.Group();
  room.position.x = ROOM_X;
  const mom = createMom(momAsset, pack);
  mom.group.position.set(1.5, 0, -1.9);
  room.add(roomModel, couch, tv, tvLight, mom.group);
  scene.add(room);
  buildOutside(scene, house, fence);
  return { scene, lights, fish, news, tvLight, mom, sounds };
}

interface IntroScene {
  scene: THREE.Scene;
  lights: WorldLights;
  fish: Fish;
  news: ReturnType<typeof createNewsScreen>;
  tvLight: THREE.PointLight;
  mom: Mom;
  sounds: Sounds;
}

/** Builds the house and riverbank at dusk and runs the intro; `onDone` when Mom sends you off. */
export async function runIntro(ctx: DreamContext, onDone: () => void): Promise<Intro> {
  const { scene, lights, fish, news, tvLight, mom, sounds } = await buildScene(ctx);
  const hud = createHud(ctx.overlay.root);
  const cam = ctx.stage.camera.position;

  let step: IntroStep = 'news';
  let inside = true;
  let busy = false;
  let disposed = false;
  let time = 0;
  let waitLeft = 0;
  let waitDone: (() => void) | null = null;
  let water: { stop(): unknown } | null = null;

  const read = (pages: readonly string[]): Promise<void> =>
    new Promise((resolve) => ctx.read(pages, resolve));
  const wait = (seconds: number): Promise<void> =>
    new Promise((resolve) => {
      waitLeft = seconds;
      waitDone = resolve;
    });
  const fade = (toBlack: boolean): Promise<void> => ctx.overlay.fade(toBlack);

  const tvAt = { x: ROOM_X, z: -2.1 };
  const doorAt = { x: ROOM_X - 3.2, z: 1.2 };
  const momSpot = (prompt: string, hint: string): Spot => ({
    at: mom.group.position,
    reach: 2.2,
    prompt,
    hint,
  });
  const spots: Record<ActiveStep, Spot> = {
    news: {
      at: tvAt,
      reach: 2.5,
      prompt: 'E: watch the news',
      hint: 'Walk to the TV: W A S D to move, mouse to look',
    },
    'mom-leaves': momSpot('E: talk to Mom', 'Go to Mom'),
    'mom-back': momSpot('E: talk to Mom', 'Go to Mom'),
    outside: { at: doorAt, reach: 1.4, prompt: 'E: go outside', hint: 'Go to the front door' },
    throw: momSpot('E: stand with Mom', 'Go to Mom, by the water'),
    goodbye: momSpot('', ''),
  };

  const actions: Record<ActiveStep, () => Promise<void>> = {
    news: () => read(INTRO_PAGES.news),
    'mom-leaves': async () => {
      await read(INTRO_PAGES['mom-leaves']);
      await fade(true);
      mom.group.position.set(ROOM_X - 2.6, 0, 0.5);
      mom.group.rotation.y = Math.PI / 2;
      mom.pack.visible = true;
      await fade(false);
    },
    'mom-back': () => read(INTRO_PAGES['mom-back']),
    outside: async () => {
      await fade(true);
      inside = false;
      tvLight.intensity = 0;
      applyDim(lights, LIGHTING.dusk, 0);
      ctx.player.setColliders(OUTSIDE_COLLIDERS);
      ctx.player.teleport(OUTSIDE_SPAWN_X, 0, YAW_EAST);
      mom.group.position.set(MOM_OUT_X, 0, 0);
      water = ctx.audio.loop(sounds.water, WATER_VOLUME);
      await fade(false);
      await read(INTRO_PAGES.outside);
    },
    throw: async () => {
      mom.play('Interact', true);
      await wait(THROW_DELAY);
      mom.pack.visible = false;
      const { x, z } = mom.group.position;
      fish.feed({ x: x + HAND_REACH, y: HAND_HEIGHT, z });
      await wait(TAKE_WAIT);
      await read(INTRO_PAGES.throw);
    },
    goodbye: async () => {
      mom.play('Idle_Gun_Pointing');
      await read(INTRO_PAGES.goodbye);
    },
  };

  async function perform(current: ActiveStep): Promise<void> {
    busy = true;
    hud.prompt(null);
    await actions[current]();
    step = nextIntroStep(current);
    if (step === 'goodbye') {
      await actions.goodbye();
      step = 'done';
      onDone();
    }
    busy = false;
  }

  function tick(dt: number): void {
    time += dt;
    mom.update(dt);
    if (inside) {
      news.update(time);
      tvLight.intensity =
        TV_LIGHT.intensity *
        (1 - TV_LIGHT.flicker * Math.abs(Math.sin(time * 23) * Math.sin(time * 7.3)));
    } else fish.update(dt, cam, null, false);
    if (waitDone) {
      waitLeft -= dt;
      if (waitLeft <= 0) {
        const resolve = waitDone;
        waitDone = null;
        resolve();
      }
    }
  }

  function interact(current: ActiveStep, pressed: boolean): void {
    const spot = spots[current];
    const near = Math.hypot(cam.x - spot.at.x, cam.z - spot.at.z) <= spot.reach;
    hud.prompt(near ? spot.prompt : spot.hint);
    if (near && pressed) void perform(current);
  }

  const stop = ctx.stage.addUpdater((dt) => {
    const pressed = ctx.keys.consumePress('KeyE');
    lights.sky.position.set(cam.x, 0, cam.z);
    if (ctx.isPaused() || disposed) return;
    tick(dt);
    if (busy || step === 'done') return;
    interact(step, pressed);
  });

  ctx.player.setColliders(ROOM_COLLIDERS);
  ctx.player.teleport(ROOM_X, 1.05, 0);
  ctx.stage.scene = scene;

  return {
    dispose() {
      disposed = true;
      stop();
      water?.stop();
      hud.dispose();
      fish.dispose();
      mom.dispose();
      news.dispose();
      disposeScene(scene);
    },
  };
}
