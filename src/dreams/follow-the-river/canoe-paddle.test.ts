import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { GRIP, gripAt } from './canoe-paddle';
import { dipPaddle } from './canoe-ride';

describe('the grip points', () => {
  it('lie on the dipped shaft line, GRIP either side of its middle, left hand on the left', () => {
    const mid = new THREE.Vector3(0.1, 0.62, -0.7);
    const along = new THREE.Vector3(0.95, 0.3, 0.1).normalize();
    dipPaddle(along, mid);
    const l = gripAt(mid, along, -1, new THREE.Vector3());
    const r = gripAt(mid, along, 1, new THREE.Vector3());
    expect(l.distanceTo(mid)).toBeCloseTo(GRIP);
    expect(r.distanceTo(mid)).toBeCloseTo(GRIP);
    expect(new THREE.Vector3().subVectors(r, l).normalize().dot(along)).toBeCloseTo(1);
    expect(new THREE.Vector3().subVectors(l, mid).cross(along).length()).toBeCloseTo(0);
  });
});
