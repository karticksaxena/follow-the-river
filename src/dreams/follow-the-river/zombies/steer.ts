/** Neighbours closer than this (m) push a zombie away. */
export const SEPARATION = 1.1;
const PUSH = 1.5;

/** Unit direction toward `target`, pushed away from neighbours closer than SEPARATION (xz pairs). Writes `out`. */
export function steer(
  x: number,
  z: number,
  tx: number,
  tz: number,
  neighbours: Float32Array,
  count: number,
  out: { x: number; z: number },
): void {
  let dx = tx - x;
  let dz = tz - z;
  const to = Math.hypot(dx, dz);
  if (to < 1e-6) {
    out.x = 0;
    out.z = 0;
    return;
  }
  dx /= to;
  dz /= to;
  for (let i = 0; i < count; i++) {
    const ax = x - neighbours[i * 2];
    const az = z - neighbours[i * 2 + 1];
    const d = Math.hypot(ax, az);
    if (d < 1e-6 || d >= SEPARATION) continue;
    const k = (((SEPARATION - d) / SEPARATION) * PUSH) / d;
    dx += ax * k;
    dz += az * k;
  }
  const len = Math.hypot(dx, dz);
  out.x = len < 1e-6 ? 0 : dx / len;
  out.z = len < 1e-6 ? 0 : dz / len;
}
