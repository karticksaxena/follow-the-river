import * as THREE from 'three/webgpu';
import { type Bend, noBend, rowsFor, SHORE } from './shore-shape';
import { createWaterMesh } from './water';

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
  mesh.receiveShadow = true;
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
  /** The shore terrain runs this far (m) west and east past the nominal shores, into the fog. */
  landMargin: 60,
  /** Flat pebbles this far (m) onto the land, then the shore slopes down to the water. */
  pebbleDepth: 6,
  /** The slope starts this far (m) past the water line and falls to WATER_Y right at it. */
  slopeStart: 4,
  /** The sloped shore runs on this far (m) under the water. */
  slopeRun: 4,
} as const;
export const PEBBLE_COLOR = 0x5a5348;

/**
 * Pure: the lake's planes. The water is one rectangle; the shore terrain (lake.ts) is a height
 * field on either side of the river mouth that follows the wandering outline (shore-shape.ts).
 * Nothing overlaps.
 */
export function lakeRects(z: number): Record<'water' | 'shoreWest' | 'shoreEast', Rect> {
  const far = z - OVERRUN;
  const band = z + LAKE.pebbleDepth;
  const wide = SHORE.sideAmp + 2; // the water reaches past the wandering side shores
  return {
    // The lake's water starts where the river mouth's flare starts, so it can fill the flare.
    water: { x0: LAKE.west - wide, x1: LAKE.east + wide, z0: z + SHORE.mouthRadius, z1: far },
    shoreWest: { x0: LAKE.west - LAKE.landMargin, x1: EDGE_X, z0: band, z1: far },
    shoreEast: { x0: FAR_EDGE_X, x1: LAKE.east + LAKE.landMargin, z0: band, z1: far },
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

/** Pure: the shore's height `dz` m north (+) of the water line: level, then sloping to WATER_Y at 0. */
export function shoreY(dz: number): number {
  return dz >= LAKE.slopeStart ? 0 : (WATER_Y * (LAKE.slopeStart - dz)) / LAKE.slopeStart;
}

/** Shifts a flat plane's rows sideways by `bend(z)`; the plane is centred on `centreZ`. */
export function bendPlane(geo: THREE.BufferGeometry, centreZ: number, bend: Bend): void {
  const p = geo.attributes.position;
  // The mesh lies flat (rotation.x = -PI/2): local y runs to world -z.
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + bend(centreZ - p.getY(i)));
}

/** A ground plane `width` by `depth` centred at (x, y, z) whose rows follow the river's bend. */
export function bentPlane(
  [width, depth]: readonly [number, number],
  color: number,
  [x, y, z]: readonly [number, number, number],
  bend: Bend,
): THREE.Mesh {
  const mesh = plane(width, depth, color);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.PlaneGeometry(width, depth, 1, rowsFor(depth));
  bendPlane(mesh.geometry, z, bend);
  mesh.position.set(x, y, z);
  return mesh;
}

export interface RiverOptions {
  /** Land colour beyond the far bank. */
  farBankColor?: number;
  /** How far the river runs past `toZ`: 0 where a lake takes over. */
  endOverrun?: number;
  /** True where the banks are city embankments: the far land starts past the far kerb. */
  embankment?: boolean;
  /** The river's sideways shift past the walkable ends (shore-shape `bendFor`). */
  bend?: Bend;
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
  const { farBankColor = 0x24271f, endOverrun = OVERRUN, embankment = false, bend = noBend } = o;
  const { z0, z1 } = riverSpan(fromZ, toZ, endOverrun);
  // Where a lake takes over, the far land stops where the lake's shore begins.
  const landEnd = endOverrun === 0 ? z1 + LAKE.pebbleDepth : z1;
  const farX = FAR_EDGE_X + (embankment ? KERB_WIDTH : 0);
  const farBank = bentPlane(
    [FAR_LAND_WIDTH, z0 - landEnd],
    farBankColor,
    [farX + FAR_LAND_WIDTH / 2, 0, (z0 + landEnd) / 2],
    bend,
  );
  // At a lake the river's water ends where the lake's begins: at the top of the mouth's flare.
  const wz1 = endOverrun === 0 ? z1 + SHORE.mouthRadius : z1;
  const wmiddle = (z0 + wz1) / 2;
  const water = createWaterMesh(RIVER_WIDTH, z0 - wz1);
  water.geometry.dispose();
  water.geometry = new THREE.PlaneGeometry(RIVER_WIDTH, z0 - wz1, 1, rowsFor(z0 - wz1));
  bendPlane(water.geometry, wmiddle, bend);
  water.position.set(RIVER_X, WATER_Y, wmiddle);
  scene.add(farBank, water);
}
