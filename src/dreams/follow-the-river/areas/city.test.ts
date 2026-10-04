import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../../engine/collide';
import { CAMPFIRE } from '../campfire';
import { EDGE_X } from '../river';
import { shackBounds, shackColliders } from '../shack';
import { CITY } from './city';

const inside = (
  x: number,
  z: number,
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

describe('CITY', () => {
  it('is chapter 1 with arrival pages and the boathouse at the safe spot', () => {
    expect(CITY.chapter).toBe(1);
    expect(CITY.arrival.length).toBeGreaterThan(0);
    expect(CITY.safeProp).toEqual({ prop: 'boathouse', x: 0, z: CITY.safeZ - 2, yaw: 0 });
  });

  it('has unique pickup ids and exactly one tape', () => {
    const ids = CITY.pickups.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CITY.pickups.filter((p) => p.kind === 'tape')).toHaveLength(1);
  });

  it('keeps every spot on the walkable strip', () => {
    for (const s of [CITY.daySpawn, CITY.waitSpot, CITY.nightStart]) {
      expect(s.x).toBeGreaterThan(CITY.landX);
      expect(s.x).toBeLessThan(EDGE_X);
    }
    expect(CITY.daySpawn.z).toBeGreaterThan(CITY.barricadeZ);
    expect(CITY.waitSpot.z).toBeGreaterThan(CITY.barricadeZ);
    expect(CITY.nightStart.z).toBeLessThan(CITY.barricadeZ);
    expect(CITY.safeZ).toBeGreaterThan(CITY.endZ);
  });

  it('lights the campfire (the wait spot) clear of the throwing edge, with room to pass', () => {
    expect(EDGE_X - CITY.waitSpot.x).toBeGreaterThan(1);
    expect(EDGE_X - (CITY.waitSpot.x + CAMPFIRE.solid / 2)).toBeGreaterThan(1);
  });

  it('places day pickups and lurkers before the barricade, not inside shack walls', () => {
    const walls = CITY.shacks.flatMap(shackColliders);
    for (const p of [...CITY.pickups, ...CITY.lurkers]) {
      expect(p.z).toBeGreaterThan(CITY.barricadeZ);
      const pushed = resolveCircle(p.x, p.z, 0.3, walls);
      expect(Math.hypot(pushed.x - p.x, pushed.z - p.z)).toBeLessThan(1e-6);
    }
  });

  it('puts every shack pickup inside its shack', () => {
    const shackPickups = CITY.pickups.filter((p) => p.id !== 'battery-2' && p.id !== 'arrows-3');
    for (const p of shackPickups) {
      expect(CITY.shacks.some((s) => inside(p.x, p.z, shackBounds(s)))).toBe(true);
    }
  });

  it('references real shacks from its ambush scares', () => {
    const ids = new Set(CITY.shacks.map((s) => s.id));
    const ambushShacks = CITY.scares.flatMap((s) => (s.kind === 'ambush' ? [s.shack] : []));
    expect(ambushShacks.length).toBeGreaterThan(0);
    expect(ambushShacks.every((id) => ids.has(id))).toBe(true);
  });

  it('keeps solid props off the river and pickups clear of them', () => {
    const solids = CITY.props.filter((p) => p.collide);
    expect(solids.every((p) => p.x <= EDGE_X - 0.2)).toBe(true);
    const tooClose = CITY.pickups.filter((k) =>
      solids.some((p) => Math.hypot(p.x - k.x, p.z - k.z) < 1),
    );
    expect(tooClose).toEqual([]);
  });
});
