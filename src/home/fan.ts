/** Ceiling-fan blade speed, rad/s: the lowest setting, a fan left turning at night. Tuning knob. */
export const FAN_SPIN = 1.2;

/** The blade angle after `dt` seconds, wrapped to [0, 2π) so it never loses float precision. */
export function spunAngle(angle: number, dt: number): number {
  const full = Math.PI * 2;
  return (((angle + FAN_SPIN * dt) % full) + full) % full;
}
