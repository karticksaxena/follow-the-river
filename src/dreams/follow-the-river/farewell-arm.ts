import * as THREE from 'three/webgpu';
import { loadModel } from '../../engine/models';
import type { Shots } from './farewell-shots';
import { characterUrl } from './kits';

/**
 * Kartik's first-person arm (`kartik-arm.glb`: a rigid mesh, origin at the middle of the palm, +Z along the
 * fingers, +Y up (the back of the hand) with the palm facing -Y, thumb +X; the wrist is bent back, so the
 * forearm trails behind and above the hand) as a child of the camera. Tuning knobs (m).
 */
export const ARM = {
  /** Where the hand starts when the arm is not yet in the frame: below it, to the right where the weapons sit, a little toward the camera (camera space). */
  hidden: { x: 0.3, y: -0.9, z: 0.2 },
  /**
   * Laid on her skin: the palm centre sits `palmOff` m off it (the shots' hand point is `press` m inside it), the
   * fingers point up her side (`fingersUp`) and a little toward her tail (`fingersBack`), so the forearm, bent
   * back at the wrist, comes in from the lower right of the frame.
   */
  onHer: { palmOff: 0.09, fingersUp: 1, fingersBack: 0.35 },
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
  arm.position.copy(t);
  const away = 1 - smooth(Math.min(1, Math.max(0, rise)));
  arm.position.x += ARM.hidden.x * away;
  arm.position.y += ARM.hidden.y * away;
  arm.position.z += ARM.hidden.z * away;
}

/**
 * Pure: where the palm goes (world), which way the fingers point and which way the palm faces, to lay Kartik's
 * hand flat on her skin at `shots.hand` (`handIn` is straight into her skin there).
 */
export function handOnHer(shots: Pick<Shots, 'hand' | 'handIn'>): {
  target: THREE.Vector3;
  along: THREE.Vector3;
  palm: THREE.Vector3;
} {
  const [ix, iy, iz] = shots.handIn;
  const palm = new THREE.Vector3(ix, iy, iz);
  const target = new THREE.Vector3(...shots.hand).addScaledVector(palm, -ARM.onHer.palmOff);
  // Up her side along the skin (perpendicular to `handIn` in x, y), and a little back along her.
  const up = ARM.onHer.fingersUp;
  const along = new THREE.Vector3(-iy * up, ix * up, -ARM.onHer.fingersBack).normalize();
  return { target, along, palm };
}

/** Loads the arm, parented to nothing yet and hidden. */
export async function loadArm(): Promise<THREE.Object3D> {
  const arm = await loadModel(characterUrl('kartik-arm'));
  arm.visible = false;
  arm.traverse((n) => (n.frustumCulled = false));
  return arm;
}
