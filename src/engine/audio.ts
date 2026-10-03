import * as THREE from 'three/webgpu';

export interface AudioBus {
  readonly listener: THREE.AudioListener;
  /** Browsers start audio suspended; call from a click handler. */
  unlock(): Promise<void>;
  setVolume(volume: number): void;
  loop(buffer: AudioBuffer, volume: number): THREE.Audio;
  /** Plays `buffer` once (a scare sting, a thud). */
  once(buffer: AudioBuffer, volume: number): void;
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
    once(buffer, volume) {
      const sound = new THREE.Audio(listener);
      sound.setBuffer(buffer);
      sound.setVolume(volume);
      // three's own onEnded resets isPlaying; keep it, then free the audio graph node.
      const ended = sound.onEnded.bind(sound);
      sound.onEnded = () => {
        ended();
        sound.disconnect();
      };
      sound.play();
    },
  };
}
