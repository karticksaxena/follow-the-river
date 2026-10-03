import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import type { AudioBus } from '../../../engine/audio';
import { resolveCircle } from '../../../engine/collide';
import type { BoxGrid } from '../../../engine/grid';
import { loadSkinned, type SkinnedAsset } from '../../../engine/models';
import { inCone, type Vec3 } from '../../../engine/ray';
import { characterUrl } from '../kits';
import {
  ATTACK,
  isAlive,
  kill as killMind,
  newMind,
  takeByFish as takeMind,
  think,
  type Intent,
  type Mind,
  type Senses,
  type Thought,
  type Tuning,
} from './brain';
import { bodyHit, CLIP_FOR, LOOPING, pickOutfit, timeScaleFor } from './look';
import { steer } from './steer';

export interface PlayerSense {
  x: number;
  z: number;
  eye: Vec3;
  look: Vec3;
  beamOn: boolean;
  beamRange: number;
  beamHalfAngle: number;
}

export interface Horde {
  /** Places a zombie from the pool (a never-used or long-dead slot). Returns its id, or −1 when full. */
  spawn(x: number, z: number, yaw: number, tuning: Tuning, lying?: boolean): number;
  update(dt: number, player: PlayerSense, onHit: (damage: number) => void): void;
  rayHit(origin: Vec3, dir: Vec3, maxDistance: number): { id: number; distance: number } | null;
  kill(id: number): void;
  takeByFish(id: number): void;
  alert(x: number, z: number, radius: number): void;
  /** Alive zombies (not dying, taken or dead). */
  forEachAlive(fn: (id: number, x: number, z: number) => void): void;
  aliveCount(): number;
  reset(): void;
  dispose(): void;
}

/** Tuning knobs. */
const FADE = 0.25;
const RADIUS = 0.35;
const TURN_RATE = 6;
const DRAG_SPEED = 2;
const SINK_SPEED = 1.2;
const PARK_Y = -50;
const SHADOW_EVERY = 0.5;
const SHADOW_COUNT = 4;
const SHADOW_RANGE = 15;
const VOICES = 4;
const GROAN_RANGE = 25;
const GROAN_MIN = 1.2;
const GROAN_MAX = 3.5;
const CHEST_Y = 1.1;

interface Body {
  root: THREE.Object3D;
  mesh: THREE.Object3D | null;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  action: THREE.AnimationAction | null;
  intent: Intent | null;
  active: boolean;
  order: number;
  heard: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  mind: Mind;
  tuning: Tuning;
  thought: Thought;
}

function createBody(i: number, assets: Record<'m' | 'f', SkinnedAsset>): Body {
  const { body, outfit } = pickOutfit(i);
  const asset = assets[body];
  const root = clone(asset.scene);
  const skinned: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) skinned.push(node);
  });
  for (const node of skinned) if (node.name !== outfit) node.removeFromParent();
  const kept = skinned.find((node) => node.name === outfit) ?? null;
  if (kept) kept.frustumCulled = false;
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of asset.clips) {
    const action = mixer.clipAction(clip);
    if (!LOOPING.has(clip.name)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions.set(clip.name, action);
  }
  root.visible = false;
  root.position.set(0, PARK_Y, 0);
  return {
    root,
    mesh: kept,
    mixer,
    actions,
    action: null,
    intent: null,
    active: false,
    order: 0,
    heard: false,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    mind: newMind(),
    tuning: { sight: 0, speed: 0, giveUp: 0 },
    thought: { intent: 'stand', hit: false },
  };
}

function park(b: Body): void {
  b.active = false;
  b.root.visible = false;
  b.root.position.set(0, PARK_Y, 0);
  b.mixer.stopAllAction();
  b.action = null;
  b.intent = null;
}

/** Cross-fades to the clip for `intent` (fade 0: snap). `lie` is Death held on its last frame. */
function play(b: Body, intent: Intent, fade = FADE): void {
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

function turn(yaw: number, target: number, maxStep: number): number {
  const d = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  return yaw + Math.max(-maxStep, Math.min(maxStep, d));
}

interface Scratch {
  chest: THREE.Vector3;
  senses: Senses;
  dir: { x: number; z: number };
  neighbours: Float32Array;
  count: number;
}

/** Walks/runs toward the player (or drifts downriver when dragged) and turns to face the way it moves. */
function move(b: Body, dt: number, player: PlayerSense, grid: BoxGrid, s: Scratch): void {
  const intent = b.thought.intent;
  let face = b.yaw;
  if (intent === 'walk' || intent === 'run') {
    steer(b.x, b.z, player.x, player.z, s.neighbours, s.count, s.dir);
    const next = resolveCircle(
      b.x + s.dir.x * b.tuning.speed * dt,
      b.z + s.dir.z * b.tuning.speed * dt,
      RADIUS,
      grid.near(b.x, b.z, 1),
    );
    b.x = next.x;
    b.z = next.z;
    if (s.dir.x !== 0 || s.dir.z !== 0) face = Math.atan2(s.dir.x, s.dir.z);
  } else if (intent === 'strike') {
    face = Math.atan2(player.x - b.x, player.z - b.z);
  } else if (intent === 'dragged') {
    b.x += DRAG_SPEED * dt;
    b.y -= SINK_SPEED * dt;
  }
  b.yaw = turn(b.yaw, face, TURN_RATE * dt);
}

interface Voices {
  /** Plays a groan on zombie `id`. `steal`: take over its own voice or the oldest one instead of skipping. */
  say(id: number, volume: number, steal: boolean): void;
  /** Stops and frees any voice owned by zombie `id`. */
  release(id: number): void;
  groanSomeone(player: PlayerSense): void;
  stopAll(): void;
  dispose(): void;
}

function createVoices(
  audio: AudioBus,
  groans: readonly AudioBuffer[],
  bodies: readonly Body[],
): Voices {
  const voices = Array.from({ length: VOICES }, () => audio.positional(bodies[0].root, 3));
  const owners = new Int32Array(VOICES).fill(-1);
  const started = new Float64Array(VOICES);
  let clock = 0;

  /** Voice index to use for `id`: its own if playing (steal only), else a free one, else the oldest (steal only). */
  function pick(id: number, steal: boolean): number {
    let free = -1;
    let oldest = 0;
    for (let v = 0; v < VOICES; v++) {
      if (!voices[v].isPlaying) {
        if (free < 0) free = v;
        continue;
      }
      if (owners[v] === id) return steal ? v : -1;
      if (started[v] < started[oldest]) oldest = v;
    }
    if (free >= 0) return free;
    return steal ? oldest : -1;
  }

  function say(id: number, volume: number, steal: boolean): void {
    if (groans.length === 0) return;
    const v = pick(id, steal);
    if (v < 0) return;
    const sound = voices[v];
    if (sound.isPlaying) sound.stop();
    bodies[id].root.add(sound);
    sound.setBuffer(groans[Math.floor(Math.random() * groans.length)]);
    sound.setVolume(volume);
    owners[v] = id;
    started[v] = ++clock;
    sound.play();
  }

  function release(id: number): void {
    for (let v = 0; v < VOICES; v++) {
      if (owners[v] !== id) continue;
      if (voices[v].isPlaying) voices[v].stop();
      owners[v] = -1;
    }
  }

  function groanSomeone(player: PlayerSense): void {
    let n = 0;
    for (let pass = 0; pass < 2; pass++) {
      let target = pass === 1 ? Math.floor(Math.random() * n) : -1;
      for (let id = 0; id < bodies.length; id++) {
        const b = bodies[id];
        if (!b.active || !isAlive(b.mind)) continue;
        if (Math.hypot(b.x - player.x, b.z - player.z) > GROAN_RANGE) continue;
        if (pass === 0) n++;
        else if (target-- === 0) return say(id, 0.8, false);
      }
      if (n === 0) return;
    }
  }

  const stopAll = (): void => {
    owners.fill(-1);
    for (const sound of voices) if (sound.isPlaying) sound.stop();
  };

  return {
    say,
    release,
    groanSomeone,
    stopAll,
    dispose() {
      stopAll();
      for (const sound of voices) {
        sound.disconnect();
        sound.removeFromParent();
      }
    },
  };
}

/** Marks the SHADOW_COUNT nearest alive zombies within SHADOW_RANGE of the player as shadow casters. */
function pickShadowCasters(
  bodies: readonly Body[],
  player: PlayerSense,
  distances: Float32Array,
  picked: Uint8Array,
): void {
  picked.fill(0);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const d = Math.hypot(b.x - player.x, b.z - player.z);
    distances[i] = b.active && isAlive(b.mind) && d <= SHADOW_RANGE ? d : Infinity;
  }
  for (let k = 0; k < SHADOW_COUNT; k++) {
    let best = -1;
    for (let i = 0; i < bodies.length; i++) {
      if (!picked[i] && distances[i] < Infinity && (best < 0 || distances[i] < distances[best])) {
        best = i;
      }
    }
    if (best < 0) break;
    picked[best] = 1;
  }
  for (let i = 0; i < bodies.length; i++) {
    const mesh = bodies[i].mesh;
    if (mesh) mesh.castShadow = picked[i] === 1;
  }
}

export async function createHorde(
  scene: THREE.Scene,
  audio: AudioBus,
  grid: BoxGrid,
  groans: readonly AudioBuffer[],
  capacity: number,
): Promise<Horde> {
  const [m, f] = await Promise.all([
    loadSkinned(characterUrl('zombie-m')),
    loadSkinned(characterUrl('zombie-f')),
  ]);
  const bodies = Array.from({ length: capacity }, (_, i) => createBody(i, { m, f }));
  for (const b of bodies) scene.add(b.root);
  const s: Scratch = {
    chest: new THREE.Vector3(),
    senses: { distance: 0, lit: false, heard: false },
    dir: { x: 0, z: 0 },
    neighbours: new Float32Array(capacity * 2),
    count: 0,
  };
  const voices = createVoices(audio, groans, bodies);
  const timers = { shadow: 0, groan: GROAN_MIN };
  const shadowDistances = new Float32Array(capacity);
  const picked = new Uint8Array(capacity);
  let seq = 0;

  function tick(
    b: Body,
    id: number,
    dt: number,
    player: PlayerSense,
    onHit: (d: number) => void,
  ): void {
    const { senses, chest } = s;
    senses.distance = Math.hypot(player.x - b.x, player.z - b.z);
    chest.set(b.x, CHEST_Y, b.z);
    senses.lit =
      player.beamOn &&
      inCone(player.eye, player.look, chest, player.beamRange, player.beamHalfAngle);
    senses.heard = b.heard;
    b.heard = false;
    const t = think(b.mind, senses, b.tuning, dt, b.thought);
    if (t.hit) onHit(ATTACK.damage);
    if (t.intent !== b.intent) {
      if (t.intent === 'strike') voices.say(id, 1, true);
      else if (t.intent === 'fall') voices.say(id, 0.8, true);
    }
    move(b, dt, player, grid, s);
    play(b, t.intent);
    if (t.intent === 'walk' || t.intent === 'run') {
      b.action?.setEffectiveTimeScale(timeScaleFor(CLIP_FOR[t.intent], b.tuning.speed));
    }
    b.mixer.update(dt);
    b.root.position.set(b.x, b.y, b.z);
    b.root.rotation.y = b.yaw;
    if (t.intent === 'dragged' && b.mind.state === 'dead') {
      voices.release(id);
      park(b);
    }
  }

  function collectNeighbours(): void {
    s.count = 0;
    for (const b of bodies) {
      if (!b.active || !isAlive(b.mind)) continue;
      s.neighbours[s.count * 2] = b.x;
      s.neighbours[s.count * 2 + 1] = b.z;
      s.count++;
    }
  }

  function freeSlot(): number {
    let oldest = -1;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.active) return i;
      if (b.mind.state === 'dead' && (oldest < 0 || b.order < bodies[oldest].order)) oldest = i;
    }
    return oldest;
  }

  return {
    spawn(x, z, yaw, tuning, lying = false) {
      const id = freeSlot();
      if (id < 0) return -1;
      const b = bodies[id];
      voices.release(id);
      park(b);
      b.active = true;
      b.order = ++seq;
      b.heard = false;
      b.x = x;
      b.y = 0;
      b.z = z;
      b.yaw = yaw;
      b.mind = newMind(lying);
      b.tuning.sight = tuning.sight;
      b.tuning.speed = tuning.speed;
      b.tuning.giveUp = tuning.giveUp;
      b.root.visible = true;
      b.root.position.set(x, 0, z);
      b.root.rotation.y = yaw;
      play(b, lying ? 'lie' : 'stand', 0);
      b.mixer.update(0);
      return id;
    },
    update(dt, player, onHit) {
      collectNeighbours();
      for (let id = 0; id < bodies.length; id++) {
        const b = bodies[id];
        if (b.active && b.mind.state !== 'dead') tick(b, id, dt, player, onHit);
      }
      timers.shadow -= dt;
      if (timers.shadow <= 0) {
        timers.shadow = SHADOW_EVERY;
        pickShadowCasters(bodies, player, shadowDistances, picked);
      }
      timers.groan -= dt;
      if (timers.groan <= 0) {
        timers.groan = GROAN_MIN + Math.random() * (GROAN_MAX - GROAN_MIN);
        voices.groanSomeone(player);
      }
    },
    rayHit(origin, dir, maxDistance) {
      let best: { id: number; distance: number } | null = null;
      for (let id = 0; id < bodies.length; id++) {
        const b = bodies[id];
        if (!b.active || !isAlive(b.mind)) continue;
        const d = bodyHit(origin, dir, b.x, b.y, b.z, b.mind.state === 'lying');
        if (d !== null && d <= maxDistance && (!best || d < best.distance)) {
          best = { id, distance: d };
        }
      }
      return best;
    },
    kill: (id) => killMind(bodies[id].mind),
    takeByFish: (id) => takeMind(bodies[id].mind),
    alert(x, z, radius) {
      for (const b of bodies) {
        if (b.active && isAlive(b.mind) && Math.hypot(b.x - x, b.z - z) <= radius) b.heard = true;
      }
    },
    forEachAlive(fn) {
      for (let id = 0; id < bodies.length; id++) {
        const b = bodies[id];
        if (b.active && isAlive(b.mind)) fn(id, b.x, b.z);
      }
    },
    aliveCount() {
      let n = 0;
      for (const b of bodies) if (b.active && isAlive(b.mind)) n++;
      return n;
    },
    reset() {
      voices.stopAll();
      for (const b of bodies) park(b);
      timers.shadow = 0;
      timers.groan = GROAN_MIN;
    },
    dispose() {
      voices.dispose();
      for (const b of bodies) {
        b.mixer.stopAllAction();
        b.mixer.uncacheRoot(b.root);
        b.root.removeFromParent();
      }
    },
  };
}
