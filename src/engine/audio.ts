import * as THREE from 'three/webgpu';

export type Channel = 'world' | 'voice';

export interface AudioBus {
  readonly listener: THREE.AudioListener;
  /** Browsers start audio suspended; call from a click handler. */
  unlock(): Promise<void>;
  setVolume(volume: number): void;
  /** Fetches and decodes once per URL; a failed fetch is retried next call. */
  load(url: string): Promise<AudioBuffer>;
  /**
   * Loops `buffer`. Decoded AAC files carry encoder padding, so their ends are trimmed (`loopBounds`);
   * pass `trim: false` for seamless buffers built in code (the horde layer).
   */
  loop(buffer: AudioBuffer, volume: number, channel?: Channel, trim?: boolean): THREE.Audio;
  /** Plays `buffer` once (a scare sting, a thud). Callers may stop the returned sound. */
  once(buffer: AudioBuffer, volume: number, channel?: Channel): THREE.Audio;
  /** A world-channel sound attached to `parent` (groans, splashes). Caller plays/stops it. */
  positional(parent: THREE.Object3D, refDistance: number): THREE.PositionalAudio;
  /** Smoothly mutes (true) or restores the world channel. The voice channel is unaffected. */
  setWorldPaused(paused: boolean): void;
}

const TRIM = 0.05;
const ROLLOFF = 1.6;
const PAUSE_FADE = 0.05;

/** Loop points that skip AAC encoder padding so ambience loops don't click. */
export function loopBounds(duration: number): { start: number; end: number } {
  return duration > 1 ? { start: TRIM, end: duration - TRIM } : { start: 0, end: duration };
}

/** Promise cache with eviction on failure (pure, testable). */
export function createLoadCache<T>(load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (key) => {
    let pending = cache.get(key);
    if (!pending) {
      pending = load(key);
      pending.catch(() => cache.delete(key));
      cache.set(key, pending);
    }
    return pending;
  };
}

export function createAudioBus(camera: THREE.Camera): AudioBus {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  const world = listener.context.createGain();
  world.connect(listener.getInput());
  let unlocked = false;

  // Safari suspends the context when the tab hides; wake it once the player has unlocked audio.
  document.addEventListener('visibilitychange', () => {
    if (unlocked && document.visibilityState === 'visible') {
      void listener.context.resume().catch(() => undefined);
    }
  });

  const route = <T extends { gain: GainNode }>(sound: T, channel: Channel): T => {
    if (channel === 'world') {
      sound.gain.disconnect();
      sound.gain.connect(world);
    }
    return sound;
  };
  const make = (buffer: AudioBuffer, volume: number, channel: Channel): THREE.Audio => {
    const sound = route(new THREE.Audio(listener), channel);
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    return sound;
  };

  return {
    listener,
    async unlock() {
      if (listener.context.state !== 'running') await listener.context.resume();
      unlocked = true;
    },
    setVolume(volume) {
      listener.setMasterVolume(volume);
    },
    load: createLoadCache(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return listener.context.decodeAudioData(await response.arrayBuffer());
    }),
    loop(buffer, volume, channel = 'world', trim = true) {
      const sound = make(buffer, volume, channel);
      sound.setLoop(true);
      if (trim) {
        const { start, end } = loopBounds(buffer.duration);
        sound.setLoopStart(start);
        sound.setLoopEnd(end);
      }
      sound.play();
      return sound;
    },
    once(buffer, volume, channel = 'world') {
      const sound = make(buffer, volume, channel);
      // three's own onEnded resets isPlaying; keep it, then free the audio graph node.
      const ended = sound.onEnded.bind(sound);
      sound.onEnded = () => {
        ended();
        sound.disconnect();
      };
      sound.play();
      return sound;
    },
    positional(parent, refDistance) {
      const sound = route(new THREE.PositionalAudio(listener), 'world');
      sound.setRefDistance(refDistance);
      sound.setRolloffFactor(ROLLOFF);
      parent.add(sound);
      return sound;
    },
    setWorldPaused(paused) {
      world.gain.setTargetAtTime(paused ? 0 : 1, listener.context.currentTime, PAUSE_FADE);
    },
  };
}
