import type * as THREE from 'three/webgpu';
import type { AudioBus } from '../../../engine/audio';
import type { Body } from './body';
import { isAlive } from './brain';

const VOICES = 4;
export const GROAN_RANGE = 25;
/** A zombie groans again no sooner than this (s), so the nearest ones take turns instead of one hogging it. */
export const GROAN_COOLDOWN = 4;
/** Within this (m) a groan takes a voice from the oldest one rather than being skipped when all are busy. */
const CLOSE = 10;

export interface Voices {
  /** Plays a groan on zombie `id`. `steal`: take over its own voice or the oldest one instead of skipping. */
  say(id: number, volume: number, steal: boolean): void;
  /** Stops and frees any voice owned by zombie `id`. */
  release(id: number): void;
  groanSomeone(player: { x: number; z: number }): void;
  stopAll(): void;
  dispose(): void;
}

interface VoiceState {
  readonly sounds: THREE.PositionalAudio[];
  readonly owners: Int32Array;
  readonly started: Float64Array;
  /** Per zombie: when it last groaned, and its distance to the player (scratch, Infinity = skip). */
  readonly lastSaid: Float64Array;
  readonly dist: Float64Array;
  readonly groans: readonly AudioBuffer[];
  readonly bodies: readonly Body[];
  clock: number;
}

/** Voice index to use for `id`: its own if playing (steal only), else a free one, else the oldest (steal only). */
function pick(s: VoiceState, id: number, steal: boolean): number {
  let free = -1;
  let oldest = 0;
  for (let v = 0; v < VOICES; v++) {
    if (!s.sounds[v].isPlaying) {
      if (free < 0) free = v;
      continue;
    }
    if (s.owners[v] === id) return steal ? v : -1;
    if (s.started[v] < s.started[oldest]) oldest = v;
  }
  if (free >= 0) return free;
  return steal ? oldest : -1;
}

function say(s: VoiceState, id: number, volume: number, steal: boolean): void {
  if (s.groans.length === 0) return;
  const v = pick(s, id, steal);
  if (v < 0) return;
  const sound = s.sounds[v];
  if (sound.isPlaying) sound.stop();
  s.bodies[id].root.add(sound);
  sound.setBuffer(s.groans[Math.floor(Math.random() * s.groans.length)]);
  sound.setVolume(volume);
  s.owners[v] = id;
  s.started[v] = ++s.clock;
  sound.play();
}

function release(s: VoiceState, id: number): void {
  for (let v = 0; v < VOICES; v++) {
    if (s.owners[v] !== id) continue;
    if (s.sounds[v].isPlaying) s.sounds[v].stop();
    s.owners[v] = -1;
  }
}

/** Index of the nearest zombie within range that is off cooldown, else -1. Pure; nearest-first, never by facing or order. */
export function pickGroaner(
  dist: ArrayLike<number>,
  lastSaid: ArrayLike<number>,
  now: number,
): number {
  let best = -1;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] > GROAN_RANGE || now - lastSaid[i] < GROAN_COOLDOWN) continue;
    if (best < 0 || dist[i] < dist[best]) best = i;
  }
  return best;
}

function groanSomeone(s: VoiceState, player: { x: number; z: number }): void {
  for (let id = 0; id < s.bodies.length; id++) {
    const b = s.bodies[id];
    s.dist[id] =
      b.active && isAlive(b.mind) ? Math.hypot(b.x - player.x, b.z - player.z) : Infinity;
  }
  const now = performance.now() / 1000;
  const id = pickGroaner(s.dist, s.lastSaid, now);
  if (id < 0) return;
  s.lastSaid[id] = now;
  say(s, id, 0.8, s.dist[id] < CLOSE);
}

function stopAll(s: VoiceState): void {
  s.owners.fill(-1);
  for (const sound of s.sounds) if (sound.isPlaying) sound.stop();
}

function disposeVoices(s: VoiceState): void {
  stopAll(s);
  for (const sound of s.sounds) {
    sound.disconnect();
    sound.removeFromParent();
  }
}

export function createVoices(
  audio: AudioBus,
  groans: readonly AudioBuffer[],
  bodies: readonly Body[],
): Voices {
  const s: VoiceState = {
    sounds: Array.from({ length: VOICES }, () => audio.positional(bodies[0].root, 3)),
    owners: new Int32Array(VOICES).fill(-1),
    started: new Float64Array(VOICES),
    lastSaid: new Float64Array(bodies.length).fill(-Infinity),
    dist: new Float64Array(bodies.length),
    groans,
    bodies,
    clock: 0,
  };
  return {
    say: (id, volume, steal) => say(s, id, volume, steal),
    release: (id) => release(s, id),
    groanSomeone: (player) => groanSomeone(s, player),
    stopAll: () => stopAll(s),
    dispose: () => disposeVoices(s),
  };
}
