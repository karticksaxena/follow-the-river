import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../../engine/collide';
import { EDGE_X } from '../river';
import { shackBounds, shackColliders } from '../shack';
import { FOREST } from './forest';

const inside = (
  x: number,
  z: number,
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

const damSpan = (z: number): boolean => z < (FOREST.safeProp?.z ?? 0) + 6;
const count = (kind: string): number => FOREST.pickups.filter((p) => p.kind === kind).length;

describe('FOREST', () => {
  it('is chapter 3 with the dam as its safe prop and a nearer night fog', () => {
    expect(FOREST.chapter).toBe(3);
    expect(FOREST.arrival.length).toBe(2);
    expect(FOREST.safeProp).toEqual({ prop: 'dam', x: 10, z: -396, yaw: 0 });
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

  it('has a reachable ending spot on the strip, in front of the dam', () => {
    const e = FOREST.endingAt;
    expect(e).toBeDefined();
    if (!e) return;
    expect(e.x - e.radius).toBeGreaterThan(FOREST.landX);
    expect(e.x + e.radius).toBeLessThan(EDGE_X);
    expect(e.z).toBeGreaterThan(FOREST.endZ);
    const solids = FOREST.props.filter((p) => p.collide);
    expect(solids.some((p) => Math.hypot(p.x - e.x, p.z - e.z) < 1)).toBe(false);
    const walls = FOREST.shacks.flatMap(shackColliders);
    const pushed = resolveCircle(e.x, e.z, 0.3, walls);
    expect(Math.hypot(pushed.x - e.x, pushed.z - e.z)).toBeLessThan(1e-6);
  });

  it('ends the strip at the dam: the end wall sits behind its near face', () => {
    const dam = FOREST.safeProp;
    expect(dam).toBeDefined();
    // The dam is 10 m thick, centred on its z: its near face is at z + 5.
    expect(FOREST.endZ).toBeLessThanOrEqual((dam?.z ?? 0) + 5);
    expect(FOREST.endZ).toBeGreaterThan((dam?.z ?? 0) - 5);
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

  it('keeps solid props off the river (the dam aside) and pickups clear of them', () => {
    const solids = FOREST.props.filter((p) => p.collide);
    expect(solids.every((p) => p.x <= EDGE_X - 0.2 || damSpan(p.z))).toBe(true);
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
