import type { AreaDef, PickupDef } from './areas/types';
import { HOUSE_CLEARANCE, nearBox } from './houses';
import { EDGE_X } from './river';
import { shackBounds } from './shack';

/** Loose loot lies in the walkable band, this far in from the river's edge and from the land side (m). Tuning knobs. */
export const LOOT_RIVER_MARGIN = 2;
export const LOOT_LAND_MARGIN = 2;
/** Most a loose pickup shifts along z from where the level asked for it (m). */
export const LOOT_Z_JITTER = 1.5;
/** Clear of a solid prop (m). */
export const LOOT_PROP_CLEARANCE = 2.5;
const TRIES = 12;
/** Reshuffles every pickup's roll at once (tuning knob). */
const LOOT_SALT = 7;
/** A pickup within this of a house box counts as inside it (not loose). */
const INSIDE_MARGIN = 0.5;

/** Deterministic hash of a string and a try number to [0, 1). */
function hash01(s: string, n: number): number {
  let h = 2166136261 ^ (n + LOOT_SALT);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Where a loose pickup lies: x spread across the band, z nudged, never in a house or beside a solid prop. Pure per id. */
export function lootSpot(area: AreaDef, id: string, z: number): { x: number; z: number } {
  const lo = area.landX + LOOT_LAND_MARGIN;
  const hi = EDGE_X - LOOT_RIVER_MARGIN;
  const houses = area.shacks.map(shackBounds);
  const solids = area.props.filter((p) => p.collide);
  let spot = { x: (lo + hi) / 2, z };
  for (let n = 0; n < TRIES; n++) {
    const x = lo + hash01(id, n * 2) * (hi - lo);
    const zz = z + (hash01(id, n * 2 + 1) * 2 - 1) * LOOT_Z_JITTER;
    spot = { x, z: zz };
    const hit =
      nearBox(houses, x, zz, HOUSE_CLEARANCE) ||
      solids.some((p) => Math.hypot(x - p.x, zz - p.z) <= LOOT_PROP_CLEARANCE);
    if (!hit) return spot;
  }
  return spot; // ponytail: after TRIES clashes keep the last roll; the area test fails loudly if that ever happens
}

/** A pickup is loose when it is not inside a house (a shack's footprint, walls included). */
export function isLoose(area: AreaDef, p: PickupDef): boolean {
  return !nearBox(area.shacks.map(shackBounds), p.x, p.z, INSIDE_MARGIN);
}

/** The area's day pickups with the loose ones spread across the path (tapes and house contents stay put). */
export function spreadPickups(area: AreaDef): PickupDef[] {
  return area.pickups.map((p) => (isLoose(area, p) ? { ...p, ...lootSpot(area, p.id, p.z) } : p));
}
