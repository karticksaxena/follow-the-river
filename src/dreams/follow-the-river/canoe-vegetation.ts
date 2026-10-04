import type { Tier } from '../../engine/quality';
import { seeded } from './skyline';
import {
  COMMON_TREES,
  DEAD_TREES,
  GRASS,
  grassTufts,
  NEAR_RANGE,
  PEBBLES,
  PINES,
  type Plant,
  ROCKS,
  UNDERGROWTH,
} from './vegetation';

/** The canoe scene's terrain, passed in (canoe-scene.ts imports this file). */
export interface CanoeGround {
  pathX(z: number): number;
  /** The terrain mesh's own height, exactly as drawn. */
  meshY(x: number, z: number): number;
  /** The smooth terrain height (water at 0): land is above it. */
  terrainY(x: number, z: number): number;
  riverHalf: number;
}

/**
 * What stands on the banks, per 100 m of river and per side: trees within `NEAR_RANGE` of the river
 * (full meshes) and beyond it out to `FAR_TO` (thinned `-far` meshes), ferns, rocks, pebbles.
 * Trees thin out on lower tiers. Tuning knobs.
 */
const PER_100M = { near: 12, far: 22, ferns: 40, rocks: 9, pebbles: 45 } as const;
const TREE_DENSITY: Readonly<Record<Tier, number>> = { high: 1, medium: 0.8, low: 0.6 };
const FAR_TO = 95;
const TREE_FROM = 1.5;
/** Land heights (m above the water) each kind needs. */
const MIN_Y = { tree: 0.2, plant: 0.1, grass: 0.15, rock: -0.4, pebble: -0.3 } as const;
/** Trunks and rocks bite into the ground this far (m). */
const SINK = { tree: 0.15, rock: 0.2, pebble: 0.02 } as const;
const PEBBLE_BAND = 6;
const PINE_SHARE = 0.55;
const DEAD_SHARE = 0.15;
const TAU = Math.PI * 2;

type Pick = (random: () => number) => readonly [number, number];

/** A bank spot: `from..to` metres from the river's centre line, on a random side, at a random z. */
function bank(g: CanoeGround, zNear: number, zFar: number, from: number, to: number): Pick {
  return (random) => {
    const z = zNear - random() * (zNear - zFar);
    const d = from + (to - from) * random() ** 1.4;
    return [g.pathX(z) + (random() < 0.5 ? -d : d), z];
  };
}

/** Three common-tree models only: fewer meshes (draw calls). */
const CANOE_COMMON = COMMON_TREES.slice(0, 3);

const oneOf = (list: readonly string[], random: () => number): string =>
  list[Math.floor(random() * list.length)];

function treeModel(random: () => number): { model: string; scale: number } {
  const r = random();
  if (r < PINE_SHARE) return { model: oneOf(PINES, random), scale: 0.9 + random() * 0.6 };
  if (r < 1 - DEAD_SHARE)
    return { model: oneOf(CANOE_COMMON, random), scale: 0.9 + random() * 0.5 };
  return { model: oneOf(DEAD_TREES, random), scale: 0.7 + random() * 0.4 };
}

const tree =
  (far: boolean) =>
  (r: () => number): Omit<Plant, 'x' | 'z' | 'y'> & { sink: number } => {
    const { model, scale } = treeModel(r);
    return { model, yaw: r() * TAU, scale, far, sink: SINK.tree };
  };

/** Pure, deterministic: every tree, fern, rock and pebble of the river, and the grass (tier). */
export function canoePlants(zNear: number, zFar: number, tier: Tier, g: CanoeGround): Plant[] {
  const random = seeded(97);
  const per100 = (rate: number): number => Math.round(((zNear - zFar) / 100) * 2 * rate);
  const out: Plant[] = [];
  const put = (
    count: number,
    pick: Pick,
    minY: number,
    make: (random: () => number) => Omit<Plant, 'x' | 'z' | 'y'> & { sink?: number },
  ): void => {
    for (let i = 0; i < count; i++) {
      const [x, z] = pick(random);
      if (g.terrainY(x, z) < minY) continue;
      const { sink = 0, ...rest } = make(random);
      out.push({ ...rest, x, z, y: g.meshY(x, z) - sink });
    }
  };
  const dens = TREE_DENSITY[tier];
  const lo = g.riverHalf + TREE_FROM;
  const nearTo = g.riverHalf + NEAR_RANGE;
  put(
    Math.round(per100(PER_100M.near) * dens),
    bank(g, zNear, zFar, lo, nearTo),
    MIN_Y.tree,
    tree(false),
  );
  put(
    Math.round(per100(PER_100M.far) * dens),
    bank(g, zNear, zFar, nearTo, g.riverHalf + FAR_TO),
    MIN_Y.tree,
    tree(true),
  );
  put(per100(PER_100M.ferns), bank(g, zNear, zFar, g.riverHalf + 1, 30), MIN_Y.plant, (r) => ({
    model: oneOf(UNDERGROWTH, r),
    yaw: r() * TAU,
    scale: 0.8 + r() * 0.6,
  }));
  put(per100(PER_100M.rocks), bank(g, zNear, zFar, g.riverHalf - 1, 30), MIN_Y.rock, (r) => ({
    model: oneOf(ROCKS, r),
    yaw: r() * TAU,
    scale: 0.4 + r() * 0.7,
    sink: SINK.rock,
  }));
  put(
    per100(PER_100M.pebbles),
    bank(g, zNear, zFar, g.riverHalf - 0.5, g.riverHalf + PEBBLE_BAND),
    MIN_Y.pebble,
    (r) => ({
      model: oneOf(PEBBLES, r),
      yaw: r() * TAU,
      scale: 0.7 + r() * 1.1,
      sink: SINK.pebble,
    }),
  );
  return [...out, ...grass(zNear, zFar, tier, g)];
}

/** Grass on the banks as far out as the tier's fade reaches (less the last few metres). */
function grass(zNear: number, zFar: number, tier: Tier, g: CanoeGround): Plant[] {
  const reach = GRASS[tier].fade.to - 6;
  const from = g.riverHalf + 0.8;
  const count = Math.round(2 * (zNear - zFar) * reach * GRASS[tier].perM2);
  const ground = (x: number, z: number): number | null =>
    g.terrainY(x, z) < MIN_Y.grass ? null : g.meshY(x, z);
  return grassTufts(count, tier, 98, bank(g, zNear, zFar, from, from + reach), ground);
}
