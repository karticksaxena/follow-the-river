import { describe, expect, it } from 'vitest';
import { segmentHitsBox, type Box } from '../../engine/collide';
import { PLAYER_RADIUS } from '../../engine/player';
import { footprint, FURNITURE, furnitureColliders, ROOM_INSIDE } from './intro-room';
import { AT, MOM_PATH, ROOM_COLLIDERS, ROOM_X } from './intro-scene';

const grow = (b: Box, r: number): Box => ({
  minX: b.minX - r,
  maxX: b.maxX + r,
  minZ: b.minZ - r,
  maxZ: b.maxZ + r,
});
const overlaps = (a: Box, b: Box): boolean =>
  a.minX < b.maxX - 1e-6 &&
  a.maxX > b.minX + 1e-6 &&
  a.minZ < b.maxZ - 1e-6 &&
  a.maxZ > b.minZ + 1e-6;
const onFloor = FURNITURE.filter((p) => p.y === 0);
const solid = furnitureColliders(0);

describe('the intro living room furniture', () => {
  it('stands inside the room', () => {
    for (const p of FURNITURE) {
      const b = footprint(p);
      expect(b.minX).toBeGreaterThanOrEqual(ROOM_INSIDE.minX);
      expect(b.maxX).toBeLessThanOrEqual(ROOM_INSIDE.maxX);
      expect(b.minZ).toBeGreaterThanOrEqual(ROOM_INSIDE.minZ);
      expect(b.maxZ).toBeLessThanOrEqual(ROOM_INSIDE.maxZ);
    }
  });

  it('keeps solid pieces off each other, the couch and the TV (rugs and table-tops aside)', () => {
    const fixed = ROOM_COLLIDERS.map((b) => ({
      ...b,
      minX: b.minX - ROOM_X,
      maxX: b.maxX - ROOM_X,
    }));
    const pieces = onFloor.filter((p) => p.solid).map(footprint);
    pieces.forEach((a, i) => {
      for (const b of pieces.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    });
    // ROOM_COLLIDERS holds the furniture too: only the walls, couch and TV (the first 8) remain here
    for (const a of pieces) for (const b of fixed.slice(0, 8)) expect(overlaps(a, b)).toBe(false);
  });

  it('puts table-top things on a table they fit inside', () => {
    for (const p of FURNITURE.filter((q) => q.y > 0)) {
      const under = onFloor.filter((q) => q.solid).map(footprint);
      expect(
        under.some((b) => b.minX <= p.x && p.x <= b.maxX && b.minZ <= p.z && p.z <= b.maxZ),
      ).toBe(true);
    }
  });

  it('keeps the walk from the spawn to the TV, Mom and the door free', () => {
    // beside the TV (the coffee table sits on the straight line to it, so the walk bends round it)
    const goals = [{ x: AT.tv.x - 1.3, z: -1.5 }, AT.momInside, AT.momDoor, AT.door];
    for (const goal of goals) {
      for (const b of solid) {
        const world = grow({ ...b, minX: b.minX + ROOM_X, maxX: b.maxX + ROOM_X }, PLAYER_RADIUS);
        const a = AT.spawnRoom;
        expect(segmentHitsBox(a.x, a.z, goal.x, goal.z, world)).toBeNull();
      }
    }
  });

  it("is never on Mom's path points", () => {
    const points = [...MOM_PATH.pace, ...MOM_PATH.out, ...MOM_PATH.in, ...MOM_PATH.glances];
    for (const q of points) {
      for (const b of solid) {
        const inside =
          q.x - ROOM_X >= b.minX - 0.3 &&
          q.x - ROOM_X <= b.maxX + 0.3 &&
          q.z >= b.minZ - 0.3 &&
          q.z <= b.maxZ + 0.3;
        expect(inside).toBe(false);
      }
    }
  });
});
