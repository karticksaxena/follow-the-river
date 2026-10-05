import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { shoreFor } from './ending-farewell';
import { handOnHer, placeArm } from './farewell-arm';
import { shotsFor } from './farewell-shots';

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
    const at = world(arm, new THREE.Vector3(0, 0, 0));
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

describe('the hand on her skin, seen from the kneel', () => {
  const at = shoreFor({ x: -3, z: -387.5 }, -392);
  const shots = shotsFor(at);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 100);
  camera.position.set(...shots.kneel.at);
  camera.lookAt(...shots.kneel.look);
  const arm = new THREE.Group();
  camera.add(arm);
  const { target, along, palm } = handOnHer(shots);
  placeArm(arm, camera, target, along, palm, 1);
  camera.updateMatrixWorld(true);
  /** Degrees right of and above the view axis of an arm-space point (the arm's origin is the middle of the palm). */
  const seen = (x: number, y: number, z: number): { az: number; el: number } => {
    const p = camera.worldToLocal(arm.localToWorld(new THREE.Vector3(x, y, z)));
    return {
      az: (Math.atan2(p.x, -p.z) * 180) / Math.PI,
      el: (Math.atan2(p.y, -p.z) * 180) / Math.PI,
    };
  };

  it('has the palm and a fingertip in the frame, near its middle', () => {
    for (const [x, y, z] of [
      [0, 0, 0],
      [-0.011, -0.04, 0.188], // a fingertip
    ] as const) {
      const { az, el } = seen(x, y, z);
      expect(Math.abs(az)).toBeLessThan(25);
      expect(Math.abs(el)).toBeLessThan(25);
    }
  });

  it('keeps the forearm end and the sleeve below the bottom of the frame (35 degrees), entering from the lower right', () => {
    for (const [x, y, z] of [
      [0.02, 0.24, -0.39], // the forearm's cut end (the sleeve)
      [0.04, 0.29, -0.34],
    ] as const) {
      const { az, el } = seen(x, y, z);
      expect(el).toBeLessThan(-36);
      expect(az).toBeGreaterThan(-5); // right of the hand or straight below it, never off to the left
    }
  });

  it('lays the palm flat on her skin: the palm faces into it, the fingers along it, just off it', () => {
    const down = arm
      .localToWorld(new THREE.Vector3(0, -1, 0))
      .sub(arm.localToWorld(new THREE.Vector3()));
    const into = new THREE.Vector3(...shots.handIn);
    expect(down.normalize().dot(into)).toBeGreaterThan(0.99);
    expect(Math.abs(along.clone().normalize().dot(into))).toBeLessThan(0.05);
    expect(new THREE.Vector3(...shots.hand).sub(target).dot(into)).toBeCloseTo(0.09);
  });
});
