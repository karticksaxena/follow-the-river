import { ANATOMY } from './dras-anatomy';
import { DRY_RISE } from './orca-strand';
import { WATER_Y } from './river';

/** How far (m) from her skin your hand reaches (E: put your hand on her), anywhere along her land side. */
export const HAND_REACH = 1.8;

/** Where she lies: her nose on the shore, her body running back (-z) into the lake. */
export interface Lying {
  noseX: number;
  noseZ: number;
}

/**
 * Pure: the point of her centre line (nose to tail) nearest the player, when E works where the player
 * stands: on land (the shore at least `DRY_RISE` above the water: the wet slope is not) and within
 * `HAND_REACH` of her skin. Else null.
 */
export function reachPoint(
  at: Lying,
  x: number,
  z: number,
  ground: (z: number) => number,
): { x: number; z: number } | null {
  const tailZ = at.noseZ - 2 * ANATOMY.halfLength;
  const near = { x: at.noseX, z: Math.min(at.noseZ, Math.max(tailZ, z)) };
  const onLand = ground(z) >= WATER_Y + DRY_RISE;
  return onLand && Math.hypot(x - near.x, z - near.z) <= ANATOMY.halfWidth + HAND_REACH
    ? near
    : null;
}
