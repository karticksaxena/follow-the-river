import {
  color,
  float,
  mix,
  mx_noise_float,
  normalLocal,
  positionGeometry,
  positionLocal,
  smoothstep,
  step,
  uniform,
  vec3,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { ANATOMY, SKIN_MATERIALS } from './dras-anatomy';
import type { Phase } from './state';

/**
 * Every zombie the orca eats carries the virus Mom's lab made (Plan 7): she gets sicker every day
 * and night and with every kill. 0 = well, 1 = dying. Her black and white stay: sickness shows as a
 * slow dulling, lesions and wasting, never as paleness. Tuning knobs.
 */
export const SICK = {
  /** Sickness never drops below this in a phase (the story), whatever was eaten. */
  floor: {
    intro: 0,
    day1: 0.05,
    night1: 0.08,
    day2: 0.18,
    night2: 0.24,
    day3: 0.38,
    night3: 0.45,
    end: 1,
  } as Record<Phase, number>,
  /** Each zombie she eats. */
  perKill: 0.015,
  /** Until the very end she is never more than this sick. */
  cap: 0.9,
  lesion: 0x5e5b57,
  /** Her black dulls toward this charcoal and her white toward this yellowed grey at k = 1. */
  dullBlack: 0x262626,
  dullWhite: 0xb9b3a4,
  /** Share of the way to the dull colour at k = 1 (never grey-out). */
  dullShare: 0.85,
  /** Her wet gloss fades: roughness from the skin's own (makeWet's) up to this at k = 1. */
  dullRoughness: 0.75,
  speck: 0x060606,
  /** Metres the peanut-head dent sinks at its worst, and how much thinner (share of width). */
  dent: 0.12,
  thin: 0.1,
  /** Her breath: pale until `redFrom`, then red. */
  mist: { well: 0xd8e2e8, sick: 0xa8463f, redFrom: 0.95 },
  /** The blow: seconds, how high it rises (m), how big it grows (m), how opaque it starts. */
  blow: { seconds: 1.4, rise: 1.6, size: 2.2, opacity: 0.55 },
  /** How much smaller, lower and fainter the blow gets at k = 1 (shares). */
  blowWeak: { size: 0.4, rise: 0.4, opacity: 0.5 },
  /** Cruising slows by up to this share when she is dying. */
  slow: 0.3,
} as const;

/** The sickness for `eaten` zombies in `phase`: the story floor, growing with every kill. */
export function sicknessAt(phase: Phase, eaten: number): number {
  const floor = SICK.floor[phase];
  if (phase === 'end') return floor;
  return Math.min(SICK.cap, Math.max(floor, eaten * SICK.perKill));
}

const sickMist = new THREE.Color(SICK.mist.sick);
const dullBlack = new THREE.Color(SICK.dullBlack);
const dullWhite = new THREE.Color(SICK.dullWhite);
const hsl = { h: 0, s: 0, l: 0 };

/** The colour `base` dulls toward: charcoal for black, yellowed grey for white, between for grey. */
function dullTarget(base: THREE.Color, out: THREE.Color): THREE.Color {
  const l = base.getHSL(hsl, THREE.SRGBColorSpace).l;
  if (l < 0.2) return out.copy(dullBlack);
  if (l > 0.6) return out.copy(dullWhite);
  return out.copy(dullBlack).lerp(dullWhite, 0.5);
}

/** The CPU mirror of the shader's dulling: `base` at sickness `k`, into `out`. */
export function dulled(base: THREE.Color, k: number, out: THREE.Color): THREE.Color {
  const t = Math.min(1, Math.max(0, k));
  return out
    .copy(base)
    .lerp(dullTarget(base, new THREE.Color()), t * t * (3 - 2 * t) * SICK.dullShare);
}

/** Pure: the blow's colour for sickness `k`, written into `out`: pale until the very end. */
export function mistColor(k: number, out: THREE.Color): THREE.Color {
  const { redFrom } = SICK.mist;
  const red = Math.min(1, Math.max(0, (k - redFrom) / (1 - redFrom)));
  return out.setHex(SICK.mist.well).lerp(sickMist, red);
}

/** A soft round puff (canvas gradient) for the blow. */
export function makeMist(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g) {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  const material = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const mist = new THREE.Sprite(material);
  mist.visible = false;
  return mist;
}

export interface Blow {
  rise: number;
  size: number;
  opacity: number;
}

/** Pure: the blow `t` seconds in (rise and size in m, opacity) at sickness `k` into `out`; false once it has faded. */
export function blowAt(t: number, k: number, out: Blow): boolean {
  const s = t / SICK.blow.seconds;
  if (s < 0 || s >= 1) return false;
  const w = SICK.blowWeak;
  out.rise = SICK.blow.rise * Math.sqrt(s) * (1 - w.rise * k);
  out.size = (0.3 + SICK.blow.size * s) * (1 - w.size * k);
  out.opacity = SICK.blow.opacity * (1 - s) * (1 - s) * (1 - w.opacity * k);
  return true;
}

type Uniform = ReturnType<typeof uniform<'float'>>;

/** Skin: dulls gently from Day 1; blotches, rings and specks appear as she gets sicker. */
function lesions(base: THREE.Color, k: Uniform): THREE.Node<'vec3'> {
  const p = positionGeometry; // rest position, so the patches ride on her skin as she swims
  const dull = color(dullTarget(base, new THREE.Color()));
  const skin = mix(color(base), dull, smoothstep(0, 1, k).mul(SICK.dullShare));
  const patch = mx_noise_float(p.mul(0.9)).mul(0.5).add(0.5);
  const blotch = smoothstep(0.42, 0.58, patch).mul(smoothstep(0.1, 0.45, k));
  const ring = float(1)
    .sub(mx_noise_float(p.mul(3.1)).abs().mul(14))
    .clamp(0, 1)
    .mul(smoothstep(0.3, 0.7, k));
  const speck = step(0.8, mx_noise_float(p.mul(28)).mul(0.5).add(0.5)).mul(
    smoothstep(0.35, 0.8, k),
  );
  const grey = color(SICK.lesion);
  const c1 = mix(skin, grey, blotch.mul(0.6));
  const c2 = mix(c1, grey, ring.mul(0.5));
  return mix(c2, color(SICK.speck), speck);
}

/** Wasting: the peanut-head dent behind the blowhole and a thinner body (on the skinned position). */
function wasting(k: Uniform): THREE.Node<'vec3'> {
  const [z0, z1] = ANATOMY.dentZ;
  const z = positionGeometry.z;
  const band = smoothstep(z0 - 0.3, z0, z).mul(smoothstep(z1 + 0.3, z1, z));
  const top = smoothstep(0.1, 0.5, positionGeometry.y);
  const dent = band
    .mul(top)
    .mul(smoothstep(0.35, 1, k))
    .mul(SICK.dent);
  const thin = float(1).sub(smoothstep(0.5, 1, k).mul(SICK.thin));
  return positionLocal.mul(vec3(thin, 1, 1)).sub(normalLocal.mul(dent));
}

export interface Sickness {
  readonly k: number;
  set(k: number): void;
  /** Frees the node materials. */
  dispose(): void;
}

/**
 * Swaps every mesh's material under `body` for a node material driven by one uniform (its own, so
 * another orca stays well): skin gets dulling, lesions and fading gloss, every part the wasting.
 * The old materials are disposed, so pass clones.
 */
export function makeSick(body: THREE.Object3D): Sickness {
  const k = uniform(0);
  const made: THREE.MeshStandardNodeMaterial[] = [];
  body.traverse((n) => {
    if (!(n instanceof THREE.Mesh) || !(n.material instanceof THREE.MeshStandardMaterial)) return;
    const src = n.material;
    const m = new THREE.MeshStandardNodeMaterial().copy(src);
    if (SKIN_MATERIALS.includes(src.name)) {
      m.colorNode = lesions(src.color, k);
      m.roughnessNode = mix(float(src.roughness), SICK.dullRoughness, k);
    }
    m.positionNode = wasting(k);
    n.material = m;
    made.push(m);
    src.dispose();
  });
  return {
    get k() {
      return k.value;
    },
    set(v) {
      k.value = Math.min(1, Math.max(0, v));
    },
    dispose() {
      for (const m of made) m.dispose();
    },
  };
}
