import type { Interior } from '../../../engine/interiors';

/** How far (m) from the doorway a zombie aims when going through it, and how close to the door's line counts as lined up. */
export const DOOR = { reach: 0.8, align: 0.5, corner: 1 } as const;

const within = (h: Interior, x: number, z: number): boolean =>
  x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ;

/** Leaving: line up with the door from inside, then go out. */
function leave(h: Interior, x: number, z: number, out: { x: number; z: number }): void {
  const lined = Math.abs(z - h.doorZ) <= DOOR.align;
  out.x = !lined && x < h.doorX - DOOR.reach ? h.doorX - DOOR.reach : h.doorX + DOOR.reach;
  out.z = h.doorZ;
}

/** Entering: round the corner to the door's side, line up outside it, then go in. */
function enter(h: Interior, x: number, z: number, out: { x: number; z: number }): void {
  const lined = Math.abs(z - h.doorZ) <= DOOR.align;
  if (x > h.doorX && lined) {
    out.x = h.doorX - DOOR.reach;
    out.z = h.doorZ;
  } else if (x <= h.doorX) {
    // Beside or behind the house: walk straight along its wall out past the nearer corner, then round it.
    const alongside = z > h.minZ - DOOR.corner && z < h.maxZ + DOOR.corner;
    out.x = alongside ? x : h.doorX + DOOR.reach;
    out.z = z < h.doorZ ? h.minZ - DOOR.corner : h.maxZ + DOOR.corner;
  } else {
    out.x = h.doorX + DOOR.reach;
    out.z = h.doorZ;
  }
}

/**
 * Where a zombie at (x, z) heads to reach the player at (px, pz), written into `out` (no
 * allocation): the player, unless a house's walls are between them, then that house's door.
 */
export function aimAt(
  houses: readonly Interior[],
  x: number,
  z: number,
  px: number,
  pz: number,
  out: { x: number; z: number },
): void {
  out.x = px;
  out.z = pz;
  for (const h of houses) {
    const here = within(h, x, z);
    if (here === within(h, px, pz)) continue;
    if (here) leave(h, x, z, out);
    else enter(h, x, z, out);
    return;
  }
}
