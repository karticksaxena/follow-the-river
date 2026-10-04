import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { ARM, placeArm } from './farewell-arm';

function rig(): { camera: THREE.PerspectiveCamera; arm: THREE.Group } {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0.4, 0.4, -390.5);
  camera.rotation.set(-0.2, Math.PI - 0.5, 0, 'YXZ'); // looks along +z-ish, turned a little
  const arm = new THREE.Group();
  camera.add(arm);
  camera.updateMatrixWorld(true);
  return { camera, arm };
}

const world = (o: THREE.Object3D, v: THREE.Vector3): THREE.Vector3 => {
  o.updateWorldMatrix(true, false);
  return o.localToWorld(v);
};

describe('placeArm', () => {
  const hand = { x: 0.97, y: 0.23, z: -390.2 };
  const along = { x: 0, y: -0.1, z: 1 };
  const palm = { x: 1, y: 0, z: 0 };

  it('rests the palm on the target', () => {
    const { camera, arm } = rig();
    placeArm(arm, camera, hand, along, palm, 1);
    const at = world(arm, new THREE.Vector3(0, 0, ARM.palm));
    expect(at.distanceTo(new THREE.Vector3(hand.x, hand.y, hand.z))).toBeLessThan(1e-5);
  });

  it('points the fingers along the given direction', () => {
    const { camera, arm } = rig();
    placeArm(arm, camera, hand, along, palm, 1);
    const tip = world(arm, new THREE.Vector3(0, 0, 1)).sub(world(arm, new THREE.Vector3()));
    expect(tip.normalize().dot(new THREE.Vector3(0, -0.1, 1).normalize())).toBeGreaterThan(0.9999);
  });

  it('turns the palm toward the skin', () => {
    const { camera, arm } = rig();
    placeArm(arm, camera, hand, { x: 0, y: 0, z: 1 }, palm, 1);
    const down = world(arm, new THREE.Vector3(0, -1, 0)).sub(world(arm, new THREE.Vector3()));
    expect(down.normalize().dot(new THREE.Vector3(1, 0, 0))).toBeGreaterThan(0.99);
  });

  it('keeps the palm down for a hand lowering to the water', () => {
    const { camera, arm } = rig();
    placeArm(arm, camera, hand, { x: 0, y: -0.5, z: 1 }, { x: 0, y: -1, z: 0 }, 1);
    const down = world(arm, new THREE.Vector3(0, -1, 0)).sub(world(arm, new THREE.Vector3()));
    expect(down.normalize().y).toBeLessThan(-0.8);
  });

  it('starts below the frame and rises to the hand', () => {
    const { camera, arm } = rig();
    placeArm(arm, camera, hand, along, palm, 0);
    expect(arm.position.y).toBeLessThan(-0.7);
    const low = arm.position.y;
    placeArm(arm, camera, hand, along, palm, 0.5);
    expect(arm.position.y).toBeGreaterThan(low);
    placeArm(arm, camera, hand, along, palm, 1);
    expect(arm.position.y).toBeGreaterThan(low + 0.5);
  });
});
