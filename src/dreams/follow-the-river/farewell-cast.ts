import * as THREE from 'three/webgpu';
import type { Rail } from './camera-rail';
import { placeArm } from './farewell-arm';
import type { Fish } from './fish';
import type { Pt } from './mom-actor';

/** Tuning knobs (s, 1/s, m). */
export const CAST = {
  /** The first-person arm rises over this long, and the arm lowers the pack over this long. */
  armRise: 0.8,
  /** The camera's turn to follow her (1/s). */
  follow: 3,
  /** Mom's shuffle along the pebbles (m/s). */
  shuffle: 0.6,
  /** The floating pack bobs this high (m) at this rate (Hz). */
  bob: { amp: 0.03, rate: 0.35 },
} as const;

/** What the first-person arm is doing: the palm goes to `hand()` (world), fingers along `along`, palm facing `palm`. */
export interface ArmJob {
  hand(out: THREE.Vector3): THREE.Vector3;
  along: THREE.Vector3;
  palm: THREE.Vector3;
  /** 0 below the frame .. 1 in place, easing toward `goal` over `CAST.armRise`. */
  rise: number;
  goal: number;
  /** Runs before each frame's placement (a pose that follows the camera updates `along` here). */
  refresh?(): void;
}

/**
 * What runs behind the farewell's steps every frame (even while a page is open): the camera held
 * where the last rail left it, following her, Kartik's arm, Mom's shuffle, the bobbing pack. Every
 * field is set by the steps; nothing here allocates per frame.
 */
export interface Cast {
  /** The camera stays at the end of this rail, which a rail in play overrides. */
  hold: Rail | null;
  /** The camera turns, from where it looks now, to keep her in view (on) or stops (off). */
  follow(on: boolean): void;
  arm: ArmJob | null;
  /** Mom slides to this spot (kneeling, in the Crouch clip) and `done` runs on arrival. */
  slide: { to: Pt; done: () => void } | null;
  /** A pack on the water: bobs there until released. */
  float: THREE.Object3D | null;
  update(dt: number): void;
}

const goal = new THREE.Vector3();

/** The slice of the ending's scene the cast moves: Kartik's arm and Mom's group. */
export interface Players {
  arm: THREE.Object3D;
  mom: { group: THREE.Object3D };
}

export function createCast(scene: Players, camera: THREE.Camera, fish: Pick<Fish, 'head'>): Cast {
  const look = new THREE.Vector3();
  const eye = { x: 0, y: 0, z: 0 };
  const hand = new THREE.Vector3();
  let time = 0;
  let following = false;
  let floatY = 0;
  const cast: Cast = {
    hold: null,
    follow(on) {
      following = on;
      if (on) camera.getWorldDirection(look).multiplyScalar(6).add(camera.position);
    },
    arm: null,
    slide: null,
    float: null,
    update(dt) {
      time += dt;
      if (cast.hold) cast.hold.pose(cast.hold.seconds, camera);
      if (following) followHer(camera, fish, look, eye, dt);
      stepArm(cast, scene, camera, hand, dt);
      stepSlide(cast, scene, dt);
      if (cast.float) {
        if (floatY === 0) floatY = cast.float.position.y;
        cast.float.position.y =
          floatY + CAST.bob.amp * Math.sin(2 * Math.PI * CAST.bob.rate * time);
      } else floatY = 0;
    },
  };
  return cast;
}

/** Turns the camera toward her head, easing (`look` is the point it follows, set at the start). */
function followHer(
  camera: THREE.Camera,
  fish: Pick<Fish, 'head'>,
  look: THREE.Vector3,
  eye: { x: number; y: number; z: number },
  dt: number,
): void {
  if (!fish.head(eye)) return;
  look.lerp(goal.set(eye.x, eye.y, eye.z), 1 - Math.exp(-CAST.follow * dt));
  camera.lookAt(look);
}

function stepArm(
  cast: Cast,
  scene: Players,
  camera: THREE.Camera,
  out: THREE.Vector3,
  dt: number,
): void {
  const job = cast.arm;
  if (!job) return;
  const step = dt / CAST.armRise;
  job.rise += Math.max(-step, Math.min(step, job.goal - job.rise));
  if (job.rise <= 0 && job.goal <= 0) {
    cast.arm = null; // gone below the frame
    scene.arm.visible = false;
    return;
  }
  scene.arm.visible = true;
  job.refresh?.();
  placeArm(scene.arm, camera, job.hand(out), job.along, job.palm, job.rise);
}

function stepSlide(cast: Cast, scene: Players, dt: number): void {
  const slide = cast.slide;
  if (!slide) return;
  const pos = scene.mom.group.position;
  const dx = slide.to.x - pos.x;
  const dz = slide.to.z - pos.z;
  const d = Math.hypot(dx, dz);
  const step = CAST.shuffle * dt;
  if (d > step) {
    pos.x += (dx / d) * step;
    pos.z += (dz / d) * step;
    return;
  }
  pos.x = slide.to.x;
  pos.z = slide.to.z;
  cast.slide = null;
  slide.done();
}
