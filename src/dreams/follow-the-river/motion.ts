import type * as THREE from 'three/webgpu';
import {
  layer,
  stepEmbers,
  stepFireflies,
  stepLeaves,
  stepMist,
  stepMotes,
  stepSpray,
  type Embers,
  type Frame,
  type Layer,
  type MotionEnv,
  type MotionSite,
} from './motion-steps';

export { beamBrightness, conePoint } from './motion-beam';
export type { FireflyZone, MotionEnv, MotionSite } from './motion-steps';

/**
 * Small motion everywhere: how many of each live particle there is per quality tier (tuning knobs).
 * Each system is one draw call, pooled and updated on the CPU (no allocation per frame or per spawn);
 * Low keeps only the cheap, gameplay-adjacent ones (spray, embers).
 */
export const MOTION = {
  /** Splash droplets alive at once (a burst is scaled by this tier's share of High). */
  spray: { low: 64, medium: 128, high: 256 },
  /** Wisps drifting flat over the river at night. */
  mist: { low: 0, medium: 5, high: 8 },
  /** Dust in the torch's beam. */
  motes: { low: 0, medium: 120, high: 300 },
  /** Night 3's forest edge, and the canoe banks at dawn. */
  fireflies: { low: 0, medium: 10, high: 24 },
  /** Rising from the campfire. */
  embers: { low: 8, medium: 16, high: 28 },
  /** Falling in the forest by day. */
  leaves: { low: 0, medium: 24, high: 48 },
} as const;

export interface Motion {
  readonly env: MotionEnv;
  /** A burst of `n` droplets at (x, y, z) thrown up at about `speed` m/s (scaled down by tier). */
  burst(x: number, y: number, z: number, n: number, speed: number): void;
  /** Moves every system on `dt` seconds; reads the camera's world matrix. */
  update(dt: number): void;
  dispose(): void;
}

/** Every live motion, newest last: the newest takes the splashes; disposing one hands them back to the one before. */
const live: Motion[] = [];

/** A splash at (x, y, z) on the scene's motion, if it has one (the fish's recorded splashes call this). */
export function splashAt(x: number, y: number, z: number, big: boolean): void {
  live[live.length - 1]?.burst(x, y, z, big ? 40 : 14, big ? 4.5 : 2.6);
}

/** A small splash where a paddle's blade goes into the water. */
export function dripAt(x: number, y: number, z: number): void {
  live[live.length - 1]?.burst(x, y, z, 7, 1.4);
}

interface Layers {
  spray: Layer;
  mist: Layer;
  motes: Layer;
  flies: Layer;
  embers: Embers;
  leaves: Layer;
}

function makeLayers(scene: THREE.Object3D): Layers {
  return {
    spray: layer(scene, MOTION.spray.high, false),
    mist: layer(scene, MOTION.mist.high, false, true),
    motes: layer(scene, MOTION.motes.high, true),
    flies: layer(scene, MOTION.fireflies.high, true),
    embers: { layer: layer(scene, MOTION.embers.high, true), owed: 0 },
    leaves: layer(scene, MOTION.leaves.high, false),
  };
}

/** Throws up to `m` droplets from (x, y, z); returns how many. */
function throwSpray(l: Layer, x: number, y: number, z: number, m: number, speed: number): number {
  for (let i = 0; i < m; i++) {
    const p = l.pool.spawn();
    const a = Math.random() * Math.PI * 2;
    const h = Math.random() * speed * 0.45;
    p.x = x + Math.cos(a) * 0.15;
    p.y = y;
    p.z = z + Math.sin(a) * 0.15;
    p.vx = Math.cos(a) * h;
    p.vz = Math.sin(a) * h;
    p.vy = speed * (0.55 + Math.random() * 0.45);
    p.life = 0.55 + Math.random() * 0.6;
    p.size = 0.08 + Math.random() * 0.1;
  }
  return m;
}

function stepAll(ls: Layers, f: Frame, site: MotionSite): number {
  const { env } = f;
  stepMotes(ls.motes, f, MOTION.motes[env.tier]);
  stepMist(ls.mist, f, env.mist ? MOTION.mist[env.tier] : 0);
  stepFireflies(ls.flies, f, MOTION.fireflies[env.tier], site.fireflies);
  stepLeaves(ls.leaves, f, MOTION.leaves[env.tier]);
  stepEmbers(ls.embers, f, MOTION.embers[env.tier], site);
  return stepSpray(ls.spray, f);
}

/**
 * Builds the scene's particle systems (all cheap and hidden until used) and makes them the one
 * `splashAt` / `dripAt` talk to. `camera` is read for the torch's beam; its matrix is as of the last render.
 */
export function createMotion(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  site: MotionSite,
): Motion {
  const ls = makeLayers(scene);
  const env: MotionEnv = {
    tier: 'high',
    night: false,
    torch: 0,
    mist: false,
    fireflies: false,
    leaves: false,
  };
  const ground = site.ground ?? ((): number => 0);
  const frame: Frame = {
    e: camera.matrixWorld.elements,
    px: 0,
    pz: 0,
    time: 0,
    dt: 0,
    env,
    ground,
  };
  let sprayAlive = 0;
  const motion: Motion = {
    env,
    burst(x, y, z, n, speed) {
      const cap = MOTION.spray[env.tier];
      const m = Math.min(Math.ceil((n * cap) / MOTION.spray.high), cap - sprayAlive);
      if (m > 0) sprayAlive += throwSpray(ls.spray, x, y, z, m, speed);
    },
    update(dt) {
      frame.dt = Math.min(dt, 0.1);
      frame.time += frame.dt;
      frame.px = frame.e[12];
      frame.pz = frame.e[14];
      sprayAlive = stepAll(ls, frame, site);
    },
    dispose() {
      const at = live.indexOf(motion);
      if (at >= 0) live.splice(at, 1);
      for (const l of [ls.spray, ls.mist, ls.motes, ls.flies, ls.embers.layer, ls.leaves]) {
        scene.remove(l.cloud.mesh);
        l.cloud.dispose();
      }
    },
  };
  live.push(motion);
  return motion;
}
