import { describe, expect, it } from 'vitest';
import type { Tier } from '../../engine/quality';
import { meshY, pathX, RIVER_HALF, TERRAIN, terrainY } from './canoe-scene';
import { canoePlants } from './canoe-vegetation';
import { NEAR_RANGE, type Plant } from './vegetation';

const GROUND = { pathX, meshY, terrainY, riverHalf: RIVER_HALF };
const Z_NEAR = TERRAIN.behind;
const Z_FAR = -600 - TERRAIN.ahead;
const plants = (tier: Tier): Plant[] => canoePlants(Z_NEAR, Z_FAR, tier, GROUND);
const grass = (t: Tier): number => plants(t).filter((p) => p.model.startsWith('Grass')).length;

describe('canoePlants', () => {
  it('stands on the terrain mesh: nothing floats, trunks and rocks bite in a little', () => {
    for (const p of plants('high')) {
      const ground = meshY(p.x, p.z);
      expect(p.y).toBeLessThanOrEqual(ground + 1e-6);
      expect(p.y).toBeGreaterThan(ground - 0.4);
    }
  });

  it('keeps trees and grass out of the water, off the river', () => {
    const dry = plants('high').filter((p) => /Tree|Pine|Grass|Fern|Plant/.test(p.model));
    expect(dry.length).toBeGreaterThan(1000);
    for (const p of dry) {
      expect(terrainY(p.x, p.z)).toBeGreaterThan(0);
      expect(Math.abs(p.x - pathX(p.z))).toBeGreaterThan(RIVER_HALF);
    }
  });

  it('makes far trees only beyond NEAR_RANGE of the river bank, near ones within', () => {
    const trees = plants('high').filter((p) => /Tree|Pine/.test(p.model));
    expect(trees.some((p) => p.far)).toBe(true);
    expect(trees.some((p) => !p.far)).toBe(true);
    for (const p of trees) {
      const d = Math.abs(p.x - pathX(p.z));
      expect(p.far === true).toBe(d > RIVER_HALF + NEAR_RANGE); // 35 m from the bank
    }
  });

  it('is mostly pines, with dead and common trees, and no red autumn foliage', () => {
    const names = plants('high').map((p) => p.model);
    expect(names.filter((m) => m.startsWith('Pine_')).length).toBeGreaterThan(
      names.filter((m) => m.startsWith('CommonTree_')).length,
    );
    expect(names.some((m) => m.startsWith('DeadTree_'))).toBe(true);
    expect(names.filter((m) => /^(Twisted|Bush)/.test(m))).toEqual([]);
  });

  it('scatters ferns, rocks and pebbles along the banks', () => {
    const names = plants('high').map((p) => p.model);
    for (const prefix of ['Fern_', 'Rock_Medium_', 'Pebble_Round_']) {
      expect(names.filter((m) => m.startsWith(prefix)).length).toBeGreaterThan(20);
    }
  });

  it('has much sparser grass on Low, sparser on Medium', () => {
    expect(grass('high')).toBeGreaterThan(grass('medium'));
    expect(grass('medium')).toBeGreaterThan(grass('low'));
    expect(grass('low')).toBeLessThan(grass('high') / 6);
  });

  it('is deterministic', () => {
    expect(plants('medium')).toEqual(plants('medium'));
  });
});
