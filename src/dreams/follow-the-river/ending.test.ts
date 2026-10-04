import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import { DAWN } from './dawn';
import { DIFFICULTY, HORDE_CAPACITY } from './difficulty';
import {
  armForLastStand,
  bedFade,
  ENDING_PAGES,
  nextEndingStep,
  nightEnd,
  REPLAY_PAGES,
  sickenToEnd,
  struckNear,
  WAVE,
  waveCount,
  waveDue,
  waveSpot,
  type EndingStep,
} from './ending';
import { FAREWELL, FAREWELL_PAGES, shoreFor, type Bed } from './ending-farewell';
import {
  facing,
  LANTERN_OUT,
  lanternSpot,
  MOM_LANTERN,
  retreatPoint,
  stopShort,
} from './ending-scene';
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

describe('the stranding', () => {
  it('leaves her dying (sickness 1, past the fight cap), so her breath turns red', () => {
    let k = -1;
    sickenToEnd({ setSickness: (v) => (k = v) });
    expect(k).toBe(1);
  });
});

describe('the last stand', () => {
  it('Mom flinches only when the orca strikes within 4 m of her', () => {
    expect(struckNear({ x: 0, z: 3 }, { x: 0, z: 0 })).toBe(true);
    expect(struckNear({ x: 0, z: 9 }, { x: 0, z: 0 })).toBe(false);
    expect(struckNear(null, { x: 0, z: 0 })).toBe(false);
  });

  it('sends a horde in groups, too big for you alone, and never more', () => {
    expect(waveDue(0)).toBe(WAVE.group);
    expect(waveDue(WAVE.gap)).toBe(2 * WAVE.group);
    expect(waveDue(1000)).toBe(WAVE.count);
    expect(waveDue(-5)).toBe(WAVE.group);
    expect(waveDue(1000, 18)).toBe(18); // an easier night sends fewer
    expect(WAVE.count).toBeGreaterThan(HORDE_CAPACITY); // more than can be alive at once
  });

  it('sends 30 times the difficulty quota, and all of them must die', () => {
    expect(waveCount('normal')).toBe(Math.round(30 * DIFFICULTY.normal.quota));
    expect(waveCount('story')).toBeLessThan(waveCount('normal'));
    expect(waveCount('hard')).toBeGreaterThan(waveCount('normal'));
  });

  it('fights beside you: she guards a 9 m ring around you and Mom, strikes fast, sweeps', () => {
    expect(WAVE.orca).toEqual({ cooldown: 0.5, reach: 7, pace: 0.7, sweep: 2, guard: 9 });
  });

  it('lets the orca outlast the horde, and every group arrives long before her guard lifts', () => {
    for (const d of ['story', 'normal', 'hard'] as const) {
      expect(WAVE.strikes).toBeGreaterThan(waveCount(d));
      expect(Math.ceil(waveCount(d) / WAVE.group) * WAVE.gap).toBeLessThan(WAVE.safety);
    }
    expect(WAVE.safety).toBe(150);
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

describe("Mom's lantern light", () => {
  const body = { x: 2, z: 5 };
  const hand = { x: 2.25, y: 1, z: 5.1 };
  const axisClearance = (p: { x: number; z: number }): number =>
    Math.hypot(p.x - body.x, p.z - body.z);

  it('sits clear of her body axis and her hand, whichever side the camera is on', () => {
    for (const cam of [
      { x: 2, z: 9 }, // front
      { x: 2, z: 1 }, // behind her
      { x: -4, z: 5 }, // her left
      { x: 8, z: 5 }, // her right
      { x: 2.25, z: 5.1 }, // on the hand
    ]) {
      const out = { x: 0, y: 0, z: 0 };
      lanternSpot(hand, body, cam, out);
      expect(axisClearance(out)).toBeGreaterThanOrEqual(0.3);
      expect(Math.hypot(out.x - hand.x, out.y - hand.y, out.z - hand.z)).toBeGreaterThanOrEqual(
        0.25,
      );
    }
  });

  it('lights her softly from outside, and is nearly out by sunrise', () => {
    expect(LANTERN_OUT).toBeGreaterThanOrEqual(0.3);
    expect(MOM_LANTERN.intensity).toBeLessThanOrEqual(2);
  });
});

describe('bedFade', () => {
  it('fades the dawn beds out, then stops and frees them, leaving none for the ride', () => {
    const log: string[] = [];
    const fake = (name: string, volume: number): Bed => {
      let v = volume;
      return {
        stop: () => log.push(`${name} stop`),
        setVolume: (x: number) => (v = x),
        getVolume: () => v,
        disconnect: () => log.push(`${name} off`),
      };
    };
    const water = fake('water', 0.25);
    const birds = fake('birds', 0.3);
    const beds = [water, birds];
    const step = bedFade(beds, 0.5);
    expect(step(0.25)).toBe(false);
    expect(birds.getVolume()).toBeCloseTo(0.15);
    expect(water.getVolume()).toBeCloseTo(0.125);
    expect(beds).toHaveLength(2);
    expect(step(0.3)).toBe(true);
    expect(log).toEqual(['water stop', 'water off', 'birds stop', 'birds off']);
    expect(beds).toHaveLength(0);
  });
});
