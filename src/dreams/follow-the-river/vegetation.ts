import type { Box } from '../../engine/collide';
import type { Tier } from '../../engine/quality';
import type { AreaDef, PropPlacement } from './areas/types';
import { EDGE_X, LAKE } from './river';
import { lakeEdgeZ } from './shore-shape';
import { seeded } from './skyline';

/** One piece of MegaKit vegetation or rock: `model` is the GLB node name (`Pine_1`). */
export interface Plant {
  model: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** The thinned `-far` variant (trees only). */
  far?: boolean;
}

/** MegaKit models within this many metres of where the player goes get the full mesh; beyond, `-far`. */
export const NEAR_RANGE = 35;

/** Triangles per model, near / far (g6-asset-report.md). Models not listed (pebbles etc.) count `DEFAULT_TRIS`. */
const TRIS: Readonly<Record<string, readonly [number, number]>> = {
  Pine_1: [3947, 975],
  Pine_2: [3648, 890],
  Pine_3: [4964, 1235],
  Pine_4: [3370, 836],
  Pine_5: [1646, 388],
  CommonTree_1: [6265, 1565],
  CommonTree_2: [5648, 1413],
  CommonTree_3: [3505, 876],
  CommonTree_4: [4066, 1018],
  CommonTree_5: [3182, 795],
  DeadTree_1: [6169, 1535],
  DeadTree_2: [6557, 1633],
  DeadTree_3: [5802, 1436],
  Fern_1: [288, 288],
  Plant_1: [120, 120],
  Plant_7: [48, 48],
  Grass_Common_Short: [155, 155],
  Grass_Common_Tall: [326, 326],
  Grass_Wispy_Tall: [622, 622],
  Rock_Medium_1: [342, 342],
  Rock_Medium_2: [244, 244],
  Rock_Medium_3: [522, 522],
};
const DEFAULT_TRIS = 130;

export const PINES = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'] as const;
export const COMMON_TREES = [
  'CommonTree_1',
  'CommonTree_2',
  'CommonTree_3',
  'CommonTree_4',
  'CommonTree_5',
] as const;
export const DEAD_TREES = ['DeadTree_1', 'DeadTree_2', 'DeadTree_3'] as const;
export const ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'] as const;
export const PEBBLES = ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3'] as const;
export const UNDERGROWTH = ['Fern_1', 'Fern_1', 'Plant_1', 'Plant_7'] as const;
/** Grass tufts, most common first: short and tall clumps, now and then a wispy one. */
const GRASS_MODELS = [
  'Grass_Common_Short',
  'Grass_Common_Short',
  'Grass_Common_Short',
  'Grass_Common_Tall',
  'Grass_Wispy_Tall',
] as const;

/**
 * Grass per tier: tufts per m², the distance (m) it starts to sink away and where it is gone, and
 * the tuft's scale range (the models are 1.3-1.9 m: ground grass is 0.3-0.6 m). Tuning knobs.
 */
export const GRASS: Readonly<
  Record<
    Tier,
    { perM2: number; fade: { from: number; to: number }; scale: readonly [number, number] }
  >
> = {
  high: { perM2: 1.2, fade: { from: 18, to: 32 }, scale: [0.3, 0.6] },
  medium: { perM2: 0.6, fade: { from: 13, to: 24 }, scale: [0.3, 0.6] },
  low: { perM2: 0.18, fade: { from: 8, to: 16 }, scale: [0.35, 0.65] },
};

/** Pure: true for the tree models (they have `-far` variants). */
export const isTree = (model: string): boolean =>
  /^(Pine|CommonTree|TwistedTree|DeadTree)_/.test(model);

/** Pure: triangles one plant costs when drawn. */
export function triangles(p: Pick<Plant, 'model' | 'far'>): number {
  const t = TRIS[p.model];
  return t ? t[p.far ? 1 : 0] : DEFAULT_TRIS;
}

/**
 * Pure: the triangles drawn with the camera at (cx, cz) and everything within `radius` metres
 * in view (an upper bound: no frustum cull; grass past its tier's fade is gone).
 */
export function drawnTriangles(
  plants: readonly Plant[],
  cx: number,
  cz: number,
  radius: number,
  tier: Tier,
): number {
  let sum = 0;
  const fadeTo = GRASS[tier].fade.to;
  for (const p of plants) {
    const d = Math.hypot(p.x - cx, p.z - cz);
    const reach = p.model.startsWith('Grass') ? Math.min(radius, fadeTo) : radius;
    if (d <= reach) sum += triangles(p);
  }
  return sum;
}

/** Pure: how many plants of a placement list are far variants / near ones. */
export function countVariants(plants: readonly Plant[]): { near: number; far: number } {
  const far = plants.filter((p) => p.far).length;
  return { near: plants.length - far, far };
}

/** A rectangle on the ground. */
export type Zone = Box;

/** Pure: how far (m) (x, z) is from the zone (0 inside it). */
export function distanceTo(zone: Zone, x: number, z: number): number {
  return Math.hypot(
    Math.max(zone.minX - x, 0, x - zone.maxX),
    Math.max(zone.minZ - z, 0, z - zone.maxZ),
  );
}

/** Pure: true when a MegaKit tree at (x, z) is beyond `NEAR_RANGE` of the walkable strip. */
export function isFar(zone: Zone, x: number, z: number): boolean {
  return distanceTo(zone, x, z) > NEAR_RANGE;
}

/** The walkable strip of an area as a zone. */
export function stripZone(area: Pick<AreaDef, 'landX' | 'startZ' | 'endZ'>): Zone {
  return { minX: area.landX, maxX: EDGE_X, minZ: area.endZ, maxZ: area.startZ };
}

/** MegaKit props of an area's placement list as plants on the flat ground (y from the placement). */
export function plantsOf(area: AreaDef): Plant[] {
  const zone = stripZone(area);
  return area.props
    .filter((p: PropPlacement) => p.kit === 'megakit')
    .map((p) => ({
      model: p.model,
      x: p.x,
      y: p.y ?? 0,
      z: p.z,
      yaw: p.yaw ?? 0,
      scale: p.scale ?? 1,
      far: isTree(p.model) && isFar(zone, p.x, p.z),
    }));
}

/**
 * Pure: `count` grass tufts at `pick(random)` = [x, z], on `groundY(x, z)` (null: skip that tuft),
 * off the `avoid` zones. Deterministic for a seed.
 */
export function grassTufts(
  count: number,
  tier: Tier,
  seed: number,
  pick: (random: () => number) => readonly [number, number],
  groundY: (x: number, z: number) => number | null,
  avoid: readonly Zone[] = [],
): Plant[] {
  const { scale } = GRASS[tier];
  const random = seeded(seed);
  const out: Plant[] = [];
  for (let i = 0; i < count; i++) {
    const [x, z] = pick(random);
    const y = groundY(x, z);
    const model = GRASS_MODELS[Math.floor(random() * GRASS_MODELS.length)] ?? 'Grass_Common_Short';
    const s = scale[0] + (scale[1] - scale[0]) * random();
    const yaw = random() * Math.PI * 2;
    if (y === null || avoid.some((a) => distanceTo(a, x, z) === 0)) continue;
    out.push({ model, x, y, z, yaw, scale: s });
  }
  return out;
}

/** Grass over a rectangle (z0 near, z1 far) at the tier's density. */
export function scatterGrass(
  region: { x0: number; x1: number; z0: number; z1: number },
  tier: Tier,
  seed: number,
  groundY: (x: number, z: number) => number | null,
  avoid: readonly Zone[] = [],
): Plant[] {
  const dx = region.x1 - region.x0;
  const dz = region.z0 - region.z1;
  const count = Math.round(Math.abs(dx * dz) * GRASS[tier].perM2);
  const pick = (r: () => number): [number, number] => [region.x0 + r() * dx, region.z0 - r() * dz];
  return grassTufts(count, tier, seed, pick, groundY, avoid);
}

/** Metres either side of a road tile (6 m wide) and around a shack, kept free of grass. */
const ROAD_HALF = 3.6;
const SHACK_MARGIN = 0.6;
/** Grass starts this far (m) past the lake's pebble band, and 0.5 m inside the river bank. */
const BEACH_GAP = 2;
const BANK_GAP = 0.5;
/** Grass reaches this far (m) west of the strip's land wall: past it the trees stand. */
const LAND_REACH = 9;

/** Zones grass keeps off: road tiles and the shacks' footprints. */
export function grassAvoid(
  area: Pick<AreaDef, 'props' | 'shacks'>,
  shacks: readonly Zone[],
): Zone[] {
  const roads = area.props
    .filter((p) => p.kit === 'roads')
    .map((p) => ({
      minX: p.x - ROAD_HALF,
      maxX: p.x + ROAD_HALF,
      minZ: p.z - ROAD_HALF,
      maxZ: p.z + ROAD_HALF,
    }));
  const pads = shacks.map((b) => ({
    minX: b.minX - SHACK_MARGIN,
    maxX: b.maxX + SHACK_MARGIN,
    minZ: b.minZ - SHACK_MARGIN,
    maxZ: b.maxZ + SHACK_MARGIN,
  }));
  return [...roads, ...pads];
}

/**
 * Grass over an area's walkable strip and the land behind it (y 0, flat), none on city
 * embankments; at a lake it stops short of the wandering beach. `shacks` are their footprints.
 */
export function stripGrass(
  area: Pick<AreaDef, 'bank' | 'landX' | 'startZ' | 'endZ' | 'lake' | 'props' | 'shacks'>,
  tier: Tier,
  shacks: readonly Zone[],
): Plant[] {
  if (area.bank !== 'natural') return [];
  const lakeZ = area.lake?.z;
  const beach = (x: number): number =>
    lakeZ === undefined ? -Infinity : lakeEdgeZ(x, lakeZ) + LAKE.pebbleDepth + BEACH_GAP;
  const region = {
    x0: area.landX - LAND_REACH,
    x1: EDGE_X - BANK_GAP,
    z0: area.startZ,
    z1: area.endZ,
  };
  return scatterGrass(
    region,
    tier,
    71,
    (x, z) => (z > beach(x) ? 0 : null),
    grassAvoid(area, shacks),
  );
}
