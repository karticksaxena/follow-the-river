import * as THREE from 'three/webgpu';
import type { AudioBus } from '../../engine/audio';
import { segmentHitsBox } from '../../engine/collide';
import type { BoxGrid } from '../../engine/grid';
import { loadModel } from '../../engine/models';
import type { Vec3 } from '../../engine/ray';
import { propUrl } from './kits';
import { GUN_KINDS, type GunKind } from './state';
import { GUNS, spreadDir, stepTimers, tryShot, type GunSpec, type GunTimers } from './weapons';
import type { Horde } from './zombies/horde';

/** Walls block shots up to this height (m), like arrows. */
const WALL_HEIGHT = 3;
const FLASH = { intensity: 40, distance: 12, color: 0xffc070, seconds: 0.05 } as const;
const KICK_TIME = 0.15;

export interface Gun {
  readonly kind: GunKind;
  readonly spec: GunSpec;
  /** True when the next shot would not be refused for reloading. */
  readonly ready: boolean;
  /** The first-person model; controls toggle `visible` and lower it while switching. */
  readonly view: THREE.Group;
  /** Fires along unit `look`; false while reloading. Caller has already spent the round. */
  fire(eye: Vec3, look: Vec3, horde: Horde, grid: BoxGrid): boolean;
}

/** Every gun, sharing one muzzle-flash light (the scene's light count never changes). */
export interface Armory {
  readonly guns: Readonly<Record<GunKind, Gun>>;
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

const origin: Vec3 = { x: 0, y: 0, z: 0 };
const pellet: Vec3 = { x: 0, y: 0, z: 0 };

/** Metres a shot along `dir` travels before the first wall (or `range`). */
function shotLength(eye: Vec3, dir: Vec3, range: number, grid: BoxGrid): number {
  const x1 = eye.x + dir.x * range;
  const z1 = eye.z + dir.z * range;
  let t = 1;
  for (const box of grid.near((eye.x + x1) / 2, (eye.z + z1) / 2, range / 2 + 0.5)) {
    const hit = segmentHitsBox(eye.x, eye.z, x1, z1, box);
    if (hit !== null && hit < t && eye.y + dir.y * range * hit < WALL_HEIGHT) t = hit;
  }
  return range * t;
}

interface GunState {
  readonly spec: GunSpec;
  readonly audio: AudioBus;
  readonly sound: AudioBuffer;
  readonly view: THREE.Group;
  readonly timers: GunTimers;
  flashLeft: number;
  kick: number;
}

/** Every pellet is its own ray: a shotgun blast can drop several zombies. */
function shoot(s: GunState, eye: Vec3, look: Vec3, horde: Horde, grid: BoxGrid): boolean {
  const { spec } = s;
  if (!tryShot(s.timers, spec)) return false;
  origin.x = eye.x;
  origin.y = eye.y;
  origin.z = eye.z;
  for (let i = 0; i < spec.pellets; i++) {
    spreadDir(look, spec.spread, Math.random(), Math.random(), pellet);
    const zombie = horde.rayHit(origin, pellet, shotLength(eye, pellet, spec.range, grid));
    if (zombie) horde.hurt(zombie.id, zombie.head);
  }
  horde.alert(eye.x, eye.z, spec.alertRadius);
  s.audio.once(s.sound, spec.volume);
  s.flashLeft = FLASH.seconds;
  s.kick = KICK_TIME;
  return true;
}

function updateGun(s: GunState, dt: number): void {
  stepTimers(s.timers, dt);
  s.flashLeft = Math.max(0, s.flashLeft - dt);
  s.kick = Math.max(0, s.kick - dt);
  const k = s.kick / KICK_TIME;
  s.view.position.z = s.spec.view.z + s.spec.kick * k;
  s.view.rotation.x = 0.35 * k;
}

function resetGun(s: GunState): void {
  s.timers.cooldown = 0;
  s.flashLeft = 0;
  s.kick = 0;
  updateGun(s, 0);
}

async function makeGun(
  camera: THREE.Camera,
  audio: AudioBus,
  sound: AudioBuffer,
  kind: GunKind,
): Promise<{ gun: Gun; s: GunState }> {
  const spec = GUNS[kind];
  const view = new THREE.Group();
  view.position.set(spec.view.x, spec.view.y, spec.view.z);
  view.visible = false;
  view.add(await loadModel(propUrl(spec.model)));
  camera.add(view);
  const s: GunState = {
    spec,
    audio,
    sound,
    view,
    timers: { cooldown: 0 },
    flashLeft: 0,
    kick: 0,
  };
  const gun: Gun = {
    kind,
    spec,
    get ready() {
      return s.timers.cooldown <= 0;
    },
    view,
    fire: (eye, look, horde, grid) => shoot(s, eye, look, horde, grid),
  };
  return { gun, s };
}

/** The pistol, shotgun and rifle, each with its own sound, held in view from the camera. */
export async function createArmory(
  camera: THREE.Camera,
  audio: AudioBus,
  sounds: Readonly<Record<GunKind, AudioBuffer>>,
): Promise<Armory> {
  const made = await Promise.all(
    GUN_KINDS.map((kind) => makeGun(camera, audio, sounds[kind], kind)),
  );
  const [pistol, shotgun, rifle] = made;
  if (!pistol || !shotgun || !rifle) throw new Error('the armory needs all three guns');
  const flash = new THREE.PointLight(FLASH.color, 0, FLASH.distance, 2);
  flash.position.set(0.2, -0.15, -0.9);
  camera.add(flash);
  const states = made.map((m) => m.s);
  return {
    guns: { pistol: pistol.gun, shotgun: shotgun.gun, rifle: rifle.gun },
    update(dt) {
      let lit = 0;
      for (const st of states) {
        updateGun(st, dt);
        lit = Math.max(lit, st.flashLeft);
      }
      flash.intensity = FLASH.intensity * (lit / FLASH.seconds);
    },
    reset() {
      for (const st of states) resetGun(st);
      flash.intensity = 0;
    },
    dispose() {
      for (const st of states) camera.remove(st.view);
      camera.remove(flash);
    },
  };
}
