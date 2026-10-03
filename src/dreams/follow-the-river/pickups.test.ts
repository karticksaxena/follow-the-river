import { describe, expect, it } from 'vitest';
import type { PickupDef } from './areas/types';
import { collect, nearestPickup, PICKUP_RADIUS, promptFor } from './pickups';
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

  it('says when you cannot carry more', () => {
    const full = { ...freshRun().supplies, battery: SUPPLY_LIMITS.battery };
    expect(promptFor(battery, full)).toMatch(/full/i);
    expect(promptFor(battery, { ...full, battery: 10 })).toMatch(/^E: /);
  });
});
