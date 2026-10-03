import * as THREE from 'three/webgpu';

export interface AudioBus {
  readonly listener: THREE.AudioListener;
  /** Browsers start audio suspended; call from a click handler. */
  unlock(): Promise<void>;
  setVolume(volume: number): void;
  loop(buffer: AudioBuffer, volume: number): THREE.Audio;
}

export function createAudioBus(camera: THREE.Camera): AudioBus {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  return {
    listener,
    async unlock() {
      if (listener.context.state !== 'running') await listener.context.resume();
    },
    setVolume(volume) {
      listener.setMasterVolume(volume);
    },
    loop(buffer, volume) {
      const sound = new THREE.Audio(listener);
      sound.setBuffer(buffer);
      sound.setLoop(true);
      sound.setVolume(volume);
      sound.play();
      return sound;
    },
  };
}

/** Brown noise (smoothed white noise): a low room rumble, no sound file needed. Values stay in -1..1. */
export function brownNoise(
  length: number,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    samples[i] = Math.max(-1, Math.min(1, last * 3.5));
  }
  return samples;
}

export function roomToneBuffer(context: BaseAudioContext, seconds = 6): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    Math.floor(context.sampleRate * seconds),
    context.sampleRate,
  );
  buffer.copyToChannel(brownNoise(buffer.length), 0);
  return buffer;
}
