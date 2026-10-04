import * as THREE from 'three/webgpu';
import type { AudioBus } from '../../../engine/audio';
import type { BoxGrid } from '../../../engine/grid';
import { loadSkinned, type SkinnedAsset } from '../../../engine/models';
import { inCone, type Vec3 } from '../../../engine/ray';
import { characterUrl } from '../kits';
import { createBody, move, park, play, type Body, type Scratch } from './body';
import {
  flinch,
  hitKills,
  isAlive,
  kill as killMind,
  newMind,
  seize as seizeMind,
  think,
  throwByFish as throwMind,
  type Tuning,
} from './brain';
import { bodyHit, CLIP_FOR, timeScaleFor } from './look';
import { THROWN, thrownTilt } from './thrown';
import { createVoices, type Voices } from './voices';

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
  rayHit(
    origin: Vec3,
    dir: Vec3,
    maxDistance: number,
  ): { id: number; distance: number; head: boolean } | null;
  /** A bullet or arrow struck `id`: true if it died (a head hit, or enough body hits), else it flinches. */
  hurt(id: number, head: boolean): boolean;
  kill(id: number): void;
  /** The orca knocks `id` into the lake (its jaws are at depth jawZ: it flies away from them): it flies, splashes, sinks. */
  throwByFish(id: number, jawZ: number): void;
  /** Called where a thrown zombie hits the water (the orca's big splash). */
  onSplash: ((x: number, z: number) => void) | null;
  /** The orca bites `id`: false if it is no longer alive. Pose it with hold(), end with drown(). */
  seize(id: number): boolean;
  /** Puts a held zombie in the orca's jaws: position, facing and sideways tilt (radians). */
  hold(id: number, x: number, y: number, z: number, yaw: number, tilt: number): void;
  /** Under the water with the orca: gone. */
  drown(id: number): void;
  /** Where `id` is (into `out`); false unless it is alive. */
  locate(id: number, out: { x: number; z: number }): boolean;
  alert(x: number, z: number, radius: number): void;
  /** Alive zombies (not dying, taken or dead). */
  forEachAlive(fn: (id: number, x: number, z: number) => void): void;
  aliveCount(): number;
  /** Alive and awake: not lying down and not standing idle (rising, chasing, hitting, stunned). */
  awakeCount(): number;
  reset(): void;
  dispose(): void;
}

/** Tuning knobs. */
const SHADOW_EVERY = 0.5;
const SHADOW_COUNT = 4;
const SHADOW_RANGE = 15;
const GROAN_MIN = 1.2;
const GROAN_MAX = 3.5;
const CHEST_Y = 1.1;

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

/** All mutable horde state; the functions below operate on it (keeps each under 50 lines). */
interface HordeState {
  readonly bodies: Body[];
  readonly grid: BoxGrid;
  readonly s: Scratch;
  readonly voices: Voices;
  readonly timers: { shadow: number; groan: number };
  onSplash: ((x: number, z: number) => void) | null;
  readonly shadowDistances: Float32Array;
  readonly picked: Uint8Array;
  seq: number;
}

function tick(
  h: HordeState,
  b: Body,
  id: number,
  dt: number,
  player: PlayerSense,
  onHit: (d: number) => void,
): void {
  const { senses, chest } = h.s;
  senses.distance = Math.hypot(player.x - b.x, player.z - b.z);
  chest.set(b.x, CHEST_Y, b.z);
  senses.lit =
    player.beamOn && inCone(player.eye, player.look, chest, player.beamRange, player.beamHalfAngle);
  senses.heard = b.heard;
  b.heard = false;
  const t = think(b.mind, senses, b.tuning, dt, b.thought);
  if (t.hit) onHit(b.tuning.damage);
  if (t.intent !== b.intent) {
    if (t.intent === 'strike') h.voices.say(id, 1, true);
    else if (t.intent === 'fall') h.voices.say(id, 0.8, true);
  }
  move(b, dt, player, h.grid, h.s);
  play(b, t.intent);
  if (t.intent === 'walk' || t.intent === 'run') {
    b.action?.setEffectiveTimeScale(timeScaleFor(CLIP_FOR[t.intent], b.tuning.speed));
  }
  b.mixer.update(dt);
  b.root.position.set(b.x, b.y, b.z);
  b.root.rotation.y = b.yaw;
  if (t.intent === 'thrown') {
    b.root.rotation.z = thrownTilt(b.fly);
    if (b.splashDue) {
      b.splashDue = false;
      h.onSplash?.(b.x, b.z);
    }
  }
  if (t.intent === 'thrown' && b.mind.state === 'dead') {
    h.voices.release(id);
    park(b);
  }
}

function collectNeighbours(h: HordeState): void {
  const { s } = h;
  s.count = 0;
  for (const b of h.bodies) {
    if (!b.active || !isAlive(b.mind)) continue;
    s.neighbours[s.count * 2] = b.x;
    s.neighbours[s.count * 2 + 1] = b.z;
    s.count++;
  }
}

function freeSlot(bodies: readonly Body[]): number {
  let oldest = -1;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.active) return i;
    if (b.mind.state === 'dead' && (oldest < 0 || b.order < bodies[oldest].order)) oldest = i;
  }
  return oldest;
}

function spawnZombie(
  h: HordeState,
  x: number,
  z: number,
  yaw: number,
  tuning: Tuning,
  lying: boolean,
): number {
  const id = freeSlot(h.bodies);
  if (id < 0) return -1;
  const b = h.bodies[id];
  h.voices.release(id);
  park(b);
  b.active = true;
  b.order = ++h.seq;
  b.heard = false;
  b.wounds = 0;
  b.x = x;
  b.y = 0;
  b.z = z;
  b.yaw = yaw;
  b.mind = newMind(lying);
  b.tuning.sight = tuning.sight;
  b.tuning.speed = tuning.speed;
  b.tuning.giveUp = tuning.giveUp;
  b.tuning.stun = tuning.stun;
  b.tuning.damage = tuning.damage;
  b.tuning.bodyHits = tuning.bodyHits;
  b.root.visible = true;
  b.root.position.set(x, 0, z);
  b.root.rotation.y = yaw;
  play(b, lying ? 'lie' : 'stand', 0);
  b.mixer.update(0);
  return id;
}

function updateHorde(
  h: HordeState,
  dt: number,
  player: PlayerSense,
  onHit: (damage: number) => void,
): void {
  collectNeighbours(h);
  for (let id = 0; id < h.bodies.length; id++) {
    const b = h.bodies[id];
    if (b.active && b.mind.state !== 'dead') tick(h, b, id, dt, player, onHit);
  }
  h.timers.shadow -= dt;
  if (h.timers.shadow <= 0) {
    h.timers.shadow = SHADOW_EVERY;
    pickShadowCasters(h.bodies, player, h.shadowDistances, h.picked);
  }
  h.timers.groan -= dt;
  if (h.timers.groan <= 0) {
    h.timers.groan = GROAN_MIN + Math.random() * (GROAN_MAX - GROAN_MIN);
    h.voices.groanSomeone(player);
  }
}

function rayHitHorde(
  bodies: readonly Body[],
  origin: Vec3,
  dir: Vec3,
  maxDistance: number,
): { id: number; distance: number; head: boolean } | null {
  let best: { id: number; distance: number; head: boolean } | null = null;
  for (let id = 0; id < bodies.length; id++) {
    const b = bodies[id];
    if (!b.active || !isAlive(b.mind)) continue;
    const d = bodyHit(origin, dir, b.x, b.y, b.z, b.mind.state === 'lying');
    if (d !== null && d.distance <= maxDistance && (!best || d.distance < best.distance)) {
      best = { id, distance: d.distance, head: d.head };
    }
  }
  return best;
}

function hurtBody(b: Body, head: boolean): boolean {
  if (!b.active || !isAlive(b.mind)) return false;
  b.wounds++;
  if (hitKills(b.wounds - 1, head, b.tuning.bodyHits)) {
    killMind(b.mind);
    return true;
  }
  b.heard = true;
  flinch(b.mind);
  return false;
}

function alertHorde(bodies: readonly Body[], x: number, z: number, radius: number): void {
  for (const b of bodies) {
    if (b.active && isAlive(b.mind) && Math.hypot(b.x - x, b.z - z) <= radius) b.heard = true;
  }
}

function seizeBody(h: HordeState, id: number): boolean {
  const b = h.bodies[id];
  if (!b.active || !seizeMind(b.mind)) return false;
  h.voices.say(id, 1, true);
  return true;
}

function holdBody(b: Body, x: number, y: number, z: number, yaw: number, tilt: number): void {
  if (b.mind.state !== 'held') return;
  b.x = x;
  b.y = y;
  b.z = z;
  b.yaw = yaw;
  b.root.position.set(x, y, z);
  b.root.rotation.set(0, yaw, tilt);
}

/** Knocks it aside: it flies from where it stands, away from the jaws (at `jawZ`) along the bank. */
function throwBody(b: Body, jawZ: number): void {
  if (!b.active || !isAlive(b.mind)) return;
  throwMind(b.mind);
  b.fly = 0;
  b.fromX = b.x;
  b.fromZ = b.z;
  b.push = b.z >= jawZ ? THROWN.push : -THROWN.push;
  b.splashDue = false;
}

function drownBody(h: HordeState, id: number): void {
  const b = h.bodies[id];
  if (b.mind.state !== 'held') return;
  b.mind.state = 'dead';
  h.voices.release(id);
  park(b);
}

function aliveCount(bodies: readonly Body[]): number {
  let n = 0;
  for (const b of bodies) if (b.active && isAlive(b.mind)) n++;
  return n;
}

function awakeCount(bodies: readonly Body[]): number {
  let n = 0;
  for (const b of bodies) {
    const s = b.mind.state;
    if (b.active && isAlive(b.mind) && s !== 'lying' && s !== 'idle') n++;
  }
  return n;
}

function resetHorde(h: HordeState): void {
  h.voices.stopAll();
  for (const b of h.bodies) park(b);
  h.timers.shadow = 0;
  h.timers.groan = GROAN_MIN;
}

function disposeHorde(h: HordeState): void {
  h.voices.dispose();
  for (const b of h.bodies) {
    b.mixer.stopAllAction();
    b.mixer.uncacheRoot(b.root);
    b.root.removeFromParent();
  }
}

function createState(
  scene: THREE.Scene,
  audio: AudioBus,
  grid: BoxGrid,
  groans: readonly AudioBuffer[],
  capacity: number,
  assets: Record<'m' | 'f', SkinnedAsset>,
): HordeState {
  const bodies = Array.from({ length: capacity }, (_, i) => createBody(i, assets));
  for (const b of bodies) scene.add(b.root);
  return {
    bodies,
    grid,
    s: {
      chest: new THREE.Vector3(),
      senses: { distance: 0, lit: false, heard: false },
      dir: { x: 0, z: 0 },
      pos: { x: 0, z: 0 },
      neighbours: new Float32Array(capacity * 2),
      count: 0,
    },
    voices: createVoices(audio, groans, bodies),
    timers: { shadow: 0, groan: GROAN_MIN },
    onSplash: null,
    shadowDistances: new Float32Array(capacity),
    picked: new Uint8Array(capacity),
    seq: 0,
  };
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
  const h = createState(scene, audio, grid, groans, capacity, { m, f });
  const { bodies } = h;
  return {
    spawn: (x, z, yaw, tuning, lying = false) => spawnZombie(h, x, z, yaw, tuning, lying),
    update: (dt, player, onHit) => updateHorde(h, dt, player, onHit),
    rayHit: (origin, dir, maxDistance) => rayHitHorde(bodies, origin, dir, maxDistance),
    hurt: (id, head) => hurtBody(bodies[id], head),
    kill: (id) => killMind(bodies[id].mind),
    throwByFish: (id, jawZ) => throwBody(bodies[id], jawZ),
    get onSplash() {
      return h.onSplash;
    },
    set onSplash(fn) {
      h.onSplash = fn;
    },
    seize: (id) => seizeBody(h, id),
    hold: (id, x, y, z, yaw, tilt) => holdBody(bodies[id], x, y, z, yaw, tilt),
    drown: (id) => drownBody(h, id),
    locate(id, out) {
      const b = bodies[id];
      if (!b?.active || !isAlive(b.mind)) return false;
      out.x = b.x;
      out.z = b.z;
      return true;
    },
    alert: (x, z, radius) => alertHorde(bodies, x, z, radius),
    forEachAlive(fn) {
      for (let id = 0; id < bodies.length; id++) {
        const b = bodies[id];
        if (b.active && isAlive(b.mind)) fn(id, b.x, b.z);
      }
    },
    aliveCount: () => aliveCount(bodies),
    awakeCount: () => awakeCount(bodies),
    reset: () => resetHorde(h),
    dispose: () => disposeHorde(h),
  };
}
