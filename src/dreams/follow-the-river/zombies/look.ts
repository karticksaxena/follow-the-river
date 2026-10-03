import type { Intent } from './brain';

/** Outfit mesh names inside zombie-m.glb / zombie-f.glb. */
export const OUTFITS = {
  m: ['beach', 'casual', 'farmer', 'hoodie', 'punk', 'suit', 'swat', 'worker'],
  f: ['casual', 'punk', 'soldier', 'suit', 'worker'],
} as const;

type Body = 'm' | 'f';

/** Men and women interleaved (5 of 13 are women), fixed order. */
const LIST: readonly { body: Body; outfit: string }[] = [
  { body: 'm', outfit: 'beach' },
  { body: 'f', outfit: 'casual' },
  { body: 'm', outfit: 'casual' },
  { body: 'f', outfit: 'punk' },
  { body: 'm', outfit: 'farmer' },
  { body: 'm', outfit: 'hoodie' },
  { body: 'f', outfit: 'soldier' },
  { body: 'm', outfit: 'punk' },
  { body: 'm', outfit: 'suit' },
  { body: 'f', outfit: 'suit' },
  { body: 'm', outfit: 'swat' },
  { body: 'm', outfit: 'worker' },
  { body: 'f', outfit: 'worker' },
];

/** Outfit for the i-th zombie: every outfit appears before any repeats; about 4 in 10 are women. */
export function pickOutfit(i: number): { body: Body; outfit: string } {
  return LIST[i % LIST.length];
}

export const CLIP_FOR: Readonly<Record<Intent, string>> = {
  lie: 'Death',
  rise: 'GetUp',
  stand: 'Idle',
  walk: 'Walk',
  run: 'Run',
  strike: 'Attack',
  stagger: 'Hit',
  fall: 'Death',
  dragged: 'Hit',
};

export const LOOPING: ReadonlySet<string> = new Set(['Idle', 'Walk', 'Run']);

/** Metres per second the feet travel at timeScale 1. Tuning knobs, set by eye in the browser. */
export const CLIP_SPEED: Readonly<{ Walk: number; Run: number }> = { Walk: 0.9, Run: 4.5 };

export function timeScaleFor(clip: string, speed: number): number {
  if (clip === 'Walk') return speed / CLIP_SPEED.Walk;
  if (clip === 'Run') return speed / CLIP_SPEED.Run;
  return 1;
}
