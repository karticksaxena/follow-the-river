import {
  instancedDynamicBufferAttribute,
  positionGeometry,
  smoothstep,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import * as THREE from 'three/webgpu';

/** One pooled particle. All numbers, so the pool is preallocated and a spawn allocates nothing. */
export interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds lived and seconds it lives for. */
  age: number;
  life: number;
  size: number;
  /** A random 0..1 fixed at spawn (phase, tint). */
  seed: number;
}

function blank(): Particle {
  return { alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, seed: 0 };
}

/**
 * Pure: moves `p` on by `dt`: drag (fraction of velocity lost per second), then gravity (m/s², negative
 * is down). Returns false, and clears `p.alive`, once its life is used up.
 */
export function stepParticle(p: Particle, dt: number, gravity: number, drag: number): boolean {
  p.age += dt;
  if (p.age >= p.life) {
    p.alive = false;
    return false;
  }
  const keep = Math.max(0, 1 - drag * dt);
  p.vx *= keep;
  p.vy = p.vy * keep + gravity * dt;
  p.vz *= keep;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  return true;
}

export interface Pool {
  readonly items: readonly Particle[];
  /** The next free slot (the oldest one is recycled when all are alive), reset and alive. No allocation. */
  spawn(): Particle;
}

/** A fixed pool of `max` particles. */
export function createPool(max: number): Pool {
  const items = Array.from({ length: max }, blank);
  let cursor = 0;
  return {
    items,
    spawn() {
      let slot = -1;
      for (let i = 0; i < max; i++) {
        const k = (cursor + i) % max;
        if (!items[k].alive) {
          slot = k;
          break;
        }
      }
      if (slot < 0) slot = cursor;
      cursor = (slot + 1) % max;
      const p = items[slot];
      p.alive = true;
      p.age = 0;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.seed = Math.random();
      return p;
    },
  };
}

export interface CloudOptions {
  /** Added to what is behind (glows, motes) instead of covering it (spray, leaves). */
  additive: boolean;
  /** Lies flat in the XZ plane (mist) instead of facing the camera. */
  flat?: boolean;
  /** Fogged like the scene (default: only the non-additive ones). */
  fog?: boolean;
}

/** `pos`: x, y, z, size per instance; `col`: r, g, b, a. The caller fills both, then `commit(n)`. */
export interface Cloud {
  readonly mesh: THREE.Mesh;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  /** Draws the first `n` instances (none at 0; the mesh stays visible so the shaders compile with the scene) and uploads the buffers: one draw call. */
  commit(n: number): void;
  dispose(): void;
}

function cloudMaterial(
  options: CloudOptions,
  pos: THREE.InstancedBufferAttribute,
  col: THREE.InstancedBufferAttribute,
): THREE.Material {
  const p = instancedDynamicBufferAttribute(pos, 'vec4' as const);
  const c = instancedDynamicBufferAttribute(col, 'vec4' as const);
  const soft = smoothstep(0, 0.5, uv().sub(0.5).length()).oneMinus();
  const colorNode = vec4(c.rgb, c.a.mul(soft.mul(soft)));
  const material = options.flat
    ? new THREE.MeshBasicNodeMaterial({ colorNode })
    : new THREE.SpriteNodeMaterial({ colorNode, positionNode: p.xyz, scaleNode: p.w });
  if (options.flat) {
    material.positionNode = vec3(positionGeometry.x, 0, positionGeometry.y).mul(p.w).add(p.xyz);
  }
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.blending = options.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  material.fog = options.fog ?? !options.additive;
  return material;
}

/** One draw call of up to `max` soft round quads, positioned and tinted from two instanced buffers. */
export function createCloud(max: number, options: CloudOptions): Cloud {
  const pos = new Float32Array(max * 4);
  const col = new Float32Array(max * 4);
  const posAttr = new THREE.InstancedBufferAttribute(pos, 4).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.InstancedBufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const material = cloudMaterial(options, posAttr, colAttr);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false; // instances are anywhere; the plane's own bounds mean nothing
  mesh.renderOrder = 3;
  mesh.count = 0;
  return {
    mesh,
    pos,
    col,
    commit(n) {
      mesh.count = n;
      if (n === 0) return;
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
