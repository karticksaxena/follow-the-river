import { dot, float, mix, pow, smoothstep, uniform, vec3, vec4 } from 'three/tsl';
import * as THREE from 'three/webgpu';

export type Vec3 = [number, number, number];

/** One colour grade, applied to the display-referred picture (after tone mapping). */
export interface GradeParams {
  /** Added to the shadows (kept near 0: the blacks stay crushed and dark). */
  lift: Vec3;
  /** Midtone curve; above 1 brightens the mids. */
  gamma: number;
  /** Per-channel multiplier (white balance). */
  gain: Vec3;
  saturation: number;
  /** Around mid grey; above 1 crushes blacks deeper. */
  contrast: number;
  /** Colour added in the shadows / the highlights (split toning). */
  shadows: Vec3;
  highlights: Vec3;
}

export type GradePreset = 'night' | 'day' | 'dusk' | 'flashback' | 'sunrise';

/** Per-scene looks. Tuning knobs. */
export const GRADES: Readonly<Record<GradePreset, Readonly<GradeParams>>> = {
  // Cold teal shadows, desaturated, blacks crushed.
  night: {
    lift: [0, 0.002, 0.004],
    gamma: 1,
    gain: [0.92, 1, 1.06],
    saturation: 0.7,
    contrast: 1.12,
    shadows: [-0.015, 0.012, 0.02],
    highlights: [0, 0.01, 0.03],
  },
  // Overcast grey-green.
  day: {
    lift: [0, 0.002, 0],
    gamma: 1,
    gain: [0.96, 1, 0.94],
    saturation: 0.75,
    contrast: 1.05,
    shadows: [-0.005, 0.012, 0],
    highlights: [0, 0.01, 0],
  },
  // Rust.
  dusk: {
    lift: [0.004, 0, 0],
    gamma: 1,
    gain: [1.08, 0.95, 0.82],
    saturation: 0.85,
    contrast: 1.1,
    shadows: [0.02, 0, -0.01],
    highlights: [0.04, 0.015, -0.02],
  },
  // Sepia, cold shadows.
  flashback: {
    lift: [0, 0, 0.004],
    gamma: 1,
    gain: [1, 0.96, 0.9],
    saturation: 0.35,
    contrast: 1.1,
    shadows: [-0.005, 0, 0.02],
    highlights: [0.04, 0.025, -0.01],
  },
  // Warm highlights, blue shadows.
  sunrise: {
    lift: [0, 0, 0.004],
    gamma: 1,
    gain: [1.1, 1, 0.9],
    saturation: 1,
    contrast: 1,
    shadows: [-0.01, 0, 0.04],
    highlights: [0.06, 0.03, -0.03],
  },
};

const mixVec = (a: Vec3, b: Vec3, t: number, out: Vec3): void => {
  for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * t;
};

const blank = (): GradeParams => ({
  lift: [0, 0, 0],
  gamma: 1,
  gain: [1, 1, 1],
  saturation: 1,
  contrast: 1,
  shadows: [0, 0, 0],
  highlights: [0, 0, 0],
});

/** Blends two grades (`t` 0 to 1). Pass `out` to reuse it, e.g. every frame of a blend. */
export function mixGrade(
  a: Readonly<GradeParams>,
  b: Readonly<GradeParams>,
  t: number,
  out: GradeParams = blank(),
): GradeParams {
  t = Math.min(1, Math.max(0, t));
  mixVec(a.lift, b.lift, t, out.lift);
  mixVec(a.gain, b.gain, t, out.gain);
  mixVec(a.shadows, b.shadows, t, out.shadows);
  mixVec(a.highlights, b.highlights, t, out.highlights);
  out.gamma = a.gamma + (b.gamma - a.gamma) * t;
  out.saturation = a.saturation + (b.saturation - a.saturation) * t;
  out.contrast = a.contrast + (b.contrast - a.contrast) * t;
  return out;
}

const vec = (): ReturnType<typeof uniform<'vec3'>> => uniform(new THREE.Vector3());
const ease = (x: number): number => x * x * (3 - 2 * x);

export interface Grading {
  /** The grade as a TSL node over the (display-referred) `color`. */
  node(color: THREE.Node<'vec4'>): THREE.Node<'vec4'>;
  /** Blends to `preset` over `seconds` (0 = cut); returns the preset it left. */
  set(preset: GradePreset, seconds?: number): GradePreset;
  update(dt: number): void;
}

/** Colour grade with named presets, blended over time. One per post pipeline. */
export function createGrading(start: GradePreset): Grading {
  const now = mixGrade(GRADES[start], GRADES[start], 0);
  const from = mixGrade(now, now, 0);
  let target: GradePreset = start;
  let t = 1;
  let seconds = 0;
  const u = { lift: vec(), gain: vec(), shadows: vec(), highlights: vec() };
  const gamma = uniform(1);
  const saturation = uniform(1);
  const contrast = uniform(1);
  const push = (): void => {
    for (const k of ['lift', 'gain', 'shadows', 'highlights'] as const) {
      u[k].value.set(...now[k]);
    }
    gamma.value = now.gamma;
    saturation.value = now.saturation;
    contrast.value = now.contrast;
  };
  push();
  return {
    node(color) {
      const luma = vec3(0.2126, 0.7152, 0.0722);
      const lit = color.rgb.mul(u.gain).add(u.lift.mul(float(1).sub(color.rgb)));
      const curved = pow(lit.max(0.0001), vec3(float(1).div(gamma)));
      const toned = mix(vec3(dot(curved, luma)), curved, saturation);
      const l = dot(toned, luma);
      const split = toned
        .add(u.shadows.mul(float(1).sub(smoothstep(0, 0.5, l))))
        .add(u.highlights.mul(smoothstep(0.5, 1, l)));
      return vec4(split.sub(0.4).mul(contrast).add(0.4).max(0), color.a);
    },
    set(preset, duration = 0) {
      const previous = target;
      target = preset;
      mixGrade(now, now, 0, from);
      t = 0;
      seconds = duration;
      if (duration <= 0) this.update(0);
      return previous;
    },
    update(dt) {
      if (t >= 1) return;
      t = seconds <= 0 ? 1 : Math.min(1, t + dt / seconds);
      mixGrade(from, GRADES[target], ease(t), now);
      push();
    },
  };
}
