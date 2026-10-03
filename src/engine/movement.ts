/** Walking and sprinting speeds in metres per second. Tuning knobs. */
export const WALK_SPEED = 2.2;
export const SPRINT_SPEED = 4.2;

export interface MoveIntent {
  /** -1 (back) to 1 (forward). */
  forward: number;
  /** -1 (left) to 1 (right). */
  right: number;
  sprint: boolean;
}

/** WASD + Shift to a movement wish. Diagonals are normalised so they aren't faster. */
export function moveIntent(isDown: (code: string) => boolean): MoveIntent {
  const forward = Number(isDown('KeyW')) - Number(isDown('KeyS'));
  const right = Number(isDown('KeyD')) - Number(isDown('KeyA'));
  const length = Math.hypot(forward, right) || 1;
  return {
    forward: forward / length,
    right: right / length,
    sprint: isDown('ShiftLeft') || isDown('ShiftRight'),
  };
}

/**
 * World-space step on the ground plane. (fx, fz) is the camera's forward direction
 * flattened and normalised; right is that vector turned 90° clockwise seen from above.
 */
export function moveDelta(
  intent: MoveIntent,
  fx: number,
  fz: number,
  dt: number,
): { dx: number; dz: number } {
  const speed = (intent.sprint ? SPRINT_SPEED : WALK_SPEED) * dt;
  const rx = -fz;
  const rz = fx;
  return {
    dx: (fx * intent.forward + rx * intent.right) * speed,
    dz: (fz * intent.forward + rz * intent.right) * speed,
  };
}
