import { describe, expect, it } from 'vitest';
import { waterlineX } from './banks';
import { DIFFICULTY } from './difficulty';
import { ANATOMY } from './dras-anatomy';
import { canThrow, cruiseHeading, drasWatchPoint, pickStrike } from './fish';
import {
  BODY_HALF_WIDTH,
  cruiseTargetX,
  cruiseYFor,
  FIGHT,
  fightSurfacing,
  inWaterX,
  isDry,
  LANE_OFFSET,
  nextSurfacing,
  NIGHT_STRIKE,
  strikeWait,
  styleFor,
  SURFACE_MAX,
  SURFACE_MIN,
  surfaceYFor,
  waveBudget,
} from './fish-parts';
import { EDGE_X, WATER_Y } from './river';
import { START_SUPPLIES } from './state';

describe('fish', () => {
  it('arms a budget of her share of each wave, by difficulty', () => {
    expect(waveBudget(13, DIFFICULTY.story.orca.share)).toBe(7);
    expect(waveBudget(13, DIFFICULTY.normal.orca.share)).toBe(4);
    expect(waveBudget(13, 0.2)).toBe(3);
    expect([13, 17, 21].map((q) => waveBudget(q, DIFFICULTY.normal.orca.share))).toEqual([4, 5, 6]);
  });

  it('waits longer between strikes when armed than the style says, longer still when dry', () => {
    for (const d of ['story', 'normal', 'hard'] as const) {
      const { armedCooldown, dryCooldown } = DIFFICULTY[d].orca;
      const s = styleFor(0, d);
      expect(strikeWait(s, false, 0)).toBe(armedCooldown);
      expect(strikeWait(s, false, 0.999)).toBeCloseTo(armedCooldown * 2, 1);
      expect(strikeWait(s, true, 0)).toBe(dryCooldown);
      expect(strikeWait(s, true, 0.999)).toBeCloseTo(dryCooldown * 1.5, 1);
    }
    expect(strikeWait({ ...NIGHT_STRIKE }, false, 0.9)).toBe(NIGHT_STRIKE.cooldown); // no jitter in the last stand
  });

  it('feeding shortens both waits and widens her reach, within the limits', () => {
    const [a, b, many] = [0, 2, 99].map((n) => styleFor(n, 'normal'));
    expect(b.cooldown).toBeLessThan(a.cooldown);
    expect(b.dryCooldown).toBeLessThan(a.dryCooldown ?? 0);
    expect(b.reach).toBeGreaterThan(a.reach);
    expect(b.sweep).toBeGreaterThan(a.sweep);
    expect(many.cooldown).toBeGreaterThan(0);
    expect(many.cooldown).toBeLessThan(b.cooldown);
    expect(many.cooldown).toBeCloseTo(DIFFICULTY.normal.orca.armedCooldown * 0.4);
  });

  it('is dry only with every owned gun at 0 and no arrows', () => {
    const none = { ...START_SUPPLIES, arrows: 0, ammo: 0, shells: 0, rounds: 0 };
    expect(isDry(none, [])).toBe(true);
    expect(isDry({ ...none, arrows: 1 }, [])).toBe(false);
    expect(isDry({ ...none, rounds: 5 }, ['pistol'])).toBe(true); // not a rifle owner
    expect(isDry({ ...none, ammo: 1 }, ['pistol', 'shotgun'])).toBe(false);
    expect(isDry(none, ['pistol', 'shotgun'])).toBe(true);
  });

  it('takes only zombies near the player, with the player as the guard', () => {
    const edge = 3;
    const me = { x: 0, z: 0 };
    const far = new Float32Array([1, 2, -20]);
    const near = new Float32Array([2, 2, -5]);
    const guard = DIFFICULTY.normal.orca.guard;
    expect(pickStrike(far, 1, me, edge, 4.5, [me], guard)).toBeNull();
    expect(pickStrike(near, 1, me, edge, 4.5, [me], guard)).toBe(2);
  });

  it('only takes zombies near the water, nearest to the player first', () => {
    const edge = 3;
    // id, x, z
    const c = new Float32Array([1, -10, 0, 2, 2, -8, 3, 1.5, -2]);
    expect(pickStrike(c, 3, { x: 0, z: 0 }, edge)).toBe(3);
    expect(pickStrike(new Float32Array([1, -10, 0]), 1, { x: 0, z: 0 }, edge)).toBeNull();
  });

  it('lets you throw only from the edge and only with a pack', () => {
    expect(canThrow(2, 3, 1)).toBe(true);
    expect(canThrow(-2, 3, 1)).toBe(false);
    expect(canThrow(2, 3, 0)).toBe(false);
  });

  it('rests facing downstream when not swimming along the river', () => {
    expect(cruiseHeading(1.5, 0)).toBe(0);
    expect(Math.abs(cruiseHeading(1, -2.5))).toBeLessThanOrEqual(0.25);
    expect(cruiseHeading(0, 2.5)).toBeCloseTo(Math.PI);
  });

  it('cruises in a lane beside the player bank, all through the weave', () => {
    for (let t = 0; t < 60; t += 0.5) {
      const x = cruiseTargetX(EDGE_X, t);
      expect(x).toBeGreaterThanOrEqual(EDGE_X + 2.5);
      expect(x).toBeLessThanOrEqual(EDGE_X + 5.5);
    }
  });

  it('cruises with the fin above the water and the back under it', () => {
    const finTop = 2; // any measured fin top
    expect(cruiseYFor(finTop) + finTop).toBeGreaterThan(WATER_Y);
    expect(cruiseYFor(finTop) + finTop - ANATOMY.finHeight).toBeLessThan(WATER_Y);
    expect(surfaceYFor(finTop) + finTop - ANATOMY.finHeight).toBeGreaterThan(WATER_Y);
  });

  it('surfaces every 18 to 30 seconds', () => {
    expect(nextSurfacing(0)).toBe(SURFACE_MIN);
    expect(nextSurfacing(0.999)).toBeLessThan(SURFACE_MAX);
    expect(SURFACE_MIN).toBe(18);
    expect(SURFACE_MAX).toBe(30);
  });

  it('cruising never puts any of the body over the bank', () => {
    // 10 minutes of a player wandering the strip, 30 fps
    let worst = Infinity;
    const water = waterlineX('natural');
    for (let t = 0; t < 600; t += 1 / 30) {
      for (const yaw of [0, 0.3, -0.3, Math.PI, Math.PI / 2]) {
        const x = inWaterX(cruiseTargetX(water, t), yaw, water);
        worst = Math.min(worst, x - Math.abs(Math.sin(yaw)) * 3.5 - BODY_HALF_WIDTH - water);
      }
    }
    expect(worst).toBeGreaterThanOrEqual(0.5);
  });

  it('keeps the whole 7 m orca in the river, even turned toward the bank', () => {
    const edge = 3;
    for (const yaw of [0, 0.4, Math.PI / 2, -Math.PI / 2, Math.PI, 2.5]) {
      const x = inWaterX(edge + 0.5, yaw, edge);
      const nose = x - Math.sin(yaw) * 3.5;
      const tail = x + Math.sin(yaw) * 3.5;
      expect(Math.min(nose, tail)).toBeGreaterThan(edge + BODY_HALF_WIDTH);
    }
    expect(inWaterX(9, 0, edge)).toBe(9); // already well out: unchanged
  });
});

describe('the last stand beside you', () => {
  it('only guards in the last stand: normal nights take anyone', () => {
    expect(NIGHT_STRIKE.guard).toBe(Infinity);
    expect([7, 9, 6]).toEqual(
      (['normal', 'story', 'hard'] as const).map((d) => styleFor(3, d).guard),
    ); // nights guard you alone: the ending's own style is untouched (ending.test.ts)
  });

  it('cruises a lane 2 m nearer the shore, and surfaces every 6 to 10 s', () => {
    expect(cruiseTargetX(EDGE_X, 0, LANE_OFFSET - FIGHT.laneIn)).toBe(
      cruiseTargetX(EDGE_X, 0) - FIGHT.laneIn,
    );
    expect(FIGHT.laneIn).toBe(2);
    expect(fightSurfacing(0)).toBe(6);
    expect(fightSurfacing(0.999)).toBeLessThan(10);
  });

  it('feeds the torch her head only while she is surfaced or stranded and placed', () => {
    const out = { x: 0, y: 0, z: 0 };
    const head = { x: 1, y: 2, z: 3 };
    const fish = (surfaced: boolean, placed: boolean): Parameters<typeof drasWatchPoint>[0] => ({
      surfaced,
      head: (o: typeof out) => (placed ? Object.assign(o, head) : null),
    });
    expect(drasWatchPoint(fish(false, true), out)).toBe(false); // under water or only the fin up
    expect(drasWatchPoint(fish(true, false), out)).toBe(false); // not placed / after a reset
    expect(drasWatchPoint(fish(true, true), out)).toBe(true);
    expect(out).toEqual(head);
  });
});
