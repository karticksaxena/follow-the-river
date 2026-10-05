import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import { resolveCircle } from '../../../engine/collide';
import type { BoxGrid } from '../../../engine/grid';
import type { Interior } from '../../../engine/interiors';
import type { SkinnedAsset } from '../../../engine/models';
import { EDGE_X } from '../river';
import {
  DAY_TUNING,
  newMind,
  type Intent,
  type Mind,
  type Senses,
  type Thought,
  type Tuning,
} from './brain';
import { addRim, CLIP_FOR, findHeadBone, LOOPING, pickOutfit } from './look';
import { aimAt } from './route';
import { steer } from './steer';
import { THROWN, thrownPose } from './thrown';

/** Tuning knobs. */
const FADE = 0.25;
const RADIUS = 0.35;
const TURN_RATE = 6;
/** Share of its speed a zombie keeps while winding up a blow. */
const LUNGE = 0.45;
const PARK_Y = -50;

export interface Body {
  root: THREE.Object3D;
  mesh: THREE.Object3D | null;
  /** The skeleton's `Head` bone (null: the model has none), found once at build. */
  head: THREE.Object3D | null;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  action: THREE.AnimationAction | null;
  intent: Intent | null;
  active: boolean;
  order: number;
  heard: boolean;
  /** Body hits taken so far (see `hitKills`). */
  wounds: number;
  /** An extra asleep in a house (not part of the wave): see `Horde.sleepingCount`. */
  sleeper: boolean;
  /** Thrown by the orca (thrown.ts): seconds since, where from, the sideways push (m/s), and the splash is due. */
  fly: number;
  fromX: number;
  fromZ: number;
  push: number;
  splashDue: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  mind: Mind;
  tuning: Tuning;
  thought: Thought;
}

/** Per-horde scratch (reused every frame: no allocation in the hot loop). */
export interface Scratch {
  chest: THREE.Vector3;
  senses: Senses;
  dir: { x: number; z: number };
  /** Reused out parameter for `resolveCircle`. */
  pos: { x: number; z: number };
  /** Reused out parameter for `aimAt`: where the zombie heads (the player, or a door). */
  aim: { x: number; z: number };
  /** The buildings whose doors zombies use (route.ts). */
  houses: readonly Interior[];
  neighbours: Float32Array;
  count: number;
}

function buildActions(
  mixer: THREE.AnimationMixer,
  clips: readonly THREE.AnimationClip[],
): Map<string, THREE.AnimationAction> {
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of clips) {
    const action = mixer.clipAction(clip);
    if (!LOOPING.has(clip.name)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions.set(clip.name, action);
  }
  return actions;
}

export function createBody(i: number, assets: Record<'m' | 'f', SkinnedAsset>): Body {
  const { body, outfit } = pickOutfit(i);
  const asset = assets[body];
  const root = clone(asset.scene);
  const skinned: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) skinned.push(node);
  });
  for (const node of skinned) if (node.name !== outfit) node.removeFromParent();
  const kept = skinned.find((node) => node.name === outfit) ?? null;
  if (kept) {
    kept.frustumCulled = false;
    addRim(kept);
  }
  const mixer = new THREE.AnimationMixer(root);
  const actions = buildActions(mixer, asset.clips);
  root.visible = false;
  root.position.set(0, PARK_Y, 0);
  return {
    root,
    mesh: kept,
    head: findHeadBone(root),
    mixer,
    actions,
    action: null,
    intent: null,
    active: false,
    order: 0,
    heard: false,
    wounds: 0,
    sleeper: false,
    fly: 0,
    fromX: 0,
    fromZ: 0,
    push: 0,
    splashDue: false,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    mind: newMind(),
    tuning: { ...DAY_TUNING },
    thought: { intent: 'stand', hit: false },
  };
}

export function park(b: Body): void {
  b.active = false;
  b.root.visible = false;
  b.root.position.set(0, PARK_Y, 0);
  b.root.rotation.set(0, 0, 0); // a body the orca shook or threw ends tilted
  b.fly = 0;
  b.splashDue = false;
  b.mixer.stopAllAction();
  b.action = null;
  b.intent = null;
}

/** Cross-fades to the clip for `intent` (fade 0: snap). `lie` is Death held on its last frame. */
export function play(b: Body, intent: Intent, fade = FADE): void {
  if (intent === b.intent) return;
  const was = b.intent;
  b.intent = intent;
  if (intent === 'fall' && was === 'lie') return;
  const next = b.actions.get(CLIP_FOR[intent]);
  if (!next) return;
  const prev = b.action;
  next.reset();
  if (intent === 'lie') {
    next.time = next.getClip().duration;
    next.paused = true;
  }
  next.play();
  if (prev && prev !== next) {
    if (fade > 0) {
      next.fadeIn(fade);
      prev.fadeOut(fade);
    } else prev.stop();
  }
  b.action = next;
}

const air = { x: 0, y: 0 };

/** The orca knocked it aside: it flies into the lake, splashes once, and sinks (see `thrownPose`). */
export function fly(
  b: Pick<Body, 'fly' | 'fromX' | 'fromZ' | 'push' | 'x' | 'y' | 'z' | 'splashDue'>,
  dt: number,
): void {
  b.fly += dt;
  const inWater = thrownPose(b.fly, { x: b.fromX, z: b.fromZ }, EDGE_X, air);
  b.x = air.x;
  b.y = air.y;
  b.z = b.fromZ + b.push * Math.min(b.fly, THROWN.flight);
  if (inWater && b.fly - dt < THROWN.flight) b.splashDue = true; // the frame it lands
}

export function turn(yaw: number, target: number, maxStep: number): number {
  const d = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  return yaw + Math.max(-maxStep, Math.min(maxStep, d));
}

/** Walks/runs toward the player (or flies when thrown) and turns to face the way it moves. */
export function move(
  b: Body,
  dt: number,
  player: { x: number; z: number },
  grid: BoxGrid,
  s: Scratch,
): void {
  const intent = b.thought.intent;
  let face = b.yaw;
  // A winding-up zombie lunges on at LUNGE of its speed: standing still, it could never land a
  // blow on a running player.
  const lunging = intent === 'strike' && b.mind.state === 'attack';
  if (intent === 'walk' || intent === 'run' || lunging) {
    const speed = b.tuning.speed * (lunging ? LUNGE : 1);
    aimAt(s.houses, b.x, b.z, player.x, player.z, s.aim);
    steer(b.x, b.z, s.aim.x, s.aim.z, s.neighbours, s.count, s.dir);
    const next = resolveCircle(
      b.x + s.dir.x * speed * dt,
      b.z + s.dir.z * speed * dt,
      RADIUS,
      grid.near(b.x, b.z, 1),
      s.pos,
    );
    b.x = next.x;
    b.z = next.z;
    if (s.dir.x !== 0 || s.dir.z !== 0) face = Math.atan2(s.dir.x, s.dir.z);
  } else if (intent === 'strike') {
    face = Math.atan2(player.x - b.x, player.z - b.z);
  } else if (intent === 'struggle') {
    return; // the orca poses it (Horde.hold)
  } else if (intent === 'thrown') {
    fly(b, dt);
    return;
  }
  b.yaw = turn(b.yaw, face, TURN_RATE * dt);
}
