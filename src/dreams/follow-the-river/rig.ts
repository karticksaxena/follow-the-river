import * as THREE from 'three/webgpu';

// Scratch objects: the rig runs every frame, so nothing here allocates.
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const dir = new THREE.Vector3();
const perp = new THREE.Vector3();
const elbow = new THREE.Vector3();
const goal = new THREE.Vector3();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const EPS = 1e-4;

/**
 * Turns the head bone toward `target` (world), clamped to `limits` (radians), eased by `weight`
 * (0 = animation untouched, 1 = fully turned). Call after `mixer.update`.
 * Assumes the head's parent frame faces +Z with +Y up (true of the Quaternius rigs' neck/torso
 * chain once the armature is upright); the head replaces its animated rotation.
 */
export function lookAt(
  head: THREE.Object3D,
  target: THREE.Vector3,
  weight: number,
  limits: { yaw: number; pitch: number },
): void {
  const parent = head.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  a.copy(target);
  parent.worldToLocal(a);
  a.sub(head.position);
  const yaw = THREE.MathUtils.clamp(Math.atan2(a.x, a.z), -limits.yaw, limits.yaw);
  const pitch = THREE.MathUtils.clamp(
    Math.atan2(-a.y, Math.hypot(a.x, a.z)),
    -limits.pitch,
    limits.pitch,
  );
  euler.set(pitch, yaw, 0);
  head.quaternion.slerp(q.setFromEuler(euler), weight);
}

/** Rotates `obj` (world frame) so the direction `from` points along `to`. */
function swing(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  obj.getWorldQuaternion(q);
  q.premultiply(q2.setFromUnitVectors(from, to));
  const parent = obj.parent;
  if (parent) parent.getWorldQuaternion(q2).invert();
  else q2.identity();
  obj.quaternion.copy(q2.multiply(q));
}

/**
 * Two-bone IK: swings `upper` and `lower` so `hand` lands on `target` (world), the elbow bending
 * toward `pole` (world). A target out of reach straightens the arm toward it.
 */
export function reach(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  hand: THREE.Object3D,
  target: THREE.Vector3,
  pole: THREE.Vector3,
): void {
  upper.updateWorldMatrix(true, true);
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  hand.getWorldPosition(c);
  const l1 = b.distanceTo(a);
  const l2 = c.distanceTo(b);
  dir.copy(target).sub(a);
  const d = THREE.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + EPS, l1 + l2 - EPS);
  dir.normalize();
  goal.copy(a).addScaledVector(dir, d);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(l1 * l1 - along * along, 0));
  perp.copy(pole).sub(a);
  perp.addScaledVector(dir, -perp.dot(dir)); // the pole's part across the shoulder-target line
  if (perp.lengthSq() < EPS) perp.set(0, 1, 0).addScaledVector(dir, -dir.y);
  perp.normalize();
  elbow.copy(a).addScaledVector(dir, along).addScaledVector(perp, h);
  swing(upper, dir.copy(b).sub(a).normalize(), perp.copy(elbow).sub(a).normalize());
  upper.updateWorldMatrix(false, true);
  lower.getWorldPosition(b);
  hand.getWorldPosition(c);
  swing(lower, dir.copy(c).sub(b).normalize(), perp.copy(goal).sub(b).normalize());
  lower.updateWorldMatrix(false, true);
}
