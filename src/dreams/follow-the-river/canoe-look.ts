import * as THREE from 'three/webgpu';
import type { Ride } from './canoe-ride';

/** Tuning knobs: how near the view must be to the calf, for how long, and when to help. */
export const LOOK = {
  /** The calf is seen when it is this close (radians, about 25 degrees) to where the camera faces... */
  angle: (25 * Math.PI) / 180,
  /** ...for this long (s). */
  dwell: 0.4,
  /** A player who has not looked after this long (s) gets the camera turned gently toward the calf... */
  giveUp: 25,
  /** ...and if even that has not worked after this many more seconds the ride goes on anyway. */
  force: 5,
  /** Camera turn rate while helping (per second, exponential). */
  steer: 2.5,
  /** The calf counts from this surfacing (0..1), the same moment its blow is heard. */
  from: 0.6,
  /** The top-left line names the side the calf is on from where you face (you may be facing Mom). */
  lines: {
    right: 'Something in the water. Look to your right.',
    left: 'Something in the water. Look to your left.',
  },
} as const;

/** Pure: is the offset (dx, dz) to the right or the left of the facing (fx, fz)? (Right of -z is +x.) */
export const sideOf = (fx: number, fz: number, dx: number, dz: number): 'right' | 'left' =>
  fx * dz - fz * dx >= 0 ? 'right' : 'left';

export interface Watch {
  /** Seconds the calf has been in view without a break. */
  seen: number;
  /** Seconds the player has been asked to look. */
  waited: number;
}
export const newWatch = (): Watch => ({ seen: 0, waited: 0 });

/** Pure: one frame of waiting. `angle` is the calf's angle from the view's centre. 'assist' = turn the camera for them, 'done' = they have seen it. */
export function watchStep(w: Watch, angle: number, dt: number): 'wait' | 'assist' | 'done' {
  w.waited += dt;
  w.seen = angle <= LOOK.angle ? w.seen + dt : 0;
  if (w.seen >= LOOK.dwell || w.waited >= LOOK.giveUp + LOOK.force) return 'done';
  return w.waited >= LOOK.giveUp ? 'assist' : 'wait';
}

/** Pure: yaw and pitch (three's YXZ camera) that face the offset (dx, dy, dz). */
export function aimAngles(dx: number, dy: number, dz: number): { yaw: number; pitch: number } {
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Pure: `from` moved fraction `k` of the way to `to` by the short way round. */
export function turnToward(from: number, to: number, k: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * k;
}

const toCalf = new THREE.Vector3();
const eye = new THREE.Vector3();
const facing = new THREE.Vector3();

/** Sets the top-left line (touches the DOM only when it changes). */
function setLine(r: Ride, text: string): void {
  if (r.goalEl.textContent === text) return;
  r.goalEl.textContent = text;
  if (text) r.ctx.overlay.root.append(r.goalEl);
  else r.goalEl.remove();
}

/**
 * Once the calf has surfaced: asks the player to look at it, and sets `script.looked` when they
 * have (or the give-up time has passed, after the camera was turned toward it). Per live frame.
 */
export function watchCalf(r: Ride): void {
  if (r.script.looked || r.reading || r.calf.surfaced < LOOK.from) return;
  const cam = r.ctx.stage.camera;
  r.cs.calf.root.getWorldPosition(toCalf).sub(cam.getWorldPosition(eye));
  const verdict = watchStep(r.watch, cam.getWorldDirection(facing).angleTo(toCalf), r.dt);
  if (verdict === 'done') {
    r.script.looked = true;
    return setLine(r, '');
  }
  setLine(r, LOOK.lines[sideOf(facing.x, facing.z, toCalf.x, toCalf.z)]);
  if (verdict !== 'assist') return;
  const aim = aimAngles(toCalf.x, toCalf.y, toCalf.z);
  const k = 1 - Math.exp(-r.dt * LOOK.steer);
  cam.rotation.y = turnToward(cam.rotation.y, aim.yaw, k);
  cam.rotation.x = turnToward(cam.rotation.x, aim.pitch, k);
}
