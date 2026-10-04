import type { Difficulty } from '../../engine/settings';
import { DAY_TUNING, NIGHT_TUNING, type Tuning } from './zombies/brain';

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

export interface DifficultyTuning {
  /** Zombies a wave needs killed, times the wave's quota. */
  quota: number;
  /** Added to every night's chase speed (m/s). */
  speed: number;
  /** Seconds between a wave's spawns, times the wave's own. */
  interval: number;
  /** Seconds of steady light to stun, and how long it holds. */
  stun: { exposure: number; seconds: number };
  /** One blow (health 100): 34 = three hits, 50 = two, 25 = four. */
  damage: number;
  /** Body hits that drop a zombie (a head hit always kills). */
  bodyHits: number;
  /** An arrow that killed can be picked up again (otherwise it breaks). */
  keepKillArrows: boolean;
  /** Crates, pickups and what a death gives back, times the base. */
  supplies: number;
  /** Share of Mom's bag in the last stand. */
  bag: number;
}

/** Tuning knobs. Normal is the game as meant: scarce, fast, short stuns. */
export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyTuning>> = {
  story: {
    quota: 0.6,
    speed: -0.5,
    interval: 1.4,
    stun: { exposure: 0.4, seconds: 1.6 },
    damage: 25,
    bodyHits: 1,
    keepKillArrows: true,
    supplies: 1.6,
    bag: 1,
  },
  normal: {
    quota: 1,
    speed: 0,
    interval: 1,
    stun: { exposure: 0.6, seconds: 0.9 },
    damage: 34,
    bodyHits: 2,
    keepKillArrows: false,
    supplies: 1,
    bag: 0.5,
  },
  hard: {
    quota: 1.4,
    speed: 0.3,
    interval: 0.75,
    stun: { exposure: 0.8, seconds: 0.6 },
    damage: 50,
    bodyHits: 2,
    keepKillArrows: false,
    supplies: 0.6,
    bag: 0.34,
  },
};

const nights: Record<Difficulty, (Tuning | undefined)[]> = { story: [], normal: [], hard: [] };
const days = new Map<Difficulty, Tuning>();

/** Zombie tuning for a chapter's night (cached by chapter: no allocation after the first call). */
export function nightTuning(chapter: number, difficulty: Difficulty): Tuning {
  const c = chapter === 2 || chapter === 3 ? chapter : 1;
  let t = nights[difficulty][c];
  if (!t) {
    const { stun, damage, bodyHits, speed } = DIFFICULTY[difficulty];
    const base = NIGHT_DIFFICULTY[c].speed + speed;
    nights[difficulty][c] = t = { ...NIGHT_TUNING, speed: base, stun, damage, bodyHits };
  }
  return t;
}

/** The slow day lurkers, hitting and stunning as hard as the difficulty says. */
export function dayTuning(difficulty: Difficulty): Tuning {
  let t = days.get(difficulty);
  if (!t) {
    const { stun, damage, bodyHits } = DIFFICULTY[difficulty];
    days.set(difficulty, (t = { ...DAY_TUNING, stun, damage, bodyHits }));
  }
  return t;
}
