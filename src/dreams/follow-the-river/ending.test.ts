import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import { DAWN } from './dawn';
import { HORDE_CAPACITY } from './difficulty';
import {
  armForLastStand,
  ENDING_PAGES,
  nextEndingStep,
  nightEnd,
  REPLAY_PAGES,
  WAVE,
  waveDue,
  waveSpot,
  type EndingStep,
} from './ending';
import { FAREWELL, FAREWELL_PAGES, shoreFor } from './ending-farewell';
import { facing, retreatPoint, stopShort } from './ending-scene';
import { EDGE_X } from './river';
import { freshRun, restartPhase, SUPPLY_LIMITS, type GunKind } from './state';

describe('ending steps', () => {
  it('runs Mom, the last stand, the stranding, the farewell, dawn, the ride home, the credits', () => {
    const steps: EndingStep[] = ['mom'];
    while (steps[steps.length - 1] !== 'done') steps.push(nextEndingStep(steps[steps.length - 1]));
    expect(steps).toEqual([
      'mom',
      'fight',
      'strand',
      'song',
      'hand',
      'pack',
      'dawn',
      'ride',
      'credits',
      'done',
    ]);
    expect(nextEndingStep('done')).toBe('done');
  });

  it('has Mom arm you for the fight, say why it died, and the credits', () => {
    for (const pages of Object.values(ENDING_PAGES)) expect(pages.length).toBeGreaterThan(0);
    expect(ENDING_PAGES.mom.join(' ')).toMatch(/You followed the river/);
    expect(ENDING_PAGES.mom.join(' ')).toMatch(/fight with us/);
    expect(FAREWELL_PAGES.stranded.join(' ')).toMatch(/eating the sickness for us/);
    expect(ENDING_PAGES.credits[0]).toBe("Kartik's Dreams - Follow the River");
    const credits = ENDING_PAGES.credits.join(' ');
    for (const name of ['Kenney', 'Quaternius', 'OpenGameArt', 'Made with three.js']) {
      expect(credits).toContain(name);
    }
    expect(REPLAY_PAGES.slice(-ENDING_PAGES.credits.length)).toEqual(ENDING_PAGES.credits);
  });

  it('never uses an em dash on screen', () => {
    const all = [...Object.values(ENDING_PAGES).flat(), ...Object.values(FAREWELL_PAGES).flat()];
    for (const page of all) expect(page).not.toContain('\u2014');
  });
});

describe('the last stand', () => {
  it('sends a horde in groups, too big for you alone, and never more', () => {
    expect(waveDue(0)).toBe(WAVE.group);
    expect(waveDue(WAVE.gap)).toBe(2 * WAVE.group);
    expect(waveDue(1000)).toBe(WAVE.count);
    expect(waveDue(-5)).toBe(WAVE.group);
    expect(WAVE.count).toBeGreaterThan(HORDE_CAPACITY); // more than can be alive at once
  });

  it('lets the orca outlast the horde, and every group arrives before the time runs out', () => {
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

  it('Mom fills your guns, arrows and spare batteries, and gives you a pistol if you have none', () => {
    const run = { live: { ...restartPhase(freshRun()), guns: [] as GunKind[] } };
    armForLastStand(run, 1);
    expect(run.live.guns).toEqual(['pistol']);
    expect(run.live.supplies.ammo).toBe(SUPPLY_LIMITS.ammo);
    expect(run.live.supplies.arrows).toBe(SUPPLY_LIMITS.arrows);
    expect(run.live.supplies.cells).toBe(1);
  });

  it("Mom's bag is a share of the limit and never takes away what you carry", () => {
    const run = { live: { ...restartPhase(freshRun()), guns: ['pistol' as const] } };
    run.live.supplies = { ...run.live.supplies, ammo: 20, arrows: 0 };
    armForLastStand(run, 0.5);
    expect(run.live.supplies.ammo).toBe(20);
    expect(run.live.supplies.arrows).toBe(Math.round(SUPPLY_LIMITS.arrows * 0.5));
  });

  it('fades to dawn in 8 s', () => {
    expect(DAWN.seconds).toBe(14);
  });
});

describe('the farewell', () => {
  it('puts both E spots on the pebbles you can walk to (short of the shore wall)', () => {
    const meet = FOREST.meetAt;
    const lake = FOREST.lake;
    if (!meet || !lake) throw new Error('the forest has Mom and a lake');
    const at = shoreFor(meet, lake.z);
    const reach = FOREST.endZ + 0.3; // the wall's land face plus your body
    const side = { x: at.noseX + FAREWELL.side.x, z: at.noseZ + FAREWELL.side.z };
    const edge = { x: at.noseX + FAREWELL.edge.x, z: at.lakeZ + FAREWELL.edge.z };
    expect(side.z - FAREWELL.side.radius).toBeLessThan(reach + 2);
    expect(side.z).toBeGreaterThan(reach);
    expect(edge.z + FAREWELL.edge.radius).toBeGreaterThan(reach);
  });

  it("lands clear of Mom's canoe on the shore (its body runs 7 m back into the lake)", () => {
    const meet = FOREST.meetAt;
    const lake = FOREST.lake;
    if (!meet || !lake) throw new Error('the forest has Mom and a lake');
    const at = shoreFor(meet, lake.z);
    const canoes = FOREST.props.filter((p) => p.model === 'canoe' && p.z < lake.z + 10);
    expect(canoes.length).toBe(1);
    for (const c of canoes) expect(Math.abs(c.x - at.noseX)).toBeGreaterThan(3);
  });

  it('lands its nose up the shore beside Mom, with the water line behind it', () => {
    const at = shoreFor({ x: -3, z: -387.5 }, -392);
    expect(at.noseZ).toBeGreaterThan(at.lakeZ);
    expect(at.noseX).toBeGreaterThan(-3);
    expect(at.noseX).toBeLessThan(EDGE_X);
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
