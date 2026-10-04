import * as THREE from 'three/webgpu';
import { loadModel } from '../../engine/models';
import { characterUrl } from './kits';

/**
 * Kartik's first-person arm (`kartik-arm.glb`: a rigid mesh, origin at the elbow, +Z along the
 * fingers, +Y up with the palm facing -Y, thumb +X) as a child of the camera. Tuning knobs (m).
 */
export const ARM = {
  /** Elbow to the middle of the palm along the fingers. */
  palm: 0.38,
  /** Where the elbow starts when the arm is not yet in the frame: below it, a little right and toward the camera (camera space). */
  hidden: { x: 0.12, y: -0.9, z: 0.25 },
} as const;

interface V3Like {
  x: number;
  y: number;
  z: number;
}

const t = new THREE.Vector3();
const d = new THREE.Vector3();
const p = new THREE.Vector3();
const x0 = new THREE.Vector3();
const y0 = new THREE.Vector3();
const zero = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const turn = new THREE.Quaternion();
const smooth = (s: number): number => s * s * (3 - 2 * s);

/**
 * Puts the arm (a child of `camera`) so the middle of its palm is at `hand` (world), its fingers
 * point along `along` (world) and its palm faces `palm` (world, as far as the fingers allow).
 * `rise` 0..1 brings it up from below the frame. Allocates nothing.
 */
export function placeArm(
  arm: THREE.Object3D,
  camera: THREE.Camera,
  hand: V3Like,
  along: V3Like,
  palm: V3Like,
  rise: number,
): void {
  camera.updateMatrixWorld();
  camera.getWorldQuaternion(q).invert();
  camera.worldToLocal(t.set(hand.x, hand.y, hand.z));
  d.set(along.x, along.y, along.z).normalize().applyQuaternion(q);
  p.set(palm.x, palm.y, palm.z).applyQuaternion(q);
  m.lookAt(d, zero, UP); // local +Z along the fingers
  x0.setFromMatrixColumn(m, 0);
  y0.setFromMatrixColumn(m, 1);
  turn.setFromAxisAngle(AXIS_Z, Math.atan2(p.dot(x0), -p.dot(y0))); // the palm turns to `palm`
  arm.quaternion.setFromRotationMatrix(m).multiply(turn);
  arm.position.copy(t).addScaledVector(d, -ARM.palm);
  const away = 1 - smooth(Math.min(1, Math.max(0, rise)));
  arm.position.x += ARM.hidden.x * away;
  arm.position.y += ARM.hidden.y * away;
  arm.position.z += ARM.hidden.z * away;
}

/** Loads the arm, parented to nothing yet and hidden. */
export async function loadArm(): Promise<THREE.Object3D> {
  const arm = await loadModel(characterUrl('kartik-arm'));
  arm.visible = false;
  arm.traverse((n) => (n.frustumCulled = false));
  return arm;
}
