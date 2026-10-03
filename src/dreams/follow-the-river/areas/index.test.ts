import { describe, expect, it } from 'vitest';
import { BATTERY } from '../flashlight';
import { PICKUP_GAIN } from '../pickups';
import { PHASES } from '../state';
import { CITY } from './city';
import { FOREST } from './forest';
import { areaFor } from './index';
import { SUBURBS } from './suburbs';

describe('areaFor', () => {
  it('routes each day and night to its area, and intro/end to none', () => {
    const ids = PHASES.map((p) => areaFor(p)?.id ?? null);
    expect(ids).toEqual([null, 'city', 'city', 'suburbs', 'suburbs', 'forest', 'forest', null]);
  });
});

/** A careful day: about a minute of torch use (inside shacks). */
const DAY_TORCH_SECONDS = 60;

describe('supply balance', () => {
  it.each([CITY, SUBURBS, FOREST])(
    '$id leaves a careful player ≥ 1 fish pack and ≥ 50 % battery',
    (area) => {
      const count = (kind: string): number => area.pickups.filter((p) => p.kind === kind).length;
      expect(count('fishPack')).toBeGreaterThanOrEqual(2);
      const refill = count('battery') * (PICKUP_GAIN.battery?.amount ?? 0);
      expect(refill).toBeGreaterThanOrEqual(DAY_TORCH_SECONDS * BATTERY.drainPerSecond);
    },
  );
});
