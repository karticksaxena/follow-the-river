import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { resolveCircle } from '../../engine/collide';
import { CITY } from './areas/city';
import {
  addShack,
  DOOR_HEIGHT,
  SHACK_TILE,
  shackBounds,
  shackColliders,
  shackInterior,
} from './shack';

const def = { id: 's1', x: -14, z: -20, width: 3, depth: 2 };

const wall = (s: THREE.Scene): THREE.Material | THREE.Material[] | undefined =>
  s.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)?.material;

describe('shack', () => {
  it('builds a house with the same walls and door as a shack, in its own wall material', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    const a = new THREE.Scene();
    const b = new THREE.Scene();
    await addShack(a, def);
    await addShack(b, { ...def, look: 'house' });
    vi.unstubAllGlobals();
    expect(wall(a)).not.toBe(wall(b));
    expect(shackColliders({ ...def, look: 'house' })).toEqual(shackColliders(def));
  });

  it('has a footprint of width × depth tiles centred on (x, z)', () => {
    const b = shackBounds(def);
    expect(b.maxX - b.minX).toBeCloseTo(2 * SHACK_TILE); // depth runs along x (door faces +X)
    expect(b.maxZ - b.minZ).toBeCloseTo(3 * SHACK_TILE);
  });

  it('lets the player walk in through the doorway on the +X side', () => {
    const b = shackBounds(def);
    const walls = shackColliders(def);
    // Walk from outside the door straight in along -X.
    let x = b.maxX + 1;
    for (let i = 0; i < 40; i++) ({ x } = resolveCircle(x - 0.1, def.z, 0.3, walls));
    expect(x).toBeLessThan(b.maxX - 0.5);
  });

  it('blocks walking through a side wall', () => {
    const b = shackBounds(def);
    const walls = shackColliders(def);
    let z = b.maxZ + 1;
    for (let i = 0; i < 40; i++) ({ z } = resolveCircle(def.x, z - 0.1, 0.3, walls));
    expect(z).toBeGreaterThan(b.maxZ);
  });

  it('has a doorway tall enough to walk through', () => {
    expect(DOOR_HEIGHT).toBeGreaterThanOrEqual(2);
  });

  it('uses MeshStandardMaterial for walls, roof and floor so they receive environment light', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    const scene = new THREE.Scene();
    await addShack(scene, def);
    vi.unstubAllGlobals();
    const meshes = scene.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    expect(meshes.length).toBeGreaterThanOrEqual(3);
    for (const m of meshes) expect(m.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });
});

describe('shackInterior', () => {
  it('covers the footprint, with the door point on the +X wall', () => {
    const first = CITY.shacks[0];
    if (!first) throw new Error('no shack');
    const interior = shackInterior(first);
    const b = shackBounds(first);
    expect([interior.minX, interior.maxX, interior.minZ, interior.maxZ]).toEqual([
      b.minX,
      b.maxX,
      b.minZ,
      b.maxZ,
    ]);
    expect(interior.doorX).toBe(b.maxX);
    expect(interior.doorZ).toBeGreaterThan(b.minZ);
    expect(interior.doorZ).toBeLessThan(b.maxZ);
  });
});
