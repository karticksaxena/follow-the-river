import type * as THREE from 'three/webgpu';
import type { FishState } from './fish-state';
import { splashAt } from './motion';
import { WATER_Y } from './river';
import { rateIn } from './sounds';

/** Sound knobs: volumes, rate ranges, and the least time between her short calls (s). */
export const SOUND = {
  splash: 1,
  big: 1,
  thump: { volume: 0.6, rate: 0.5 },
  blow: { volume: 0.8, rate: [0.9, 1.1], weakRate: 0.85 },
  call: { volume: 0.6, gap: 20 },
} as const;

/** Plays a recording on `a`, cutting off whatever it was playing. */
function fire(
  a: THREE.PositionalAudio,
  buffer: AudioBuffer | null,
  volume: number,
  rate: number,
): void {
  if (!buffer) return;
  if (a.isPlaying) a.stop();
  a.setBuffer(buffer);
  a.setVolume(volume);
  a.setPlaybackRate(rate);
  a.play();
}

/** A real splash at (x, z): a big one (the burst, the leap) also gets a low thump of the body under it. */
export function playSplash(f: FishState, x: number, z: number, big = false): void {
  f.splashAt.position.set(x, WATER_Y, z);
  splashAt(x, WATER_Y, z, big);
  const pick = big ? f.pick.big : f.pick.splash;
  fire(f.splash, pick(), big ? SOUND.big : SOUND.splash, rateIn(0.9, 1.1));
  if (big) fire(f.thump, f.pick.big(), SOUND.thump.volume, SOUND.thump.rate);
}

/** One of her short calls, at most one every `SOUND.call.gap` s so they stay special. */
export function callOut(f: FishState): void {
  if (f.time - f.lastCall < SOUND.call.gap) return;
  const buffer = f.pick.call();
  if (!buffer) return;
  f.lastCall = f.time;
  fire(f.voice, buffer, SOUND.call.volume, rateIn(0.95, 1.05));
}

/** A recorded blow at the blowhole: lower, slower (0.85 at full sickness) and fainter the sicker she is. */
export function playBlow(f: FishState): void {
  const { x, y, z } = f.root.position;
  const k = f.sickness;
  f.splashAt.position.set(x, y, z);
  const [lo, hi] = SOUND.blow.rate;
  const rate = rateIn(lo, hi) * (1 - (1 - SOUND.blow.weakRate) * k);
  fire(f.blow, f.pick.blow(), SOUND.blow.volume * (1 - 0.5 * k), rate);
}
