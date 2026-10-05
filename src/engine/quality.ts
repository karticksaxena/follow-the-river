/** Adaptive render quality. Tuning knobs. */
export const QUALITY = {
  /** Resolution multipliers, best first. */
  steps: [1, 0.85, 0.72, 0.6, 0.5],
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
  /** Auto climbs one tier (to at most the one the GPU class chose) after this many seconds at the best resolution step with headroom. */
  raiseFor: 20,
  /** A tier raise that runs slow again drops back: never raise more than this many times a session (no ping-pong rebuilds). */
  maxRaises: 1,
  /** A frame this long (s) is a stall (a shader compile, a tab switch), not the GPU's speed: Auto ignores it. */
  hitch: 0.25,
} as const;

/** True for a frame too long to say anything about throughput; stepping the quality down for it would rebuild the post graph mid-play. */
export const isHitch = (seconds: number): boolean => seconds > QUALITY.hitch;

export interface Quality {
  step: number;
  /** Seconds the smoothed frame time has been slow / fast. */
  slow: number;
  fast: number;
  /** Seconds since the last change. */
  since: number;
  ema: number;
  /** Tier raises Auto has made (see `QUALITY.maxRaises`). */
  raises: number;
}

export type Tier = 'low' | 'medium' | 'high';
export type Graphics = Tier | 'auto';
export const GRAPHICS: readonly Graphics[] = ['auto', 'low', 'medium', 'high'];

const LAST = QUALITY.steps.length - 1;

export interface TierSettings {
  /** Planar water reflection: share of the frame it renders at; 0 = none (a flat colour stands in). */
  reflectionScale: number;
  /** The moon/sun's cascaded shadows; null = none. */
  keyShadow: { cascades: number; mapSize: number } | null;
  /** The torch's spot-shadow map size (px). */
  torchShadowMap: number;
  /** GTAO (with its normal pre-pass and TRAA); null = none. */
  ao: { scale: number; samples: number } | null;
  /** Bloom glow (lamps, windows, the moon). */
  bloom: boolean;
  /** Raymarch steps of the mist (0 = no pass; WebGL 2 never has it). */
  mistSteps: number;
  /** Device-pixel-ratio cap: integrated GPUs render 1080p at 1.0, High may go to 1.5. */
  maxPixelRatio: number;
  /** Resolution step Auto restarts from when it drops to this tier. */
  dropStep: number;
}

/**
 * Everything a tier turns on: the one table the engine and the game read. Tuning knobs.
 * Low: no reflection pass, no shadows but the torch, scene pass + bloom + SMAA only.
 */
export const TIERS: Readonly<Record<Tier, TierSettings>> = {
  low: {
    maxPixelRatio: 1,
    reflectionScale: 0,
    keyShadow: null,
    torchShadowMap: 512,
    ao: null,
    bloom: true,
    mistSteps: 0,
    dropStep: 3,
  },
  medium: {
    maxPixelRatio: 1,
    reflectionScale: 0.2,
    keyShadow: { cascades: 1, mapSize: 1024 },
    torchShadowMap: 512,
    ao: { scale: 0.5, samples: 10 },
    bloom: true,
    mistSteps: 8,
    dropStep: 1,
  },
  high: {
    maxPixelRatio: 1.5,
    reflectionScale: 0.35,
    keyShadow: { cascades: 3, mapSize: 2048 },
    torchShadowMap: 1024,
    ao: { scale: 0.75, samples: 24 },
    bloom: true,
    mistSteps: 12,
    dropStep: 0,
  },
};

/** A frame within this share of the cap period counts as cap-paced. */
const CAP_PACED = 1.15;

/**
 * The number `adaptQuality` is fed. Under a binding cap the interval just equals the cap period and
 * says nothing about headroom, so a cap-paced frame is judged by its work time (update and submit):
 * Auto can climb back. A frame that ran longer than the cap period (the GPU is behind) is judged by
 * its interval. `capMs` 0 (no cap) always uses the interval.
 */
export function frameCost(intervalMs: number, workMs: number, capMs: number): number {
  return capMs > 0 && intervalMs <= capMs * CAP_PACED ? Math.min(intervalMs, workMs) : intervalMs;
}

export function newQuality(): Quality {
  return {
    step: 0,
    slow: 0,
    fast: 0,
    since: 0,
    ema: (QUALITY.slowMs + QUALITY.fastMs) / 2,
    raises: 0,
  };
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

export function raiseTier(tier: Tier): Tier {
  return tier === 'low' ? 'medium' : 'high';
}

const RANK: Record<Tier, number> = { low: 0, medium: 1, high: 2 };

/**
 * Resolution first; in auto, once it is at its last step and still slow, the caller lowers the
 * tier (`'tier'`) and the resolution restarts higher. After `raiseFor` s of headroom at the best
 * step, it climbs one tier (`'raise'`) back toward `ceiling` (the GPU class's tier), at most
 * `maxRaises` times, so one bad moment (a load, a shader build) does not pin a player low all session.
 */
export function adaptQuality(
  q: Quality,
  tier: Tier,
  auto: boolean,
  frameMs: number,
  dt: number,
  ceiling: Tier = tier,
): 'res' | 'tier' | 'raise' | null {
  if (stepQuality(q, frameMs, dt)) return 'res';
  if (
    auto &&
    tier !== 'low' &&
    q.step === LAST &&
    q.slow >= QUALITY.slowFor &&
    q.since >= QUALITY.minGap
  ) {
    settle(q, TIERS[lowerTier(tier)].dropStep);
    return 'tier';
  }
  if (
    auto &&
    RANK[tier] < RANK[ceiling] &&
    q.step === 0 &&
    q.fast >= QUALITY.raiseFor &&
    q.raises < QUALITY.maxRaises
  ) {
    const raises = q.raises + 1;
    settle(q, TIERS[raiseTier(tier)].dropStep);
    q.raises = raises;
    return 'raise';
  }
  return null;
}

/** Pixel ratio for the renderer at the current step. */
export function pixelRatio(q: Readonly<Quality>, devicePixelRatio: number, tier: Tier): number {
  return Math.min(devicePixelRatio, TIERS[tier].maxPixelRatio) * QUALITY.steps[q.step];
}
