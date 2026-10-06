import { describe, expect, it } from 'vitest';
import { FOREST } from './areas/forest';
import { bankProfile, bankY, waterlineX } from './banks';
import { shoreFor } from './ending-farewell';
import { EDGE_X, FAR_EDGE_X, LAKE, WATER_Y } from './river';
import {
  BEND,
  FAR_BANK,
  farBankInset,
  lakeDepth,
  lakeEdgeZ,
  mouthFlare,
  riverBend,
  rowsFor,
  rowZs,
  SHORE,
} from './shore-shape';

const LAKE_Z = FOREST.lake?.z ?? 0;
const FRAME = { z: LAKE_Z, west: LAKE.west, east: LAKE.east };
const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
};

describe('the gameplay edges are unchanged', () => {
  it('keeps the walkable edge, the natural waterline and the bank profile', () => {
    expect(EDGE_X).toBe(3);
    expect(FAR_EDGE_X).toBe(33);
    expect(waterlineX('natural')).toBeCloseTo(3.432, 3);
    expect(waterlineX('embankment')).toBe(EDGE_X);
    expect(bankProfile('natural').map((p) => [p.x, p.y])).toEqual([
      [3, 0],
      [3.12, -0.45],
      [3.32, -0.9],
      [3.6, -1.15],
      [8, -2.2],
    ]);
    expect(bankY('natural', waterlineX('natural'))).toBeCloseTo(WATER_Y, 2);
  });

  it('bends nothing between the walkable ends, at any z a player can stand', () => {
    for (const z of range(-391, 14, 1)) expect(riverBend(z, 14, -391)).toBe(0);
  });
});

describe('the lake outline', () => {
  it('is continuous and stays within its bounds', () => {
    let prev = lakeEdgeZ(-120, LAKE_Z);
    for (const x of range(-119.9, 160, 0.1)) {
      const e = lakeEdgeZ(x, LAKE_Z);
      expect(Math.abs(e - prev)).toBeLessThan(0.4);
      expect(e).toBeLessThanOrEqual(LAKE_Z);
      expect(e).toBeGreaterThanOrEqual(LAKE_Z - 2 * SHORE.nearAmp - 1e-9);
      prev = e;
    }
  });

  it('has a continuous depth field, deep inside and on land far outside', () => {
    for (const z of range(LAKE_Z + 14, LAKE_Z - 140, 2.5)) {
      let prev = lakeDepth(-120, z, FRAME);
      for (const x of range(-117, 153, 3)) {
        const d = lakeDepth(x, z, FRAME);
        expect(Math.abs(d - prev)).toBeLessThan(6);
        prev = d;
      }
    }
    expect(lakeDepth(30, LAKE_Z - 40, FRAME)).toBeGreaterThan(20);
    expect(lakeDepth(-100, LAKE_Z - 40, FRAME)).toBeLessThan(0);
    expect(lakeDepth(30, LAKE_Z + 12, FRAME)).toBeLessThan(0);
    expect(lakeDepth(30, LAKE_Z, FRAME)).toBeCloseTo(0, 6);
  });

  it('wanders: coves and points of several metres, and no straight shore', () => {
    const edges = range(-110, 150, 1).map((x) => lakeEdgeZ(x, LAKE_Z) - LAKE_Z);
    expect(Math.min(...edges)).toBeLessThan(-9);
    expect(edges.filter((e) => e < -3).length).toBeGreaterThan(40);
    expect(edges.filter((e) => e > -1).length).toBeGreaterThan(40);
  });

  it('keeps the river mouth and Mom beach dead straight', () => {
    for (const x of range(SHORE.pinFrom, SHORE.pinTo, 0.5)) {
      expect(lakeEdgeZ(x, LAKE_Z)).toBe(LAKE_Z);
      expect(lakeDepth(x, LAKE_Z - 2, FRAME)).toBeCloseTo(2, 6);
    }
  });
});

describe('Mom, the canoe and the strand point sit on the beach', () => {
  const mom = FOREST.meetAt ?? { x: 0, z: 0 };
  const canoe = FOREST.props.find((p) => p.model === 'canoe' && p.z < LAKE_Z + LAKE.pebbleDepth);
  const nose = shoreFor(mom, LAKE_Z);

  it('has the shoreline within 0.3 m of the lake z at all three', () => {
    for (const x of [mom.x, canoe?.x ?? NaN, nose.noseX]) {
      expect(Math.abs(lakeEdgeZ(x, LAKE_Z) - LAKE_Z)).toBeLessThan(0.3);
    }
  });

  it('keeps them the same few metres up the beach as before the shore moved', () => {
    expect(LAKE_Z + 4.5 - mom.z).toBeCloseTo(0, 6);
    expect(nose.noseZ - lakeEdgeZ(nose.noseX, LAKE_Z)).toBeCloseTo(6.5, 6); // 6.5 m up the beach: about 65 % of her over land
    expect(canoe?.y).toBeCloseTo(-0.0, 0);
  });

  it('lies inside the pinned beach with room to spare', () => {
    expect(mom.x).toBeGreaterThan(SHORE.pinFrom + 2);
    expect(canoe?.x ?? 0).toBeGreaterThan(SHORE.pinFrom);
  });
});

describe('the far bank wander', () => {
  it('only pushes into the river, by at most 2 x amp, and is continuous', () => {
    let prev = farBankInset(-500);
    for (const z of range(-499.9, 200, 0.2)) {
      const o = farBankInset(z);
      expect(o).toBeGreaterThanOrEqual(-1e-9);
      expect(o).toBeLessThanOrEqual(2 * FAR_BANK.amp + 1e-9);
      expect(Math.abs(o - prev)).toBeLessThan(0.3);
      prev = o;
    }
  });
});

describe('the bend', () => {
  it('turns upstream to -x and downstream to +x, never sharper than the angle', () => {
    let prev = 0;
    for (const z of range(-391 - 1, -391 - 200, -1)) {
      const b = riverBend(z, 14, -391);
      expect(b).toBeGreaterThanOrEqual(prev);
      expect(b - prev).toBeLessThanOrEqual(Math.tan((BEND.angleDeg * Math.PI) / 180) + 1e-9);
      prev = b;
    }
    expect(riverBend(14 + 150, 14, -391)).toBeLessThan(0);
    expect(riverBend(-391 - 150, 14, -391)).toBeGreaterThan(5);
  });

  it('does not bend at a lake end', () => {
    expect(riverBend(-391 - 100, 14, -391, false)).toBeCloseTo(0, 9);
  });

  it('keeps rows no taller than a lead, so the strip itself never moves', () => {
    expect(BEND.step).toBeLessThan(BEND.lead);
    expect(rowsFor(250)).toBe(25);
  });
});

describe('the river mouth is filleted', () => {
  const R = SHORE.mouthRadius;

  it('flares along a circle of the fillet radius, tangent to the bank and to the shore', () => {
    expect(R).toBeGreaterThanOrEqual(6);
    expect(R).toBeLessThanOrEqual(8);
    expect(R).toBeLessThanOrEqual(LAKE.pebbleDepth); // the strips and the terrain meet at the band
    expect(mouthFlare(LAKE_Z + R, LAKE_Z)).toBe(0);
    expect(mouthFlare(LAKE_Z + R + 50, LAKE_Z)).toBe(0);
    expect(mouthFlare(LAKE_Z, LAKE_Z)).toBe(R);
    expect(mouthFlare(LAKE_Z - 30, LAKE_Z)).toBe(R);
    for (const u of range(0.1, R - 0.1, 0.1)) {
      const s = mouthFlare(LAKE_Z + u, LAKE_Z);
      expect((R - s) ** 2 + (R - u) ** 2).toBeCloseTo(R * R, 6);
    }
    expect(mouthFlare(LAKE_Z + R - 0.1, LAKE_Z)).toBeLessThan(0.01); // no kink where it starts
  });

  it('cuts rows finely only where the flare is', () => {
    const zs = rowZs(134, LAKE_Z, 4, { near: LAKE_Z + R, step: 1 });
    expect(zs[0]).toBe(134);
    expect(zs.at(-1)).toBe(LAKE_Z);
    expect(zs).toContain(LAKE_Z + R);
    for (let i = 1; i < zs.length; i++) expect(zs[i - 1] - zs[i]).toBeLessThanOrEqual(4 + 1e-9);
    expect(zs.filter((z) => z < LAKE_Z + R).length).toBe(R);
  });

  it('keeps the fixed spots dead straight within 2 m, and clear of the flare', () => {
    const mom = FOREST.meetAt ?? { x: 0, z: 0 };
    const canoe = FOREST.props.find((p) => p.model === 'canoe' && p.z < LAKE_Z + LAKE.pebbleDepth);
    const nose = shoreFor(mom, LAKE_Z);
    for (const s of [mom.x, canoe?.x ?? NaN, nose.noseX]) {
      for (const x of range(s - 2, s + 2, 0.25)) expect(lakeEdgeZ(x, LAKE_Z)).toBe(LAKE_Z);
    }
    // The land the flare leaves reaches east of the nose and the canoe.
    expect(EDGE_X - mouthFlare(nose.noseZ, LAKE_Z)).toBeGreaterThan(nose.noseX + 0.5);
    expect(EDGE_X - mouthFlare(canoe?.z ?? 0, LAKE_Z)).toBeGreaterThan((canoe?.x ?? 0) + 0.5);
  });
});
