import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../../engine/collide';
import { CAMPFIRE } from '../campfire';
import { HOUSE_CLEARANCE, nearBox } from '../houses';
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

describe('CITY houses', () => {
  const houses = CITY.shacks.filter((s) => s.look === 'house');
  const gates = [CITY.barricadeZ, ...CITY.waves.map((w) => w.gateZ)];

  it('has two houses in each Night 1 zone, single storey, depth 2 and 3 or 4 wide', () => {
    expect(houses).toHaveLength(6);
    CITY.waves.forEach((w) => {
      expect(houses.filter((h) => h.z < w.z && h.z > w.gateZ)).toHaveLength(2);
    });
    for (const h of houses) {
      expect(h.depth).toBe(2);
      expect([3, 4]).toContain(h.width);
      expect(h.x).toBeCloseTo(-13.74);
    }
  });

  it('keeps every house 8 m from a barricade or gate and off the road and the street lamps', () => {
    for (const h of houses) {
      const b = shackBounds(h);
      for (const g of gates) {
        expect(Math.min(Math.abs(b.minZ - g), Math.abs(b.maxZ - g))).toBeGreaterThanOrEqual(8);
      }
      expect(b.minX).toBeGreaterThan(CITY.landX);
      expect(b.maxX).toBeLessThan(-8.5 - 1);
    }
  });

  it('keeps scenery and wave cover spots clear of every house', () => {
    const boxes = houses.map(shackBounds);
    expect(CITY.props.filter((p) => nearBox(boxes, p.x, p.z, HOUSE_CLEARANCE - 0.01))).toEqual([]);
    const spots = CITY.waves.flatMap((w) => w.ambushes).filter((a) => a.at !== undefined);
    expect(spots.filter((a) => nearBox(boxes, a.x ?? 0, a.at ?? 0, 3))).toEqual([]);
  });

  it('holds 1 or 2 ammo boxes in each house, all on the floor 1 m+ inside the walls', () => {
    const boxes = houses.map(shackBounds);
    for (const h of houses) {
      const b = shackBounds(h);
      const mine = (CITY.housePickups ?? []).filter(
        (p) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ,
      );
      const ammo = mine.filter((p) => p.kind === 'ammo').length;
      expect(ammo).toBeGreaterThanOrEqual(1);
      expect(ammo).toBeLessThanOrEqual(2);
      for (const p of mine) {
        expect(Math.min(p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z)).toBeGreaterThan(1);
      }
    }
    expect((CITY.housePickups ?? []).every((p) => nearBox(boxes, p.x, p.z, 0))).toBe(true);
    expect((CITY.housePickups ?? []).filter((p) => p.kind === 'battery')).toHaveLength(1);
    const ids = (CITY.housePickups ?? []).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lies 1 sleeper in each house (2 in the widest), inside it, on top of nothing', () => {
    const sleepers = CITY.waves.flatMap((w) => w.sleepers ?? []);
    expect(sleepers.every((s) => s.lying)).toBe(true);
    for (const h of houses) {
      const b = shackBounds(h);
      const n = sleepers.filter(
        (s) => s.x > b.minX && s.x < b.maxX && s.z > b.minZ && s.z < b.maxZ,
      );
      expect(n).toHaveLength(h.width === 4 ? 2 : 1);
    }
    expect(sleepers).toHaveLength(9);
  });
});
