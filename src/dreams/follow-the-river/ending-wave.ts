import type { Difficulty } from '../../engine/settings';
import { DIFFICULTY } from './difficulty';
import { EDGE_X } from './river';

/** Tuning knobs (metres, seconds). */
export const WAVE = {
  /** A horde too big for you alone (Plan 7): you fight it beside the orca. */
  count: 30,
  /** Zombies per spawn group, and the pause between groups. */
  group: 5,
  gap: 3.5,
  /** The fight ends only when every one of them is dead; after this long her guard lifts so she clears the rest. */
  safety: 150,
  /** Strikes the orca is armed with: far more than the wave has zombies. */
  strikes: 99,
  /**
   * Its last stand (a normal night: 1.1 s apart, 4.5 m, pace 1, no sweep, anyone): grabs close
   * together, further up the bank, quicker, its body throws the zombies beside its jaws into the
   * lake, and she only takes those within `guard` m of you or Mom (she fights beside you).
   */
  orca: { cooldown: 0.5, reach: 7, pace: 0.7, sweep: 2, guard: 9 },
  /** Upstream of the player (+z), and the spread between lanes along the bank (m). */
  upstream: 34,
  laneGap: 1.5,
  laneStep: 2,
  /** The whole wave keeps hearing the player (m), so nobody gives up the hunt mid-fight. */
  hearing: 60,
} as const;
export const FLINCH = { lookUp: 12, near: 4 } as const; // m up the bank Mom watches; a strike this close makes her flinch

/** Did the orca strike within `FLINCH.near` m of Mom? */
export const struckNear = (
  at: { x: number; z: number } | null,
  mom: { x: number; z: number },
): boolean => at !== null && Math.hypot(at.x - mom.x, at.z - mom.z) <= FLINCH.near;

/** How many zombies the wave sends: `WAVE.count` times the difficulty's quota. */
export const waveCount = (d: Difficulty): number => Math.round(WAVE.count * DIFFICULTY[d].quota);

/** How many zombies of the wave (`count` in all) should exist `elapsed` seconds in (all of them once the last group is due). */
export function waveDue(elapsed: number, count: number = WAVE.count): number {
  return Math.min(count, (Math.floor(Math.max(0, elapsed) / WAVE.gap) + 1) * WAVE.group);
}

/** Where wave zombie `i` appears, relative to the player's z: a lane along the river bank. */
export function waveSpot(i: number, playerZ: number): { x: number; z: number } {
  const lane = i % WAVE.group;
  return { x: EDGE_X - 1 - lane * WAVE.laneGap, z: playerZ + WAVE.upstream + lane * WAVE.laneStep };
}
