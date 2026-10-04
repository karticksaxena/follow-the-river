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
  strength: 0.6,
  /** Cap on the added light per channel (HDR): a lamp right next to the ray cannot blow out. */
  cap: 0.15,
} as const;

/** Raymarch steps for a tier. Pure. WebGL 2 is untested for the volume material, so it gets none. */
export function volumeSteps(tier: Tier, webgpu: boolean): number {
  return webgpu ? VOLUME.steps[tier] : 0;
}
