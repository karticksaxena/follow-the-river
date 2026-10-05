import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../../engine/collide';
import type { Interior } from '../../../engine/interiors';
import { shackColliders, shackInterior } from '../shack';
import { aimAt, DOOR } from './route';

type Pt = { x: number; z: number };

/** A 6.5 x 8 house, walls x -17..-10.5, z -24..-16, door on the +X side at z -20. */
const house: Interior = {
  minX: -17,
  maxX: -10.5,
  minZ: -24,
  maxZ: -16,
  top: 3,
  doorX: -10.5,
  doorZ: -20,
};
const aim = (x: number, z: number, px: number, pz: number): Pt => {
  const out = { x: 0, z: 0 };
  aimAt([house], x, z, px, pz, out);
  return out;
};

describe('aimAt', () => {
  it('heads straight for the player when both are outside, or both inside', () => {
    expect(aim(-5, -20, -5, -30)).toEqual({ x: -5, z: -30 });
    expect(aim(-15, -18, -12, -22)).toEqual({ x: -12, z: -22 });
  });

  it('leaves through the door: lines up with it first, then aims just outside', () => {
    expect(aim(-16, -17, -3, -20)).toEqual({ x: house.doorX - DOOR.reach, z: house.doorZ });
    expect(aim(-12, -20.2, -3, -20)).toEqual({ x: house.doorX + DOOR.reach, z: house.doorZ });
    expect(aim(-11, -17, -3, -20).x).toBe(house.doorX + DOOR.reach);
  });

  it('enters through the door: aims just inside once lined up outside it', () => {
    expect(aim(-8, -20.1, -14, -20)).toEqual({ x: house.doorX - DOOR.reach, z: house.doorZ });
    expect(aim(-8, -26, -14, -20)).toEqual({ x: house.doorX + DOOR.reach, z: house.doorZ });
  });

  it('goes round the nearer corner from beside or behind the house', () => {
    expect(aim(-14, -30, -14, -20)).toEqual({
      x: house.doorX + DOOR.reach,
      z: house.minZ - DOOR.corner,
    });
    expect(aim(-14, -10, -14, -20).z).toBe(house.maxZ + DOOR.corner);
    expect(aim(-19, -23, -14, -20).z).toBe(house.minZ - DOOR.corner);
  });
});

const arrived = (p: Pt, to: Pt): boolean => Math.hypot(p.x - to.x, p.z - to.z) < 0.4;

describe('a zombie walking by aimAt through real shack walls', () => {
  const def = { id: 'h', x: -13.74, z: -20, width: 3, depth: 2 };
  const walls = shackColliders(def);
  const inner = [shackInterior(def)];
  const walk = (from: Pt, to: Pt): Pt => {
    let p = { ...from };
    const out = { x: 0, z: 0 };
    for (let i = 0; i < 1500; i++) {
      aimAt(inner, p.x, p.z, to.x, to.z, out);
      const d = Math.hypot(out.x - p.x, out.z - p.z) || 1;
      const step = { x: p.x + ((out.x - p.x) / d) * 0.05, z: p.z + ((out.z - p.z) / d) * 0.05 };
      p = resolveCircle(step.x, step.z, 0.35, walls);
    }
    return p;
  };

  it('gets out of a house to a player on the road', () => {
    const to = { x: -6, z: -20 };
    expect(arrived(walk({ x: -16, z: -17.5 }, to), to)).toBe(true);
  });

  it('gets into a house from the road, and from behind it', () => {
    const to = { x: -15, z: -20 };
    expect(arrived(walk({ x: -6, z: -26 }, to), to)).toBe(true);
    expect(arrived(walk({ x: -20, z: -21 }, to), to)).toBe(true);
  });
});
