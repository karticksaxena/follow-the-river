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
export type PickupKind = 'battery' | 'arrows' | 'fishPack' | 'tape' | 'ammo';
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
  props: readonly PropPlacement[];
  shacks: readonly ShackDef[];
  pickups: readonly PickupDef[];
  lurkers: readonly LurkerDef[];
  scares: readonly ScareDef[];
}
