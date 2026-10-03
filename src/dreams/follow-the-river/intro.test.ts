import { describe, expect, it } from 'vitest';
import { resolveCircle, type Box } from '../../engine/collide';
import { PLAYER_RADIUS } from '../../engine/player';
import { INTRO_PAGES, nextIntroStep, type IntroStep } from './intro';
import { AT, OUTSIDE_COLLIDERS, REACH, ROOM_COLLIDERS } from './intro-scene';

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
});
