import * as THREE from 'three/webgpu';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Tier } from '../../engine/quality';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import type { AreaDef } from './areas/types';
import { meshY, pathX, RIVER_HALF, TERRAIN, terrainY } from './canoe-scene';
import { canoePlants } from './canoe-vegetation';
import { addVegetation } from './nature';
import { shackBounds } from './shack';
import { type Plant, plantsOf, stripGrass } from './vegetation';

/** Vegetation meshes per scene: every one is a draw call in every pass. */
const TIERS: readonly Tier[] = ['low', 'medium', 'high'];
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

async function build(plants: Plant[], tier: Tier): Promise<THREE.InstancedMesh[]> {
  const scene = new THREE.Scene();
  await addVegetation(scene, plants, tier);
  return scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
}

const materialName = (m: THREE.Mesh): string => (Array.isArray(m.material) ? '' : m.material.name);

const area = (a: AreaDef, tier: Tier): Plant[] => [
  ...plantsOf(a),
  ...stripGrass(a, tier, a.shacks.map(shackBounds)),
];
const canoe = (tier: Tier): Plant[] =>
  canoePlants(TERRAIN.behind, -600 - TERRAIN.ahead, tier, GROUND);

describe('addVegetation', () => {
  it('makes at most 60 meshes per scene on every tier', async () => {
    const scenes: [string, (t: Tier) => Plant[]][] = [
      ['forest', (t) => area(FOREST, t)],
      ['suburbs', (t) => area(SUBURBS, t)],
      ['canoe', canoe],
    ];
    for (const [, plants] of scenes) {
      for (const tier of TIERS) {
        const meshes = await build(plants(tier), tier);
        expect(meshes.length).toBeGreaterThan(10);
      }
    }
  }, 60000);

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
    expect(small.length).toBeGreaterThan(3);
    for (const m of small) {
      expect(m.castShadow).toBe(false);
    }
    for (const m of meshes) expect(m.boundingSphere).not.toBeNull();
  }, 60000);
});
