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

/** Fraction 0..1 along the segment where it first enters the box, or null. */
export function segmentHitsBox(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  box: Box,
): number | null {
  let tMin = 0;
  let tMax = 1;
  const dx = x1 - x0;
  const dz = z1 - z0;
  if (Math.abs(dx) < 1e-12) {
    if (x0 < box.minX || x0 > box.maxX) return null;
  } else {
    const a = (box.minX - x0) / dx;
    const b = (box.maxX - x0) / dx;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
  }
  if (Math.abs(dz) < 1e-12) {
    if (z0 < box.minZ || z0 > box.maxZ) return null;
  } else {
    const a = (box.minZ - z0) / dz;
    const b = (box.maxZ - z0) / dz;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
  }
  return tMin <= tMax ? tMin : null;
}

/**
 * Pushes a circle (the player, radius in metres) out of every box it overlaps.
 * Checks every box passed in: use `createBoxGrid` to pass only nearby boxes.
 * Writes the result into `out` and returns it; hot loops pass a reused scratch object.
 */
export function resolveCircle(
  x: number,
  z: number,
  radius: number,
  boxes: readonly Box[],
  out: { x: number; z: number } = { x: 0, z: 0 },
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
  out.x = px;
  out.z = pz;
  return out;
}
