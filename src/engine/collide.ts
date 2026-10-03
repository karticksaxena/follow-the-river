/** Axis-aligned rectangle on the ground plane (seen from above). */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function boxAt(x: number, z: number, width: number, depth: number): Box {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

function exitInside(x: number, z: number, radius: number, box: Box): { x: number; z: number } {
  const exits = [
    { x: box.minX - radius, z },
    { x: box.maxX + radius, z },
    { x, z: box.minZ - radius },
    { x, z: box.maxZ + radius },
  ];
  let best = exits[0];
  for (const exit of exits) {
    if (Math.hypot(exit.x - x, exit.z - z) < Math.hypot(best.x - x, best.z - z)) best = exit;
  }
  return best;
}

/**
 * Pushes a circle (the player, radius in metres) out of every box it overlaps.
 * Checks every box passed in: use `createBoxGrid` to pass only nearby boxes.
 */
export function resolveCircle(
  x: number,
  z: number,
  radius: number,
  boxes: readonly Box[],
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const box of boxes) {
    const cx = Math.max(box.minX, Math.min(px, box.maxX));
    const cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
    const dx = px - cx;
    const dz = pz - cz;
    const distance = Math.hypot(dx, dz);
    if (distance >= radius) continue;
    if (distance > 1e-9) {
      px = cx + (dx / distance) * radius;
      pz = cz + (dz / distance) * radius;
    } else {
      ({ x: px, z: pz } = exitInside(px, pz, radius, box));
    }
  }
  return { x: px, z: pz };
}
