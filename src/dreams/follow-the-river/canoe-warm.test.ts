/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-type-assertion -- partial fakes of big interfaces */
import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import type { Pose, Ride } from './canoe-ride';
import { warmRide } from './canoe-warm';

const spots: Pose[] = [
  { x: 1, y: 0, z: -5, yaw: 0.1, roll: 0 },
  { x: 2, y: 0, z: -50, yaw: 0.2, roll: 0 },
];

interface Fake {
  r: Ride;
  stage: { hold: boolean; warming: boolean; scene: THREE.Scene };
  previous: THREE.Scene;
  kartik: THREE.Object3D;
  mesh: THREE.Mesh;
  camera: THREE.PerspectiveCamera;
}

function fake(compile: () => Promise<void>, log: string[]): Fake {
  const scene = new THREE.Scene();
  const previous = new THREE.Scene();
  const mesh = new THREE.Mesh();
  scene.add(mesh);
  const kartik = new THREE.Object3D();
  kartik.visible = false;
  const calf = new THREE.Object3D();
  calf.visible = false;
  const paddle = new THREE.Object3D();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(9, 9, 9);
  const stage = {
    hold: false,
    warming: false,
    scene: previous,
    camera,
    tier: 'high',
    renderer: { compileAsync: vi.fn(compile) },
    addUpdater: vi.fn((fn: (dt: number) => void) => {
      const live = { on: true };
      queueMicrotask(() => {
        for (let i = 0; i < 10 && live.on; i++) {
          log.push(
            `frame hold=${String(stage.hold)} warming=${String(stage.warming)} culled=${String(mesh.frustumCulled)} kartik=${String(kartik.visible)} scene=${stage.scene === scene ? 'ride' : 'other'}`,
          );
          fn(0.016);
        }
      });
      return () => void (live.on = false);
    }),
  };
  const r = {
    ctx: { stage },
    cs: {
      scene,
      kartik: { group: kartik },
      calf: { root: calf },
      paddle,
      sky: new THREE.Object3D(),
    },
    motion: { env: { tier: 'low' }, burst: vi.fn(), update: vi.fn() },
  } as unknown as Ride;
  return { r, stage, previous, kartik, mesh, camera };
}

describe('warmRide', () => {
  it('draws the ride scene with everything on and culling off, then hands the stage back', async () => {
    const log: string[] = [];
    const { r, stage, previous, kartik, mesh, camera } = fake(() => Promise.resolve(), log);
    await warmRide(r, previous, spots);
    expect(log).toHaveLength(spots.length * 2);
    expect(
      log.every((l) => l === 'frame hold=false warming=true culled=false kartik=true scene=ride'),
    ).toBe(true);
    expect(stage.scene).toBe(previous);
    expect([stage.hold, stage.warming, kartik.visible, mesh.frustumCulled]).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(camera.position.toArray()).toEqual([9, 9, 9]); // exactly where it was
  });

  it('holds the loop while compiling and lets go when the compile fails', async () => {
    const log: string[] = [];
    const { r, stage, previous } = fake(() => Promise.reject(new Error('gpu')), log);
    await warmRide(r, previous, spots);
    expect(stage.hold).toBe(false);
    expect(stage.warming).toBe(false);
    expect(stage.scene).toBe(previous);
  });
});
