import type { Kit } from '../kits';

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
export type PickupKind = 'battery' | 'arrows' | 'fishPack' | 'tape' | 'ammo' | 'gun';
export interface PickupDef {
  id: string;
  kind: PickupKind;
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
export interface AreaDef {
  id: 'city' | 'suburbs' | 'forest';
  /** Which chapter (day and night) plays here. */
  chapter: 1 | 2 | 3;
  /** Pages shown when the night is survived. */
  arrival: readonly string[];
  ground: number;
  farBank: number;
  skyline: 'city' | 'houses' | 'trees';
  /** Land side of the play strip (x), the river edge is EDGE_X. */
  landX: number;
  /** Strip ends: the start blocker (z, positive) and the far end (z, negative). */
  startZ: number;
  endZ: number;
  daySpawn: Spot;
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
