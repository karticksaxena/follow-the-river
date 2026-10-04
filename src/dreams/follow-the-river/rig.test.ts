import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { lookAt, reach } from './rig';

describe('reach', () => {
  it('puts the hand on a reachable target, bending at the elbow toward the pole', () => {
    const upper = new THREE.Object3D();
    const lower = new THREE.Object3D();
    const hand = new THREE.Object3D();
    upper.add(lower);
    lower.add(hand);
    lower.position.set(0, -0.3, 0);
    hand.position.set(0, -0.28, 0);
    const root = new THREE.Group();
    root.add(upper);
    upper.position.set(0, 1.4, 0);
    root.updateMatrixWorld(true);
    const target = new THREE.Vector3(0.35, 1.05, 0.3);
    reach(upper, lower, hand, target, new THREE.Vector3(0, 1.2, -1));
    root.updateMatrixWorld(true);
    expect(hand.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeLessThan(0.01);
    expect(lower.getWorldPosition(new THREE.Vector3()).z).toBeLessThan(0.15); // elbow toward -Z
  });

  it('stretches toward an unreachable target without going NaN', () => {
    const upper = new THREE.Object3D();
    const lower = new THREE.Object3D();
    const hand = new THREE.Object3D();
    upper.add(lower);
    lower.add(hand);
    lower.position.set(0, -0.3, 0);
    hand.position.set(0, -0.3, 0);
    upper.updateMatrixWorld(true);
    reach(upper, lower, hand, new THREE.Vector3(0, -3, 0.5), new THREE.Vector3(0, 0, -1));
    upper.updateMatrixWorld(true);
    const p = hand.getWorldPosition(new THREE.Vector3());
    expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
    expect(p.length()).toBeCloseTo(0.6, 2);
  });
});

const rig = (): THREE.Object3D => {
  const root = new THREE.Group();
  const head = new THREE.Object3D();
  head.position.set(0, 1.6, 0);
  root.add(head);
  root.updateMatrixWorld(true);
  return head;
};
const euler = (head: THREE.Object3D): THREE.Euler =>
  new THREE.Euler().setFromQuaternion(head.quaternion, 'YXZ');

describe('lookAt', () => {
  it('turns the head toward a target but never past its limits', () => {
    const head = rig();
    const limits = { yaw: 1, pitch: 0.5 };
    lookAt(head, new THREE.Vector3(1, 1.6, 5), 1, limits);
    expect(euler(head).y).toBeCloseTo(Math.atan2(1, 5), 3);
    lookAt(head, new THREE.Vector3(-5, 1.6, -0.5), 1, limits); // behind: clamped
    expect(Math.abs(euler(head).y)).toBeCloseTo(1, 3);
  });

  it('weight 0 leaves the head alone, and pitch is clamped', () => {
    const head = rig();
    lookAt(head, new THREE.Vector3(3, 1.6, 3), 0, { yaw: 1, pitch: 0.3 });
    expect(euler(head).y).toBeCloseTo(0, 5);
    lookAt(head, new THREE.Vector3(0, 9, 1), 1, { yaw: 1, pitch: 0.3 });
    expect(euler(head).x).toBeCloseTo(-0.3, 3);
  });
});
