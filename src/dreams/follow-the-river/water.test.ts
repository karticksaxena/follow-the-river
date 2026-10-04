import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { disposeScene } from '../../engine/dispose';
import { createWaterMesh, fresnel, LAKE_FLOW, REFLECTION, waterReflection } from './water';

describe('fresnel', () => {
  it('stays within [0, cap] and never lets the water glow', () => {
    for (const c of [-1, 0, 0.1, 0.5, 0.9, 1, 2]) {
      const f = fresnel(c, REFLECTION.base, REFLECTION.cap);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(REFLECTION.cap);
    }
    expect(REFLECTION.cap).toBeLessThanOrEqual(0.5);
    expect(REFLECTION.stillCap).toBeLessThanOrEqual(0.5);
    expect(fresnel(1, REFLECTION.stillBase, REFLECTION.stillCap)).toBeLessThan(0.15);
  });

  it('is mostly deep water looking down and most reflective at grazing angles', () => {
    expect(fresnel(1, REFLECTION.base, REFLECTION.cap)).toBeCloseTo(
      REFLECTION.base * REFLECTION.cap,
    );
    expect(fresnel(0, REFLECTION.base, REFLECTION.cap)).toBeCloseTo(REFLECTION.cap);
    let previous = Infinity;
    for (let c = 0; c <= 1; c += 0.1) {
      const f = fresnel(c, REFLECTION.base, REFLECTION.cap);
      expect(f).toBeLessThanOrEqual(previous);
      previous = f;
    }
  });
});

describe('createWaterMesh', () => {
  it('lies flat, centred, and carries its reflector target', () => {
    const mesh = createWaterMesh(30, 100);
    expect(mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(mesh.position.length()).toBe(0);
    const reflection = waterReflection(mesh.material);
    expect(mesh.children).toContain(reflection.target);
    expect(reflection.reflector.resolutionScale).toBe(REFLECTION.resolutionScale);
    expect(reflection.reflector.bounces).toBe(false);
  });

  it('frees the reflection with the scene', () => {
    const scene = new THREE.Scene();
    const mesh = createWaterMesh(10, 10, LAKE_FLOW);
    scene.add(mesh);
    const spy = vi.spyOn(waterReflection(mesh.material), 'dispose');
    disposeScene(scene);
    expect(spy).toHaveBeenCalledOnce();
  });
});
