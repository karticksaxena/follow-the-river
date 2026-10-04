import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import { KIT_SCALE, kitUrl } from './kits';
import { EDGE_X, FAR_EDGE_X, LAKE, lakeRects, OVERRUN, riverSpan, shoreY, WATER_Y } from './river';
import { groundSpan, stripBlockers } from './world';

describe('kits', () => {
  it('keeps each kit in its own folder (their colormap.png files differ)', () => {
    expect(kitUrl('city', 'building-a')).toMatch(/assets\/kits\/city\/building-a\.glb$/);
    expect(kitUrl('cars', 'police')).toMatch(/assets\/kits\/cars\/police\.glb$/);
  });

  it('scales every kit to metres', () => {
    expect(KIT_SCALE).toEqual({ city: 10, roads: 6, cars: 1, survival: 6, suburb: 8, nature: 5 });
  });
});

describe('the lake', () => {
  it('leaves areas without a lake as before: ground and river run OVERRUN past the end', () => {
    for (const a of [CITY, SUBURBS]) {
      expect(a.lake).toBeUndefined();
      expect(groundSpan(a)).toEqual({ z0: a.startZ + OVERRUN, z1: a.endZ - OVERRUN });
      expect(riverSpan(a.startZ, a.endZ)).toEqual({ z0: a.startZ + OVERRUN, z1: a.endZ - OVERRUN });
    }
  });

  it('stops the land and the river at the shore and lays the water from there on', () => {
    const z = FOREST.lake?.z ?? 0;
    expect(groundSpan(FOREST).z1).toBe(z + LAKE.pebbleDepth); // the sloped shore takes over
    expect(riverSpan(FOREST.startZ, z, 0).z1).toBe(z);
    const r = lakeRects(z);
    expect(r.water.z0).toBe(z);
    expect(r.water.z1).toBe(z - OVERRUN);
    expect(r.water.x0).toBeLessThan(FOREST.landX - 30); // far wider than the strip
    expect(r.water.x1).toBeGreaterThan(EDGE_X + 60);
  });

  it('keeps the pebble band on the land side and clear of the river mouth', () => {
    const z = FOREST.lake?.z ?? 0;
    const r = lakeRects(z);
    for (const p of [r.pebblesWest, r.pebblesEast]) {
      expect(p.z1).toBe(z);
      expect(p.z0).toBeGreaterThan(z);
    }
    expect(r.pebblesWest.x1).toBeLessThanOrEqual(EDGE_X);
    expect(r.pebblesEast.x0).toBeGreaterThanOrEqual(FAR_EDGE_X);
    expect(r.water.x1).toBeGreaterThanOrEqual(FAR_EDGE_X + 60);
  });

  it('has no overlapping flat planes past the shore (no z-fighting)', () => {
    const r = lakeRects(-392);
    const flat = [r.water, r.flankWest, r.flankEast];
    for (const a of flat) {
      for (const b of flat) {
        if (a === b) continue;
        expect(a.x1 <= b.x0 || b.x1 <= a.x0).toBe(true);
      }
    }
  });
});

describe('the lake shore', () => {
  it('is level on land, reaches below the water at the water line and slopes down past it', () => {
    expect(shoreY(LAKE.pebbleDepth)).toBe(0);
    expect(shoreY(LAKE.slopeStart)).toBe(0);
    expect(shoreY(0)).toBe(WATER_Y);
    expect(shoreY(-LAKE.slopeRun)).toBeLessThan(WATER_Y);
  });

  it('keeps Mom (and the ending line) on level land', () => {
    const meet = FOREST.meetAt;
    expect(shoreY((meet?.z ?? 0) - (FOREST.lake?.z ?? 0))).toBe(0);
  });
});

describe('the river collider', () => {
  it('spans the whole river, EDGE_X to FAR_EDGE_X', () => {
    const [river] = stripBlockers(CITY);
    expect(river.minX).toBeCloseTo(EDGE_X);
    expect(river.maxX).toBeCloseTo(FAR_EDGE_X);
  });
});

describe('the far bank', () => {
  it('has every prop, skyline item and pine at least 1 m past the far edge', () => {
    for (const a of [CITY, SUBURBS, FOREST]) {
      for (const p of a.props.filter((q) => q.x > EDGE_X)) {
        const onLakeFlank = a.lake !== undefined && p.z < a.lake.z;
        expect(p.x >= FAR_EDGE_X + 1 || onLakeFlank, `${a.id} ${p.model} x=${p.x}`).toBe(true);
      }
    }
  });
});
