import { describe, expect, it } from 'vitest';
import { beached, newStrand, STRAND, strandPose, strandRest, strandRoll } from './orca-strand';

const shore = (z: number): number => (z > -392 ? Math.min(0, (z + 392) / 4 - 1) : -1);

describe('the last leap', () => {
  const rest = strandRest(1, -388.5, shore);
  const from = { x: 7, y: -2.6, z: -380, yaw: 0, pitch: 0 };

  it('comes to rest lying up the shore, nose on the pebbles, tail back in the lake', () => {
    expect(rest.yaw).toBeCloseTo(Math.PI);
    expect(rest.z).toBeCloseTo(-388.5 - 3.5);
    expect(rest.pitch).toBeGreaterThan(0); // nose up the slope
    expect(rest.y).toBeGreaterThan(shore(rest.z));
  });

  it('swims in under the water, leaps, lands on its rest pose and breathes until still', () => {
    const s = newStrand(from, rest);
    const out = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    s.t = STRAND.approach;
    strandPose(s, out);
    expect(out.y).toBeLessThan(-2); // under the water at the launch
    s.t = STRAND.approach + STRAND.leap / 2;
    expect(strandPose(s, out).y).toBeGreaterThan(rest.y); // in the air
    expect(beached(s)).toBe(false);
    s.t = STRAND.approach + STRAND.leap;
    strandPose(s, out);
    expect([out.x, out.z]).toEqual([rest.x, rest.z]);
    expect(beached(s)).toBe(true);
    s.t += 1;
    const breathing = strandPose(s, out).y;
    s.still = true;
    expect(strandPose(s, out).y).toBeCloseTo(rest.y);
    expect(breathing).not.toBeCloseTo(rest.y, 3);
    s.t += 5;
    expect(strandRoll(s)).toBeCloseTo(STRAND.roll);
  });
});
