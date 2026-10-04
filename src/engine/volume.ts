import type { Tier } from './quality';

/** The layer the mist box and the lights that scatter into it live on (they stay on layer 0 too). */
export const VOLUME_LAYER = 10;

/** Volumetric pass tuning knobs. */
export const VOLUME = {
  /** Raymarch steps per tier (Low has no pass). */
  steps: { low: 0, medium: 8, high: 12 } as Readonly<Record<Tier, number>>,
  /** The pass renders at this share of the screen's resolution, then is blurred. */
  resolutionScale: 0.25,
  /** Gaussian blur radius and sigma over the quarter-res result (hides raymarch banding and noise). */
  blurRadius: 0.6,
  blurSigma: 4,
  /** How much of the blurred mist is added to the scene colour. */
  strength: 1,
  /** Cap on the added light per channel (HDR): a lamp right next to the ray cannot blow out. */
  cap: 0.6,
} as const;

/** Raymarch steps for a tier. Pure. WebGL 2 is untested for the volume material, so it gets none. */
export function volumeSteps(tier: Tier, webgpu: boolean): number {
  return webgpu ? VOLUME.steps[tier] : 0;
}

/** God rays at dawn: tuning knobs. */
export const SHAFTS = {
  /** Fraction of the camera far plane beyond which a pixel counts as sky. */
  skyFrom: 0.8,
  samples: 12,
  /** How far toward the sun each pixel marches (share of the way to the sun on screen). */
  reach: 0.85,
  /** Per-sample falloff. */
  decay: 0.93,
  /** Peak brightness added (HDR, before bloom). Keep low: the 14 s frame must stay readable. */
  peak: 0.35,
  /** Share of the dawn (0..1) the rays fade in over, and out over. */
  fadeIn: [0.4, 0.62] as readonly [number, number],
  fadeOut: [0.78, 0.97] as readonly [number, number],
} as const;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0..1 through the dawn: none while it is dark, full as the sun climbs, none again once it is up. Pure. */
export function shaftEnvelope(k: number): number {
  return smooth(...SHAFTS.fadeIn, k) * (1 - smooth(...SHAFTS.fadeOut, k));
}

/** 0..1 from the camera-forward / sun-direction dot: nothing when looking away. Pure. */
export function shaftFacing(dot: number): number {
  return smooth(0.1, 0.8, dot);
}

/** The sun as the shafts see it: set `direction` (to the sun, world), `color` and `level` (0 = off) each frame. */
export interface ShaftSource {
  direction: { x: number; y: number; z: number };
  color: { r: number; g: number; b: number };
  level: number;
}
