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

export const WAKE_W = 128;
export const WAKE_H = 256;
const WAKE_FLECKS = 90;
const WAKE_FLECK_MAX = 0.65; // peak alpha: the product with the envelope stays well under 0.75
const WAKE_ARM_SPREAD = 0.4; // how far (of the width) each arm opens by the far end
const WAKE_SCROLL_SPEED = 0.35; // texture lengths per second the water streams past the fin

/** Deterministic hash in [0, 1) (no Math.random: two builds are identical). */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

interface Fleck {
  x: number;
  y: number;
  rx: number;
  ry: number;
  a: number;
}

function makeFlecks(): Fleck[] {
  const out: Fleck[] = [];
  for (let i = 0; i < WAKE_FLECKS; i++) {
    const v = hash(i * 3 + 1);
    const lane = i % 5; // 0..1 the two arms, 2..4 the wide turbulent centre streak
    const side = lane === 0 ? -1 : lane === 1 ? 1 : 0;
    const spread = (hash(i * 3 + 2) - 0.5) * (side === 0 ? 0.3 : 0.08);
    out.push({
      x: (0.5 + side * WAKE_ARM_SPREAD * v + spread) * WAKE_W,
      y: v * WAKE_H,
      rx: side === 0 ? 7 + hash(i) * 6 : 2.5 + hash(i) * 3,
      ry: side === 0 ? 14 + hash(i + 9) * 14 : 3 + hash(i + 9) * 5,
      a: side === 0 ? 0.25 : 0.5 + hash(i + 5) * 0.5,
    });
  }
  return out;
}
const FLECKS = makeFlecks();

/** Soft foam flecks and ripple blobs, tiling along the length (wraps in y). Alpha in [0, 0.65]. */
export function wakeFleck(x: number, y: number): number {
  let sum = 0;
  for (const f of FLECKS) {
    let dy = Math.abs(y - f.y);
    dy = Math.min(dy, WAKE_H - dy);
    const dx = (x - f.x) / f.rx;
    const e = dx * dx + (dy / f.ry) ** 2;
    if (e < 9) sum += f.a * Math.exp(-e);
  }
  return Math.min(WAKE_FLECK_MAX, sum * WAKE_FLECK_MAX);
}

/** Strongest just behind the fin (top), nothing at the far end and at both edges. */
function wakeEnvelope(x: number, y: number): number {
  const v = y / (WAKE_H - 1);
  const u = Math.abs(x / (WAKE_W - 1) - 0.5) * 2; // 0 centre .. 1 edge
  return Math.max(0, 1 - v) ** 1.5 * Math.max(0, Math.min(1, (1 - u) * 5));
}

/** Final alpha per pixel (row-major, tip at row 0): flecks under the static envelope. */
export function wakeAlpha(): Float32Array {
  const a = new Float32Array(WAKE_W * WAKE_H);
  for (let y = 0; y < WAKE_H; y++)
    for (let x = 0; x < WAKE_W; x++) a[y * WAKE_W + x] = wakeFleck(x, y) * wakeEnvelope(x, y);
  return a;
}

/** `map.offset.y` at time t: it grows, so the pattern streams away from the fin. */
export function wakeScroll(t: number): number {
  return (t * WAKE_SCROLL_SPEED) % 1;
}

type Pixel = (x: number, y: number) => [number, number, number, number];

function fillCanvas(px: Pixel): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WAKE_W;
  canvas.height = WAKE_H;
  const g = canvas.getContext('2d');
  if (g) {
    const img = g.createImageData(WAKE_W, WAKE_H);
    for (let y = 0; y < WAKE_H; y++) {
      for (let x = 0; x < WAKE_W; x++) img.data.set(px(x, y), (y * WAKE_W + x) * 4);
    }
    g.putImageData(img, 0, 0);
  }
  return canvas;
}

/**
 * A faint pale patch of broken, disturbed water trailing the fin: on black water at night the fin
 * alone is easy to miss. The tip sits at the plane's +Y edge. `map` (tileable flecks) scrolls via
 * `wakeScroll`; `alphaMap` is the static envelope that fades the wake out.
 */
export function makeWake(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const map = new THREE.CanvasTexture(
    fillCanvas((x, y) => [255, 255, 255, Math.round(wakeFleck(x, y) * 255)]),
  );
  map.wrapT = THREE.RepeatWrapping;
  const alphaMap = new THREE.CanvasTexture(
    fillCanvas((x, y) => {
      const e = Math.round(wakeEnvelope(x, y) * 255);
      return [e, e, e, 255];
    }),
  );
  const material = new THREE.MeshBasicMaterial({
    map,
    alphaMap,
    color: WAKE_COLOR,
    transparent: true,
    opacity: WAKE_OPACITY,
    depthWrite: false,
  });
  material.addEventListener('dispose', () => alphaMap.dispose());
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.scale.set(WAKE_SIZE.width, WAKE_SIZE.length, 1);
  mesh.renderOrder = 1;
  return mesh;
}

/** Height of the dorsal fin above the back (measured from the model). */
const FIN_HEIGHT = ANATOMY.finHeight;
const FIN_CLEARANCE = 0.8; // fin top above the water while cruising (most of the fin shows)
const BACK_CLEARANCE = 0.25; // back above the water while surfacing
/** Roughness of her wet skin (glossy: the moon and torch streak on it) and of her glassy eye. Sickness dulls the skin's. */
export const WET = { skin: 0.25, eye: 0.08 } as const;

/** Where her eye is (the torch's eye adjustment aims here) for a body centre `(x, y, z)` facing `yaw`. Writes `out`. */
export function headPoint(
  x: number,
  y: number,
  z: number,
  yaw: number,
  out: { x: number; y: number; z: number },
): typeof out {
  out.x = x - Math.sin(yaw) * ANATOMY.eye.ahead;
  out.y = y + ANATOMY.eye.up;
  out.z = z - Math.cos(yaw) * ANATOMY.eye.ahead;
  return out;
}
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
export const cruiseTargetX = (water: number, time: number, lane = LANE_OFFSET): number =>
  water + lane + Math.sin(time * 0.4) * WEAVE_X;

/** The last stand (a finite `guard`): she cruises beside you, her fin in view, blowing every 6-10 s. */
export const FIGHT = { laneIn: 2, surfaceMin: 6, surfaceMax: 10 } as const;

/** Seconds until the next blow while she fights beside you; `rand` is in [0, 1). */
export const fightSurfacing = (rand: number): number =>
  FIGHT.surfaceMin + rand * (FIGHT.surfaceMax - FIGHT.surfaceMin);

/** Slow roll while surfacing, s in 0..1. */
export const surfaceRoll = (s: number): number => Math.sin(Math.PI * s) * SURFACE_ROLL;

/** Height of the model's highest point above its origin (the dorsal fin), measured at load. */
export function topOf(body: THREE.Object3D): number {
  return new THREE.Box3().setFromObject(body).max.y;
}

/** A wet sheen on her skin so moon and flashlight catch it (still dark), and a glassy eye that glints. */
export function makeWet(body: THREE.Object3D): void {
  body.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return;
    const m: unknown = n.material;
    if (!(m instanceof THREE.MeshStandardMaterial)) return;
    if (SKIN_MATERIALS.includes(m.name)) m.roughness = WET.skin;
    else if (m.name === 'orca-eye') m.roughness = WET.eye;
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
  guard: Infinity,
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
    guard: Infinity,
  };
}

/** Is (x, z) within `guard` of one of the guard points? (No guard points: anywhere.) */
function guarded(
  guards: readonly { x: number; z: number }[],
  guard: number,
  x: number,
  z: number,
): boolean {
  if (guards.length === 0 || guard === Infinity) return true;
  for (const p of guards) if (Math.hypot(x - p.x, z - p.z) <= guard) return true;
  return false;
}

/** The zombie to take: alive, within `reach` of the edge, within `guard` of a guard point (if any), nearest to the player. */
export function pickStrike(
  candidates: ArrayLike<number>,
  count: number,
  player: { x: number; z: number },
  edgeX: number,
  reach: number = FISH.reach,
  guards: readonly { x: number; z: number }[] = [],
  guard = Infinity,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const x = candidates[i * 3 + 1];
    if (edgeX - x > reach) continue;
    const z = candidates[i * 3 + 2];
    if (!guarded(guards, guard, x, z)) continue;
    const dx = x - player.x;
    const dz = z - player.z;
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
