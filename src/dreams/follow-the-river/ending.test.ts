import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import {
  DAWN,
  ENDING_PAGES,
  nextEndingStep,
  nightEnd,
  REPLAY_PAGES,
  WAVE,
  waveDue,
  waveSpot,
  type EndingStep,
} from './ending';
import { facing, retreatPoint, stopShort } from './ending-scene';
import { EDGE_X } from './river';

describe('ending steps', () => {
  it('runs Mom → fight → silence → dawn → epilogue → credits → done', () => {
    const steps: EndingStep[] = ['mom'];
    while (steps[steps.length - 1] !== 'done') steps.push(nextEndingStep(steps[steps.length - 1]));
    expect(steps).toEqual(['mom', 'fight', 'silence', 'dawn', 'epilogue', 'credits', 'done']);
    expect(nextEndingStep('done')).toBe('done');
  });

  it('has Mom speak before and after the fight, a short epilogue and the credits', () => {
    for (const pages of Object.values(ENDING_PAGES)) expect(pages.length).toBeGreaterThan(0);
    expect(ENDING_PAGES.mom.join(' ')).toMatch(/You followed the river/);
    expect(ENDING_PAGES.mom.join(' ')).toMatch(/so sorry/);
    expect(ENDING_PAGES.silence.join(' ')).toMatch(/held on for us/);
    expect(ENDING_PAGES.silence.join(' ')).toMatch(/Because of it/);
    expect(ENDING_PAGES.epilogue.length).toBeGreaterThanOrEqual(3);
    expect(ENDING_PAGES.epilogue.length).toBeLessThanOrEqual(4);
    expect(ENDING_PAGES.credits[0]).toBe("Kartik's Dreams — Follow the River");
    expect(ENDING_PAGES.credits[1]).toBe('A dream by Kartik');
    const credits = ENDING_PAGES.credits.join(' ');
    for (const name of ['Kenney', 'Quaternius', 'OpenGameArt', 'Made with three.js']) {
      expect(credits).toContain(name);
    }
    expect(REPLAY_PAGES).toEqual([...ENDING_PAGES.epilogue, ...ENDING_PAGES.credits]);
  });
});

describe('the wave', () => {
  it('sends 12 zombies in groups and never more', () => {
    expect(waveDue(0)).toBe(WAVE.group);
    expect(waveDue(WAVE.gap)).toBe(2 * WAVE.group);
    expect(waveDue(WAVE.gap * 2)).toBe(WAVE.count);
    expect(waveDue(1000)).toBe(WAVE.count);
    expect(waveDue(-5)).toBe(WAVE.group);
  });

  it('lets the orca outlast the wave and the wave fit in its 25 s', () => {
    expect(WAVE.seconds).toBe(25);
    expect(WAVE.strikes).toBeGreaterThan(WAVE.count);
    expect(Math.ceil(WAVE.count / WAVE.group) * WAVE.gap).toBeLessThan(WAVE.seconds);
  });

  it('spawns on the bank, upstream of the player, within reach of the water', () => {
    for (let i = 0; i < WAVE.count; i++) {
      const at = waveSpot(i, -388);
      expect(at.z).toBeGreaterThan(-388 + WAVE.upstream - 1);
      expect(at.x).toBeLessThan(EDGE_X);
      expect(at.x).toBeGreaterThan(FOREST.landX);
    }
  });

  it('fades to dawn in 8 s', () => {
    expect(DAWN.seconds).toBe(8);
  });
});

describe('nightEnd', () => {
  it('Nights 1 and 2 end at the safe spot', () => {
    for (const area of [CITY, SUBURBS]) {
      expect(nightEnd(area, area.safeZ + 20)).toBeNull();
      expect(nightEnd(area, area.safeZ + 2)).toBe('safe');
    }
  });

  it('Night 3 ignores the safe z and ends at the lake shore', () => {
    const at = FOREST.endingAt;
    expect(at).toBeDefined();
    if (!at) return;
    expect(nightEnd(FOREST, FOREST.safeZ - 1)).toBeNull(); // 8 m short of the shore
    expect(nightEnd(FOREST, at.z + at.radius + 0.5)).toBeNull();
    expect(nightEnd(FOREST, at.z + at.radius - 0.5)).toBe('ending');
    expect(nightEnd(FOREST, at.z)).toBe('ending');
  });
});

describe('Mom on the shore', () => {
  it('stands at ground level on the shore, facing back up the bank toward the player', () => {
    const mom = FOREST.meetAt;
    const at = FOREST.endingAt;
    expect(mom && at).toBeTruthy();
    if (!mom || !at) return;
    const yaw = facing(mom.x, mom.z, at.x, at.z);
    expect(Math.cos(yaw)).toBeGreaterThan(0.9); // looks toward +z, the player
  });

  it('is the lantern spot of the area (no other area has one)', () => {
    expect(CITY.meetAt).toBeUndefined();
    expect(SUBURBS.meetAt).toBeUndefined();
  });
});

describe("Mom's movement", () => {
  it('retreats toward the water but stays on the pebbles', () => {
    const mom = FOREST.meetAt;
    const lake = FOREST.lake;
    if (!mom || !lake) throw new Error('forest needs meetAt and lake');
    const p = retreatPoint(mom, lake.z);
    expect(p.z).toBeLessThan(mom.z);
    expect(p.z).toBeGreaterThanOrEqual(lake.z + 1);
    expect(p.x).toBeLessThanOrEqual(EDGE_X - 0.5);
    expect(retreatPoint({ x: 9, z: lake.z + 1.2 }, lake.z)).toEqual({
      x: EDGE_X - 0.5,
      z: lake.z + 1,
    });
  });

  it('stops short of the player on the line to them', () => {
    const p = stopShort({ x: 0, z: 0 }, { x: 0, z: 6 }, 1.5);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(4.5);
    expect(stopShort({ x: 1, z: 1 }, { x: 1, z: 2 }, 1.5)).toEqual({ x: 1, z: 1 });
  });
});
