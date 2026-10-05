import { describe, expect, it, vi } from 'vitest';
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
  sickenToEnd,
  struckNear,
  waitDone,
  WAVE,
  waveCount,
  waveDue,
  waveSpot,
  type EndingStep,
} from './ending';
import {
  ENDING_GOALS,
  FAREWELL,
  FAREWELL_PAGES,
  FAREWELL_PROMPTS,
  shoreFor,
  WALK_TIMEOUT,
  walkWithin,
  type Bed,
} from './ending-farewell';
import {
  facing,
  FAREWELL_LIGHT,
  LANTERN_OUT,
  lanternSpot,
  meetPoint,
  MOM_LANTERN,
  retreatPoint,
  SHORE,
  stopShort,
} from './ending-scene';
import { shotsFor } from './farewell-shots';
import { torchScale } from './flashlight';
import { EDGE_X } from './river';
import { freshRun, restartPhase, SUPPLY_LIMITS, type GunKind } from './state';

describe('ending steps', () => {
  it('runs Mom, the last stand, the swim in, the song, the kneel, her look, the orbit, the last pack, dawn, the ride home, the credits', () => {
    const steps: EndingStep[] = ['mom'];
    while (steps[steps.length - 1] !== 'done') steps.push(nextEndingStep(steps[steps.length - 1]));
    expect(steps).toEqual([
      'mom',
      'fight',
      'swim',
      'song',
      'kneel',
      'look',
      'orbit',
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
  it('lets you walk to the kneeling spot (short of the shore wall) and lands the pack camera in its E range', () => {
    const meet = FOREST.meetAt;
    const lake = FOREST.lake;
    if (!meet || !lake) throw new Error('the forest has Mom and a lake');
    const at = shoreFor(meet, lake.z);
    const reach = FOREST.endZ + 0.3; // the wall's land face plus your body
    const kneel = shotsFor(at).kneel.at;
    expect(kneel[2] - FAREWELL.kneelRadius).toBeLessThan(reach + 1);
    expect(kneel[2] + FAREWELL.kneelRadius).toBeGreaterThan(reach);
    expect(Math.abs(kneel[0] - at.noseX)).toBeGreaterThan(0.9); // beside her, not on her
  });

  it('says her, not it, and calls her skin smooth like wet rubber', () => {
    expect(FAREWELL_PROMPTS.kneel).toBe('E: put your hand on her');
    expect(FAREWELL_PAGES.hand[0]).toBe('Her skin is cold and smooth, like wet rubber.');
    expect(FAREWELL_PAGES.look[0]).toBe('She lifts her head a little and looks at you.');
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

/** The candela the farewell key puts on Mom `d` m from it. */
const lit = (d: number): number =>
  (FAREWELL_LIGHT.lantern.intensity *
    torchScale(d, FAREWELL_LIGHT.lantern.intensity, 2, FAREWELL_LIGHT.lantern.cap)) /
  d ** 2;

describe('the farewell key at close range', () => {
  it('never lights Mom with more than the cap (her skin clipped to white at 10 cd and 1 m)', () => {
    for (const d of [0.3, 0.6, 1, 1.5, 3])
      expect(lit(d)).toBeLessThanOrEqual(FAREWELL_LIGHT.lantern.cap + 1e-9);
  });

  it('keeps the full key for Dras when Mom is far from it', () => {
    expect(torchScale(20, FAREWELL_LIGHT.lantern.intensity, 2, FAREWELL_LIGHT.lantern.cap)).toBe(1);
  });

  it('has her stop SHORE.meet short of the camera on her way, where the camera turns to look', () => {
    const at = meetPoint({ x: 1, z: -388 }, { x: -7.5, z: -391 });
    expect(Math.hypot(at.x + 7.5, at.z + 391)).toBeCloseTo(SHORE.meet);
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

describe('waitDone', () => {
  it('ends a wait whose step throws, so the ending never freezes on it', () => {
    // Kartik: stuck at "Let's go home" - the dawn's bed fade threw (a sound freed twice).
    const throwing = {
      pred: (): boolean => {
        throw new Error('InvalidAccessError: not connected');
      },
    };
    expect(waitDone(throwing, 0.016)).toBe(true);
    expect(waitDone({ pred: () => false }, 0.016)).toBe(false);
    expect(waitDone({ pred: () => true }, 0.016)).toBe(true);
  });
});

describe('the ending goal line', () => {
  it('says something plain for every beat but the ride, with the keys to press', () => {
    for (const [beat, line] of Object.entries(ENDING_GOALS)) {
      if (beat === 'ride') continue;
      expect(line).toMatch(/^[A-Z].*\.$/);
      expect(line).not.toMatch(/[\d\u2014]/); // no counts, no em dashes
    }
    expect(ENDING_GOALS.kneel).toMatch(/^Go to Dras.*E: put your hand on her/);
    expect(ENDING_GOALS.pack).toBe(`${FAREWELL_PROMPTS.pack}.`);
    expect(ENDING_GOALS.goTo).toBe('Mom walks to her side.');
    expect(ENDING_GOALS.dawn).toMatch(/Mom is coming/);
    expect(ENDING_GOALS.home).toBe('Go home with Mom.');
  });
});

describe('walkWithin', () => {
  it('moves on when the walk never arrives, with Mom put at the spot', async () => {
    vi.useFakeTimers();
    try {
      const stop = vi.fn<() => void>();
      const scene = {
        actor: { walkTo: () => new Promise<void>(() => undefined), stop },
        mom: { group: { position: { x: 0, z: 0 } } },
      };
      const done = walkWithin(scene, { x: 3, z: -4 });
      await vi.advanceTimersByTimeAsync(WALK_TIMEOUT * 1000 + 1);
      await done;
      expect(stop).toHaveBeenCalled();
      expect(scene.mom.group.position).toEqual({ x: 3, z: -4 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns at once when she arrives', async () => {
    const scene = {
      actor: { walkTo: () => Promise.resolve(), stop: vi.fn<() => void>() },
      mom: { group: { position: { x: 0, z: 0 } } },
    };
    await walkWithin(scene, { x: 3, z: -4 });
    expect(scene.actor.stop).not.toHaveBeenCalled();
  });
});
