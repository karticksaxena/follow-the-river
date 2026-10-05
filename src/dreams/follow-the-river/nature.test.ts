import * as THREE from 'three/webgpu';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Tier } from '../../engine/quality';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import type { AreaDef } from './areas/types';
import { meshY, pathX, RIVER_HALF, TERRAIN, terrainY } from './canoe-scene';
import { canoePlants } from './canoe-vegetation';
import { addVegetation, type Vegetation } from './nature';
import { shackBounds } from './shack';
import { type Plant, plantsOf, stripGrass } from './vegetation';

/** Vegetation meshes shown per pass: every one is a draw call. */
const MAX_MESHES = 60;
const TIERS: readonly Tier[] = ['low', 'medium', 'high'];
/** Triangles in one pass (every mesh in view, all around: an upper bound), per tier. */
const TRIANGLES: Record<Tier, number> = { low: 400_000, medium: 800_000, high: 1_500_000 };
/** Fog far planes tried: night (60) and day (100). */
const FOGS = [60, 100];
/** Camera spots (x, z): start, middle and end of each area, and along the canoe path. */
const SPOTS = {
  forest: [14, -60, -200, -300, -380].flatMap((z): [number, number][] => [
    [-4, z],
    [-16, z],
  ]),
  suburbs: [14, -60, -200, -300, -480].flatMap((z): [number, number][] => [
    [-4, z],
    [-16, z],
  ]),
  canoe: [0, -150, -300, -450, -600].map((z): [number, number] => [pathX(z), z]),
};
const GROUND = { pathX, meshY, terrainY, riverHalf: RIVER_HALF };

type ReadFile = (path: string) => Uint8Array<ArrayBuffer>;

/** Node's fs, found at run time (the project has no Node typings). */
async function nodeReadFile(): Promise<ReadFile> {
  const specifier = 'node:fs';
  const fs: unknown = await import(/* @vite-ignore */ specifier);
  if (typeof fs !== 'object' || fs === null || !('readFileSync' in fs)) throw new Error('no fs');
  const read = fs.readFileSync;
  if (typeof read !== 'function') throw new Error('no readFileSync');
  // oxlint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-type-assertion
  return (path) => read(path) as Uint8Array<ArrayBuffer>;
}

class FakeRequest {
  url: string;
  constructor(url: string) {
    this.url = url;
  }
}

/** Loads the real GLBs in Node: files from public/, textures stubbed out. */
beforeAll(async () => {
  const read = await nodeReadFile();
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 4, height: 4, close() {} }));
  vi.stubGlobal('navigator', { userAgent: 'node' });
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('ProgressEvent', FakeRequest);
  vi.stubGlobal('Request', FakeRequest);
  vi.stubGlobal('fetch', (req: FakeRequest) => {
    const file = req.url.slice(req.url.indexOf('assets/'));
    return Promise.resolve(new Response(read(`public/${file}`)));
  });
});
afterAll(() => vi.unstubAllGlobals());

async function built(plants: Plant[], tier: Tier): Promise<Vegetation> {
  return addVegetation(new THREE.Scene(), plants, tier);
}

async function build(plants: Plant[], tier: Tier): Promise<THREE.InstancedMesh[]> {
  const vegetation = await built(plants, tier);
  return vegetation.children.filter(
    (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
  );
}

/** Triangles a mesh draws in one pass: instances x triangles per instance. */
const drawn = (m: THREE.InstancedMesh): number => m.count * ((m.geometry.index?.count ?? 0) / 3);

/** Instances drawn: each species mesh draws its shown cells. */
const instancesOf = (meshes: readonly THREE.InstancedMesh[]): number =>
  meshes.reduce((sum, m) => sum + m.count, 0);

const materialName = (m: THREE.Mesh): string => (Array.isArray(m.material) ? '' : m.material.name);

const area = (a: AreaDef, tier: Tier): Plant[] => [
  ...plantsOf(a),
  ...stripGrass(a, tier, a.shacks.map(shackBounds)),
];
const canoe = (tier: Tier): Plant[] =>
  canoePlants(TERRAIN.behind, -600 - TERRAIN.ahead, tier, GROUND);

describe('addVegetation', () => {
  it('stays in budget per pass at the sample camera spots: triangles and meshes, every tier', async () => {
    // [scene, plants per tier, camera spots (x, z)]
    const scenes: [string, (t: Tier) => Plant[], [number, number][]][] = [
      ['forest', (t) => area(FOREST, t), SPOTS.forest],
      ['suburbs', (t) => area(SUBURBS, t), SPOTS.suburbs],
      ['canoe', canoe, SPOTS.canoe],
    ];
    for (const [name, plants, spots] of scenes) {
      for (const tier of TIERS) {
        const vegetation = await built(plants(tier), tier);
        let worst = 0;
        let most = 0;
        for (const fog of FOGS) {
          for (const [x, z] of spots) {
            const shown = vegetation.cull(x, z, fog);
            worst = Math.max(
              worst,
              shown.reduce((sum, m) => sum + drawn(m), 0),
            );
            most = Math.max(most, shown.length);
          }
        }
        expect(worst, `${name} ${tier} triangles`).toBeLessThanOrEqual(TRIANGLES[tier]);
        expect(most, `${name} ${tier} meshes`).toBeLessThanOrEqual(MAX_MESHES);
        expect(vegetation.children.length).toBeGreaterThan(5); // one mesh per species part
      }
    }
  }, 120000);

  it('casts shadows and reflects trees on High only', async () => {
    for (const tier of TIERS) {
      const meshes = await build(canoe(tier), tier);
      expect(meshes.some((m) => m.castShadow)).toBe(tier === 'high');
      expect(meshes.some((m) => m.layers.isEnabled(0))).toBe(tier === 'high');
    }
  }, 60000);

  it('never reflects or casts from grass and ferns, and bounds every mesh by its instances', async () => {
    const meshes = await build(canoe('high'), 'high');
    const small = meshes.filter((m) => /^(Grass|Leaves)$/.test(materialName(m)));
    expect(small.length).toBeGreaterThan(1);
    for (const m of small) {
      expect(m.castShadow).toBe(false);
    }
    for (const m of meshes) expect(m.boundingSphere).not.toBeNull();
  }, 60000);
});

describe('Vegetation.setTier (Auto or the pause menu changes the tier mid-chapter)', () => {
  it('High to Medium stops casting and reflecting, and back to High restores it', async () => {
    const vegetation = await built(canoe('high'), 'high');
    const meshes = vegetation.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    expect(meshes.some((m) => m.castShadow)).toBe(true);
    vegetation.setTier('medium');
    expect(meshes.some((m) => m.castShadow)).toBe(false);
    expect(meshes.some((m) => m.layers.isEnabled(0))).toBe(false);
    vegetation.setTier('high');
    expect(meshes.some((m) => m.castShadow)).toBe(true);
    expect(meshes.some((m) => m.layers.isEnabled(0))).toBe(true);
  }, 60000);

  it('narrows the cull reach live after a step-down', async () => {
    const vegetation = await built(canoe('high'), 'high');
    const [x, z] = SPOTS.canoe[2];
    const high = instancesOf(vegetation.cull(x, z, 100));
    vegetation.setTier('low');
    expect(instancesOf(vegetation.cull(x, z, 100))).toBeLessThan(high);
  }, 60000);

  it('showAll shows every cell wherever the camera is, and the undo culls again', async () => {
    const vegetation = await built(canoe('high'), 'high');
    const [x, z] = SPOTS.canoe[2];
    const near = instancesOf(vegetation.cull(x, z, 100));
    const undo = vegetation.showAll();
    const all = instancesOf(vegetation.cull(x, z, 100));
    expect(all).toBeGreaterThan(near);
    expect(instancesOf(vegetation.cull(x + 500, z, 100))).toBe(all); // the cull stands still
    undo();
    expect(instancesOf(vegetation.cull(x, z, 100))).toBe(near);
  }, 60000);

  it('showAll(true) draws every species mesh (each is one node build), with fewer instances', async () => {
    const vegetation = await built(canoe('high'), 'high');
    const [x, z] = SPOTS.canoe[2];
    const meshes = vegetation.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    const undoAll = vegetation.showAll();
    const all = instancesOf(vegetation.cull(x, z, 100));
    undoAll();
    const undo = vegetation.showAll(true);
    const sample = vegetation.cull(x, z, 100);
    expect(sample).toHaveLength(meshes.length);
    expect(instancesOf(sample)).toBeLessThan(all / 4);
    undo();
  }, 60000);

  it('packs the shown cells to the front of a species mesh, matrices and scales in step', async () => {
    const vegetation = await built(canoe('high'), 'high');
    const [x, z] = SPOTS.canoe[2];
    const shown = vegetation.cull(x, z, 100);
    const mesh = shown.find((m) => m.count > 1);
    expect(mesh).toBeDefined();
    if (!mesh) return;
    const scale = mesh.geometry.getAttribute('instScale');
    const at = new THREE.Matrix4();
    const s = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, at);
      s.setFromMatrixScale(at);
      expect(s.x).toBeCloseTo(scale.getX(i), 4); // the instance's own scale, not a neighbour's
    }
  }, 60000);
});
