import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { blowsOn, END, eyeRoughness, liftDelay, turnHead } from './fish-farewell';
import { WET } from './fish-parts';

/** Her rig as orca.glb has it: nose at -z, the Head bone's own rotation turning its local Y along the body, the first spine bone 1.26 m down it. */
function rig(): { head: THREE.Object3D; trunk: THREE.Object3D; root: THREE.Group } {
  const root = new THREE.Group();
  root.rotation.y = Math.PI; // her yaw on the shore
  root.position.set(1.5, 0.1, -392);
  const head = new THREE.Bone();
  head.position.set(0, 0, -3.5);
  head.quaternion.set(0, Math.SQRT1_2, Math.SQRT1_2, 0);
  const trunk = new THREE.Bone();
  trunk.position.set(0, 1.26, 0);
  head.add(trunk);
  const outer = new THREE.Group();
  outer.add(head);
  root.add(outer);
  root.updateMatrixWorld(true);
  return { head, trunk, root };
}

const trunkWorld = (trunk: THREE.Object3D): { p: THREE.Vector3; q: THREE.Quaternion } => {
  trunk.updateWorldMatrix(true, false);
  return {
    p: trunk.getWorldPosition(new THREE.Vector3()),
    q: trunk.getWorldQuaternion(new THREE.Quaternion()),
  };
};

/** Which way her nose points in the world, given the head's rest rotation (her -z in the head's parent is straight ahead). */
function noseDir(head: THREE.Object3D, rest: THREE.Quaternion): THREE.Vector3 {
  const turn = head.quaternion.clone().multiply(rest.clone().invert());
  const parent = head.parent;
  if (!parent) throw new Error('no parent');
  return new THREE.Vector3(0, 0, -1)
    .applyQuaternion(turn)
    .applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()));
}

const rest = (trunk: THREE.Object3D): THREE.Vector3 => trunk.position.clone();

describe('turnHead', () => {
  const eye = new THREE.Vector3(1.5 - 1.5, 0.4, -388.5 - 1.2); // beside her head, to her -x side

  it('leaves the trunk exactly where the animation put it', () => {
    const { head, trunk } = rig();
    const before = trunkWorld(trunk);
    turnHead(head, trunk, rest(trunk), eye, 1);
    const after = trunkWorld(trunk);
    expect(after.p.distanceTo(before.p)).toBeLessThan(1e-5);
    expect(after.q.angleTo(before.q)).toBeLessThan(1e-5);
  });

  it('turns the head toward a target at her side and lifts it', () => {
    const { head, trunk } = rig();
    const q0 = head.quaternion.clone();
    const ahead = noseDir(head, q0);
    expect(ahead.z).toBeGreaterThan(0.99); // she lies facing +z
    turnHead(head, trunk, rest(trunk), new THREE.Vector3(-3, 0.6, -389.5), 1); // far to her -x side and a little above
    const turned = noseDir(head, q0);
    expect(turned.x).toBeLessThan(-0.2); // toward the -x side
    expect(turned.y).toBeGreaterThan(0.05); // and up
    expect(turned.angleTo(ahead)).toBeLessThan(Math.hypot(END.head.yaw, END.head.pitch) + 1e-6);
  });

  it('never adds up: turning every frame from the same rest leaves the trunk where it was', () => {
    const { head, trunk } = rig();
    const home = rest(trunk);
    const q0 = head.quaternion.clone();
    const sq0 = trunk.quaternion.clone();
    const before = trunkWorld(trunk);
    for (let i = 0; i < 30; i++) {
      head.quaternion.copy(q0); // the animation resets rotations each frame, never positions
      trunk.quaternion.copy(sq0);
      turnHead(head, trunk, home, eye, 1);
    }
    const after = trunkWorld(trunk);
    expect(after.p.distanceTo(before.p)).toBeLessThan(1e-5);
  });

  it('does nothing with no share', () => {
    const { head, trunk } = rig();
    const q = head.quaternion.clone();
    turnHead(head, trunk, rest(trunk), eye, 0);
    expect(head.quaternion.angleTo(q)).toBe(0);
  });

  it('never turns past its limits, however far round the target is', () => {
    const { head, trunk } = rig();
    const q = head.quaternion.clone();
    turnHead(head, trunk, rest(trunk), new THREE.Vector3(30, 30, -300), 1);
    expect(head.quaternion.angleTo(q)).toBeLessThan(
      Math.hypot(END.head.yaw, END.head.pitch) + 1e-6,
    );
  });

  it('lifts the nose at least a little even for a level target straight ahead', () => {
    const { head, trunk } = rig();
    const q = head.quaternion.clone();
    turnHead(head, trunk, rest(trunk), new THREE.Vector3(1.5, 0.1, -388 + 20), 1); // dead ahead of her nose
    expect(head.quaternion.angleTo(q)).toBeCloseTo(END.head.lift, 2);
  });
});

describe('her struggle', () => {
  it('lifts her tail every 6-9 s, and much less often once the song is over', () => {
    expect(liftDelay(0, false)).toBe(6);
    expect(liftDelay(1, false)).toBe(9);
    expect(liftDelay(0.5, true)).toBeGreaterThan(2 * liftDelay(0.5, false));
  });

  it('blows on every other breath, the first one quiet', () => {
    expect([0, 1, 2, 3].map(blowsOn)).toEqual([false, true, false, true]);
  });

  it('loses the glint of her eye as she goes', () => {
    expect(eyeRoughness(0)).toBe(WET.eye);
    expect(eyeRoughness(1)).toBe(END.eyeRoughness);
    expect(eyeRoughness(0.5)).toBeGreaterThan(WET.eye);
  });
});
