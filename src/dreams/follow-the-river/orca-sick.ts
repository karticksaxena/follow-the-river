import * as THREE from 'three/webgpu';
import { SKIN_MATERIALS } from './dras-anatomy';
import type { Phase } from './state';

/**
 * Every zombie the orca eats carries the virus Mom's lab made (Plan 7): it gets sicker each day and
 * night, duller and blotched, and its breath turns red. 0 = well, 1 = dying. Tuning knobs.
 */
export const SICKNESS: Readonly<Record<Phase, number>> = {
  intro: 0,
  day1: 0,
  night1: 0.1,
  day2: 0.25,
  night2: 0.4,
  day3: 0.55,
  night3: 0.7,
  end: 1,
};

export const SICK = {
  /** What its white patches fade toward (the body's colours are vertex colours times this). */
  tint: 0x9a7f7a,
  /** Its breath: a healthy pale mist, a sick red one. */
  mist: { well: 0xd8e2e8, sick: 0xa8463f },
  /** The blow: seconds, how high it rises (m), how big it grows (m), how opaque it starts. */
  blow: { seconds: 1.4, rise: 1.6, size: 2.2, opacity: 0.55 },
  /** Cruising slows by up to this share when it is dying. */
  slow: 0.3,
} as const;

const well = new THREE.Color(1, 1, 1);
const sick = new THREE.Color(SICK.tint);
const sickMist = new THREE.Color(SICK.mist.sick);

/** Tints the orca's skin materials (not eye or mouth) toward SICK.tint by `k` (0..1). */
export function tintSick(body: THREE.Object3D, k: number): void {
  body.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return;
    const m: unknown = n.material;
    if (m instanceof THREE.MeshStandardMaterial && SKIN_MATERIALS.includes(m.name))
      m.color.copy(well).lerp(sick, k);
  });
}

/** Pure: the blow's colour for sickness `k`, written into `out`. */
export function mistColor(k: number, out: THREE.Color): THREE.Color {
  return out.setHex(SICK.mist.well).lerp(sickMist, Math.min(1, k * 1.2));
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

/** Pure: the blow `t` seconds in (rise and size in m, opacity) into `out`; false once it has faded. */
export function blowAt(t: number, out: Blow): boolean {
  const s = t / SICK.blow.seconds;
  if (s < 0 || s >= 1) return false;
  out.rise = SICK.blow.rise * Math.sqrt(s);
  out.size = 0.3 + SICK.blow.size * s;
  out.opacity = SICK.blow.opacity * (1 - s) * (1 - s);
  return true;
}
