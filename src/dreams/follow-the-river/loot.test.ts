import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import { HOUSE_CLEARANCE, nearBox } from './houses';
import {
  isLoose,
  LOOT_LAND_MARGIN,
  LOOT_PROP_CLEARANCE,
  LOOT_RIVER_MARGIN,
  lootSpot,
  spreadPickups,
} from './loot';
import { EDGE_X } from './river';
import { shackBounds } from './shack';
import { edgePickups } from './waves';

const CENTRE_BAND = 1.5;
const MAX_CENTRED = 0.4;

describe.each([CITY, SUBURBS, FOREST])('loose loot in $id', (area) => {
  const lo = area.landX + LOOT_LAND_MARGIN;
  const hi = EDGE_X - LOOT_RIVER_MARGIN;
  const houses = area.shacks.map(shackBounds);
  const solids = area.props.filter((p) => p.collide);
  const loose = [...spreadPickups(area).filter((p) => isLoose(area, p)), ...edgePickups(area)];

  it('has loose pickups', () => expect(loose.length).toBeGreaterThanOrEqual(5));

  it('lies in the band, outside every house and solid prop', () => {
    const bad = loose.filter(
      (p) =>
        p.x < lo ||
        p.x > hi ||
        nearBox(houses, p.x, p.z, HOUSE_CLEARANCE) ||
        solids.some((q) => Math.hypot(p.x - q.x, p.z - q.z) <= LOOT_PROP_CLEARANCE),
    );
    expect(bad.map((p) => p.id)).toEqual([]);
  });

  it('is spread, not centred and not parked on an edge', () => {
    const mid = (lo + hi) / 2;
    const centred = loose.filter((p) => Math.abs(p.x - mid) < CENTRE_BAND).length;
    expect(centred / loose.length).toBeLessThanOrEqual(MAX_CENTRED);
    const xs = loose.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan((hi - lo) / 2);
  });

  it('is deterministic and leaves house pickups where they were', () => {
    expect(spreadPickups(area)).toEqual(spreadPickups(area));
    expect(lootSpot(area, 'x', -20)).toEqual(lootSpot(area, 'x', -20));
    for (const p of area.pickups.filter((q) => !isLoose(area, q)))
      expect(spreadPickups(area)).toContainEqual(p);
  });
});
