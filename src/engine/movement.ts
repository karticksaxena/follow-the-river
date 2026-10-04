/** Walking and sprinting speeds in metres per second. Tuning knobs. */
export const WALK_SPEED = 3.2;
export const SPRINT_SPEED = 4.8;

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

/** Jump take-off speed (m/s) and gravity (m/s²): a ~0.55 m hop. Tuning knobs. */
export const JUMP_SPEED = 4;
export const GRAVITY = 14;

export interface Air {
  /** Feet above the ground (m), 0 when standing. */
  height: number;
  /** Upward speed (m/s). */
  speed: number;
}

/** One frame of a jump, in place: rise, fall under gravity, land at 0. */
export function fall(air: Air, dt: number): void {
  if (air.height <= 0 && air.speed <= 0) return;
  air.speed -= GRAVITY * dt;
  air.height += air.speed * dt;
  if (air.height > 0) return;
  air.height = 0;
  air.speed = 0;
}

/**
 * Head bob while moving: two dips per stride, a little roll side to side; sprinting is bigger and
 * faster. Amplitudes in metres and radians, rates in strides per second. Tuning knobs.
 */
export const BOB = {
  walk: { amp: 0.035, rate: 0.9 },
  sprint: { amp: 0.075, rate: 1.35 },
  roll: 0.014,
  /** How fast the bob fades in and out (per second). */
  ease: 8,
} as const;

export interface Bob {
  /** Stride phase (rad), and the current amplitude (m) easing toward the gait's. */
  phase: number;
  amp: number;
  /** Outputs: height offset (m) and roll (rad). */
  y: number;
  roll: number;
}

/** One frame of head bob, in place: `gait` is how you move (0 = standing). */
export function stepBob(b: Bob, gait: 'stand' | 'walk' | 'sprint', dt: number): void {
  const target = gait === 'stand' ? 0 : BOB[gait].amp;
  b.amp += (target - b.amp) * Math.min(1, BOB.ease * dt);
  if (gait !== 'stand') b.phase += 2 * Math.PI * BOB[gait].rate * dt;
  b.y = b.amp * Math.sin(2 * b.phase);
  b.roll = BOB.roll * (b.amp / BOB.sprint.amp) * Math.sin(b.phase);
}
