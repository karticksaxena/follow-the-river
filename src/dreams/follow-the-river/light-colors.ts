import * as THREE from 'three/webgpu';
import type { LightPreset } from './light-presets';

/** The preset's colours as `Color`s (linear working space), so a blend is not rounded to 8 bits. */
export interface LightColors {
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  fog: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  key: THREE.Color;
  disc: THREE.Color;
}

export function createLightColors(): LightColors {
  return {
    skyTop: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    fog: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    key: new THREE.Color(),
    disc: new THREE.Color(),
  };
}

const from = new THREE.Color();
const to = new THREE.Color();

function blend(a: number, b: number, t: number, out: THREE.Color): void {
  out.lerpColors(from.set(a), to.set(b), t);
}

/** The colours of `a` -> `b` at `t`, blended in linear space into `out`. Allocation-free: per frame. */
export function mixColorsInto(
  a: LightPreset,
  b: LightPreset,
  t: number,
  out: LightColors,
): LightColors {
  blend(a.skyTop, b.skyTop, t, out.skyTop);
  blend(a.skyHorizon, b.skyHorizon, t, out.skyHorizon);
  blend(a.fog.color, b.fog.color, t, out.fog);
  blend(a.hemi.sky, b.hemi.sky, t, out.hemiSky);
  blend(a.hemi.ground, b.hemi.ground, t, out.hemiGround);
  blend(a.key.color, b.key.color, t, out.key);
  blend(a.disc.color, b.disc.color, t, out.disc);
  return out;
}
