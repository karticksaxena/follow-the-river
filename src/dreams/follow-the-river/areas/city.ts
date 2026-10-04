import { EDGE_X } from '../river';
import { seeded } from '../skyline';
import type { AreaDef, LurkerDef, PickupDef, PropPlacement, ScareDef, ShackDef } from './types';

const ROAD_X = -5;
const LIGHT_X = -8.5;
/** Day-1 strip: from the start blocker to the barricade, then Night 1 on to the boathouse. */
const START_Z = 14;
const END_Z = -415;
const BARRICADE_Z = -120;
const LAND_X = -18;
/** Shack interiors: back wall at x ≈ -17, so pickups sit 1 m in. */
const SHACK_BACK_X = -16;
const SHACK_MID_X = -13.7;
/** Facing +X (toward the door and the road). */
const FACE_DOOR = -Math.PI / 2;
/** Fence pieces are ~2.3 m long; 10 across the 21 m strip overlap slightly. */
const BARRICADE_FENCES = 10;
const BUILDING_SEED = 23;
const BUILDINGS = [
  ...'a,b,c,d,e,f,g,h'.split(',').map((c) => `building-${c}`),
  'building-skyscraper-a',
  'building-skyscraper-b',
];

type Extra = Pick<PropPlacement, 'yaw' | 'scale' | 'collide'>;

/** Props at every `step` m from `fromZ` down to `toZ` (z decreases), all at the same x. */
function row(
  kit: PropPlacement['kit'],
  model: string,
  fromZ: number,
  toZ: number,
  step: number,
  x: number,
  extra: Extra = {},
): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let z = fromZ; z >= toZ; z -= step) out.push({ kit, model, x, z, ...extra });
  return out;
}

/** Kenney city buildings behind the shacks, fronts toward the river; the same picks every visit. */
function backdrop(): PropPlacement[] {
  const random = seeded(BUILDING_SEED);
  return row('city', 'building-a', 10, -250, 14, -27).map((p) => ({
    ...p,
    model: BUILDINGS[Math.floor(random() * BUILDINGS.length)],
    x: -24 - random() * 6,
    yaw: -Math.PI / 2,
  }));
}

function car(model: string, x: number, z: number, yaw = 0): PropPlacement {
  return { kit: 'cars', model, x, z, yaw, collide: true };
}

function solid(
  kit: PropPlacement['kit'],
  model: string,
  x: number,
  z: number,
  yaw = 0,
): PropPlacement {
  return { kit, model, x, z, yaw, collide: true };
}

/** Wrecks, a start blocker, and clutter by the shacks. */
function streetProps(): PropPlacement[] {
  return [
    car('garbage-truck', -5, START_Z - 2),
    car('sedan', -8.5, START_Z - 2, 0.3),
    car('sedan', -1.5, START_Z - 2, -0.2),
    car('police', -4, -24, 0.4),
    car('sedan', -6, -44),
    car('van', -4, -66, -0.2),
    car('taxi', -5, -88),
    car('ambulance', -3, -116),
    solid('roads', 'dumpster', -9, -82, Math.PI / 2),
    solid('roads', 'dumpster', -9.5, -8, Math.PI / 2),
    solid('survival', 'barrel', -9.5, -22),
    solid('survival', 'barrel', -9.2, -40),
    solid('survival', 'box-large', -9.5, -60),
    solid('survival', 'box', -9.3, -104),
    solid('survival', 'barrel', -9.5, -108),
  ];
}

/** Fence and barriers across the whole strip at the barricade (buildWorld adds the collider). */
function barricade(): PropPlacement[] {
  const out: PropPlacement[] = [];
  const first = LAND_X + 1.1;
  const last = EDGE_X - 1.2;
  const step = (last - first) / (BARRICADE_FENCES - 1);
  for (let i = 0; i < BARRICADE_FENCES; i++) {
    const x = first + i * step;
    out.push({ kit: 'roads', model: 'construction-fence', x, z: BARRICADE_Z, yaw: Math.PI / 2 });
    if (i % 3 === 1) {
      out.push({
        kit: 'roads',
        model: 'construction-barrier',
        x,
        z: BARRICADE_Z + 1.2,
        yaw: Math.PI / 2 + (i % 2) * 0.15,
      });
    }
    if (i % 3 === 0)
      out.push({ kit: 'roads', model: 'construction-cone', x: x + 1, z: BARRICADE_Z + 1.6 });
  }
  return out;
}

/** Past the barricade the city thins into suburb fences, big trees and poles. */
function outskirts(): PropPlacement[] {
  return [
    ...row('suburb', 'fence-2x3', -250, -400, 12, -16, { yaw: Math.PI / 2 }),
    ...row('suburb', 'tree-large', -255, -400, 20, -14),
    ...row('suburb', 'tree-large', -265, -400, 28, -12.5),
    ...row('roads', 'electricity-pole', -270, -400, 40, -10.5),
  ];
}

const PROPS: readonly PropPlacement[] = [
  ...row('roads', 'road-straight', 12, -410, 6, ROAD_X, { yaw: Math.PI / 2 }),
  ...row('roads', 'light-square', 10, -400, 18, LIGHT_X),
  ...streetProps(),
  ...backdrop(),
  ...barricade(),
  ...outskirts(),
  { kit: 'survival', model: 'bedroll', x: -0.9, z: -113.5, yaw: 0.5 },
];

const SHACKS: readonly ShackDef[] = [
  { id: 's1', x: -13.74, z: -14, width: 3, depth: 2 },
  { id: 's2', x: -13.74, z: -32, width: 3, depth: 2 },
  { id: 's3', x: -13.74, z: -52, width: 3, depth: 2 },
  { id: 's4', x: -13.74, z: -74, width: 3, depth: 2 },
  { id: 's5', x: -13.74, z: -96, width: 3, depth: 2 },
];

const PICKUPS: readonly PickupDef[] = [
  { id: 'battery-1', kind: 'battery', x: SHACK_BACK_X, z: -14 },
  { id: 'battery-2', kind: 'battery', x: -3, z: -60 },
  { id: 'battery-3', kind: 'battery', x: SHACK_BACK_X, z: -77 },
  { id: 'arrows-1', kind: 'arrows', x: SHACK_BACK_X, z: -35 },
  { id: 'arrows-2', kind: 'arrows', x: SHACK_BACK_X, z: -71 },
  { id: 'arrows-3', kind: 'arrows', x: -9, z: -84 },
  { id: 'fish-1', kind: 'fishPack', x: SHACK_BACK_X, z: -29 },
  { id: 'fish-2', kind: 'fishPack', x: SHACK_BACK_X, z: -96 },
  { id: 'tape-1', kind: 'tape', x: SHACK_BACK_X, z: -52, tape: 1 },
];

const LURKERS: readonly LurkerDef[] = [
  { x: SHACK_MID_X, z: -12, yaw: FACE_DOOR },
  // The ambush: a "corpse" in s3's back corner, just over WAKE (4 m) from the tape, so it only
  // rises when the tape is taken (or the player pokes around the corner).
  { x: -16.2, z: -56.15, yaw: 0, lying: true },
  { x: SHACK_MID_X, z: -74, yaw: FACE_DOOR, lying: true },
  { x: SHACK_MID_X, z: -94, yaw: FACE_DOOR },
  { x: -6, z: -70, yaw: 0, lying: true },
];

const SCARES: readonly ScareDef[] = [
  { kind: 'watcher', x: -15, z: -40, trigger: 12 },
  { kind: 'ambush', shack: 's3', trigger: 1.5 },
  { kind: 'alarm', x: -4, z: -66, trigger: 4 },
];

export const CITY: AreaDef = {
  id: 'city',
  chapter: 1,
  arrival: ['You made it to the boathouse.', 'Night 1 survived.'],
  ground: 0x1d1f21,
  farBank: 0x15181b,
  skyline: 'city',
  bank: 'embankment',
  landX: LAND_X,
  startZ: START_Z,
  endZ: END_Z,
  waves: [
    { z: -148, gateZ: -180, count: 6, crate: { x: -1, gun: 'pistol' } },
    { z: -212, gateZ: -244, count: 8, crate: { x: -1, gun: 'shotgun' } },
    { z: -276, gateZ: -308, count: 10, crate: { x: -1 } },
  ],
  gate: { kit: 'roads', model: 'construction-fence', yaw: Math.PI / 2 },
  daySpawn: { x: 0, z: 6, yaw: 0 },
  waitSpot: { x: 0.5, z: -113, yaw: Math.PI },
  barricadeZ: BARRICADE_Z,
  nightStart: { x: 1.5, z: -124, yaw: 0 },
  safeZ: -400,
  safeProp: { prop: 'boathouse', x: 0, z: -402, yaw: 0 },
  props: PROPS,
  shacks: SHACKS,
  pickups: PICKUPS,
  lurkers: LURKERS,
  scares: SCARES,
};
