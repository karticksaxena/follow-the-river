import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { disposeScene } from '../../engine/dispose';
import { TIERS } from '../../engine/quality';
import {
  clampGlint,
  createWaterMesh,
  FLOW,
  flowSpeed,
  FOAM,
  foamFalloff,
  fresnel,
  GLINT,
  LAKE_FLOW,
  REFLECTION,
  RIVER_FLOW,
  setWaterAttribute,
  setWaterTier,
  waterReflection,
} from './water';

/** Whether the water's emissive graph samples the reflector node. */
function reflectsPlanar(material: THREE.MeshStandardNodeMaterial): boolean {
  const target = waterReflection(material);
  const seen = new Set<unknown>();
  const walk = (node: unknown): boolean => {
    if (node === target || node === target.reflector) return true;
    if (!node || typeof node !== 'object' || seen.has(node)) return false;
    seen.add(node);
    return Object.values(node).some(walk);
  };
  return walk(material.emissiveNode);
}

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
    setWaterTier('high');
    expect(reflection.reflector.resolutionScale).toBe(TIERS.high.reflectionScale);
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

describe('flowSpeed', () => {
  it('is slowest at the bank, fastest mid-river, never upstream', () => {
    const bank = flowSpeed(0, RIVER_FLOW.speed);
    const mid = flowSpeed(15, RIVER_FLOW.speed);
    expect(bank).toBeCloseTo(RIVER_FLOW.speed * FLOW.bankSlow);
    expect(bank).toBeGreaterThan(0);
    expect(mid).toBeCloseTo(RIVER_FLOW.speed);
    let previous = 0;
    for (let d = 0; d <= 15; d += 1) {
      const v = flowSpeed(d, RIVER_FLOW.speed);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });

  it('keeps the still lake still, and treats a negative shore as the bank', () => {
    expect(flowSpeed(8, LAKE_FLOW.speed)).toBe(0);
    expect(flowSpeed(-3, 1)).toBeCloseTo(FLOW.bankSlow);
  });
});

describe('foamFalloff', () => {
  it('is full at the waterline and gone past the foam width', () => {
    expect(foamFalloff(0)).toBe(1);
    expect(foamFalloff(-2)).toBe(1);
    expect(foamFalloff(FOAM.width)).toBe(0);
    expect(foamFalloff(FOAM.width * 3)).toBe(0);
  });

  it('only ever fades with distance', () => {
    let previous = 1;
    for (let d = 0; d <= FOAM.width; d += FOAM.width / 20) {
      const f = foamFalloff(d);
      expect(f).toBeLessThanOrEqual(previous);
      previous = f;
    }
  });
});

describe('clampGlint', () => {
  it('stays under the bloom threshold so characters never bloom white', () => {
    expect(clampGlint(0)).toBe(0);
    expect(clampGlint(-1)).toBe(0);
    expect(clampGlint(50)).toBe(GLINT.max);
    expect(GLINT.max).toBeLessThan(1);
  });
});

describe('setWaterAttribute', () => {
  it('gives every vertex its distance to the nearest bank and its across-river position', () => {
    const mesh = createWaterMesh(30, 20);
    const a = mesh.geometry.getAttribute('water');
    expect(a.itemSize).toBe(2);
    const geo = new THREE.PlaneGeometry(30, 20, 20, 2);
    setWaterAttribute(geo, (x) => 15 - Math.abs(x));
    const w = geo.getAttribute('water');
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      expect(w.getX(i)).toBeCloseTo(15 - Math.abs(p.getX(i)));
      expect(w.getY(i)).toBeCloseTo(p.getX(i));
    }
  });
});

describe('setWaterTier', () => {
  it('rebuilds live water shaders only when the tier changes', () => {
    setWaterTier('high');
    const mesh = createWaterMesh(10, 10);
    const v = mesh.material.version;
    setWaterTier('high');
    expect(mesh.material.version).toBe(v);
    setWaterTier('low');
    expect(mesh.material.version).toBe(v + 1);
    setWaterTier('high');
    mesh.material.dispose();
    setWaterTier('low');
    setWaterTier('high'); // a disposed material is no longer rebuilt
  });
});

describe('the planar reflection per tier', () => {
  it('renders at the tier scale, resizing live water on a change', () => {
    setWaterTier('high');
    const mesh = createWaterMesh(10, 10);
    const r = waterReflection(mesh.material).reflector;
    expect(r.resolutionScale).toBe(TIERS.high.reflectionScale);
    setWaterTier('medium');
    expect(r.resolutionScale).toBe(TIERS.medium.reflectionScale);
    mesh.material.dispose();
    setWaterTier('high');
  });

  it('is not in the Low shader at all (a flat colour stands in), and is back on Medium', () => {
    setWaterTier('low');
    const low = createWaterMesh(10, 10);
    expect(reflectsPlanar(low.material)).toBe(false);
    setWaterTier('medium');
    expect(reflectsPlanar(low.material)).toBe(true);
    low.material.dispose();
    setWaterTier('high');
  });
});
