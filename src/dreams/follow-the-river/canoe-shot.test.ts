import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { HEAD_CLEARANCE, HEADS, railPoint, SHOT } from './canoe-shot';

describe('the end shot rail', () => {
  it('starts above and between them, rises and goes back to a high wide view, never dipping', () => {
    const p = new THREE.Vector3();
    expect(railPoint(0, p).toArray()).toEqual([...SHOT.start]);
    expect(railPoint(1, p).toArray()).toEqual([...SHOT.end]);
    expect(SHOT.end[1]).toBeGreaterThan(SHOT.start[1] + 5); // high
    expect(SHOT.end[2]).toBeLessThan(-8); // behind the stern
    let lastY = -Infinity;
    let lastZ = Infinity;
    for (let k = 0; k <= 1; k += 0.05) {
      railPoint(k, p);
      expect(p.y).toBeGreaterThanOrEqual(lastY);
      expect(p.z).toBeLessThanOrEqual(lastZ);
      lastY = p.y;
      lastZ = p.z;
    }
    expect(SHOT.seconds).toBe(14);
  });

  it('never goes inside Kartik or Mom: at least 0.6 m from either head at every sample', () => {
    const p = new THREE.Vector3();
    const kartik = new THREE.Vector3(...HEADS.kartik);
    const mom = new THREE.Vector3(...HEADS.mom);
    let nearest = Infinity;
    for (let i = 0; i <= 1000; i++) {
      railPoint(i / 1000, p);
      nearest = Math.min(nearest, p.distanceTo(kartik), p.distanceTo(mom));
    }
    expect(nearest).toBeGreaterThanOrEqual(HEAD_CLEARANCE);
  });
});
