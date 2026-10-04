import * as THREE from 'three/webgpu';
import { reach } from './rig';

/** Each hand grips the shaft this far (m) from its middle, along the shaft. */
export const GRIP = 0.3;

/** Pure: the grip point on the shaft (`mid` plus `along`, a unit vector from the left hand to the right), `side` -1 left, 1 right. */
export function gripAt(
  mid: THREE.Vector3,
  along: THREE.Vector3,
  side: -1 | 1,
  out: THREE.Vector3,
): THREE.Vector3 {
  return out
    .copy(along)
    .multiplyScalar(side * GRIP)
    .add(mid);
}

/** One of Mom's arms: the bones the grip IK swings (GLTFLoader strips the '.' from UpperArm.L). */
export interface Arm {
  side: -1 | 1;
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
}

/** Her left and right arm, or null if the rig lacks any of the bones. */
export function findArms(mom: THREE.Object3D): [Arm, Arm] | null {
  const arm = (side: -1 | 1, s: 'L' | 'R'): Arm | null => {
    const upper = mom.getObjectByName(`UpperArm${s}`);
    const lower = mom.getObjectByName(`LowerArm${s}`);
    const hand = mom.getObjectByName(`Wrist${s}`);
    return upper && lower && hand ? { side, upper, lower, hand } : null;
  };
  const left = arm(-1, 'L');
  const right = arm(1, 'R');
  return left && right ? [left, right] : null;
}

const pole = new THREE.Vector3();
const target = new THREE.Vector3();

/**
 * Puts both of her hands on the shaft: the tilted, sunk paddle no longer passes through her wrists,
 * so each arm is swung to its grip point (canoe-local `mid`, `along`), the elbow staying where the
 * Row clip has it. Call after the mixer; allocates nothing.
 */
export function gripPaddle(
  arms: readonly Arm[],
  canoe: THREE.Object3D,
  mid: THREE.Vector3,
  along: THREE.Vector3,
): void {
  for (const arm of arms) {
    arm.lower.getWorldPosition(pole);
    canoe.localToWorld(gripAt(mid, along, arm.side, target));
    reach(arm.upper, arm.lower, arm.hand, target, pole);
  }
}
