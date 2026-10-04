import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createRail, orbitKeys, type RailKey } from './camera-rail';

const KEYS: RailKey[] = [
  { at: [0, 1.6, 0], look: [0, 1.6, -5] },
  { at: [1, 1.2, -1], look: [3, 1, -4] },
  { at: [2, 1.05, -3], look: [4, 0.5, -3] },
];

function samples(rail: ReturnType<typeof createRail>, n: number): THREE.Vector3[] {
  const cam = new THREE.PerspectiveCamera();
  return Array.from({ length: n }, (_, i) => {
    rail.pose((i / (n - 1)) * rail.seconds, cam);
    return cam.position.clone();
  });
}

describe('createRail', () => {
  it('starts at the first key and ends at the last', () => {
    const cam = new THREE.PerspectiveCamera();
    const rail = createRail(KEYS, 3);
    rail.pose(0, cam);
    expect(cam.position.distanceTo(new THREE.Vector3(0, 1.6, 0))).toBeLessThan(1e-6);
    rail.pose(99, cam);
    expect(cam.position.distanceTo(new THREE.Vector3(2, 1.05, -3))).toBeLessThan(1e-6);
    rail.pose(-5, cam);
    expect(cam.position.x).toBeCloseTo(0);
  });

  it('looks at its look point', () => {
    const cam = new THREE.PerspectiveCamera();
    createRail(KEYS, 3).pose(0, cam);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    expect(dir.z).toBeCloseTo(-1);
  });

  it('moves smoothly: no step above 3 x the median step over 600 samples', () => {
    for (const keys of [KEYS, orbitKeys({ x: 0, y: 0.8, z: 0 }, 4.5, 0, 2.6, [1.4, 2.6], 9)]) {
      const pts = samples(createRail(keys, 12), 600);
      const steps = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
      const median = steps.toSorted((a, b) => a - b)[Math.floor(steps.length / 2)];
      expect(Math.max(...steps)).toBeLessThan(3 * median);
    }
  });

  it('eases: the first step is smaller than a middle one', () => {
    const pts = samples(createRail(KEYS, 3), 100);
    expect(pts[1].distanceTo(pts[0])).toBeLessThan(pts[51].distanceTo(pts[50]) / 4);
  });

  it('holds still on a one-place turn (two equal camera keys)', () => {
    const turn: RailKey[] = [
      { at: [1, 1.6, 1], look: [0, 1.6, -5] },
      { at: [1, 1.6, 1], look: [5, 1, -2] },
    ];
    const cam = new THREE.PerspectiveCamera();
    const rail = createRail(turn, 1.2);
    rail.pose(0.6, cam);
    expect(cam.position.toArray()).toEqual([1, 1.6, 1]);
    expect(Number.isFinite(cam.quaternion.x)).toBe(true);
  });
});

describe('orbitKeys', () => {
  const centre = { x: 2, y: 0.9, z: -7 };
  const keys = orbitKeys(centre, 4.5, -1.5, 1.1, [1.4, 2.6], 9);

  it('keeps the radius within 1 % and looks at the centre', () => {
    expect(keys).toHaveLength(9);
    for (const k of keys) {
      expect(Math.hypot(k.at[0] - centre.x, k.at[2] - centre.z)).toBeCloseTo(4.5, 1);
      expect(k.look).toEqual([2, 0.9, -7]);
    }
  });

  it('keeps the radius within 1 % along the whole rail too', () => {
    const rail = createRail(keys, 12);
    for (const p of samples(rail, 200)) {
      const r = Math.hypot(p.x - centre.x, p.z - centre.z);
      expect(Math.abs(r - 4.5) / 4.5).toBeLessThan(0.01);
    }
  });

  it('climbs from the first height to the second', () => {
    expect(keys[0].at[1]).toBeCloseTo(1.4);
    expect(keys[8].at[1]).toBeCloseTo(2.6);
  });
});
