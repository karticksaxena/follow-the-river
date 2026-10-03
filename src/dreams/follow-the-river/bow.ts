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
  /** The first-person model; controls toggle `visible` and lower it while switching. */
  readonly view: THREE.Group;
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

interface BowState {
  readonly audio: AudioBus;
  readonly sounds: Sounds;
  readonly view: THREE.Group;
  readonly nocked: THREE.Object3D;
  readonly arrows: Arrow[];
  readonly meshes: THREE.Object3D[];
  cooldown: number;
  kick: number;
}

function resolveHit(
  s: BowState,
  i: number,
  x0: number,
  y0: number,
  z0: number,
  horde: Horde,
  grid: BoxGrid,
): void {
  const a = s.arrows[i];
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
    s.audio.once(s.sounds.thud, VOLUME.thud);
    stick(a, x0 + dir.x * zombie.distance, 0, z0 + dir.z * zombie.distance);
  } else if (t < 1) {
    stick(a, x0 + (a.x - x0) * t, y0 + (a.y - y0) * t, z0 + (a.z - z0) * t);
  }
}

function fireArrow(s: BowState, eye: Vec3, look: Vec3): void {
  const a = s.arrows.find((arrow) => arrow.state === 'idle');
  if (!a || s.cooldown > 0) return;
  a.x = eye.x + look.x * SPAWN_AHEAD;
  a.y = eye.y + look.y * SPAWN_AHEAD;
  a.z = eye.z + look.z * SPAWN_AHEAD;
  a.vx = look.x * BOW.speed;
  a.vy = look.y * BOW.speed;
  a.vz = look.z * BOW.speed;
  a.age = 0;
  a.state = 'flying';
  s.audio.once(s.sounds.twang, VOLUME.twang);
  s.cooldown = BOW.cooldown;
  s.kick = KICK_TIME;
}

/** One arrow's frame: fly and hit-test if flying, recover if stuck near the player (1 = recovered). */
function updateArrow(
  s: BowState,
  i: number,
  dt: number,
  horde: Horde,
  grid: BoxGrid,
  player: { x: number; z: number },
): number {
  const a = s.arrows[i];
  let recovered = 0;
  if (a.state === 'flying') {
    const { x, y, z } = a;
    stepArrow(a, dt);
    if (a.state === 'flying') resolveHit(s, i, x, y, z, horde, grid);
    if (a.state === 'flying') orient(s.meshes[i], a);
  } else if (a.state === 'stuck' && Math.hypot(a.x - player.x, a.z - player.z) < RECOVER_RADIUS) {
    a.state = 'idle';
    s.audio.once(s.sounds.click, VOLUME.click);
    recovered = 1;
  }
  place(s.meshes[i], a);
  return recovered;
}

function updateBow(
  s: BowState,
  dt: number,
  horde: Horde,
  grid: BoxGrid,
  player: { x: number; z: number },
): number {
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.kick = Math.max(0, s.kick - dt);
  s.view.position.z = -0.55 + KICK * (s.kick / KICK_TIME);
  s.nocked.visible = s.cooldown <= 0;
  let recovered = 0;
  for (let i = 0; i < s.arrows.length; i++) recovered += updateArrow(s, i, dt, horde, grid, player);
  return recovered;
}

function resetBow(s: BowState): void {
  for (let i = 0; i < s.arrows.length; i++) {
    s.arrows[i].state = 'idle';
    s.meshes[i].visible = false;
  }
  s.cooldown = 0;
  s.kick = 0;
}

function createBowState(
  camera: THREE.Camera,
  scene: THREE.Scene,
  audio: AudioBus,
  sounds: Sounds,
  bowModel: THREE.Object3D,
  arrowModel: THREE.Object3D,
): BowState {
  const view = new THREE.Group();
  view.position.set(0.32, -0.32, -0.55);
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
  return { audio, sounds, view, nocked, arrows, meshes, cooldown: 0, kick: 0 };
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
  const s = createBowState(camera, scene, audio, sounds, bowModel, arrowModel);
  return {
    get ready() {
      return s.cooldown <= 0;
    },
    view: s.view,
    fire: (eye, look) => fireArrow(s, eye, look),
    update: (dt, horde, grid, player) => updateBow(s, dt, horde, grid, player),
    reset: () => resetBow(s),
    dispose() {
      camera.remove(s.view);
      for (const mesh of s.meshes) mesh.removeFromParent();
    },
  };
}
