import { describe, expect, it } from 'vitest';
import type { PickupDef } from './areas/types';
import { DIFFICULTY } from './difficulty';
import {
  AMMO_BOX,
  collect,
  CRATE,
  GLOW,
  glowScale,
  inShowRange,
  isFull,
  MODEL,
  nearestPickup,
  PICKUP_RADIUS,
  promptFor,
  SHOW_RANGE,
} from './pickups';
import { freshRun, restartPhase, SUPPLY_LIMITS, type GunKind, type Supplies } from './state';

const battery: PickupDef = { id: 'battery-1', kind: 'battery', x: 0, z: 0 };
const tape: PickupDef = { id: 'tape-1', kind: 'tape', x: 3, z: 0, tape: 1 };

describe('pickups', () => {
  it('finds the nearest untaken pickup within reach', () => {
    expect(nearestPickup(0.5, 0, [battery, tape], new Set())).toBe(battery);
    expect(nearestPickup(0.5, 0, [battery, tape], new Set(['battery-1']))).toBeNull();
    expect(nearestPickup(PICKUP_RADIUS + 0.1, 0, [battery], new Set())).toBeNull();
  });

  it('adds supplies, marks the pickup taken, and does not mutate', () => {
    const live = restartPhase(freshRun());
    const after = collect(live, battery, 1);
    expect(after.taken).toContain('battery-1');
    expect(live.taken).not.toContain('battery-1');
  });

  it('files tapes as found', () => {
    expect(collect(restartPhase(freshRun()), tape, 1).tapes).toEqual([1]);
  });

  it('says when you cannot carry more spare batteries', () => {
    const full = { ...freshRun().supplies, cells: SUPPLY_LIMITS.cells };
    expect(promptFor(battery, full, [])).toMatch(/full/i);
    expect(promptFor(battery, { ...full, cells: 1 }, [])).toMatch(/^E: /);
  });

  it('a battery is a spare for R, not charge', () => {
    const after = collect(restartPhase(freshRun()), battery, 1);
    expect(after.supplies.cells).toBe(1);
  });

  it('a crate gives its gun, then ammo for every gun you own, arrows, a battery and a fish pack', () => {
    const live = { ...restartPhase(freshRun()), guns: ['pistol' as const] };
    const crate: PickupDef = { id: 'c', kind: 'crate', x: 0, z: 0, gun: 'shotgun' };
    const after = collect(live, crate, 1);
    expect(after.guns).toEqual(['pistol', 'shotgun']);
    expect(after.supplies.ammo).toBe(CRATE.ammo.pistol);
    expect(after.supplies.shells).toBe(CRATE.ammo.shotgun);
    expect(after.supplies.rounds).toBe(0);
    expect(after.supplies.cells).toBe(CRATE.cells);
    expect(promptFor(crate, after.supplies, after.guns)).toBe('E: take the shotgun');
  });

  it('the Day 2 pistol is not a second pistol when you already have one', () => {
    const live = { ...restartPhase(freshRun()), guns: ['pistol' as const] };
    const gun: PickupDef = { id: 'gun', kind: 'gun', x: 0, z: 0 };
    expect(collect(live, gun, 1).guns).toEqual(['pistol']);
  });

  it('a crate on Normal gives a new pistol plus 6 bullets and 2 arrows and no battery', () => {
    const live = { ...restartPhase(freshRun()), guns: [] as GunKind[] };
    const crate: PickupDef = { id: 'c', kind: 'crate', x: 0, z: 0, gun: 'pistol' };
    const after = collect(live, crate, 1);
    expect(after.guns).toEqual(['pistol']);
    expect(after.supplies.ammo).toBe(6);
    expect(after.supplies.arrows).toBe(live.supplies.arrows + 2);
    expect(after.supplies.cells).toBe(live.supplies.cells);
  });

  it('scales with the difficulty: at least 1 of each non-zero item', () => {
    const live = { ...restartPhase(freshRun()), guns: [] as GunKind[] };
    const crate: PickupDef = { id: 'c', kind: 'crate', x: 0, z: 0, gun: 'pistol' };
    const story = collect(live, crate, 1.6);
    expect([story.supplies.ammo, story.supplies.arrows - live.supplies.arrows]).toEqual([10, 3]);
    const hard = collect(live, crate, 0.6);
    expect([hard.supplies.ammo, hard.supplies.arrows - live.supplies.arrows]).toEqual([4, 1]);
    expect(hard.supplies.cells).toBe(live.supplies.cells);
  });

  it('an ammo box feeds every gun you own, pistol bullets if none', () => {
    const box: PickupDef = { id: 'a', kind: 'ammo', x: 0, z: 0 };
    const none = { ...restartPhase(freshRun()), guns: [] as GunKind[] };
    expect(collect(none, box, 1).supplies.ammo).toBe(AMMO_BOX.pistol);
    const two = { ...none, guns: ['pistol', 'shotgun'] as GunKind[] };
    const got = collect(two, box, 1).supplies;
    expect([got.ammo, got.shells]).toEqual([AMMO_BOX.pistol, AMMO_BOX.shotgun]);
  });

  it('an ammo box is full only when every gun you own is full (the pistol if none)', () => {
    const box: PickupDef = { id: 'a', kind: 'ammo', x: 0, z: 0 };
    const live = { ...restartPhase(freshRun()), guns: ['pistol', 'shotgun'] as GunKind[] };
    const supplies = { ...live.supplies, ammo: SUPPLY_LIMITS.ammo, shells: 1 };
    expect(isFull(box, supplies, live.guns)).toBe(false);
    expect(promptFor(box, supplies, live.guns)).toBe('E: pick up ammo');
    const got = collect({ ...live, supplies }, box, 1).supplies;
    expect(got.shells).toBe(1 + AMMO_BOX.shotgun);
    const all = { ...supplies, shells: SUPPLY_LIMITS.shells };
    expect(isFull(box, all, live.guns)).toBe(true);
    expect(isFull(box, { ...all, ammo: 0 }, [])).toBe(false);
    expect(isFull(box, all, [])).toBe(true);
  });

  it('every pickup kind has its own model: an ammo box never looks like arrows', () => {
    expect(MODEL.ammo).not.toBe(MODEL.arrows);
    expect(new Set(Object.values(MODEL)).size).toBe(Object.keys(MODEL).length);
  });
});

/** What one pickup adds to each count, from empty, owning `guns`. */
function gained(
  kind: PickupDef['kind'],
  k: number,
  guns: GunKind[],
  gun?: GunKind,
): Supplies & { guns: readonly GunKind[] } {
  const empty: Supplies = {
    battery: 0,
    cells: 0,
    arrows: 0,
    ammo: 0,
    shells: 0,
    rounds: 0,
    fishPacks: 0,
  };
  const live = { ...restartPhase(freshRun()), guns, supplies: empty };
  const after = collect(live, { id: 'p', kind, x: 0, z: 0, ...(gun ? { gun } : {}) }, k);
  return { ...after.supplies, guns: after.guns };
}

const k = (d: 'story' | 'normal' | 'hard'): number => DIFFICULTY[d].supplies;

describe('every count, every difficulty (Story 1.6, Normal 1, Hard 0.6)', () => {
  it('arrows, spare batteries and fish packs add their own count and nothing else', () => {
    const rows = [
      ['arrows', 'arrows', [3, 2, 1]],
      ['battery', 'cells', [2, 1, 1]],
      ['fishPack', 'fishPacks', [2, 1, 1]],
    ] as const;
    for (const [kind, count, [story, normal, hard]] of rows) {
      expect([k('story'), k('normal'), k('hard')].map((f) => gained(kind, f, [])[count])).toEqual([
        story,
        normal,
        hard,
      ]);
      const others = Object.entries(gained(kind, 1, [])).filter(
        ([s]) => s !== count && s !== 'guns',
      );
      expect(others.every(([, v]) => v === 0)).toBe(true);
    }
  });

  it('an ammo box: pistol bullets 3, shotgun shells 2, rifle rounds 8 on Normal, for the guns you own', () => {
    expect(gained('ammo', 1, [])).toMatchObject({ ammo: 3, shells: 0, rounds: 0, arrows: 0 });
    expect(gained('ammo', 1, ['shotgun'])).toMatchObject({ ammo: 0, shells: 2, rounds: 0 });
    const all: GunKind[] = ['pistol', 'shotgun', 'rifle'];
    expect(gained('ammo', 1, all)).toMatchObject({ ammo: 3, shells: 2, rounds: 8, arrows: 0 });
    expect(gained('ammo', k('story'), all)).toMatchObject({ ammo: 5, shells: 3, rounds: 13 });
    expect(gained('ammo', k('hard'), all)).toMatchObject({ ammo: 2, shells: 1, rounds: 5 });
  });

  it('the Day 2 pistol comes with 6 bullets; each crate gun comes with its own ammo', () => {
    expect(gained('gun', 1, [])).toMatchObject({ guns: ['pistol'], ammo: 6 });
    expect(gained('crate', 1, [], 'pistol')).toMatchObject({ ammo: 6, arrows: 2, fishPacks: 1 });
    expect(gained('crate', 1, ['pistol'], 'shotgun')).toMatchObject({ ammo: 6, shells: 4 });
    expect(gained('crate', 1, ['pistol', 'shotgun'], 'rifle')).toMatchObject({
      guns: ['pistol', 'shotgun', 'rifle'],
      ammo: 6,
      shells: 4,
      rounds: 15,
    });
  });

  it('a tape adds no supplies', () => {
    const counts = Object.entries(gained('tape', 1, [])).filter(([s]) => s !== 'guns');
    expect(counts.every(([, v]) => v === 0)).toBe(true);
  });
});

describe('inShowRange', () => {
  it('draws pickups near the player and skips those beyond the range', () => {
    const eye = { x: 0, z: -100 };
    expect(inShowRange(-14, -110, eye)).toBe(true);
    expect(inShowRange(0, -100 - SHOW_RANGE - 1, eye)).toBe(false);
    expect(SHOW_RANGE).toBeLessThan(55); // inside the night fog's far end
  });
});

describe('glowScale', () => {
  it('is 1 near, grows linearly with distance, and caps', () => {
    expect(glowScale(0)).toBe(1);
    expect(glowScale(GLOW.growFrom)).toBe(1);
    expect(glowScale(GLOW.growFrom * 2)).toBeCloseTo(2);
    expect(glowScale(GLOW.growTo)).toBeCloseTo(GLOW.growTo / GLOW.growFrom);
    expect(glowScale(500)).toBe(glowScale(GLOW.growTo));
  });
});
