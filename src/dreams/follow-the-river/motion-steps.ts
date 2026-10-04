import type * as THREE from 'three/webgpu';
import {
  createCloud,
  createPool,
  stepParticle,
  type Cloud,
  type Particle,
  type Pool,
} from '../../engine/particles';
import type { Tier } from '../../engine/quality';
import { beamBrightness, conePoint, MOTES, type V3 } from './motion-beam';
import { EDGE_X, FAR_EDGE_X, WATER_Y } from './river';

type Rgb = readonly [number, number, number];
const SPRAY = { gravity: -9.5, drag: 0.6, color: [0.7, 0.76, 0.8] as Rgb, alpha: 0.5, night: 0.4 };
const MIST = {
  size: [10, 18],
  reach: 45,
  alpha: 0.085,
  rise: 3,
  height: 0.3,
  color: [0.5, 0.56, 0.62] as Rgb,
};
const FIREFLY = {
  size: 0.16,
  reach: 32,
  near: 8,
  sway: 1.2,
  color: [0.7, 1, 0.35] as Rgb,
  alpha: 0.9,
};
const EMBER = {
  life: [1.6, 3.2],
  rise: [0.7, 1.4],
  size: [0.03, 0.06],
  near: 50,
  drag: 0.2,
  fire: 0.35,
};
const LEAF = {
  reach: 14,
  top: 7,
  fall: 0.55,
  size: 0.09,
  color: [0.26, 0.17, 0.07] as Rgb,
  alpha: 0.9,
};

/** Scratch colour for the systems that tint per particle. */
const TMP: [number, number, number] = [0, 0, 0];

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export interface MotionEnv {
  tier: Tier;
  night: boolean;
  /** The torch's level 0..1 (0: off). */
  torch: number;
  mist: boolean;
  fireflies: boolean;
  leaves: boolean;
}

/** Where fireflies live: a strip of x across the bank, or a ring around the camera (the canoe). */
export type FireflyZone =
  { kind: 'band'; minX: number; maxX: number; y: number } | { kind: 'ring'; y: number };

export interface MotionSite {
  fires: readonly { x: number; z: number }[];
  fireflies: FireflyZone;
  /** The ground's height at (x, z) for the leaves and embers (default: flat at 0). */
  ground?: (x: number, z: number) => number;
}

export interface Layer {
  cloud: Cloud;
  pool: Pool;
  items: readonly Particle[];
}

export function layer(scene: THREE.Object3D, max: number, additive: boolean, flat = false): Layer {
  const cloud = createCloud(max, { additive, flat });
  scene.add(cloud.mesh);
  const pool = createPool(max);
  return { cloud, pool, items: pool.items };
}

function put(c: Cloud, i: number, p: Particle, size: number, rgb: Rgb, a: number): void {
  const k = i * 4;
  c.pos[k] = p.x;
  c.pos[k + 1] = p.y;
  c.pos[k + 2] = p.z;
  c.pos[k + 3] = size;
  c.col[k] = rgb[0];
  c.col[k + 1] = rgb[1];
  c.col[k + 2] = rgb[2];
  c.col[k + 3] = a;
}

/** What the systems share each frame: the camera's matrix (right, up, back, position), the player and the clock. */
export interface Frame {
  e: ArrayLike<number>;
  px: number;
  pz: number;
  time: number;
  dt: number;
  env: MotionEnv;
  ground: (x: number, z: number) => number;
}

/** Spray: droplets thrown up by `burst`, falling back with gravity and dying at the water. Returns how many are alive. */
export function stepSpray(l: Layer, f: Frame): number {
  const tint = f.env.night ? SPRAY.night : 1;
  const [r, g, b] = SPRAY.color;
  let n = 0;
  for (const p of l.items) {
    if (!p.alive) continue;
    if (!stepParticle(p, f.dt, SPRAY.gravity, SPRAY.drag) || p.y < WATER_Y - 0.3) {
      p.alive = false;
      continue;
    }
    const t = p.age / p.life;
    TMP[0] = r * tint;
    TMP[1] = g * tint;
    TMP[2] = b * tint;
    put(l.cloud, n++, p, p.size * (1 - 0.4 * t), TMP, SPRAY.alpha * (1 - t));
  }
  l.cloud.commit(n);
  return n;
}

/** Dust: world-space specks, recycled into the cone the moment the beam leaves them, lit by the beam's own falloff. */
export function stepMotes(l: Layer, f: Frame, count: number): void {
  const level = f.env.torch * (f.env.night ? 1 : MOTES.day);
  if (level <= 0.01 || count === 0) return l.cloud.commit(0);
  const { e } = f;
  const c = l.cloud;
  for (let i = 0; i < count; i++) {
    const p = l.items[i];
    if (p.alive) {
      stepParticle(p, f.dt, 0, 0);
      const dx = p.x - e[12];
      const dy = p.y - e[13];
      const dz = p.z - e[14];
      const lit = beamBrightness(
        dx * e[0] + dy * e[1] + dz * e[2],
        dx * e[4] + dy * e[5] + dz * e[6],
        dx * e[8] + dy * e[9] + dz * e[10],
      );
      if (lit > 0) {
        const twinkle = 0.65 + 0.35 * Math.sin(f.time * 2 + p.seed * 40);
        put(
          c,
          i,
          p,
          p.size,
          MOTES.color,
          level * lit * twinkle * Math.min(1, p.age / MOTES.fadeIn),
        );
        continue;
      }
    }
    respawnMote(p, e);
    put(c, i, p, p.size, MOTES.color, 0);
  }
  c.commit(count);
}

const cone: V3 = { x: 0, y: 0, z: 0 };

function respawnMote(p: Particle, e: ArrayLike<number>): void {
  conePoint(Math.cbrt(Math.random()), Math.random(), Math.random(), cone);
  p.x = e[0] * cone.x + e[4] * cone.y + e[8] * cone.z + e[12];
  p.y = e[1] * cone.x + e[5] * cone.y + e[9] * cone.z + e[13];
  p.z = e[2] * cone.x + e[6] * cone.y + e[10] * cone.z + e[14];
  p.vx = rand(-MOTES.drift, MOTES.drift);
  p.vy = rand(-MOTES.drift, MOTES.drift) * 0.6;
  p.vz = rand(-MOTES.drift, MOTES.drift);
  p.size = rand(MOTES.size[0], MOTES.size[1]);
  p.age = 0;
  p.life = 1e9;
  p.alive = true;
}

/** Flat, soft wisps drifting over the river within MIST.reach m of the player. */
export function stepMist(l: Layer, f: Frame, count: number): void {
  if (count === 0) return l.cloud.commit(0);
  for (let i = 0; i < count; i++) {
    const p = l.items[i];
    if (!p.alive || Math.abs(p.z - f.pz) > MIST.reach || p.x < EDGE_X || p.x > FAR_EDGE_X) {
      p.x = rand(EDGE_X + 0.5, FAR_EDGE_X - 0.5);
      p.z = f.pz + rand(-MIST.reach, MIST.reach);
      p.y = WATER_Y + MIST.height;
      p.vx = rand(-0.1, 0.1);
      p.vz = rand(-0.4, 0.4);
      p.size = rand(MIST.size[0], MIST.size[1]);
      p.age = 0;
      p.life = 1e9;
      p.alive = true;
    }
    stepParticle(p, f.dt, 0, 0);
    const near = 1 - Math.abs(p.z - f.pz) / MIST.reach;
    put(l.cloud, i, p, p.size, MIST.color, MIST.alpha * near * Math.min(1, p.age / MIST.rise));
  }
  l.cloud.commit(count);
}

/** Fireflies: each blinks on its own beat and loops round its anchor; recycled when the player has left them behind. */
export function stepFireflies(l: Layer, f: Frame, count: number, zone: FireflyZone): void {
  if (count === 0 || !f.env.fireflies) return l.cloud.commit(0);
  const [r, g, b] = FIREFLY.color;
  for (let i = 0; i < count; i++) {
    const p = l.items[i];
    if (!p.alive || Math.hypot(p.x - f.px, p.z - f.pz) > FIREFLY.reach) placeFirefly(p, f, zone);
    const t = f.time * 0.7 + p.seed * 60;
    p.age += f.dt;
    const blink = Math.max(0, Math.sin(f.time * (0.9 + p.seed) + p.seed * 30)) ** 2;
    p.vx = p.x + Math.sin(t) * FIREFLY.sway;
    p.vy = p.y + Math.sin(t * 1.3 + 1) * 0.4;
    p.vz = p.z + Math.cos(t * 0.8) * FIREFLY.sway;
    const k = i * 4;
    l.cloud.pos[k] = p.vx;
    l.cloud.pos[k + 1] = p.vy;
    l.cloud.pos[k + 2] = p.vz;
    l.cloud.pos[k + 3] = FIREFLY.size;
    l.cloud.col[k] = r;
    l.cloud.col[k + 1] = g;
    l.cloud.col[k + 2] = b;
    l.cloud.col[k + 3] = FIREFLY.alpha * blink * Math.min(1, p.age);
  }
  l.cloud.commit(count);
}

function placeFirefly(p: Particle, f: Frame, zone: FireflyZone): void {
  if (zone.kind === 'band') {
    p.x = rand(zone.minX, zone.maxX);
    p.z = f.pz + rand(-FIREFLY.reach, FIREFLY.reach) * 0.9;
  } else {
    const a = Math.random() * Math.PI * 2;
    const d = rand(FIREFLY.near, FIREFLY.reach * 0.8);
    p.x = f.px + Math.cos(a) * d;
    p.z = f.pz + Math.sin(a) * d;
  }
  p.y = zone.y + rand(0, 1.8);
  p.seed = Math.random();
  p.age = 0;
  p.alive = true;
}

/** Leaves: dark flutterers falling round the player by day; one that lands (or is left behind) starts again from the canopy. */
export function stepLeaves(l: Layer, f: Frame, count: number): void {
  if (count === 0 || !f.env.leaves) return l.cloud.commit(0);
  for (let i = 0; i < count; i++) {
    const p = l.items[i];
    if (
      !p.alive ||
      p.y < f.ground(p.x, p.z) + 0.03 ||
      Math.hypot(p.x - f.px, p.z - f.pz) > LEAF.reach
    ) {
      p.x = f.px + rand(-LEAF.reach, LEAF.reach) * 0.9;
      p.z = f.pz + rand(-LEAF.reach, LEAF.reach) * 0.9;
      p.y = f.ground(p.x, p.z) + rand(0.5, LEAF.top);
      p.seed = Math.random();
      p.age = 0;
      p.life = 1e9;
      p.alive = true;
    }
    p.vx = Math.sin(p.age * 1.3 + p.seed * 9) * 0.4;
    p.vz = Math.cos(p.age * 1.1 + p.seed * 7) * 0.3;
    p.vy = -LEAF.fall;
    stepParticle(p, f.dt, 0, 0);
    const flutter = 0.55 + 0.45 * Math.abs(Math.cos(p.age * 2.2 + p.seed * 6));
    put(l.cloud, i, p, LEAF.size * flutter, LEAF.color, LEAF.alpha * Math.min(1, p.age / 0.6));
  }
  l.cloud.commit(count);
}

export interface Embers {
  layer: Layer;
  /** Fractional embers owed by the spawn rate. */
  owed: number;
}

/** Embers: spark up from the nearest fire within EMBER.near m, drift, cool from orange to dark red and die. */
export function stepEmbers(em: Embers, f: Frame, count: number, site: MotionSite): void {
  const l = em.layer;
  let n = 0;
  for (const p of l.items) {
    if (!p.alive) continue;
    if (!stepParticle(p, f.dt, 0, EMBER.drag)) continue;
    p.vx += Math.sin(p.age * 3 + p.seed * 20) * 0.5 * f.dt;
    p.vz += Math.cos(p.age * 2.4 + p.seed * 20) * 0.5 * f.dt;
    const t = p.age / p.life;
    TMP[0] = 1;
    TMP[1] = 0.45 * (1 - t);
    TMP[2] = 0.1 * (1 - t);
    put(l.cloud, n++, p, p.size * (1 - 0.5 * t), TMP, (1 - t) ** 1.5);
  }
  const fire = nearestFire(site, f);
  if (fire) {
    em.owed += (f.dt * count) / ((EMBER.life[0] + EMBER.life[1]) / 2);
    for (; em.owed >= 1; em.owed--) {
      if (n >= count) break;
      sparkUp(l, fire, n++, f);
    }
    if (n >= count) em.owed = 0;
  }
  l.cloud.commit(n);
}

function sparkUp(l: Layer, fire: { x: number; z: number }, slot: number, f: Frame): void {
  const p = l.pool.spawn();
  p.x = fire.x + rand(-0.25, 0.25);
  p.z = fire.z + rand(-0.25, 0.25);
  p.y = f.ground(fire.x, fire.z) + EMBER.fire;
  p.vy = rand(EMBER.rise[0], EMBER.rise[1]);
  p.life = rand(EMBER.life[0], EMBER.life[1]);
  p.size = rand(EMBER.size[0], EMBER.size[1]);
  put(l.cloud, slot, p, p.size, TMP, 0);
}

function nearestFire(site: MotionSite, f: Frame): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestD = EMBER.near;
  for (const fire of site.fires) {
    const d = Math.hypot(fire.x - f.px, fire.z - f.pz);
    if (d < bestD) {
      bestD = d;
      best = fire;
    }
  }
  return best;
}
