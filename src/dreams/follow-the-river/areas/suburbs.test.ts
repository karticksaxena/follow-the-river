import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../../engine/collide';
import { EDGE_X } from '../river';
import { shackBounds, shackColliders } from '../shack';
import { SUBURBS } from './suburbs';

const inside = (
  x: number,
  z: number,
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

const count = (k: string): number => SUBURBS.pickups.filter((p) => p.kind === k).length;

const onStrip = (x: number): boolean => x > SUBURBS.landX && x < EDGE_X;

describe('SUBURBS', () => {
  it('is chapter 2 with arrival pages and the cabin as safe prop', () => {
    expect(SUBURBS.chapter).toBe(2);
    expect(SUBURBS.arrival).toHaveLength(2);
    expect(SUBURBS.safeProp?.prop).toBe('cabin');
    expect(SUBURBS.nightFog).toBeDefined();
  });

  it('has unique pickup ids, one tape (2) inside the barn and one gun', () => {
    const ids = SUBURBS.pickups.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const tapes = SUBURBS.pickups.filter((p) => p.kind === 'tape');
    expect(tapes).toHaveLength(1);
    expect(tapes[0].tape).toBe(2);
    const barn = SUBURBS.shacks.find((s) => s.id === 'barn');
    expect(barn && inside(tapes[0].x, tapes[0].z, shackBounds(barn))).toBe(true);
    expect(SUBURBS.pickups.filter((p) => p.kind === 'gun')).toHaveLength(1);
  });

  it('puts the gun by the crashed police car, on the road side and clear of it', () => {
    const gun = SUBURBS.pickups.find((p) => p.kind === 'gun');
    const police = SUBURBS.props.find((p) => p.model === 'police');
    expect(police?.collide).toBe(true);
    expect(gun).toBeDefined();
    const dist = Math.hypot((gun?.x ?? 0) - (police?.x ?? 0), (gun?.z ?? 0) - (police?.z ?? 0));
    expect(dist).toBeGreaterThanOrEqual(1);
    expect(dist).toBeLessThan(8);
    expect(onStrip(gun?.x ?? 99)).toBe(true);
    expect(gun?.z).toBeGreaterThan(SUBURBS.barricadeZ);
  });

  it('keeps every spot, pickup and lurker on the walkable strip', () => {
    for (const s of [SUBURBS.daySpawn, SUBURBS.waitSpot, SUBURBS.nightStart]) {
      expect(onStrip(s.x)).toBe(true);
    }
    for (const p of [...SUBURBS.pickups, ...SUBURBS.lurkers]) expect(onStrip(p.x)).toBe(true);
    expect(SUBURBS.daySpawn.z).toBeGreaterThan(SUBURBS.barricadeZ);
    expect(SUBURBS.waitSpot.z).toBeGreaterThan(SUBURBS.barricadeZ);
    expect(SUBURBS.nightStart.z).toBeLessThan(SUBURBS.barricadeZ);
    expect(SUBURBS.safeZ).toBeGreaterThan(SUBURBS.endZ);
  });

  it('puts the wait spot at the campfire, not at the throwing edge', () => {
    const fire = SUBURBS.props.find((p) => p.model === 'campfire-pit');
    expect(fire).toBeDefined();
    expect(
      Math.hypot(SUBURBS.waitSpot.x - (fire?.x ?? 0), SUBURBS.waitSpot.z - (fire?.z ?? 0)),
    ).toBeLessThan(1.5);
    expect(EDGE_X - SUBURBS.waitSpot.x).toBeGreaterThan(1);
  });

  it('places day pickups and lurkers before the barricade, not inside walls', () => {
    const walls = SUBURBS.shacks.flatMap(shackColliders);
    for (const p of [...SUBURBS.pickups, ...SUBURBS.lurkers]) {
      expect(p.z).toBeGreaterThan(SUBURBS.barricadeZ);
      const pushed = resolveCircle(p.x, p.z, 0.3, walls);
      expect(Math.hypot(pushed.x - p.x, pushed.z - p.z)).toBeLessThan(1e-6);
    }
  });

  it('has 2 fish packs, 2 batteries, 2 arrows bundles and 4-5 lurkers', () => {
    expect([count('fishPack'), count('battery'), count('arrows'), count('ammo')]).toEqual([
      2, 2, 2, 1,
    ]);
    expect(SUBURBS.lurkers.length).toBeGreaterThanOrEqual(4);
    expect(SUBURBS.lurkers.length).toBeLessThanOrEqual(5);
  });

  it('references real shacks from its ambush scares', () => {
    const ids = new Set(SUBURBS.shacks.map((s) => s.id));
    const ambushShacks = SUBURBS.scares.flatMap((s) => (s.kind === 'ambush' ? [s.shack] : []));
    expect(ambushShacks.length).toBeGreaterThan(0);
    expect(ambushShacks.every((id) => ids.has(id))).toBe(true);
  });

  it('keeps solid props off the river and pickups clear of them', () => {
    const solids = SUBURBS.props.filter((p) => p.collide);
    expect(solids.every((p) => p.x <= EDGE_X - 0.2)).toBe(true);
    const tooClose = SUBURBS.pickups.filter((k) =>
      solids.some((p) => Math.hypot(p.x - k.x, p.z - k.z) < 1),
    );
    expect(tooClose).toEqual([]);
  });
});
