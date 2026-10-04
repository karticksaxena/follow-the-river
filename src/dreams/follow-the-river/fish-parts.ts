import * as THREE from 'three/webgpu';
import { ANATOMY, SKIN_MATERIALS } from './dras-anatomy';
import type { StrikeStyle } from './orca-grab';
import { WATER_Y } from './river';

const THROW_RANGE = 1.5;
const MIN_SWIM_SPEED = 0.3; // m/s along the river before the heading follows motion
const MAX_LEAN = 0.25;
/** The wake behind the fin: dim, pale blue-grey (never bright). */
const WAKE_OPACITY = 0.3;
const WAKE_COLOR = 0x9fb4bf;
export const WAKE_SIZE = { width: 2.4, length: 6 } as const;

/**
 * A faint pale V of broken water trailing the fin: on black water at night the fin alone is easy
 * to miss, the wake is what catches the eye. The V's tip sits at the plane's +Y edge (canvas top).
 */
export function makeWake(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    const fade = g.createLinearGradient(0, 0, 0, 128);
    fade.addColorStop(0, 'rgba(255,255,255,0.9)');
    fade.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = fade;
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(32, 4);
      g.lineTo(32 + side * 28, 124);
      g.stroke();
    }
  }
  const material = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas),
    color: WAKE_COLOR,
    transparent: true,
    opacity: WAKE_OPACITY,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.scale.set(WAKE_SIZE.width, WAKE_SIZE.length, 1);
  mesh.renderOrder = 1;
  return mesh;
}

/** Height of the dorsal fin above the back (measured from the model). */
const FIN_HEIGHT = ANATOMY.finHeight;
const FIN_CLEARANCE = 0.8; // fin top above the water while cruising (most of the fin shows)
const BACK_CLEARANCE = 0.25; // back above the water while surfacing
const WET_ROUGHNESS = 0.3;
/** Seconds between surfacings: random in [18, 30]. */
export const SURFACE_MIN = 18;
export const SURFACE_MAX = 30;
export const SURFACE_TIME = 2.5;
const SURFACE_ROLL = 0.35;
/** The cruise lane: this far out from the waterline, weaving by `WEAVE_X`. */
export const LANE_OFFSET = 4;
export const WEAVE_X = 1.5;

/** Root y while cruising: the fin top (`finTop`, measured above the root) clears the water. */
export const cruiseYFor = (finTop: number): number => WATER_Y + FIN_CLEARANCE - finTop;

/** Root y at the top of a surfacing: back (finTop - fin height) just out of the water. */
export const surfaceYFor = (finTop: number): number =>
  WATER_Y + BACK_CLEARANCE - (finTop - FIN_HEIGHT);

/** Seconds until the next surfacing; `rand` is in [0, 1). The sicker (`k`) she is, the oftener she logs at the surface. */
export const nextSurfacing = (rand: number, k = 0): number =>
  (SURFACE_MIN + rand * (SURFACE_MAX - SURFACE_MIN)) * (1 - 0.45 * k);

/** Seconds she stays up: 1.6x longer past half sick, easing in. */
export const surfaceTime = (k: number): number => {
  const s = Math.min(1, Math.max(0, (k - 0.5) / 0.5));
  return SURFACE_TIME * (1 + 0.6 * s * s * (3 - 2 * s));
};

/** Cruise lane x at `time`: `water` m (the waterline) plus the lane, weaving. */
export const cruiseTargetX = (water: number, time: number): number =>
  water + LANE_OFFSET + Math.sin(time * 0.4) * WEAVE_X;

/** Slow roll while surfacing, s in 0..1. */
export const surfaceRoll = (s: number): number => Math.sin(Math.PI * s) * SURFACE_ROLL;

/** Height of the model's highest point above its origin (the dorsal fin), measured at load. */
export function topOf(body: THREE.Object3D): number {
  return new THREE.Box3().setFromObject(body).max.y;
}

/** A wet sheen on her skin so moon and flashlight catch it (still dark); the eye stays glossy. */
export function makeWet(body: THREE.Object3D): void {
  body.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return;
    const m: unknown = n.material;
    if (m instanceof THREE.MeshStandardMaterial && SKIN_MATERIALS.includes(m.name))
      m.roughness = WET_ROUGHNESS;
  });
}

export const FISH = {
  strikesPerPack: 4,
  baseStrikes: 4,
  reach: 4.5,
  cooldown: 1.1,
  follow: 2.5,
};

/** A normal night's strikes (orca-grab.ts StrikeStyle). */
export const NIGHT_STRIKE = {
  cooldown: FISH.cooldown,
  reach: FISH.reach,
  pace: 1,
  sweep: 0,
} as const;

export function strikesFor(fed: number): number {
  return FISH.baseStrikes + fed * FISH.strikesPerPack;
}

/** How much hungrier each fish pack makes it (per pack, and the limits). Tuning knobs. */
export const FED = {
  cooldown: { per: -0.12, limit: 0.5 },
  reach: { per: 0.5, limit: 7 },
  pace: { per: -0.06, limit: 0.7 },
  sweep: { per: 0.4, limit: 2 },
} as const;

/** The night's strike style after `fed` packs: sooner, further, quicker, sweeping. */
export function styleFor(fed: number): StrikeStyle {
  const n = Math.max(0, fed);
  return {
    cooldown: Math.max(FED.cooldown.limit, FISH.cooldown + FED.cooldown.per * n),
    reach: Math.min(FED.reach.limit, FISH.reach + FED.reach.per * n),
    pace: Math.max(FED.pace.limit, 1 + FED.pace.per * n),
    sweep: Math.min(FED.sweep.limit, FED.sweep.per * n),
  };
}

/** The zombie to take: alive, within `reach` of the edge, nearest to the player. */
export function pickStrike(
  candidates: ArrayLike<number>,
  count: number,
  player: { x: number; z: number },
  edgeX: number,
  reach: number = FISH.reach,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const x = candidates[i * 3 + 1];
    if (edgeX - x > reach) continue;
    const dx = x - player.x;
    const dz = candidates[i * 3 + 2] - player.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidates[i * 3];
    }
  }
  return best;
}

/** Within 1.5 m of the edge and holding a pack. */
export function canThrow(x: number, edgeX: number, fishPacks: number): boolean {
  return fishPacks > 0 && edgeX - x <= THROW_RANGE;
}

/** Yaw for velocity (vx, vz): along the river while swimming, else resting downstream (-Z). */
export function cruiseHeading(vx: number, vz: number): number {
  if (Math.abs(vz) < MIN_SWIM_SPEED) return 0;
  const lean = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, Math.atan2(vx, Math.abs(vz))));
  return vz < 0 ? -lean : Math.PI + lean;
}

export const smooth = (s: number): number => s * s * (3 - 2 * s);

/** Half the body, and how far its nose and tail must stay from the bank (m). */
const HALF_LENGTH = ANATOMY.halfLength;
const BANK_MARGIN = 0.6;
/** Half the body's width (m), measured from the model. */
export const BODY_HALF_WIDTH = ANATOMY.halfWidth;

/**
 * The smallest x that keeps the whole orca (nose and tail) in the river when it faces `yaw`:
 * turned toward the bank, its 7 m body reaches sideways and the nose used to end up on land.
 */
export function inWaterX(x: number, yaw: number, water: number): number {
  return Math.max(x, water + BANK_MARGIN + BODY_HALF_WIDTH + Math.abs(Math.sin(yaw)) * HALF_LENGTH);
}

export function turnToward(current: number, target: number, amount: number): number {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * Math.min(1, amount);
}

export function findClip(clips: readonly THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const clip = clips.find((c) => c.name === name);
  if (!clip) throw new Error(`orca.glb has no ${name} clip`);
  return clip;
}
