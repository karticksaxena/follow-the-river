import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import {
  COLD_OPEN_PAGES,
  CUES,
  ease,
  nextColdOpenStep,
  SHAMBLERS,
  shotAt,
  SHOTS,
  TITLE_PAGES,
  type ColdOpenStep,
} from './coldopen';
import { CUT_Z, HOUSE, LAMP, litWindows, WINDOW } from './coldopen-scene';
import { LIGHTING } from './lighting';
import { EDGE_X } from './river';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('cold open steps and captions', () => {
  it('runs aerial → corner → window → done', () => {
    const steps: ColdOpenStep[] = ['aerial'];
    while (steps[steps.length - 1] !== 'done') {
      steps.push(nextColdOpenStep(steps[steps.length - 1]));
    }
    expect(steps).toEqual(['aerial', 'corner', 'window', 'done']);
    expect(nextColdOpenStep('done')).toBe('done');
  });

  it('has the three captions in order, and the title card', () => {
    expect(COLD_OPEN_PAGES.aerial).toEqual(['It started on an ordinary evening.']);
    expect(COLD_OPEN_PAGES.corner).toEqual(['By night, the city was not the city any more.']);
    expect(COLD_OPEN_PAGES.window).toEqual(['Across the river, a TV was still on.']);
    expect(TITLE_PAGES).toEqual(['Follow the River']);
  });

  it("every caption is a single page, so the pager's Skip ends the whole cold open", () => {
    for (const pages of Object.values(COLD_OPEN_PAGES)) expect(pages).toHaveLength(1);
  });
});

describe('camera shots', () => {
  it('ease is a clamped smoothstep', () => {
    expect(ease(-1)).toBe(0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(2)).toBe(1);
    expect(ease(0.25)).toBeLessThan(0.25);
  });

  it('shotAt starts at from, ends at to and holds past the end, without allocating', () => {
    const pos = { x: 0, y: 0, z: 0 };
    const look = { x: 0, y: 0, z: 0 };
    for (const shot of Object.values(SHOTS)) {
      shotAt(shot, 0, pos, look);
      expect(pos).toEqual(shot.from);
      expect(look).toEqual(shot.lookFrom);
      shotAt(shot, shot.seconds, pos, look);
      expect(pos).toEqual(shot.to);
      expect(look).toEqual(shot.lookTo);
      shotAt(shot, shot.seconds * 2, pos, look);
      expect(pos).toEqual(shot.to);
      shotAt(shot, shot.seconds / 3, pos, look);
      expect([pos.x, pos.y, pos.z, look.x, look.y, look.z].some(Number.isNaN)).toBe(false);
    }
  });

  it('every shot stays above ground and sees its target through the fog', () => {
    const fog = {
      aerial: LIGHTING.dusk.fog.far,
      corner: LIGHTING.night.fog.far,
      window: LIGHTING.night.fog.far,
    } as const;
    for (const name of ['aerial', 'corner', 'window'] as const) {
      const shot = SHOTS[name];
      expect(shot.seconds).toBeGreaterThan(0);
      for (const [pos, look] of [
        [shot.from, shot.lookFrom],
        [shot.to, shot.lookTo],
      ] as const) {
        expect(pos.y).toBeGreaterThan(1);
        expect(dist(pos, look)).toBeGreaterThan(1);
        expect(dist(pos, look)).toBeLessThan(fog[name]);
      }
    }
  });

  it('the shots and captions together run 40–60 s at a steady reading pace', () => {
    const shots = Object.values(SHOTS).reduce((sum, s) => sum + s.seconds, 0);
    const pages = Object.values(COLD_OPEN_PAGES).flat().length + TITLE_PAGES.length;
    const READ_SECONDS = 4; // a comfortable pause per caption
    expect(shots + pages * READ_SECONDS).toBeGreaterThanOrEqual(40);
    expect(shots + pages * READ_SECONDS).toBeLessThanOrEqual(60);
    expect(CUES.siren.at).toBeLessThan(SHOTS.aerial.seconds);
    expect(CUES.alarm.at).toBeLessThan(SHOTS.corner.seconds);
  });
});

describe('cold open scene layout', () => {
  it('the lamp is one of the Day 1 street lights, north of the cut', () => {
    const lamps = CITY.props.filter((p) => p.model === 'light-square');
    expect(lamps.some((p) => p.x === LAMP.x && p.z === LAMP.z)).toBe(true);
    expect(LAMP.z).toBeGreaterThan(CUT_Z);
  });

  it('the shamblers start on the strip, past the lamp, and walk toward a goal behind the corner camera', () => {
    const { stagger, walkers, goal, tuning } = SHAMBLERS;
    expect(Math.hypot(stagger.x - LAMP.x, stagger.z - LAMP.z)).toBeLessThan(3);
    for (const w of [stagger, ...walkers]) {
      expect(w.x).toBeGreaterThan(CITY.landX);
      expect(w.x).toBeLessThan(EDGE_X);
      expect(w.z).toBeGreaterThan(CUT_Z);
      expect(w.z).toBeLessThan(LAMP.z);
    }
    expect(goal.z).toBeGreaterThan(SHOTS.corner.from.z);
    expect(tuning.speed).toBeLessThanOrEqual(2); // the Walk clip, never Run
  });

  it('the house sits upriver of the city start with its window toward the river', () => {
    expect(HOUSE.z).toBeGreaterThan(CITY.startZ);
    expect(WINDOW.x).toBeGreaterThan(HOUSE.x);
    expect(WINDOW.x).toBeLessThan(EDGE_X);
    expect(SHOTS.window.lookTo).toEqual({ x: WINDOW.x, y: WINDOW.y, z: WINDOW.z });
  });

  it('lit windows sit on the fronts of the backdrop buildings, a few of them, above the street', () => {
    const windows = litWindows(CITY.props.filter((p) => p.z > CUT_Z));
    const buildings = CITY.props.filter((p) => p.kit === 'city' && p.z > CUT_Z);
    expect(windows.length).toBeGreaterThanOrEqual(3);
    expect(windows.length).toBeLessThan(buildings.length);
    for (const w of windows) {
      expect(w.y).toBeGreaterThan(3);
      expect(buildings.some((b) => Math.abs(b.z - w.z) < 2 && w.x > b.x && w.x < b.x + 6)).toBe(
        true,
      );
    }
  });
});
