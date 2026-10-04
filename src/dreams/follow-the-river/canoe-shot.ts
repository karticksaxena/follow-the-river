import * as THREE from 'three/webgpu';
import { smooth } from './canoe-timing';

/** The end shot, in canoe-local metres (+z is the bow): from Kartik's eye up and back to a high wide view. */
export const SHOT = {
  seconds: 14,
  /** The picture fades to black over the last of these. */
  fadeSeconds: 2,
  eye: [0, 1.0, 0.9],
  end: [2.4, 8.5, -14],
  /** Where the wide view looks: just ahead of the canoe, toward the calf and the sun. */
  look: [1.6, 0.4, 3.5],
} as const;

/** Pure: the rail's point at `k` (0..1) in canoe-local space, eased at both ends. */
export function railPoint(k: number, out: THREE.Vector3): THREE.Vector3 {
  const s = smooth(k);
  const { eye, end } = SHOT;
  return out.set(
    eye[0] + (end[0] - eye[0]) * s,
    eye[1] + (end[1] - eye[1]) * s,
    eye[2] + (end[2] - eye[2]) * s,
  );
}

const here = new THREE.Vector3();
const aim = new THREE.Vector3();
const toward = new THREE.Matrix4();
const up = new THREE.Vector3(0, 1, 0);
const goal = new THREE.Quaternion();

/** The shot's camera work; remembers how the camera was turned (relative to the canoe) when it began. */
export interface Shot {
  /** Puts the camera on the rail at `k` (0..1) and turns it from where it looked toward the wide view. Allocates nothing. */
  place(k: number): void;
}

export function createShot(canoe: THREE.Object3D, camera: THREE.Camera): Shot {
  const start = new THREE.Quaternion();
  const canoeQ = new THREE.Quaternion();
  canoe.getWorldQuaternion(canoeQ);
  start.copy(canoeQ).invert().multiply(camera.quaternion);
  return {
    /** Puts the camera on the rail at `k` and turns it from where it looked toward the wide view. Allocates nothing. */
    place(k: number): void {
      canoe.updateMatrixWorld(true);
      canoe.localToWorld(railPoint(k, here));
      camera.position.copy(here);
      canoe.localToWorld(aim.set(...SHOT.look));
      goal.setFromRotationMatrix(toward.lookAt(here, aim, up));
      canoe.getWorldQuaternion(canoeQ);
      camera.quaternion.copy(canoeQ).multiply(start).slerp(goal, smooth(k));
      camera.updateMatrixWorld(true);
    },
  };
}
