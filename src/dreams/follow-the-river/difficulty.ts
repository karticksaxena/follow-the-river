import { NIGHT_TUNING, type Tuning } from './zombies/brain';

export interface NightDifficulty {
  /** Most zombies alive at once (the horde's pool covers the biggest). */
  cap: number;
  /** Chase speed in m/s (must stay under the player's sprint). */
  speed: number;
}

/** Tuning knobs: each night is a little worse than the last. */
export const NIGHT_DIFFICULTY: Readonly<Record<1 | 2 | 3, NightDifficulty>> = {
  1: { cap: 14, speed: 3.8 },
  2: { cap: 18, speed: 3.9 },
  3: { cap: 22, speed: 4.0 },
};

/** Horde pool size: the largest cap of any night. */
export const HORDE_CAPACITY = Math.max(...Object.values(NIGHT_DIFFICULTY).map((d) => d.cap));

/** Difficulty for a chapter; anything but 2 or 3 is Night 1. */
export function nightDifficulty(chapter: number): NightDifficulty {
  return chapter === 2 || chapter === 3 ? NIGHT_DIFFICULTY[chapter] : NIGHT_DIFFICULTY[1];
}

const tunings = new Map<number, Tuning>();

/** Zombie tuning for a chapter's night (cached: no per-spawn allocation). */
export function nightTuning(chapter: number): Tuning {
  const speed = nightDifficulty(chapter).speed;
  let t = tunings.get(speed);
  if (!t) tunings.set(speed, (t = { ...NIGHT_TUNING, speed }));
  return t;
}
