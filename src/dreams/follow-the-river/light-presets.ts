export type LightingName = 'dusk' | 'day' | 'night' | 'dawn' | 'predawn' | 'sunrise';

/** The physical sky's look (three's `SkyMesh`): present means it draws the sky, absent the painted dome. */
export interface SkyParams {
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
}

export interface LightPreset {
  skyTop: number;
  skyHorizon: number;
  fog: { color: number; near: number; far: number };
  hemi: { sky: number; ground: number; intensity: number };
  key: { color: number; intensity: number; elevation: number; azimuth: number };
  /** `soft` 0..1: how much of the disc's radius is a hazy fade (1 = pure glow, 0 = crisp). */
  disc: { color: number; size: number; soft: number };
  /** `scene.environmentIntensity`: how much the sky lights every surface (image-based light). */
  environment: number;
  /** Key-light shadow strength 0..1 (0 = no shadow pass at all). */
  shadow: number;
  /** The painted dome shows its star field. */
  stars?: boolean;
  sky?: SkyParams;
}

/** Tuning knobs. Never bright: even "day" is overcast; the sunrise is the one warm exception. */
export const LIGHTING: Readonly<Record<LightingName, LightPreset>> = {
  // Intro: the evening Mom sends you off. Low, rusty sun behind smoke.
  dusk: {
    skyTop: 0x0b0d14,
    skyHorizon: 0x3a2a2a,
    fog: { color: 0x2a2224, near: 8, far: 80 },
    hemi: { sky: 0x6a5a60, ground: 0x15120f, intensity: 0.55 },
    key: { color: 0xc08060, intensity: 0.35, elevation: 0.14, azimuth: -2.4 },
    disc: { color: 0x8a5a40, size: 6, soft: 0.7 },
    environment: 0.2,
    shadow: 0,
  },
  // Overcast day: flat grey, a pale sun disc barely through the haze.
  day: {
    skyTop: 0x2c3136,
    skyHorizon: 0x50565b,
    fog: { color: 0x4a5055, near: 10, far: 90 },
    hemi: { sky: 0x8a9098, ground: 0x24261f, intensity: 0.75 },
    key: { color: 0xd0d4d8, intensity: 0.45, elevation: 0.6, azimuth: -2.0 },
    disc: { color: 0x7d8286, size: 7, soft: 0.95 },
    environment: 0.5,
    shadow: 0,
  },
  // Night: blue-black, a small cold moon that blooms, a faint star field, weak soft moon shadows.
  night: {
    skyTop: 0x05070b,
    skyHorizon: 0x1b2026,
    fog: { color: 0x141a20, near: 5, far: 55 },
    hemi: { sky: 0x3a4450, ground: 0x0c0e0a, intensity: 0.35 },
    key: { color: 0x9fb4ff, intensity: 0.35, elevation: 0.5, azimuth: -2.6 },
    disc: { color: 0xdfe8ff, size: 4, soft: 0.25 },
    environment: 0.15,
    shadow: 0.35,
    stars: true,
  },
  // Still grey and dim, a pale sun low over the dam (the ending now goes on to `sunrise`).
  dawn: {
    skyTop: 0x2a3036,
    skyHorizon: 0x625d5a,
    fog: { color: 0x4e4a4a, near: 8, far: 85 },
    hemi: { sky: 0x8a8a90, ground: 0x1c1c18, intensity: 0.6 },
    key: { color: 0xe0d4c0, intensity: 0.45, elevation: 0.42, azimuth: 3.0 },
    disc: { color: 0x8a837c, size: 7, soft: 0.9 },
    environment: 0.4,
    shadow: 0,
  },
  // The moon is setting and the sky is just going pale: where the night hands over to the sunrise.
  predawn: {
    skyTop: 0x0b1222,
    skyHorizon: 0x2a2a44,
    fog: { color: 0x1d2230, near: 6, far: 70 },
    hemi: { sky: 0x4a5878, ground: 0x10120f, intensity: 0.45 },
    key: { color: 0xcfd8ff, intensity: 0.3, elevation: 0.35, azimuth: -2.6 },
    disc: { color: 0xdfe8ff, size: 4, soft: 0.25 },
    environment: 0.2,
    shadow: 0.3,
    stars: true,
  },
  // The end of the farewell and the canoe ride: a warm sun over the dam, a blue sky.
  sunrise: {
    skyTop: 0x6f9fd0,
    skyHorizon: 0xf0c890,
    fog: { color: 0xc9c2b0, near: 10, far: 110 },
    hemi: { sky: 0xbcd2e8, ground: 0x4a5a36, intensity: 1.4 },
    key: { color: 0xffc27a, intensity: 2.2, elevation: 0.12, azimuth: 3.0 },
    disc: { color: 0xffe2a8, size: 8, soft: 0.6 },
    environment: 1,
    shadow: 1,
    sky: { turbidity: 6, rayleigh: 2.2, mie: 0.006, mieG: 0.85 },
  },
};

const channel = (a: number, b: number, t: number, shift: number): number =>
  Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);

/** Per-channel blend of two 0xRRGGBB colours. */
export function mixHex(a: number, b: number, t: number): number {
  return (channel(a, b, t, 16) << 16) | (channel(a, b, t, 8) << 8) | channel(a, b, t, 0);
}

const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

/** Angle `t` of the way from `a` to `b` the short way round (exact at both ends). */
function mixAngle(a: number, b: number, t: number): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const turn = ((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + turn * t;
}

/** Writes the blend of the sky blocks into `out.sky`: its own object, made once, never a shared one. */
function mixSky(a: LightPreset, b: LightPreset, t: number, out: LightPreset): void {
  const from = a.sky ?? b.sky;
  const to = b.sky ?? a.sky;
  if (!from || !to) {
    out.sky = undefined;
    return;
  }
  if (!out.sky || out.sky === a.sky || out.sky === b.sky) {
    out.sky = { turbidity: 0, rayleigh: 0, mie: 0, mieG: 0 };
  }
  out.sky.turbidity = mix(from.turbidity, to.turbidity, t);
  out.sky.rayleigh = mix(from.rayleigh, to.rayleigh, t);
  out.sky.mie = mix(from.mie, to.mie, t);
  out.sky.mieG = mix(from.mieG, to.mieG, t);
}

/**
 * A preset `t` (0..1) of the way from `a` to `b`, written into `out` (never allocates once `out` has
 * its blocks): safe every frame. The sky block shows when either preset has one.
 */
export function mixPresetInto(
  a: LightPreset,
  b: LightPreset,
  t: number,
  out: LightPreset,
): LightPreset {
  out.skyTop = mixHex(a.skyTop, b.skyTop, t);
  out.skyHorizon = mixHex(a.skyHorizon, b.skyHorizon, t);
  out.fog.color = mixHex(a.fog.color, b.fog.color, t);
  out.fog.near = mix(a.fog.near, b.fog.near, t);
  out.fog.far = mix(a.fog.far, b.fog.far, t);
  out.hemi.sky = mixHex(a.hemi.sky, b.hemi.sky, t);
  out.hemi.ground = mixHex(a.hemi.ground, b.hemi.ground, t);
  out.hemi.intensity = mix(a.hemi.intensity, b.hemi.intensity, t);
  out.key.color = mixHex(a.key.color, b.key.color, t);
  out.key.intensity = mix(a.key.intensity, b.key.intensity, t);
  out.key.elevation = mix(a.key.elevation, b.key.elevation, t);
  out.key.azimuth = mixAngle(a.key.azimuth, b.key.azimuth, t);
  out.disc.color = mixHex(a.disc.color, b.disc.color, t);
  out.disc.size = mix(a.disc.size, b.disc.size, t);
  out.disc.soft = t < 0.5 ? a.disc.soft : b.disc.soft;
  out.environment = mix(a.environment, b.environment, t);
  out.shadow = mix(a.shadow, b.shadow, t);
  out.stars = t < 0.5 ? a.stars : b.stars;
  mixSky(a, b, t, out);
  return out;
}

/** A fresh preset `t` (0..1) of the way from `a` to `b`. Allocates: for one-off use, not per frame. */
export function mixPreset(a: LightPreset, b: LightPreset, t: number): LightPreset {
  return mixPresetInto(a, b, t, structuredClone(a));
}
