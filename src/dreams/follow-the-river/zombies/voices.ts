import type * as THREE from 'three/webgpu';
import type { AudioBus } from '../../../engine/audio';
import type { Body } from './body';
import { isAlive } from './brain';

const VOICES = 4;
const GROAN_RANGE = 25;

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

function groanSomeone(s: VoiceState, player: { x: number; z: number }): void {
  let n = 0;
  for (let pass = 0; pass < 2; pass++) {
    let target = pass === 1 ? Math.floor(Math.random() * n) : -1;
    for (let id = 0; id < s.bodies.length; id++) {
      const b = s.bodies[id];
      if (!b.active || !isAlive(b.mind)) continue;
      if (Math.hypot(b.x - player.x, b.z - player.z) > GROAN_RANGE) continue;
      if (pass === 0) n++;
      else if (target-- === 0) return say(s, id, 0.8, false);
    }
    if (n === 0) return;
  }
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
