import type { Box } from '../../engine/collide';
import type { ShackDef } from './areas/types';
import { shackBounds } from './shack';

/** Metres kept free of scenery around a house, and of zombie spawns around its walls. Tuning knobs. */
export const HOUSE_CLEARANCE = 1.5;
export const SPAWN_CLEARANCE = 0.5;
/** A house's floor spots sit this far in from the back wall, and this far apart along it (m). */
const BACK_INSET = 1.6;
const SLOT_GAP = 2;

/** True when (x, z) is inside any of `boxes` or within `margin` m of one. */
export function nearBox(boxes: readonly Box[], x: number, z: number, margin: number): boolean {
  for (const b of boxes) {
    if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin)
      return true;
  }
  return false;
}

/** A floor spot at the back of a house: slot 0 the middle, -1 and 1 either side (always 1 m+ from the walls). */
export function houseSpot(def: ShackDef, slot: -1 | 0 | 1): { x: number; z: number } {
  return { x: shackBounds(def).minX + BACK_INSET, z: def.z + slot * SLOT_GAP };
}

/** Where a sleeper lies: in front of its slot, a metre nearer the door, so the supplies behind it are guarded. */
export function sleeperSpot(def: ShackDef, slot: -1 | 0 | 1): { x: number; z: number } {
  const s = houseSpot(def, slot);
  return { x: s.x + 1.4, z: s.z };
}
