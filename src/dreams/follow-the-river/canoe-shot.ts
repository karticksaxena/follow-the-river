import * as THREE from 'three/webgpu';
import { smooth } from './canoe-timing';

/**
 * The end shot, in canoe-local metres (+z is the bow). It cuts from the seat to a start point
 * between and above the two of them (never inside Kartik's body, which now shows), looking at the
 * calf, then rises and drifts back to a high wide view of the canoe.
 */
export const SHOT = {
  seconds: 14,
  /** The picture fades to black over the last of these. */
  fadeSeconds: 2,
  start: [0.8, 1.7, -0.1],
  end: [2.4, 8.5, -14],
  /** What the start looks at (the calf beside the bow) and what the wide view looks at (the canoe and the calf, the sun beyond). */
  startLook: [4.2, 0.2, 1.6],
  look: [1.6, 0.4, 3.5],
} as const;

/** Where the two heads are in the canoe (m): the camera must stay clear of them. */
export const HEADS = { kartik: [0, 1.0, 0.9], mom: [0, 1.0, -0.9] } as const;
export const HEAD_CLEARANCE = 0.6;

/** Pure: the rail's point at `k` (0..1) in canoe-local space, eased at both ends. */
export function railPoint(k: number, out: THREE.Vector3): THREE.Vector3 {
  const s = smooth(k);
  const { start, end } = SHOT;
  return out.set(
    start[0] + (end[0] - start[0]) * s,
    start[1] + (end[1] - start[1]) * s,
    start[2] + (end[2] - start[2]) * s,
  );
}

const here = new THREE.Vector3();
const aim = new THREE.Vector3();
const toward = new THREE.Matrix4();
const up = new THREE.Vector3(0, 1, 0);

export interface Shot {
  /** Puts the camera on the rail at `k` (0..1), its aim easing from the calf to the wide view. Allocates nothing. */
  place(k: number): void;
}

/** The shot's camera work, in the canoe's frame. */
export function createShot(canoe: THREE.Object3D, camera: THREE.Camera): Shot {
  return {
    place(k: number): void {
      canoe.updateMatrixWorld(true);
      canoe.localToWorld(railPoint(k, here));
      camera.position.copy(here);
      const s = smooth(k);
      const { startLook, look } = SHOT;
      aim.set(
        startLook[0] + (look[0] - startLook[0]) * s,
        startLook[1] + (look[1] - startLook[1]) * s,
        startLook[2] + (look[2] - startLook[2]) * s,
      );
      canoe.localToWorld(aim);
      camera.quaternion.setFromRotationMatrix(toward.lookAt(here, aim, up));
      camera.updateMatrixWorld(true);
    },
  };
}
