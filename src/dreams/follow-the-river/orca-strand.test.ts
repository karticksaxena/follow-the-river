import { describe, expect, it } from 'vitest';
import {
  beached,
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
  const rest = strandRest(1.5, LAKE_Z + 3.5, shore);

  it('lies up the shore facing the pebbles, nose up the slope, tail back in the lake', () => {
    expect(rest.yaw).toBeCloseTo(Math.PI);
    expect(rest.z).toBeCloseTo(LAKE_Z);
    expect(rest.pitch).toBeGreaterThan(0); // nose up the slope (her sagging tail is what dips)
  });

  /** The underside gap at the sample `ahead` m from the centre (see UNDERSIDE). */
  const gapAt = (ahead: number): number => {
    const i = UNDERSIDE.findIndex(([a]) => a === ahead);
    return restGaps(rest, shore)[i];
  };

  it('lies ON the pebbles: nothing under the shore, her lowest point touches', () => {
    const gaps = restGaps(rest, shore);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(-0.001); // not buried (pectoral tips included)
    expect(Math.min(...gaps)).toBeLessThan(0.01); // and resting on something
  });

  it('has nose, chin, middle (pectoral tips) and tail all within 5 cm of the shore', () => {
    for (const ahead of [3.4, 3, 1.3, -3]) expect(gapAt(ahead)).toBeLessThan(0.05);
  });

  it('bends the tail down into the lake to do it (a straight body cannot)', () => {
    expect(STRAND.bend.angle).toBeGreaterThan(0.05);
    expect(STRAND.bend.bones).toContain('Tail2');
  });

  it('is not half buried or floating on flat pebbles either', () => {
    const flat = strandRest(1.5, 3.5, () => 0);
    expect(Math.min(...restGaps(flat, () => 0))).toBeGreaterThanOrEqual(-0.001);
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

  it('dips, leaps, lands on its rest pose and breathes until still', () => {
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
    const breathing = strandPose(s, out).y;
    s.still = true;
    expect(strandPose(s, out).y).toBeCloseTo(rest.y);
    expect(breathing).not.toBeCloseTo(rest.y, 3);
  });

  it('faces the shore by the time she leaps', () => {
    const s = newStrand(from, rest, CRUISE_Y);
    s.t = strandPhases(s).dip;
    expect(Math.cos(strandPose(s, out).yaw - rest.yaw)).toBeCloseTo(1);
  });
});
