import type { Kit } from '../kits';
import type { GunKind } from '../state';

export interface Spot {
  x: number;
  z: number;
  yaw: number;
}
export interface PropPlacement {
  kit: Kit;
  model: string;
  x: number;
  z: number;
  /** Height of the base (default 0, the ground). */
  y?: number;
  yaw?: number;
  scale?: number;
  collide?: boolean;
}
/** Tiles; the door faces +X (the road/river). */
export interface ShackDef {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
}
export type PickupKind = 'battery' | 'arrows' | 'fishPack' | 'tape' | 'ammo' | 'gun' | 'crate';
export interface PickupDef {
  id: string;
  kind: PickupKind;
  /** A crate's new gun (crates hold ammo for every gun you own, arrows, a battery, a fish pack). */
  gun?: GunKind;
  x: number;
  z: number;
  tape?: number;
}
/** `lying`: starts on the ground like a corpse and gets up when the player comes close. */
export interface LurkerDef {
  x: number;
  z: number;
  yaw: number;
  lying?: boolean;
}
export type ScareDef =
  | { kind: 'watcher'; x: number; z: number; trigger: number }
  | { kind: 'ambush'; shack: string; trigger: number }
  | { kind: 'alarm'; x: number; z: number; trigger: number };
/**
 * One ambush of a wave: sprung when the player walks past `z` (between the wave's start and gate).
 * street: out of a side street on the land side; cover: from behind an obstacle at (`x`, `at`);
 * lying: "corpses" at (`x`, `at`) that get up when you come close; behind: upstream of you.
 */
export interface AmbushDef {
  z: number;
  count: number;
  kind: 'street' | 'cover' | 'lying' | 'behind';
  /** cover/lying: the spot on the bank (x) and its z (absolute). */
  x?: number;
  at?: number;
}
/** One wave of a night: where it starts, the barricade that holds you, how many come, the crate. */
export interface WaveDef {
  /** Walking past this z (downstream) starts the wave; the crate sits just beyond it. */
  z: number;
  /** The barricade across the bank (z) that stays up until the wave is dead. */
  gateZ: number;
  /** Zombies to kill before the barricade falls (Normal; ambushes count toward it). */
  quota: number;
  /** Seconds between spawns, random in [min, max] (Normal). */
  every: readonly [number, number];
  /** Most of this wave alive at once. */
  cap: number;
  /** Added to the night's chase speed (m/s): each wave a little faster. */
  faster: number;
  /** Ambushes set off along the zone, by trigger z (downstream order); they count toward the quota. */
  ambushes: readonly AmbushDef[];
  /** The crate's x on the bank, and the gun inside, if any. */
  crate: { x: number; gun?: GunKind };
}

/** A kit piece for a barricade. */
export interface GatePiece {
  kit: Kit;
  model: string;
  yaw: number;
  scale?: number;
}

/** What the wave barricades are built from: a solid row across the bank, and a few extras in front. */
export interface GateStyle {
  row: GatePiece;
  extra: GatePiece;
}

export interface AreaDef {
  id: 'city' | 'suburbs' | 'forest';
  /** Which chapter (day and night) plays here. */
  chapter: 1 | 2 | 3;
  /** Pages shown when the night is survived. */
  arrival: readonly string[];
  ground: number;
  farBank: number;
  skyline: 'city' | 'houses' | 'trees';
  /** How the land meets the water: a concrete wall (city) or a sloping mud bank (country). */
  bank: 'embankment' | 'natural';
  /** Land side of the play strip (x), the river edge is EDGE_X. */
  landX: number;
  /** Strip ends: the start blocker (z, positive) and the far end (z, negative). */
  startZ: number;
  endZ: number;
  daySpawn: Spot;
  /** The night's waves, in order downstream (Night 3's last wave is the ending's). */
  waves: readonly WaveDef[];
  gate: GateStyle;
  waitSpot: Spot;
  barricadeZ: number;
  nightStart: Spot;
  safeZ: number;
  /** The night's safe-spot prop (a model from the props folder), loaded by the chapter. */
  safeProp?: { prop: string; x: number; z: number; yaw: number };
  /** Night 3: reaching it starts the ending instead of the safe spot. */
  endingAt?: { x: number; z: number; radius: number };
  /** Where Mom waits (Night 3): on the shore, at ground level. */
  meetAt?: { x: number; z: number };
  /** The strip ends in a lake: `z` is where the shore meets the water. */
  lake?: { z: number };
  /** Fog far distance at night, overriding the area's default. */
  nightFog?: number;
  props: readonly PropPlacement[];
  shacks: readonly ShackDef[];
  pickups: readonly PickupDef[];
  lurkers: readonly LurkerDef[];
  scares: readonly ScareDef[];
}
