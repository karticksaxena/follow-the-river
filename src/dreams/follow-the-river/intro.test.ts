import { describe, expect, it } from 'vitest';
import { resolveCircle, type Box } from '../../engine/collide';
import { PLAYER_RADIUS } from '../../engine/player';
import { INTRO_PAGES, nextIntroStep, type IntroStep } from './intro';
import { AT, DOOR_CAP, MOM_PATH, OUTSIDE_COLLIDERS, REACH, ROOM_COLLIDERS } from './intro-scene';

/** A free standing point (not pushed by any collider) within `reach` of `at`. */
function reachable(at: { x: number; z: number }, reach: number, boxes: readonly Box[]): boolean {
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const x = at.x + Math.cos(a) * reach * 0.9;
    const z = at.z + Math.sin(a) * reach * 0.9;
    const p = resolveCircle(x, z, PLAYER_RADIUS, boxes);
    if (Math.hypot(p.x - x, p.z - z) < 1e-6) return true;
  }
  return false;
}

const MOM_RADIUS = 0.3;

/** Every 0.1 m along the path, Mom's footprint is not pushed by any box. */
function pathIsClear(path: readonly { x: number; z: number }[], boxes: readonly Box[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) return false;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const z = a.z + ((b.z - a.z) * k) / n;
      const p = resolveCircle(x, z, MOM_RADIUS, boxes);
      if (Math.hypot(p.x - x, p.z - z) > 1e-6) return false;
    }
  }
  return true;
}

describe('intro', () => {
  it('runs news → Mom leaves → Mom back → outside → throw → goodbye → done', () => {
    const steps: IntroStep[] = ['news'];
    while (steps[steps.length - 1] !== 'done') steps.push(nextIntroStep(steps[steps.length - 1]));
    expect(steps).toEqual([
      'news',
      'mom-leaves',
      'mom-back',
      'outside',
      'throw',
      'goodbye',
      'done',
    ]);
  });

  it('has pages for every step, and Mom says the line', () => {
    for (const pages of Object.values(INTRO_PAGES)) expect(pages.length).toBeGreaterThan(0);
    expect(INTRO_PAGES.goodbye.join(' ')).toMatch(/Always follow the river/);
    expect(INTRO_PAGES.goodbye.join(' ')).toMatch(/What have we done/);
  });

  it('every prompt spot can be reached from a free point, in world coordinates', () => {
    expect(reachable(AT.tv, REACH.tv, ROOM_COLLIDERS)).toBe(true);
    expect(reachable(AT.momInside, REACH.mom, ROOM_COLLIDERS)).toBe(true);
    expect(reachable(AT.momDoor, REACH.mom, ROOM_COLLIDERS)).toBe(true);
    expect(reachable(AT.door, REACH.door, ROOM_COLLIDERS)).toBe(true);
    expect(reachable(AT.momRiver, REACH.mom, OUTSIDE_COLLIDERS)).toBe(true);
  });

  it('spawns are free, the room spawn is out of reach of the TV, and the spots are in the room', () => {
    for (const [at, boxes] of [
      [AT.spawnRoom, ROOM_COLLIDERS],
      [AT.spawnRiver, OUTSIDE_COLLIDERS],
    ] as const) {
      const p = resolveCircle(at.x, at.z, PLAYER_RADIUS, boxes);
      expect(Math.hypot(p.x - at.x, p.z - at.z)).toBeLessThan(1e-6);
    }
    expect(Math.hypot(AT.spawnRoom.x - AT.tv.x, AT.spawnRoom.z - AT.tv.z)).toBeGreaterThan(
      REACH.tv,
    );
    for (const at of [AT.tv, AT.momInside, AT.momDoor, AT.door]) {
      expect(Math.abs(at.x - AT.spawnRoom.x)).toBeLessThan(4);
    }
  });

  it("Mom's routes never cross the walls, the couch or the TV", () => {
    const room = ROOM_COLLIDERS.filter((b) => b !== DOOR_CAP); // she walks out through the cap
    const pace = [...MOM_PATH.pace, MOM_PATH.pace[0]];
    expect(pathIsClear(pace, room)).toBe(true);
    for (const from of MOM_PATH.pace) expect(pathIsClear([from, ...MOM_PATH.out], room)).toBe(true);
    const outside = MOM_PATH.out[MOM_PATH.out.length - 1];
    expect(pathIsClear([outside, ...MOM_PATH.in], room)).toBe(true);
    const river = [AT.momRiverStart, AT.momRiverNear, AT.momRiver, AT.momRiverBack];
    expect(pathIsClear(river, OUTSIDE_COLLIDERS)).toBe(true);
    expect(pathIsClear([AT.momRiver, { x: AT.momRiver.x + 1, z: 0 }], OUTSIDE_COLLIDERS)).toBe(
      false, // the water's edge really is the edge
    );
  });
});
