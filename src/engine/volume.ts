import { TIERS, type Tier } from './quality';

/** The layer the mist box and the lights that scatter into it live on (they stay on layer 0 too). */
export const VOLUME_LAYER = 10;

/**
 * Objects only on this layer (not layer 0) are drawn by the main camera but skipped by the water's
 * planar reflection: the stage camera enables it, the reflector's virtual camera disables it.
 */
export const NO_REFLECTION_LAYER = 3;

/** Volumetric pass tuning knobs. */
export const VOLUME = {
  /** Raymarch steps per tier (Low has no pass). */
  steps: {
    low: TIERS.low.mistSteps,
    medium: TIERS.medium.mistSteps,
    high: TIERS.high.mistSteps,
  } as Readonly<Record<Tier, number>>,
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
