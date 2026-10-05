import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import type { AreaDef } from './areas/types';
import { DIFFICULTY } from './difficulty';
import { waveBudget } from './fish-parts';
import { AMMO_BOX, CRATE, PICKUP_GAIN } from './pickups';
import { scaled, type GunKind } from './state';
import { edgePickups, quotaOf } from './waves';

/** Shots per kill (a head and body mix), and how many kills one shotgun shell is worth. Tuning knobs. */
const SHOTS_PER_KILL = 1.6;
const SHELL_KILLS = 2;
const FAIR = { min: 1.3, max: 2.5 };

/** Guns owned when the night begins (earlier nights' crates). */
const OWNED_AT_START: Readonly<Record<AreaDef['id'], readonly GunKind[]>> = {
  city: [],
  suburbs: ['pistol', 'shotgun'],
  forest: ['pistol', 'shotgun', 'rifle'],
};
/** Kills one unit of a gun's ammunition is worth. */
const KILLS: Readonly<Record<GunKind, number>> = { pistol: 1, shotgun: SHELL_KILLS, rifle: 1 };

const normal = DIFFICULTY.normal;
const arrowsPerPickup = scaled(PICKUP_GAIN.arrows?.amount ?? 0, normal.supplies);

/** Kills' worth of ammunition for the guns owned, from a per-gun table (a crate's, or an ammo box's). */
const ammoOf = (guns: readonly GunKind[], per: Readonly<Record<GunKind, number>>): number =>
  guns.reduce((n, g) => n + scaled(per[g], normal.supplies) * KILLS[g], 0);

/** Shots wave `i` of `area` needs on Normal, and what its zone hands out (crate, houses, edge supplies, arrows). */
function balance(area: AreaDef, i: number): { needed: number; supplied: number } {
  const def = area.waves[i];
  if (!def) throw new Error('no such wave');
  const owned: GunKind[] = [...OWNED_AT_START[area.id]];
  for (const w of area.waves.slice(0, i + 1)) {
    if (w.crate.gun && !owned.includes(w.crate.gun)) owned.push(w.crate.gun);
  }
  const total = quotaOf(def, normal.quota);
  const needed = (total - waveBudget(total, normal.orca.share)) * SHOTS_PER_KILL;
  const inZone = (z: number): boolean => z < def.z && z > def.gateZ;
  let supplied = ammoOf(owned, CRATE.ammo) + scaled(CRATE.arrows, normal.supplies);
  for (const p of [...(area.housePickups ?? []), ...edgePickups(area)]) {
    if (!inZone(p.z)) continue;
    if (p.kind === 'ammo') supplied += ammoOf(owned, AMMO_BOX);
    else if (p.kind === 'arrows') supplied += arrowsPerPickup;
  }
  return { needed, supplied };
}

describe('Night 1 on Normal: a struggle, but fair', () => {
  CITY.waves.forEach((_, i) => {
    it(`wave ${i + 1} hands out 1.3x to 2.5x the shots it needs`, () => {
      const { needed, supplied } = balance(CITY, i);
      expect(supplied).toBeGreaterThanOrEqual(FAIR.min * needed);
      expect(supplied).toBeLessThanOrEqual(FAIR.max * needed);
    });
  });

  it('is computed for Nights 2 and 3 too (reported by the plan, not asserted)', () => {
    for (const area of [SUBURBS, FOREST]) {
      for (let i = 0; i < area.waves.length; i++) {
        const { needed, supplied } = balance(area, i);
        expect(needed).toBeGreaterThan(0);
        expect(supplied).toBeGreaterThan(0);
      }
    }
  });
});
