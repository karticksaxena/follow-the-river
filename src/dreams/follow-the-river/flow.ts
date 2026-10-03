import type { AreaDef, Spot } from './areas/types';
import { isNight, type Phase } from './state';

export const MAX_HEALTH = 100;
/** Within this many metres of the safe spot's z the night is over. */
const SAFE_REACH = 3;

/** Health after a hit, never below zero. */
export function takeDamage(health: number, damage: number): number {
  return Math.max(0, health - damage);
}

/** The bank runs toward -z, so "arrived" means z at or past the safe spot (with a little reach). */
export function atSafeSpot(z: number, safeZ: number): boolean {
  return z <= safeZ + SAFE_REACH;
}

/** Closeness on the ground plane. */
export function nearSpot(
  x: number,
  z: number,
  spot: { x: number; z: number },
  radius: number,
): boolean {
  return (x - spot.x) ** 2 + (z - spot.z) ** 2 <= radius * radius;
}

/** The "Wait for dark?" question, with only the warnings that apply. */
export function waitQuestion(fishPacks: number, tapeLeft: boolean): string {
  const parts = ['Wait for dark?'];
  if (fishPacks > 0) {
    const [noun, pronoun] = fishPacks === 1 ? ['pack', 'it'] : ['packs', 'them'];
    parts.push(`You still hold ${fishPacks} fish ${noun} — throw ${pronoun} to the fish first.`);
  }
  if (tapeLeft) parts.push('You have not found the tape yet.');
  parts.push('You cannot come back here.');
  return parts.join(' ');
}

/** 'Day 1', 'Night 2'… ('' for intro and end). */
export function phaseTitle(phase: Phase): string {
  const n = Number(phase.slice(-1));
  if (!(n >= 1 && n <= 3)) return '';
  return `${isNight(phase) ? 'Night' : 'Day'} ${n}`;
}

/** Where the player stands when `phase` (re)starts in `area`. */
export function spawnFor(phase: Phase, area: AreaDef): Spot {
  return isNight(phase) ? area.nightStart : area.daySpawn;
}
