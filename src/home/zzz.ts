/** Timing and motion of the "Z" letters rising from the sleeper. Tuning knobs. */
export const ZZZ = { every: 1.4, lifetime: 3.6, rise: 0.9, sway: 0.12 } as const;

export interface ZzzFrame {
  rise: number;
  sway: number;
  opacity: number;
  scale: number;
}

/** Pose of one Z at `t` (0 = just born, 1 = gone): fades in fast, drifts up, fades out slowly. */
export function zzzFrame(t: number): ZzzFrame {
  const c = Math.min(1, Math.max(0, t));
  const opacity = c < 0.15 ? c / 0.15 : 1 - (c - 0.15) / 0.85;
  return {
    rise: ZZZ.rise * c,
    sway: ZZZ.sway * Math.sin(c * Math.PI * 2),
    opacity,
    scale: 0.15 + 0.2 * c,
  };
}
