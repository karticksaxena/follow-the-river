import * as THREE from 'three/webgpu';
import type { AudioBus } from '../../engine/audio';
import { segmentHitsBox } from '../../engine/collide';
import type { BoxGrid } from '../../engine/grid';
import { loadModel } from '../../engine/models';
import type { Vec3 } from '../../engine/ray';
import { propUrl } from './kits';
import type { Sounds } from './sounds';
import { GUN, stepTimers, tryShot, type GunTimers } from './weapons';
import type { Horde } from './zombies/horde';

/** Walls block shots up to this height (m), like arrows. */
const WALL_HEIGHT = 3;
const FLASH = { intensity: 40, distance: 12, color: 0xffc070, seconds: 0.05 } as const;
const KICK = 0.08;
const KICK_TIME = 0.15;
const VOLUME = 0.9;
const VIEW_POSITION = { x: 0.26, y: -0.26, z: -0.5 } as const;

export interface Gun {
  /** True when the next shot would not be refused for reloading. */
  readonly ready: boolean;
  /** Seconds left of the last shot's noise (read by the night spawner). */
  readonly noiseLeft: number;
  /** The first-person model; controls toggle `visible` and lower it while switching. */
  readonly view: THREE.Group;
  /** Fires along unit `look`; false while reloading. Caller has already spent the bullet. */
  fire(eye: Vec3, look: Vec3, horde: Horde, grid: BoxGrid): boolean;
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

const origin: Vec3 = { x: 0, y: 0, z: 0 };

/** Metres a shot travels before the first wall (or `GUN.range`). */
function shotLength(eye: Vec3, look: Vec3, grid: BoxGrid): number {
  const x1 = eye.x + look.x * GUN.range;
  const z1 = eye.z + look.z * GUN.range;
  let t = 1;
  for (const box of grid.near((eye.x + x1) / 2, (eye.z + z1) / 2, GUN.range / 2 + 0.5)) {
    const hit = segmentHitsBox(eye.x, eye.z, x1, z1, box);
    if (hit !== null && hit < t && eye.y + look.y * GUN.range * hit < WALL_HEIGHT) t = hit;
  }
  return GUN.range * t;
}

interface GunState {
  readonly audio: AudioBus;
  readonly sounds: Sounds;
  readonly view: THREE.Group;
  readonly flash: THREE.PointLight;
  readonly timers: GunTimers;
  flashLeft: number;
  kick: number;
}

function shoot(s: GunState, eye: Vec3, look: Vec3, horde: Horde, grid: BoxGrid): boolean {
  if (!tryShot(s.timers)) return false;
  origin.x = eye.x;
  origin.y = eye.y;
  origin.z = eye.z;
  const length = shotLength(eye, look, grid);
  const zombie = horde.rayHit(origin, look, length);
  if (zombie) horde.kill(zombie.id);
  horde.alert(eye.x, eye.z, GUN.alertRadius);
  s.audio.once(s.sounds.gunshot, VOLUME);
  s.flashLeft = FLASH.seconds;
  s.kick = KICK_TIME;
  return true;
}

function updateGun(s: GunState, dt: number): void {
  stepTimers(s.timers, dt);
  s.flashLeft = Math.max(0, s.flashLeft - dt);
  s.kick = Math.max(0, s.kick - dt);
  s.flash.intensity = FLASH.intensity * (s.flashLeft / FLASH.seconds);
  const k = s.kick / KICK_TIME;
  s.view.position.z = VIEW_POSITION.z + KICK * k;
  s.view.rotation.x = 0.35 * k;
}

function resetGun(s: GunState): void {
  s.timers.cooldown = 0;
  s.timers.noise = 0;
  s.flashLeft = 0;
  s.kick = 0;
  updateGun(s, 0);
}

export async function createGun(
  camera: THREE.Camera,
  _scene: THREE.Scene,
  audio: AudioBus,
  sounds: Sounds,
): Promise<Gun> {
  const view = new THREE.Group();
  view.position.set(VIEW_POSITION.x, VIEW_POSITION.y, VIEW_POSITION.z);
  view.visible = false;
  view.add(await loadModel(propUrl('pistol')));
  // One light for the life of the scene (intensity 0 when idle): the light count never changes.
  const flash = new THREE.PointLight(FLASH.color, 0, FLASH.distance, 2);
  flash.position.set(0.2, -0.15, -0.9);
  camera.add(view, flash);
  const s: GunState = {
    audio,
    sounds,
    view,
    flash,
    timers: { cooldown: 0, noise: 0 },
    flashLeft: 0,
    kick: 0,
  };
  return {
    get ready() {
      return s.timers.cooldown <= 0;
    },
    get noiseLeft() {
      return s.timers.noise;
    },
    view,
    fire: (eye, look, horde, grid) => shoot(s, eye, look, horde, grid),
    update: (dt) => updateGun(s, dt),
    reset: () => resetGun(s),
    dispose() {
      camera.remove(view, flash);
    },
  };
}
