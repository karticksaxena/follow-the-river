import type { AudioBus } from '../../engine/audio';
import { EDGE_X } from './river';
import type { Sounds } from './sounds';
import { SPAWNER } from './zombies/spawner';

/** Loudness per layer, and how fast volumes ease (per second). Tuning knobs. */
const VOLUME = { water: 0.5, wind: 0.25, drone: 0.3, horde: 0.6, heartbeat: 0.8 } as const;
const WATER_FADE_DISTANCE = 25;
const EASE_PER_SECOND = 1;

export interface Ambience {
  /** Eases every layer toward its target; the loops themselves never stop. */
  update(dt: number, x: number, night: boolean, zombies: number, hurt: boolean): void;
  dispose(): void;
}

interface Layer {
  sound: ReturnType<AudioBus['loop']>;
  volume: number;
}

function step(layer: Layer, target: number, dt: number): void {
  const delta = target - layer.volume;
  const max = EASE_PER_SECOND * dt;
  layer.volume += Math.max(-max, Math.min(max, delta));
  layer.sound.setVolume(layer.volume);
}

/** Water, wind, the night drone, the horde murmur and a heartbeat: all started once, volume-driven. */
export function createAmbience(audio: AudioBus, sounds: Sounds): Ambience {
  const start = (buffer: AudioBuffer, trim = true): Layer => ({
    sound: audio.loop(buffer, 0, 'world', trim),
    volume: 0,
  });
  const water = start(sounds.water);
  const wind = start(sounds.wind);
  const drone = start(sounds.night[0] ?? sounds.wind);
  const horde = start(sounds.horde, false);
  const heart = start(sounds.heartbeat, false);
  const layers = [water, wind, drone, horde, heart];
  return {
    update(dt, x, night, zombies, hurt) {
      const nearWater = Math.max(0, 1 - (EDGE_X - x) / WATER_FADE_DISTANCE);
      step(water, VOLUME.water * nearWater, dt);
      step(wind, night ? 0 : VOLUME.wind, dt);
      step(drone, night ? VOLUME.drone : 0, dt);
      step(horde, night ? (VOLUME.horde * zombies) / SPAWNER.cap : 0, dt);
      step(heart, hurt ? VOLUME.heartbeat : 0, dt);
    },
    dispose() {
      for (const { sound } of layers) {
        if (sound.isPlaying) sound.stop();
        sound.disconnect();
      }
    },
  };
}
