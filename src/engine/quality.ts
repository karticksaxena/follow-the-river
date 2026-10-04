/** Adaptive render quality. Tuning knobs. */
export const QUALITY = {
  /** Resolution multipliers, best first. */
  steps: [1, 0.85, 0.72, 0.6, 0.5],
  maxPixelRatio: 1.5,
  /** Smoothed frame time above this (a 60 FPS miss, with room for vsync jitter) for `slowFor` s steps quality down. */
  slowMs: 17.5,
  /** Below this for `fastFor` s steps it back up. Between the two nothing changes. */
  fastMs: 12.5,
  slowFor: 2,
  fastFor: 5,
  /** Seconds between any two changes. */
  minGap: 2,
  /** Per-frame weight of the newest frame in the moving average. */
  smoothing: 0.1,
  /** Resolution step a tier drop restarts from. */
  tierDropStep: 1,
} as const;

export interface Quality {
  step: number;
  /** Seconds the smoothed frame time has been slow / fast. */
  slow: number;
  fast: number;
  /** Seconds since the last change. */
  since: number;
  ema: number;
}

export type Tier = 'low' | 'medium' | 'high';
export type Graphics = Tier | 'auto';
export const GRAPHICS: readonly Graphics[] = ['auto', 'low', 'medium', 'high'];

const LAST = QUALITY.steps.length - 1;

export function newQuality(): Quality {
  return { step: 0, slow: 0, fast: 0, since: 0, ema: (QUALITY.slowMs + QUALITY.fastMs) / 2 };
}

/** A change (or a shader rebuild) makes the next frames spiky: start the average from neutral. */
function settle(q: Quality, step: number): void {
  q.step = step;
  q.slow = 0;
  q.fast = 0;
  q.since = 0;
  q.ema = (QUALITY.slowMs + QUALITY.fastMs) / 2;
}

/** Feeds one frame; steps the resolution down/up with hysteresis. True when `q.step` changed. */
export function stepQuality(q: Quality, frameMs: number, dt: number): boolean {
  q.ema += (frameMs - q.ema) * QUALITY.smoothing;
  q.since += dt;
  if (q.ema > QUALITY.slowMs) {
    q.slow += dt;
    q.fast = 0;
  } else if (q.ema < QUALITY.fastMs) {
    q.fast += dt;
    q.slow = 0;
  } else {
    q.slow = 0;
    q.fast = 0;
  }
  if (q.since < QUALITY.minGap) return false;
  if (q.slow >= QUALITY.slowFor && q.step < LAST) settle(q, q.step + 1);
  else if (q.fast >= QUALITY.fastFor && q.step > 0) settle(q, q.step - 1);
  else return false;
  return true;
}

export function lowerTier(tier: Tier): Tier {
  return tier === 'high' ? 'medium' : 'low';
}

/**
 * Resolution first; in auto, once it is at its last step and still slow, the caller lowers the
 * tier (`'tier'`) and the resolution restarts higher. Auto never climbs back up (no ping-pong).
 */
export function adaptQuality(
  q: Quality,
  tier: Tier,
  auto: boolean,
  frameMs: number,
  dt: number,
): 'res' | 'tier' | null {
  if (stepQuality(q, frameMs, dt)) return 'res';
  if (
    auto &&
    tier !== 'low' &&
    q.step === LAST &&
    q.slow >= QUALITY.slowFor &&
    q.since >= QUALITY.minGap
  ) {
    settle(q, QUALITY.tierDropStep);
    return 'tier';
  }
  return null;
}

/** Pixel ratio for the renderer at the current step. */
export function pixelRatio(q: Readonly<Quality>, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio, QUALITY.maxPixelRatio) * QUALITY.steps[q.step];
}
