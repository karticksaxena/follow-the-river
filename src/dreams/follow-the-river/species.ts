import type * as THREE from 'three/webgpu';
import type { Category } from './nature';
import type { Kind, Plant } from './vegetation';

/** Crowns reach past their trunks: a cell's box grows by this much (m). */
const CROWN = 6;

/**
 * One part (a geometry and a material) of one model over the whole area: one mesh, so three builds
 * its shader nodes once per pass. (One mesh per 60 m cell made a node build for every cell the walk
 * met, keyed by the mesh: the hitches while walking.) The mesh draws the shown cells, packed.
 */
export interface Species {
  mesh: THREE.InstancedMesh;
  category: Category;
  /** Every instance's matrix and scale, cell after cell. */
  matrices: Float32Array;
  scales: Float32Array;
  scale: THREE.InstancedBufferAttribute;
  cells: Cell[];
  dirty: boolean;
}

/** A 60 m stretch of a species: a range of its instances, shown or hidden by the cull. */
export interface Cell {
  species: Species;
  kind: Kind;
  start: number;
  count: number;
  shown: boolean;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function cellOf(
  species: Species,
  kind: Kind,
  plants: readonly Plant[],
  start: number,
): Cell {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of plants) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const c = CROWN;
  const count = plants.length;
  return {
    species,
    kind,
    start,
    count,
    shown: false,
    minX: minX - c,
    maxX: maxX + c,
    minZ: minZ - c,
    maxZ: maxZ + c,
  };
}

/** Copies the shown cells' instances to the front of the mesh's buffers and draws only those. No allocation. */
export function pack(s: Species): void {
  const out = s.mesh.instanceMatrix.array;
  const scale = s.scale.array;
  let n = 0;
  for (const c of s.cells) {
    if (!c.shown) continue;
    for (let k = 0; k < c.count; k++) {
      const from = (c.start + k) * 16;
      const to = (n + k) * 16;
      for (let e = 0; e < 16; e++) out[to + e] = s.matrices[from + e] ?? 0;
      scale[n + k] = s.scales[c.start + k] ?? 1;
    }
    n += c.count;
  }
  s.mesh.count = n;
  s.mesh.visible = n > 0;
  s.mesh.instanceMatrix.clearUpdateRanges();
  s.mesh.instanceMatrix.addUpdateRange(0, n * 16);
  s.mesh.instanceMatrix.needsUpdate = true;
  s.scale.clearUpdateRanges();
  s.scale.addUpdateRange(0, n);
  s.scale.needsUpdate = true;
  s.dirty = false;
}
