import { describe, expect, it } from 'vitest';
import type { PickupDef } from './areas/types';
import {
  AMMO_BOX,
  collect,
  CRATE,
  isFull,
  nearestPickup,
  PICKUP_RADIUS,
  promptFor,
} from './pickups';
import { freshRun, restartPhase, SUPPLY_LIMITS, type GunKind } from './state';

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
});
