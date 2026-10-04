import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { NO_REFLECTION_LAYER } from '../../engine/volume';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import { FAR_EDGE_X } from './river';
import { addSkyline, buildingFor, setSkylineTier, skylineLayout } from './skyline';

const materials = new Map<string, THREE.Material>();

/** A stand-in for loadModel: every model is a two-part mesh group sharing one material per name. */
vi.mock('../../engine/models', () => ({
  loadModel: (url: string): Promise<THREE.Object3D> => {
    const root = new THREE.Group();
    for (const part of ['bark', 'needles']) {
      const key = `${url}:${part}`;
      let material = materials.get(key);
      if (!material) materials.set(key, (material = new THREE.MeshStandardMaterial()));
      root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    }
    return Promise.resolve(root);
  },
}));

describe('skyline draw budget (a ~100-tree row was ~100 draw objects)', () => {
  const MAX_MESHES = 40;
  it.each([
    ['forest night route', FOREST, FOREST.lake?.z ?? -392, 0],
    ['city', CITY, CITY.endZ, undefined],
    ['suburbs', SUBURBS, SUBURBS.endZ, undefined],
  ] as const)(
    '%s: a few merged meshes, none casting; Medium keeps them out of the reflection',
    async (_n, area, endZ, margin) => {
      const scene = new THREE.Scene();
      await addSkyline(scene, area.skyline, area.startZ, endZ, margin, undefined, 'medium');
      const meshes = scene.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
      expect(meshes.length).toBeGreaterThan(0);
      expect(meshes.length).toBeLessThanOrEqual(MAX_MESHES);
      for (const m of meshes) {
        expect(m.castShadow).toBe(false);
        expect(m.layers.mask).toBe(1 << NO_REFLECTION_LAYER);
      }
      const high = new THREE.Scene();
      await addSkyline(high, area.skyline, area.startZ, endZ, margin, undefined, 'high');
      for (const m of high.children) expect(m.layers.isEnabled(0)).toBe(true);
    },
  );
});

describe('skylineLayout', () => {
  it('is the same every time for the same seed', () => {
    expect(skylineLayout(7, 10, 22, 60)).toEqual(skylineLayout(7, 10, 22, 60));
  });

  it('runs past the fog in both directions, so no row end is ever visible', () => {
    const zs = skylineLayout(7, 60, 22, 60).map((s) => s.z);
    expect(Math.max(...zs)).toBeGreaterThan(70);
    expect(Math.min(...zs)).toBeLessThan(-180);
  });

  it('keeps every silhouette outside the walkable strip', () => {
    for (const s of skylineLayout(7, 60, 22, 60)) {
      expect(s.x).toBeGreaterThanOrEqual(22);
      expect(s.x).toBeLessThanOrEqual(60);
    }
  });
});

describe('far-bank skyline', () => {
  it('can be placed relative to the far edge, never nearer than 1 m past it', () => {
    // addSkyline's far row uses minX FAR_EDGE_X + 5 and shifts trees 4 m toward the river.
    for (const s of skylineLayout(7, 60, FAR_EDGE_X + 5, FAR_EDGE_X + 43)) {
      expect(s.x - 4).toBeGreaterThanOrEqual(FAR_EDGE_X + 1);
    }
  });
});

describe('buildingFor', () => {
  it('picks taller Blender buildings for taller silhouettes', () => {
    expect(buildingFor(25)).toBe('buildingTall');
    expect(buildingFor(15)).toBe('buildingMid');
    expect(buildingFor(8)).toBe('buildingLow');
  });
});

describe('setSkylineTier', () => {
  it('moves the returned meshes in and out of the reflection when the tier changes', async () => {
    const scene = new THREE.Scene();
    const meshes = await addSkyline(
      scene,
      CITY.skyline,
      CITY.startZ,
      CITY.endZ,
      undefined,
      undefined,
      'high',
    );
    expect(meshes.length).toBeGreaterThan(0);
    setSkylineTier(meshes, 'low');
    for (const m of meshes) expect(m.layers.mask).toBe(1 << NO_REFLECTION_LAYER);
    setSkylineTier(meshes, 'high');
    for (const m of meshes) expect(m.layers.isEnabled(0)).toBe(true);
  });
});
