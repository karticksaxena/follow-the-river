import { describe, expect, it } from 'vitest';
import { ANATOMY } from './dras-anatomy';
import { HAND_REACH, reachPoint } from './farewell-reach';
import { shoreY } from './river';

const LAKE_Z = -392;
const ground = (z: number): number => shoreY(z - LAKE_Z);
const at = { noseX: 1.5, noseZ: LAKE_Z + 6.5 };
const side = at.noseX - ANATOMY.halfWidth - 0.8; // beside her, on her -x flank
const works = (x: number, z: number): boolean => reachPoint(at, x, z, ground) !== null;

describe('the hand reach', () => {
  it('works beside her head, her middle and her back (land side)', () => {
    expect(works(side, at.noseZ - 0.3)).toBe(true);
    expect(works(side, at.noseZ + 0.8)).toBe(true); // just past her nose, by her face
    expect(works(side, at.noseZ - ANATOMY.halfLength)).toBe(true);
    expect(works(side, at.noseZ - 4.3)).toBe(true); // by her back, still on the land
  });

  it('does not work 4 m away, or standing in the water', () => {
    expect(works(at.noseX - 4, at.noseZ - 3)).toBe(false);
    expect(works(side, at.noseZ + HAND_REACH + ANATOMY.halfWidth + 1)).toBe(false);
    expect(works(side, LAKE_Z - 2)).toBe(false); // in the lake, by her tail
    expect(works(side, LAKE_Z + 0.5)).toBe(false); // the wet slope
  });
});
