import * as THREE from 'three/webgpu';
import { createWaterMesh, LAKE_FLOW } from './water';

/** The river: its near edge sits at x = 3, right beside the walkable bank. Tuning knobs. */
export const RIVER_WIDTH = 30;
export const RIVER_X = 3 + RIVER_WIDTH / 2;
export const EDGE_X = 3;
/** The far bank's edge (x). Anything on the far bank is placed relative to this, never a literal. */
export const FAR_EDGE_X = EDGE_X + RIVER_WIDTH;
/** The water surface height (y); the walkable ground is y 0. One value for rivers, lakes and banks. */
export const WATER_Y = -1;
/** Ground and water run this far past each end of the strip so fog, not an edge, ends the view. */
export const OVERRUN = 120;
/** The far-bank land runs this far east of the far bank (m), into the fog. */
const FAR_LAND_WIDTH = 120;
/** An embankment's kerb is this wide (m); the ground on either side stops where it starts. */
export const KERB_WIDTH = 0.6;

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
  east: FAR_EDGE_X + 60,
  /** Flat pebbles this far (m) onto the land, then the shore slopes down to the water. */
  pebbleDepth: 6,
  pebbleWest: -60,
  pebbleEast: FAR_EDGE_X + 60,
  /** The slope starts this far (m) past the water line and falls to WATER_Y right at it. */
  slopeStart: 4,
  /** The sloped shore runs on this far (m) under the water. */
  slopeRun: 4,
} as const;
export const PEBBLE_COLOR = 0x5a5348;

/** Pure: every plane of a lake whose shore meets the water at `z`. Nothing overlaps. */
export function lakeRects(
  z: number,
): Record<'water' | 'pebblesWest' | 'pebblesEast' | 'flankWest' | 'flankEast', Rect> {
  const far = z - OVERRUN;
  const band = z + LAKE.pebbleDepth;
  return {
    water: { x0: LAKE.west, x1: LAKE.east, z0: z, z1: far },
    pebblesWest: { x0: LAKE.pebbleWest, x1: EDGE_X, z0: band, z1: z },
    pebblesEast: { x0: FAR_EDGE_X, x1: LAKE.pebbleEast, z0: band, z1: z },
    // Land beside the lake, running on past the fog.
    flankWest: { x0: LAKE.west - 120, x1: LAKE.west, z0: band, z1: far },
    flankEast: { x0: LAKE.east, x1: LAKE.east + 120, z0: band, z1: far },
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

/** Pure: the shore's height `dz` m north (+) of the water line: level, then sloping to WATER_Y at 0. */
export function shoreY(dz: number): number {
  return dz >= LAKE.slopeStart ? 0 : (WATER_Y * (LAKE.slopeStart - dz)) / LAKE.slopeStart;
}

/** A pebble shore: level at the rect's far (land) side, sloping under the water at `z`. */
function shoreMesh(r: Rect, z: number): THREE.Mesh {
  const depth = r.z0 - z + LAKE.slopeRun;
  const geo = new THREE.PlaneGeometry(r.x1 - r.x0, depth, 1, Math.round(depth));
  geo.rotateX(-Math.PI / 2);
  const centreZ = r.z0 - depth / 2;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, shoreY(p.getZ(i) + centreZ - z));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: PEBBLE_COLOR }));
  mesh.position.set((r.x0 + r.x1) / 2, 0, centreZ);
  return mesh;
}

/** The lake: still dark water, sloping pebble shores on the near side, land on both flanks. */
export function addLake(scene: THREE.Scene, z: number, landColor: number, bankColor: number): void {
  const r = lakeRects(z);
  const water = createWaterMesh(r.water.x1 - r.water.x0, r.water.z0 - r.water.z1, LAKE_FLOW);
  scene.add(
    placed(water, r.water, WATER_Y),
    placed(rectPlane(r.flankWest, landColor), r.flankWest, 0),
    placed(rectPlane(r.flankEast, bankColor), r.flankEast, 0),
    shoreMesh(r.pebblesWest, z),
    shoreMesh(r.pebblesEast, z),
  );
}

export interface RiverOptions {
  /** Land colour beyond the far bank. */
  farBankColor?: number;
  /** How far the river runs past `toZ`: 0 where a lake takes over. */
  endOverrun?: number;
  /** True where the banks are city embankments: the far land starts past the far kerb. */
  embankment?: boolean;
}

/**
 * Water and the far-bank land (banks: `addBanks`), from `fromZ` (start, positive) to `toZ` (far end,
 * negative). The near ground is added by the caller.
 */
export function addRiver(
  scene: THREE.Scene,
  fromZ: number,
  toZ: number,
  o: RiverOptions = {},
): void {
  const { farBankColor = 0x24271f, endOverrun = OVERRUN, embankment = false } = o;
  const { z0, z1 } = riverSpan(fromZ, toZ, endOverrun);
  const middle = (z0 + z1) / 2;
  // Where a lake takes over, the far land stops where the lake's shore begins.
  const landEnd = endOverrun === 0 ? z1 + LAKE.pebbleDepth : z1;
  const farX = FAR_EDGE_X + (embankment ? KERB_WIDTH : 0);
  const farBank = plane(FAR_LAND_WIDTH, z0 - landEnd, farBankColor);
  farBank.position.set(farX + FAR_LAND_WIDTH / 2, 0, (z0 + landEnd) / 2);
  const water = createWaterMesh(RIVER_WIDTH, z0 - z1);
  water.position.set(RIVER_X, WATER_Y, middle);
  scene.add(farBank, water);
}
