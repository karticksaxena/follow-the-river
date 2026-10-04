import { describe, expect, it } from 'vitest';
import type { PickupDef } from './areas/types';
import { collect, CRATE, nearestPickup, PICKUP_RADIUS, promptFor } from './pickups';
import { freshRun, restartPhase, SUPPLY_LIMITS } from './state';

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
    const after = collect(live, battery);
    expect(after.taken).toContain('battery-1');
    expect(live.taken).not.toContain('battery-1');
  });

  it('files tapes as found', () => {
    expect(collect(restartPhase(freshRun()), tape).tapes).toEqual([1]);
  });

  it('says when you cannot carry more spare batteries', () => {
    const full = { ...freshRun().supplies, cells: SUPPLY_LIMITS.cells };
    expect(promptFor(battery, full)).toMatch(/full/i);
    expect(promptFor(battery, { ...full, cells: 1 })).toMatch(/^E: /);
  });

  it('a battery is a spare for R, not charge', () => {
    const after = collect(restartPhase(freshRun()), battery);
    expect(after.supplies.cells).toBe(1);
  });

  it('a crate gives its gun, then ammo for every gun you own, arrows, a battery and a fish pack', () => {
    const live = { ...restartPhase(freshRun()), guns: ['pistol' as const] };
    const crate: PickupDef = { id: 'c', kind: 'crate', x: 0, z: 0, gun: 'shotgun' };
    const after = collect(live, crate);
    expect(after.guns).toEqual(['pistol', 'shotgun']);
    expect(after.supplies.ammo).toBe(CRATE.ammo.pistol);
    expect(after.supplies.shells).toBe(CRATE.ammo.shotgun);
    expect(after.supplies.rounds).toBe(0);
    expect(after.supplies.cells).toBe(CRATE.cells);
    expect(promptFor(crate, after.supplies)).toBe('E: take the shotgun');
  });

  it('the Day 2 pistol is not a second pistol when you already have one', () => {
    const live = { ...restartPhase(freshRun()), guns: ['pistol' as const] };
    const gun: PickupDef = { id: 'gun', kind: 'gun', x: 0, z: 0 };
    expect(collect(live, gun).guns).toEqual(['pistol']);
  });
});
