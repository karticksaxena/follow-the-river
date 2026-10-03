import * as THREE from 'three/webgpu';
import type { AudioBus } from '../../engine/audio';
import { segmentHitsBox } from '../../engine/collide';
import type { BoxGrid } from '../../engine/grid';
import { loadModel } from '../../engine/models';
import type { Vec3 } from '../../engine/ray';
import { propUrl } from './kits';
import type { Sounds } from './sounds';
import type { Horde } from './zombies/horde';

/** Arrow speed (m/s), gravity (m/s², gentle on purpose), reload (s), flight time (s), arrows in the pool. */
export const BOW = { speed: 45, gravity: 4.9, cooldown: 0.9, life: 3, pool: 8 } as const;

const WALL_HEIGHT = 3;
const GROUND = 0.02;
const RECOVER_RADIUS = 1.1;
const KICK = 0.06;
const KICK_TIME = 0.25;
const SPAWN_AHEAD = 0.3;
const VOLUME = { twang: 0.6, thud: 0.7, click: 0.4 } as const;

export interface Arrow {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  state: 'idle' | 'flying' | 'stuck';
}

/** Flies one arrow for `dt` seconds; it goes idle after `BOW.life`. */
export function stepArrow(arrow: Arrow, dt: number): void {
  if (arrow.state !== 'flying') return;
  arrow.x += arrow.vx * dt;
  arrow.y += arrow.vy * dt;
  arrow.z += arrow.vz * dt;
  arrow.vy -= BOW.gravity * dt;
  arrow.age += dt;
  if (arrow.age > BOW.life) arrow.state = 'idle';
}

export interface Bow {
  readonly ready: boolean;
  /** Looses an arrow from `eye` along unit `look`. Caller has already spent the arrow. */
  fire(eye: Vec3, look: Vec3): void;
  /** Flies arrows, kills what they hit, sticks misses into walls/ground; returns arrows recovered this frame. */
  update(dt: number, horde: Horde, grid: BoxGrid, player: { x: number; z: number }): number;
  reset(): void;
  dispose(): void;
}

const FORWARD = new THREE.Vector3(0, 0, -1);
const origin: Vec3 = { x: 0, y: 0, z: 0 };
const dir: Vec3 = { x: 0, y: 0, z: 0 };
const aim = new THREE.Vector3();

function newArrow(): Arrow {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, state: 'idle' };
}

/** Points a mesh along the arrow's velocity (no allocation). */
function orient(mesh: THREE.Object3D, a: Arrow): void {
  aim.set(a.vx, a.vy, a.vz).normalize();
  mesh.quaternion.setFromUnitVectors(FORWARD, aim);
}

function place(mesh: THREE.Object3D, a: Arrow): void {
  mesh.position.set(a.x, a.y, a.z);
  mesh.visible = a.state !== 'idle';
}

/** Where along the step (0..1) it first meets a wall or the ground, or 1. */
function obstacle(grid: BoxGrid, x0: number, y0: number, z0: number, a: Arrow): number {
  let t = 1;
  if (a.y <= GROUND) t = Math.min(t, Math.max(0, (y0 - GROUND) / (y0 - a.y)));
  const length = Math.hypot(a.x - x0, a.z - z0);
  for (const box of grid.near(a.x, a.z, length + 0.5)) {
    const hit = segmentHitsBox(x0, z0, a.x, a.z, box);
    if (hit !== null && hit < t && y0 + (a.y - y0) * hit < WALL_HEIGHT) t = hit;
  }
  return t;
}

function stick(a: Arrow, x: number, y: number, z: number): void {
  a.x = x;
  a.y = Math.max(y, GROUND);
  a.z = z;
  a.state = 'stuck';
}

export async function createBow(
  camera: THREE.Camera,
  scene: THREE.Scene,
  audio: AudioBus,
  sounds: Sounds,
): Promise<Bow> {
  const [bowModel, arrowModel] = await Promise.all([
    loadModel(propUrl('bow')),
    loadModel(propUrl('arrow')),
  ]);
  const view = new THREE.Group();
  view.position.set(0.28, -0.3, -0.55);
  view.rotation.set(0, 0.1, -0.15);
  const nocked = arrowModel.clone(true);
  nocked.position.set(0, 0, -0.25);
  view.add(bowModel, nocked);
  camera.add(view);

  const arrows = Array.from({ length: BOW.pool }, newArrow);
  const meshes = arrows.map(() => {
    const mesh = arrowModel.clone(true);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  let cooldown = 0;
  let kick = 0;

  function resolveHit(
    i: number,
    x0: number,
    y0: number,
    z0: number,
    horde: Horde,
    grid: BoxGrid,
  ): void {
    const a = arrows[i];
    const t = obstacle(grid, x0, y0, z0, a);
    const length = Math.hypot(a.x - x0, a.y - y0, a.z - z0) * t;
    origin.x = x0;
    origin.y = y0;
    origin.z = z0;
    aim.set(a.vx, a.vy, a.vz).normalize();
    dir.x = aim.x;
    dir.y = aim.y;
    dir.z = aim.z;
    const zombie = length > 0 ? horde.rayHit(origin, dir, length) : null;
    if (zombie) {
      horde.kill(zombie.id);
      audio.once(sounds.thud, VOLUME.thud);
      stick(a, x0 + dir.x * zombie.distance, 0, z0 + dir.z * zombie.distance);
    } else if (t < 1) {
      stick(a, x0 + (a.x - x0) * t, y0 + (a.y - y0) * t, z0 + (a.z - z0) * t);
    }
  }

  return {
    get ready() {
      return cooldown <= 0;
    },
    fire(eye, look) {
      const a = arrows.find((arrow) => arrow.state === 'idle');
      if (!a || cooldown > 0) return;
      a.x = eye.x + look.x * SPAWN_AHEAD;
      a.y = eye.y + look.y * SPAWN_AHEAD;
      a.z = eye.z + look.z * SPAWN_AHEAD;
      a.vx = look.x * BOW.speed;
      a.vy = look.y * BOW.speed;
      a.vz = look.z * BOW.speed;
      a.age = 0;
      a.state = 'flying';
      audio.once(sounds.twang, VOLUME.twang);
      cooldown = BOW.cooldown;
      kick = KICK_TIME;
    },
    update(dt, horde, grid, player) {
      cooldown = Math.max(0, cooldown - dt);
      kick = Math.max(0, kick - dt);
      view.position.z = -0.55 + KICK * (kick / KICK_TIME);
      nocked.visible = cooldown <= 0;
      let recovered = 0;
      for (let i = 0; i < arrows.length; i++) {
        const a = arrows[i];
        if (a.state === 'flying') {
          const { x, y, z } = a;
          stepArrow(a, dt);
          if (a.state === 'flying') resolveHit(i, x, y, z, horde, grid);
          if (a.state === 'flying') orient(meshes[i], a);
        } else if (a.state === 'stuck') {
          if (Math.hypot(a.x - player.x, a.z - player.z) < RECOVER_RADIUS) {
            a.state = 'idle';
            audio.once(sounds.click, VOLUME.click);
            recovered++;
          }
        }
        place(meshes[i], a);
      }
      return recovered;
    },
    reset() {
      for (let i = 0; i < arrows.length; i++) {
        arrows[i].state = 'idle';
        meshes[i].visible = false;
      }
      cooldown = 0;
      kick = 0;
    },
    dispose() {
      camera.remove(view);
      for (const mesh of meshes) mesh.removeFromParent();
    },
  };
}
