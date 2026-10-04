import { describe, expect, it } from 'vitest';
import type { Tier } from '../../engine/quality';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import { shackBounds } from './shack';
import { lakeEdgeZ } from './shore-shape';
import {
  countVariants,
  distanceTo,
  GRASS,
  isFar,
  NEAR_RANGE,
  plantsOf,
  REACH,
  scatterGrass,
  stripGrass,
  stripZone,
  SWAP_BAND,
  triangles,
  visible,
  type Kind,
} from './vegetation';

const TIERS: readonly Tier[] = ['low', 'medium', 'high'];
const flat = (): number => 0;
const slope = (x: number): number | null => (x > 8 ? null : x * 0.1);

describe('grass density per tier', () => {
  const region = { x0: 0, x1: 10, z0: 0, z1: -10 };
  const count = (tier: Tier): number => scatterGrass(region, tier, 1, flat).length;

  it('is sparser on every lower tier, much sparser on Low', () => {
    expect(count('high')).toBeGreaterThan(count('medium'));
    expect(count('medium')).toBeGreaterThan(count('low'));
    expect(count('low')).toBeLessThan(count('high') / 4);
  });

  it('matches the tier density (tufts per m²) and stays on the region', () => {
    for (const tier of TIERS) {
      const tufts = scatterGrass(region, tier, 1, flat);
      expect(tufts.length).toBe(Math.round(100 * GRASS[tier].perM2));
      for (const t of tufts) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThanOrEqual(10);
        expect(t.z).toBeLessThanOrEqual(0);
        expect(t.z).toBeGreaterThanOrEqual(-10);
        expect(t.scale).toBeGreaterThanOrEqual(GRASS[tier].scale[0]);
        expect(t.scale).toBeLessThanOrEqual(GRASS[tier].scale[1]);
      }
    }
  });

  it('fades out sooner on lower tiers', () => {
    expect(GRASS.low.fade.to).toBeLessThan(GRASS.medium.fade.to);
    expect(GRASS.medium.fade.to).toBeLessThan(GRASS.high.fade.to);
  });

  it('sits on the ground it is given and skips holes and avoided zones', () => {
    const avoid = { minX: 2, maxX: 4, minZ: -10, maxZ: 0 };
    const tufts = scatterGrass(region, 'high', 2, (x) => slope(x), [avoid]);
    expect(tufts.length).toBeGreaterThan(30);
    for (const t of tufts) {
      expect(t.y).toBeCloseTo(t.x * 0.1);
      expect(t.x).toBeLessThanOrEqual(8);
      expect(distanceTo(avoid, t.x, t.z)).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    expect(scatterGrass(region, 'medium', 5, flat)).toEqual(
      scatterGrass(region, 'medium', 5, flat),
    );
  });
});

describe('near and far trees', () => {
  const zone = stripZone(FOREST);

  it('keeps near the trees within NEAR_RANGE of the strip, thins the rest', () => {
    expect(isFar(zone, zone.minX - NEAR_RANGE + 1, -50)).toBe(false);
    expect(isFar(zone, zone.minX - NEAR_RANGE - 1, -50)).toBe(true);
    expect(isFar(zone, -10, zone.minZ - NEAR_RANGE - 1)).toBe(true);
  });

  it('costs a far tree about a quarter of a near one', () => {
    const near = triangles({ model: 'Pine_1' });
    const far = triangles({ model: 'Pine_1', far: true });
    expect(far).toBeLessThan(near / 3);
    expect(far).toBeGreaterThan(near / 6);
  });
});

describe('forest and suburbs vegetation', () => {
  it('forest is mostly pines plus dead trees; suburbs common trees plus a few dead ones', () => {
    const f = plantsOf(FOREST).map((p) => p.model);
    expect(f.filter((m) => m.startsWith('Pine_')).length).toBeGreaterThan(100);
    expect(f.filter((m) => m.startsWith('DeadTree_')).length).toBeGreaterThan(5);
    const s = plantsOf(SUBURBS).map((p) => p.model);
    expect(s.filter((m) => m.startsWith('CommonTree_')).length).toBeGreaterThan(5);
    expect(s.some((m) => m.startsWith('DeadTree_'))).toBe(true);
  });

  it('uses no red autumn foliage (TwistedTree, Bush_Common)', () => {
    for (const area of [FOREST, SUBURBS]) {
      expect(plantsOf(area).filter((p) => /^(Twisted|Bush)/.test(p.model))).toEqual([]);
    }
  });

  it('puts the lake shore rocks and pebbles on MegaKit models, none of the old slabs', () => {
    const names = FOREST.props.map((p) => p.model);
    expect(names.filter((m) => m.startsWith('Rock_Medium_')).length).toBeGreaterThan(8);
    expect(names.filter((m) => m.startsWith('Pebble_Round_')).length).toBeGreaterThan(20);
    expect(names.some((m) => m.startsWith('rock_tall'))).toBe(false);
  });

  it('has near and far trees in both areas', () => {
    for (const area of [FOREST, SUBURBS]) {
      const v = countVariants(plantsOf(area));
      expect(v.near).toBeGreaterThan(20);
      expect(v.far).toBeGreaterThan(5);
    }
  });

  it('grows grass only on natural banks, off the shacks and the lake beach', () => {
    for (const area of [FOREST, SUBURBS]) {
      const grass = stripGrass(area, 'high', area.shacks.map(shackBounds));
      expect(grass.length).toBeGreaterThan(1000);
      for (const shack of area.shacks.map(shackBounds)) {
        expect(grass.filter((g) => distanceTo(shack, g.x, g.z) === 0)).toEqual([]);
      }
    }
    expect(stripGrass({ ...FOREST, bank: 'embankment' }, 'high', [])).toEqual([]);
    const lakeZ = FOREST.lake?.z ?? 0;
    for (const g of stripGrass(FOREST, 'high', [])) {
      expect(g.z).toBeGreaterThan(lakeEdgeZ(g.x, lakeZ) + 6); // past the pebble band
    }
  });
});

describe('visible', () => {
  const show = (kind: Kind, d: number, tier: Tier = 'high', fog = 60): boolean =>
    visible(kind, d, d, tier, fog);

  it('shows near trees up close, their thinned twin farther, and both only in the swap band', () => {
    for (const tier of ['medium', 'high'] as const) {
      const swap = REACH.nearTree[tier];
      for (let d = 0; d < 150; d += 1) {
        const both = show('near', d, tier) && show('far', d, tier);
        expect(both).toBe(Math.abs(d - swap) < SWAP_BAND);
      }
      expect(show('near', swap - SWAP_BAND - 1, tier)).toBe(true);
      expect(show('far', swap - SWAP_BAND - 1, tier)).toBe(false);
      expect(show('near', swap + SWAP_BAND + 1, tier)).toBe(false);
      expect(show('far', swap + SWAP_BAND + 1, tier)).toBe(true);
    }
  });

  it('keeps a cell whose far corner is past the band: a long cell spans the swap', () => {
    expect(visible('far', 0, 100, 'high', 60)).toBe(true);
    expect(visible('near', 0, 100, 'high', 60)).toBe(true);
  });

  it('draws no near trees on Low, and thinned ones out to the fog plus a margin', () => {
    expect(show('near', 0, 'low')).toBe(false);
    expect(show('farOnly', 60 + REACH.treeMargin, 'low')).toBe(true);
    expect(show('farOnly', 60 + REACH.treeMargin + 1, 'low')).toBe(false);
    expect(show('farOnly', 500, 'high', 500)).toBe(false); // capped at treeMax
  });

  it('ends grass where its fade ends and small plants sooner on lower tiers', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(show('grass', GRASS[tier].fade.to, tier)).toBe(true);
      expect(show('grass', GRASS[tier].fade.to + 1, tier)).toBe(false);
    }
    expect(REACH.small.low).toBeLessThan(REACH.small.medium);
    expect(REACH.small.medium).toBeLessThan(REACH.small.high);
  });
});
