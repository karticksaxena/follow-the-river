import { describe, expect, it } from 'vitest';
import {
  beached,
  CHIN,
  FIN_SINK,
  FINS,
  landShare,
  newStrand,
  restGaps,
  STRAND,
  strandPhases,
  strandPose,
  strandRest,
  swimming,
  UNDERSIDE,
} from './orca-strand';
import { shoreY } from './river';

const LAKE_Z = -392;
const shore = (z: number): number => shoreY(z - LAKE_Z);
const CRUISE_Y = -0.45;

describe('where she lies', () => {
  const rest = strandRest(1.5, LAKE_Z + 6.5, shore);

  it('lies up the shore facing the pebbles, nose up the slope, tail back in the lake', () => {
    expect(rest.yaw).toBeCloseTo(Math.PI);
    expect(rest.z).toBeCloseTo(LAKE_Z + 3); // her centre: 6.5 m up from the water line to her nose, minus half her length
    expect(rest.pitch).toBeGreaterThan(0); // nose up the slope
  });

  /** The underside gap at the sample `ahead` m from the centre (see UNDERSIDE). */
  const gapAt = (ahead: number): number => {
    const i = UNDERSIDE.findIndex(([a]) => a === ahead);
    return restGaps(rest, shore)[i];
  };

  it('lies ON the pebbles: nothing under the shore but her pectoral tips (they may sink a hand), something touches', () => {
    const gaps = restGaps(rest, shore);
    gaps.forEach((g, i) => {
      expect(g).toBeGreaterThanOrEqual(FINS.includes(i) ? -FIN_SINK - 0.001 : -0.001);
    });
    expect(Math.min(...gaps.filter((_, i) => !FINS.includes(i)))).toBeLessThan(0.15);
  });

  it('rests her head low (jaw within 0.5 m of the bank, nose-up under 8 degrees) and her tail on the bed (within 15 cm)', () => {
    expect(gapAt(3)).toBeLessThan(0.5);
    expect(rest.pitch).toBeLessThan((8 * Math.PI) / 180);
    expect(restGaps(rest, shore)[CHIN]).toBeLessThan(0.5);
    expect(gapAt(-3)).toBeLessThan(0.16);
  });

  it('arches over eight joints by under 4 degrees each on top of the clip (the old 0.13 rad each folded her)', () => {
    expect(STRAND.bend.bones.length).toBe(STRAND.bend.angles.length);
    for (const a of STRAND.bend.angles) expect(Math.abs(a)).toBeLessThan((4 * Math.PI) / 180);
    expect(STRAND.bend.bones).toContain('Tail2');
  });

  it('has 60-70 % of her length over land (see DRY_RISE) on the lake shore', () => {
    expect(landShare(rest, shore)).toBeGreaterThanOrEqual(0.6);
    expect(landShare(rest, shore)).toBeLessThanOrEqual(0.7);
  });

  it('is not half buried or floating on flat pebbles either', () => {
    const flat = strandRest(1.5, 3.5, () => 0);
    expect(Math.min(...restGaps(flat, () => 0))).toBeGreaterThanOrEqual(-FIN_SINK - 0.001);
    expect(flat.y).toBeGreaterThan(0.5);
    expect(flat.y).toBeLessThan(1.3);
  });
});

describe('the last leap', () => {
  const rest = strandRest(1.5, LAKE_Z + 3.5, shore);
  const from = { x: 20, y: -2.6, z: LAKE_Z + 28, yaw: 0, pitch: 0 };
  const out = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

  it('swims in at the surface where you can see her (fin up) before the leap', () => {
    const s = newStrand(from, rest, CRUISE_Y);
    const { rise, swim } = strandPhases(s);
    expect(s.swim).toBeGreaterThanOrEqual(4);
    expect(s.swim).toBeLessThanOrEqual(9);
    expect(swim - rise).toBeCloseTo(s.swim);
    for (let t = rise + 0.05; t < swim; t += 0.5) {
      s.t = t;
      strandPose(s, out);
      expect(out.y).toBeCloseTo(CRUISE_Y, 1); // at the surface the whole way
      expect(swimming(s)).toBe(true);
    }
    s.t = swim;
    expect(swimming(s)).toBe(false);
  });

  it('rises to the surface first, and swims for as long as the distance takes (4 to 9 s)', () => {
    const near = newStrand({ ...from, x: rest.x, z: LAKE_Z - 5 }, rest, CRUISE_Y);
    const far = newStrand({ ...from, z: LAKE_Z + 200 }, rest, CRUISE_Y);
    expect(near.swim).toBe(STRAND.swimMin);
    expect(far.swim).toBe(STRAND.swimMax);
    const s = newStrand(from, rest, CRUISE_Y);
    s.t = 0;
    expect(strandPose(s, out).y).toBeCloseTo(from.y);
    s.t = STRAND.rise / 2;
    const half = strandPose(s, out).y;
    expect(half).toBeGreaterThan(from.y);
    expect(half).toBeLessThan(CRUISE_Y);
  });

  it('dips, leaps, lands on its rest pose and lies there', () => {
    const s = newStrand(from, rest, CRUISE_Y);
    const { dip, leap } = strandPhases(s);
    s.t = dip;
    strandPose(s, out);
    expect(out.y).toBeLessThan(-2); // under the water at the launch
    expect(out.z).toBeCloseTo(rest.z - STRAND.launchOut);
    s.t = dip + STRAND.leap / 2;
    expect(strandPose(s, out).y).toBeGreaterThan(rest.y); // in the air
    expect(beached(s)).toBe(false);
    s.t = leap;
    strandPose(s, out);
    expect([out.x, out.z]).toEqual([rest.x, rest.z]);
    expect(beached(s)).toBe(true);
    s.t += 1;
    expect(strandPose(s, out).y).toBeCloseTo(rest.y); // she lies still: no root bob
    s.still = true;
    expect(strandPose(s, out).y).toBeCloseTo(rest.y);
  });

  it('faces the shore by the time she leaps', () => {
    const s = newStrand(from, rest, CRUISE_Y);
    s.t = strandPhases(s).dip;
    expect(Math.cos(strandPose(s, out).yaw - rest.yaw)).toBeCloseTo(1);
  });
});
