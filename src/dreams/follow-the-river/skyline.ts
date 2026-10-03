import * as THREE from 'three/webgpu';
import { assetUrl } from '../../engine/assets';
import { loadModel } from '../../engine/models';

export interface Silhouette {
  x: number;
  z: number;
  width: number;
  height: number;
}

export type BuildingModel = 'buildingTall' | 'buildingMid' | 'buildingLow';

/** Repeatable pseudo-random numbers so the skyline is the same every visit. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Silhouettes run from well behind the spawn (z = 0) to well past the bank's far end
 * (z ≈ -110), further than the fog reaches (70 m), so no end of the row is ever visible.
 */
export const SKYLINE_FROM_Z = 90;
export const SKYLINE_SPAN = 290;

/**
 * Distant city blocks across the river and a tree line behind the bank, all well outside
 * the walkable strip. They read as shapes in the fog, so the world never ends at a cliff.
 */
export function skylineLayout(
  seed: number,
  count: number,
  minX: number,
  maxX: number,
): Silhouette[] {
  const random = seeded(seed);
  const out: Silhouette[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: minX + random() * (maxX - minX),
      z: SKYLINE_FROM_Z - i * (SKYLINE_SPAN / count) - random() * 4,
      width: 3 + random() * 6,
      height: 6 + random() * 22,
    });
  }
  return out;
}

/** Which Blender building (tools/blender/river_props.py) fits a silhouette's height. */
export function buildingFor(height: number): BuildingModel {
  if (height > 20) return 'buildingTall';
  if (height > 12) return 'buildingMid';
  return 'buildingLow';
}

const url = (name: string): string => assetUrl(`river/${name}.glb`);

/** Native heights of the Blender props, in metres. Keep in sync with river_props.py. */
const PINE_HEIGHT = 9;
const DEAD_TREE_HEIGHT = 7;

/**
 * Places the Blender buildings (windows facing the river) and trees.
 * ponytail: one clone per prop (~130 meshes); switch to InstancedMesh if draw calls hurt.
 */
export async function addSkyline(scene: THREE.Scene): Promise<void> {
  const buildings = skylineLayout(7, 60, 22, 60);
  const trees = skylineLayout(11, 70, -40, -16);
  const placed = await Promise.all([
    ...buildings.map((b) => loadModel(url(buildingFor(b.height)))),
    ...trees.map((_, i) => loadModel(url(i % 3 === 2 ? 'deadTree' : 'pine'))),
  ]);
  buildings.forEach((b, i) => {
    const model = placed[i];
    model.position.set(b.x, 0, b.z);
    model.rotation.y = -Math.PI / 2;
    scene.add(model);
  });
  trees.forEach((t, i) => {
    const model = placed[buildings.length + i];
    const native = i % 3 === 2 ? DEAD_TREE_HEIGHT : PINE_HEIGHT;
    model.position.set(t.x, 0, t.z);
    model.rotation.y = t.width;
    model.scale.setScalar((t.height * 0.6) / native);
    scene.add(model);
  });
}
