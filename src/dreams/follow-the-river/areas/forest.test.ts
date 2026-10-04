import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../../engine/collide';
import { EDGE_X, LAKE, RIVER_X, shoreY } from '../river';
import { shackBounds, shackColliders } from '../shack';
import { lakeDepth, lakeEdgeZ } from '../shore-shape';
import { FOREST } from './forest';

const inside = (
  x: number,
  z: number,
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

const LAKE_Z = FOREST.lake?.z ?? 0;
const count = (kind: string): number => FOREST.pickups.filter((p) => p.kind === kind).length;

describe('FOREST', () => {
  it('is chapter 3 with the dam across the lake as its safe prop and a nearer night fog', () => {
    expect(FOREST.chapter).toBe(3);
    expect(FOREST.arrival.length).toBe(2);
    expect(FOREST.safeProp).toEqual({ prop: 'dam', x: RIVER_X, z: -440, yaw: 0 });
    expect(FOREST.nightFog).toBe(45);
  });

  it('has unique pickups, exactly one tape (Tape 3) inside the cabin', () => {
    const ids = FOREST.pickups.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const tapes = FOREST.pickups.filter((p) => p.kind === 'tape');
    expect(tapes).toHaveLength(1);
    expect(tapes[0].tape).toBe(3);
    expect(FOREST.shacks.some((s) => inside(tapes[0].x, tapes[0].z, shackBounds(s)))).toBe(true);
  });

  it('keeps every spot on the walkable strip', () => {
    for (const s of [FOREST.daySpawn, FOREST.waitSpot, FOREST.nightStart]) {
      expect(s.x).toBeGreaterThan(FOREST.landX);
      expect(s.x).toBeLessThan(EDGE_X);
    }
    expect(FOREST.daySpawn.z).toBeGreaterThan(FOREST.barricadeZ);
    expect(FOREST.waitSpot.z).toBeGreaterThan(FOREST.barricadeZ);
    expect(FOREST.nightStart.z).toBeLessThan(FOREST.barricadeZ);
    expect(FOREST.safeZ).toBeGreaterThan(FOREST.endZ);
  });

  it('has a reachable ending spot on the land side, a few metres before the shore', () => {
    const e = FOREST.endingAt;
    expect(e).toBeDefined();
    if (!e) return;
    expect(e.x - e.radius).toBeGreaterThan(FOREST.landX);
    expect(e.x + e.radius).toBeLessThan(EDGE_X);
    expect(e.z).toBeGreaterThan(FOREST.endZ);
    expect(e.z - LAKE_Z).toBeGreaterThan(5);
    expect(e.z - LAKE_Z).toBeLessThan(15);
    const solids = FOREST.props.filter((p) => p.collide);
    expect(solids.some((p) => Math.hypot(p.x - e.x, p.z - e.z) < 1)).toBe(false);
    const walls = FOREST.shacks.flatMap(shackColliders);
    const pushed = resolveCircle(e.x, e.z, 0.3, walls);
    expect(Math.hypot(pushed.x - e.x, pushed.z - e.z)).toBeLessThan(1e-6);
  });

  it('ends the strip just before the water, so nobody can walk in', () => {
    expect(FOREST.lake).toBeDefined();
    expect(FOREST.endZ).toBeGreaterThan(LAKE_Z);
    expect(FOREST.endZ - LAKE_Z).toBeLessThanOrEqual(2);
  });

  it('puts Mom on the pebbles ahead of the ending spot, on land, with the canoe beside her', () => {
    const e = FOREST.endingAt;
    const m = FOREST.meetAt;
    expect(e && m).toBeTruthy();
    if (!e || !m) return;
    expect(m.z).toBeLessThan(LAKE_Z + LAKE.pebbleDepth); // on the pebble band
    expect(m.z).toBeGreaterThan(FOREST.endZ - 1); // not in the end wall or the water
    expect(m.x).toBeGreaterThan(LAKE.west);
    expect(m.x).toBeLessThan(EDGE_X); // west of the river mouth
    expect(Math.hypot(m.x - e.x, m.z - e.z)).toBeGreaterThan(4);
    expect(Math.hypot(m.x - e.x, m.z - e.z)).toBeLessThan(7);
    const canoe = FOREST.props.find((p) => p.model === 'canoe' && p.z < LAKE_Z + LAKE.pebbleDepth);
    expect(canoe).toBeDefined();
    expect(Math.hypot((canoe?.x ?? 0) - m.x, (canoe?.z ?? 0) - m.z)).toBeLessThan(4);
  });

  it('shows the dam across the lake, well past the shore and not collidable', () => {
    const dam = FOREST.safeProp;
    expect(dam).toBeDefined();
    // The dam is 10 m thick, centred on its z: its near face is at z + 5.
    expect((dam?.z ?? 0) + 5).toBeLessThan(LAKE_Z - 30);
    expect(FOREST.props.some((p) => p.collide && p.z < LAKE_Z)).toBe(false);
  });

  it('sets the shore rocks on the wandering waterline, sunk a little into the slope', () => {
    const rocks = FOREST.props.filter(
      (p) => p.model.startsWith('rock_large') && p.z < LAKE_Z + 6 && p.z > LAKE_Z - 13,
    );
    expect(rocks.length).toBeGreaterThan(5);
    for (const r of rocks) {
      expect(r.y).toBeCloseTo(shoreY(r.z - lakeEdgeZ(r.x, LAKE_Z)) - 0.1, 6);
      expect(r.z).toBeGreaterThan(lakeEdgeZ(r.x, LAKE_Z)); // on the land side of the water
    }
  });

  it('keeps every prop out of the lake outline (none in the water or the river mouth)', () => {
    const frame = { z: LAKE_Z, west: LAKE.west, east: LAKE.east };
    const wet = FOREST.props.filter((p) => lakeDepth(p.x, p.z, frame) > 0);
    expect(wet).toEqual([]);
  });

  it('places day pickups and lurkers before the barricade, not inside cabin walls', () => {
    const walls = FOREST.shacks.flatMap(shackColliders);
    for (const p of [...FOREST.pickups, ...FOREST.lurkers]) {
      expect(p.z).toBeGreaterThan(FOREST.barricadeZ);
      expect(p.x).toBeGreaterThan(FOREST.landX);
      expect(p.x).toBeLessThan(EDGE_X - 0.2);
      const pushed = resolveCircle(p.x, p.z, 0.3, walls);
      expect(Math.hypot(pushed.x - p.x, pushed.z - p.z)).toBeLessThan(1e-6);
    }
  });

  it('references the real cabin from its ambush scare', () => {
    const ids = new Set(FOREST.shacks.map((s) => s.id));
    const ambushes = FOREST.scares.flatMap((s) => (s.kind === 'ambush' ? [s.shack] : []));
    expect(ambushes.length).toBeGreaterThan(0);
    expect(ambushes.every((id) => ids.has(id))).toBe(true);
  });

  it('grows no trees or bushes inside the cabin', () => {
    const cabin = shackBounds(FOREST.shacks[0]);
    expect(FOREST.props.filter((p) => inside(p.x, p.z, cabin))).toEqual([]);
  });

  it('keeps solid props off the river and pickups clear of them', () => {
    const solids = FOREST.props.filter((p) => p.collide);
    expect(solids.every((p) => p.x <= EDGE_X - 0.2)).toBe(true);
    const tooClose = FOREST.pickups.filter((k) =>
      solids.some((p) => Math.hypot(p.x - k.x, p.z - k.z) < 1),
    );
    expect(tooClose).toEqual([]);
  });

  it('has the required pickups and a few lurkers', () => {
    for (const k of ['fishPack', 'battery', 'ammo', 'arrows']) expect(count(k)).toBe(2);
    expect(FOREST.lurkers.filter((l) => !l.lying).length).toBeGreaterThanOrEqual(3);
  });
});
