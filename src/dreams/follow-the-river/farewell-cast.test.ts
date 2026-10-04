import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { createRail } from './camera-rail';
import { CAST, createCast, type ArmJob, type Cast } from './farewell-cast';

interface Rig {
  camera: THREE.PerspectiveCamera;
  arm: THREE.Group;
  mom: { group: THREE.Group };
  cast: Cast;
  eye: { x: number; y: number; z: number };
}

function setup(): Rig {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  const arm = new THREE.Group();
  camera.add(arm);
  const mom = { group: new THREE.Group() };
  const eye = { x: 3, y: 0.5, z: -10 };
  const fish = { head: (out: { x: number; y: number; z: number }) => Object.assign(out, eye) };
  const cast = createCast({ arm, mom }, camera, fish);
  return { camera, arm, mom, cast, eye };
}

const job = (): ArmJob => ({
  hand: (out) => out.set(0.3, -0.2, -0.8),
  along: new THREE.Vector3(0, 0, -1),
  palm: new THREE.Vector3(0, -1, 0),
  rise: 0,
  goal: 1,
});

describe('the cast', () => {
  it('holds the camera at the end of a rail every frame', () => {
    const { camera, cast } = setup();
    cast.hold = createRail(
      [
        { at: [0, 1.6, 0], look: [0, 1.6, -5] },
        { at: [2, 0.4, -3], look: [4, 0.2, -3] },
      ],
      2,
    );
    camera.position.set(9, 9, 9); // the player's own update puts it elsewhere
    cast.update(0.016);
    expect(camera.position.distanceTo(new THREE.Vector3(2, 0.4, -3))).toBeLessThan(1e-6);
  });

  it('turns the camera toward her head only while following', () => {
    const { camera, cast, eye } = setup();
    cast.update(0.5);
    const before = camera.quaternion.clone();
    cast.follow(true);
    for (let i = 0; i < 60; i++) cast.update(1 / 30);
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const want = new THREE.Vector3(eye.x, eye.y, eye.z).sub(camera.position).normalize();
    expect(dir.dot(want)).toBeGreaterThan(0.99);
    expect(camera.quaternion.angleTo(before)).toBeGreaterThan(0.1);
    cast.follow(false);
    const q = camera.quaternion.clone();
    eye.x = -20;
    cast.update(0.5);
    expect(camera.quaternion.angleTo(q)).toBeLessThan(1e-6);
  });

  it('brings the arm up over CAST.armRise, and takes it away again', () => {
    const { arm, cast } = setup();
    const a = job();
    cast.arm = a;
    cast.update(CAST.armRise / 2);
    expect(a.rise).toBeCloseTo(0.5);
    expect(arm.visible).toBe(true);
    cast.update(CAST.armRise);
    expect(a.rise).toBe(1);
    a.goal = 0;
    cast.update(CAST.armRise * 2);
    expect(cast.arm).toBeNull();
    expect(arm.visible).toBe(false);
  });

  it('slides Mom to her spot at the shuffle speed, then says so once', () => {
    const { mom, cast } = setup();
    const done = vi.fn<() => void>();
    cast.slide = { to: { x: 0.6, z: 0 }, done };
    cast.update(0.5);
    expect(mom.group.position.x).toBeCloseTo(CAST.shuffle * 0.5);
    expect(done).not.toHaveBeenCalled();
    cast.update(1);
    expect(mom.group.position.x).toBe(0.6);
    expect(done).toHaveBeenCalledTimes(1);
    cast.update(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('bobs a floating pack around where it was put', () => {
    const { cast } = setup();
    const pack = new THREE.Group();
    pack.position.y = -0.95;
    cast.float = pack;
    const ys = new Set<number>();
    for (let i = 0; i < 40; i++) {
      cast.update(0.25);
      ys.add(Math.round(pack.position.y * 1000));
      expect(Math.abs(pack.position.y + 0.95)).toBeLessThanOrEqual(CAST.bob.amp + 1e-9);
    }
    expect(ys.size).toBeGreaterThan(5);
  });
});
