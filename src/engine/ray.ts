export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Distance along a unit ray to the first hit on a sphere, or null. */
export function raySphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): number | null {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const inside = lx * lx + ly * ly + lz * lz <= radius * radius;
  if (inside) return 0;
  const along = lx * dx + ly * dy + lz * dz;
  if (along < 0) return null;
  const miss2 = lx * lx + ly * ly + lz * lz - along * along;
  const r2 = radius * radius;
  if (miss2 > r2) return null;
  return along - Math.sqrt(r2 - miss2);
}

/** Whether `target` is inside a cone from `eye` along unit `look` (half-angle in radians, range in m). */
export function inCone(
  eye: Vec3,
  look: Vec3,
  target: Vec3,
  range: number,
  halfAngle: number,
): boolean {
  const x = target.x - eye.x;
  const y = target.y - eye.y;
  const z = target.z - eye.z;
  const distance = Math.hypot(x, y, z);
  if (distance > range || distance < 1e-6) return distance < 1e-6;
  return (x * look.x + y * look.y + z * look.z) / distance >= Math.cos(halfAngle);
}
