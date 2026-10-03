import * as THREE from 'three/webgpu';
import { createWaterMesh, LAKE_FLOW } from './water';

/** The river: its near edge sits at x = 3, right beside the walkable bank. Tuning knobs. */
export const RIVER_WIDTH = 14;
export const RIVER_X = 3 + RIVER_WIDTH / 2;
export const EDGE_X = 3;
/** The far bank's edge (x). Anything on the far bank is placed relative to this, never a literal. */
export const FAR_EDGE_X = EDGE_X + RIVER_WIDTH;
/** The water surface height (y); the walkable ground is y 0. One value for rivers, lakes and banks. */
export const WATER_Y = -0.15;
/** Ground and water run this far past each end of the strip so fog, not an edge, ends the view. */
export const OVERRUN = 120;

/** A horizontal Lambert plane (ground, banks). */
export function plane(width: number, depth: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** A flat rectangle on the ground: x0 < x1 and z0 > z1 (z0 is the near, upstream side). */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** The lake at a strip's end. Tuning knobs (metres, colours). */
export const LAKE = {
  west: -60,
  east: 90,
  pebbleDepth: 6,
  pebbleWest: -40,
  pebbleEast: 60,
} as const;
export const PEBBLE_COLOR = 0x5a5348;
const PEBBLE_Y = 0.02;

/** Pure: every plane of a lake whose shore meets the water at `z`. Nothing overlaps. */
export function lakeRects(
  z: number,
): Record<'water' | 'pebblesWest' | 'pebblesEast' | 'flankWest' | 'flankEast', Rect> {
  const far = z - OVERRUN;
  const band = z + LAKE.pebbleDepth;
  return {
    water: { x0: LAKE.west, x1: LAKE.east, z0: z, z1: far },
    pebblesWest: { x0: LAKE.pebbleWest, x1: EDGE_X, z0: band, z1: z },
    pebblesEast: { x0: EDGE_X + RIVER_WIDTH, x1: LAKE.pebbleEast, z0: band, z1: z },
    // Land beside the lake, running on past the fog.
    flankWest: { x0: LAKE.west - 120, x1: LAKE.west, z0: z, z1: far },
    flankEast: { x0: LAKE.east, x1: LAKE.east + 120, z0: z, z1: far },
  };
}

/** Pure: the z range (near, far) the river, far bank and mud edge cover; `endOverrun` is 0 at a lake. */
export function riverSpan(
  fromZ: number,
  toZ: number,
  endOverrun = OVERRUN,
): { z0: number; z1: number } {
  return { z0: fromZ + OVERRUN, z1: toZ - endOverrun };
}

function placed<T extends THREE.Mesh>(mesh: T, r: Rect, y: number): T {
  mesh.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  return mesh;
}

const rectPlane = (r: Rect, color: number): THREE.Mesh => plane(r.x1 - r.x0, r.z0 - r.z1, color);

/** The lake: still dark water, pebbles on the near shore, land on both flanks. */
export function addLake(scene: THREE.Scene, z: number, landColor: number, bankColor: number): void {
  const r = lakeRects(z);
  const water = createWaterMesh(r.water.x1 - r.water.x0, r.water.z0 - r.water.z1, LAKE_FLOW);
  scene.add(
    placed(water, r.water, WATER_Y),
    placed(rectPlane(r.flankWest, landColor), r.flankWest, 0),
    placed(rectPlane(r.flankEast, bankColor), r.flankEast, 0),
    placed(rectPlane(r.pebblesWest, PEBBLE_COLOR), r.pebblesWest, PEBBLE_Y),
    placed(rectPlane(r.pebblesEast, PEBBLE_COLOR), r.pebblesEast, PEBBLE_Y),
  );
}

/**
 * Water, the far bank and a strip of wet mud where the near bank drops into the water,
 * from `fromZ` (start, positive) to `toZ` (far end, negative). Ground is added by the caller.
 * `endOverrun` is how far they run past `toZ`: 0 where a lake takes over.
 */
export function addRiver(
  scene: THREE.Scene,
  fromZ: number,
  toZ: number,
  farBankColor = 0x24271f,
  endOverrun = OVERRUN,
): void {
  const { z0, z1 } = riverSpan(fromZ, toZ, endOverrun);
  const length = z0 - z1;
  const middle = (z0 + z1) / 2;
  const farBank = plane(80, length, farBankColor);
  farBank.position.set(RIVER_X + RIVER_WIDTH / 2 + 40, 0, middle);
  const water = createWaterMesh(RIVER_WIDTH, length);
  water.position.set(RIVER_X, WATER_Y, middle);
  const edge = plane(0.6, length, 0x4a4a3c);
  edge.position.set(EDGE_X - 0.3, 0.01, middle);
  scene.add(farBank, water, edge);
}
