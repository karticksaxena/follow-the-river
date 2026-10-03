import { EDGE_X } from '../river';
import { shackBounds } from '../shack';
import { seeded } from '../skyline';
import type { AreaDef, LurkerDef, PickupDef, PropPlacement, ScareDef, ShackDef } from './types';

const START_Z = 14;
/** Where the shore meets the water; the pebble band (6 m) lies on the land side of it. */
const LAKE_Z = -392;
/** One metre before the water: buildWorld's end wall sits here. */
const END_Z = -391;
const BARRICADE_Z = -120;
const LAND_X = -18;
const SAFE_Z = -372;
/** The dam across the lake, ~48 m past the shore: lost in Night 3's fog, a grey shape at dawn. */
const DAM = { prop: 'dam', x: 10, z: -440, yaw: 0 };
/** Mom on the pebbles, her canoe beside her. */
const MOM = { x: -3, z: -387.5 };
const PINE_SEED = 61;
const SHACK_BACK_X = -16;
const FACE_DOOR = -Math.PI / 2;
const TAU = Math.PI * 2;
/** Metres kept free of scenery around each shack (pine canopies are wide). */
const SHACK_CLEARANCE = 1.5;
const PINES = [
  'tree_pineTallA',
  'tree_pineTallB',
  'tree_pineTallC',
  'tree_pineTallD',
  'tree_pineDefaultA',
  'tree_pineDefaultB',
  'tree_tall_dark',
];

function at(model: string, x: number, z: number, yaw = 0, scale?: number): PropPlacement {
  return { kit: 'nature', model, x, z, yaw, ...(scale ? { scale } : {}) };
}

/** Random pines in the band x0…x1 every `step` m from fromZ to toZ; the same picks every visit. */
function pines(
  seed: number,
  fromZ: number,
  toZ: number,
  step: number,
  x0: number,
  x1: number,
): PropPlacement[] {
  const random = seeded(seed);
  const out: PropPlacement[] = [];
  for (let z = fromZ; z >= toZ; z -= step) {
    const model = PINES[Math.floor(random() * PINES.length)];
    const x = x0 + random() * (x1 - x0);
    out.push(at(model, x, z - random() * step * 0.5, random() * TAU, 0.9 + random() * 0.5));
  }
  return out;
}

/** Day forest: a thick wall of pines on the land side (two bands) and a few on the far bank. */
function dayForest(): PropPlacement[] {
  return [
    ...pines(PINE_SEED, 12, -118, 2.2, -26, -14),
    ...pines(PINE_SEED + 1, 12, -118, 2.4, -60, -26),
    ...pines(PINE_SEED + 2, 10, -118, 14, 20, 40),
  ];
}

/** Pines along both sides of the lake, receding into the fog, and rocks along the shore. */
function lakeShore(): PropPlacement[] {
  const random = seeded(PINE_SEED + 6);
  const out = [
    ...pines(PINE_SEED + 7, LAKE_Z - 2, LAKE_Z - 110, 5, -78, -64),
    ...pines(PINE_SEED + 8, LAKE_Z - 2, LAKE_Z - 110, 7, 94, 110),
    at('canoe', MOM.x + 2.5, MOM.z - 1.2, 0.35, 0.6),
  ];
  for (let x = -34; x < 62; x += 9) {
    if (x > EDGE_X - 4 && x < EDGE_X + 18) continue; // the river mouth stays open
    const model = random() < 0.5 ? 'rock_largeA' : 'rock_largeC';
    out.push(
      at(
        model,
        x + random() * 4,
        LAKE_Z + 0.5 + random() * 2,
        random() * TAU,
        0.3 + random() * 0.3,
      ),
    );
  }
  return out;
}

const TALL_ROCKS = ['rock_tallA', 'rock_tallB', 'rock_tallC', 'rock_tallD', 'rock_tallE'];

/** Night route: the forest thins to rocks, the far bank turns to cliffs, the river looks narrow. */
function nightRoute(): PropPlacement[] {
  const out = [
    ...pines(PINE_SEED + 3, -124, -390, 9, -34, -16),
    ...pines(PINE_SEED + 4, -124, -390, 30, 20, 30),
  ];
  const random = seeded(PINE_SEED + 5);
  // Real rock shapes only: the cliff blocks read as plain brown boxes in the fog.
  const tall = (): string => TALL_ROCKS[Math.floor(random() * TALL_ROCKS.length)] ?? 'rock_tallA';
  for (let z = -130; z > -388; z -= 14) {
    out.push(at(tall(), -17 - random() * 4, z, random() * TAU, 1 + random() * 0.6));
    out.push(at(tall(), 18 + random() * 6, z - 6, random() * TAU, 1.6 + random()));
    if (Math.round(z / 14) % 3 === 0) out.push(at('rock_largeC', 19 + random() * 4, z, 0, 1.4));
  }
  return out;
}

/** Fallen logs and rocks across the whole strip; buildWorld adds the collider. */
function barricade(): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let i = 0; i < 6; i++) {
    const x = LAND_X + 1.5 + i * 3.9;
    out.push(at('log_large', x, BARRICADE_Z, (i % 2) * 0.12));
    out.push(at(i % 2 ? 'rock_largeB' : 'rock_largeE', x + 1.9, BARRICADE_Z + 0.8, i, 0.8));
  }
  out.push(
    at('log_large', -8, BARRICADE_Z + 1.2, 0.2),
    at('log_large', -1, BARRICADE_Z + 1.5, -0.2),
  );
  return out;
}

function campsite(): PropPlacement[] {
  return [
    at('tent_detailedOpen', -9, -22, FACE_DOOR),
    at('tent_smallClosed', -9.5, -30, FACE_DOOR + 0.2),
    at('tent_detailedOpen', -8.5, -38, FACE_DOOR - 0.15),
    at('campfire_logs', -4, -29, 0, 0.4),
    at('log_stack', -12, -26, 0.4),
    at('log_large', -3.4, -33, 1.2, 0.6),
    at('log_large', -3.2, -25, 1.9, 0.6),
    at('canoe', 0.8, -48, 0.15),
    { kit: 'survival', model: 'barrel', x: -11.5, z: -33 },
    { kit: 'survival', model: 'box', x: -11, z: -42 },
  ];
}

/** Rocks, stumps, moss, mushrooms and bushes scattered along the day strip. */
function clutter(): PropPlacement[] {
  const out: PropPlacement[] = [
    at('rock_largeA', -12, -10, 0.5, 0.8),
    at('rock_largeD', -11, -58, 2, 0.9),
    at('rock_tallA', -12.5, -88, 1),
    at('rock_largeF', -10, -104, 4, 0.7),
    at('rock_tallC', -2, -96, 3, 0.5),
    at('rock_largeC', -1, -6, 1, 0.4),
    at('bridge_wood', -12, -56, FACE_DOOR, 0.5),
  ];
  const random = seeded(PINE_SEED + 9);
  for (let z = 8; z > -118; z -= 7) {
    const x = -11 - random() * 5;
    out.push(at(z % 2 ? 'stump_old' : 'stump_oldTall', x, z, random() * TAU, 0.5));
    out.push(at('mushroom_redGroup', x + 1.5 + random() * 3, z - 3, random() * TAU));
    out.push(at('plant_bush', x + random() * 3, z - 5, random() * TAU, 0.5));
    if (z % 14 === 0) out.push(at('hanging_moss', x - 1, z, random() * TAU));
  }
  return out;
}

const SHACKS: readonly ShackDef[] = [{ id: 'cabin', x: -13.74, z: -70, width: 3, depth: 2 }];

/** True when a prop stands clear of every shack (trees would otherwise grow through the roof). */
function clearOfShacks(p: PropPlacement): boolean {
  return SHACKS.every((s) => {
    const b = shackBounds(s);
    const out = p.x < b.minX - SHACK_CLEARANCE || p.x > b.maxX + SHACK_CLEARANCE;
    return out || p.z < b.minZ - SHACK_CLEARANCE || p.z > b.maxZ + SHACK_CLEARANCE;
  });
}

const PROPS: readonly PropPlacement[] = [
  ...[...dayForest(), ...nightRoute(), ...lakeShore(), ...campsite(), ...clutter()].filter(
    clearOfShacks,
  ),
  ...barricade(),
  { kit: 'survival', model: 'campfire-pit', x: 0.3, z: -113 },
  { kit: 'survival', model: 'bedroll', x: -0.9, z: -113.5, yaw: 0.5 },
];

const PICKUPS: readonly PickupDef[] = [
  { id: 'fish-1', kind: 'fishPack', x: -6, z: -4 },
  { id: 'fish-2', kind: 'fishPack', x: -5, z: -92 },
  { id: 'battery-1', kind: 'battery', x: -6, z: -45 },
  { id: 'battery-2', kind: 'battery', x: -7, z: -108 },
  { id: 'ammo-1', kind: 'ammo', x: -5.5, z: -18 },
  { id: 'ammo-2', kind: 'ammo', x: -2, z: -80 },
  { id: 'arrows-1', kind: 'arrows', x: -6, z: -64 },
  { id: 'arrows-2', kind: 'arrows', x: -3, z: -52 },
  { id: 'tape-3', kind: 'tape', x: SHACK_BACK_X, z: -70, tape: 3 },
];

const LURKERS: readonly LurkerDef[] = [
  // Campsite: lying in and beside the tents.
  { x: -9, z: -22.2, yaw: FACE_DOOR, lying: true },
  { x: -9.5, z: -30.2, yaw: FACE_DOOR, lying: true },
  { x: -6.5, z: -39, yaw: 0, lying: true },
  // The ambush: in the cabin's back corner, just over WAKE from the tape.
  { x: -16.2, z: -74.15, yaw: 0, lying: true },
  { x: -7, z: -14, yaw: 0 },
  { x: -4, z: -60, yaw: FACE_DOOR },
  { x: -6, z: -98, yaw: 0 },
];

const SCARES: readonly ScareDef[] = [
  { kind: 'watcher', x: -13, z: -50, trigger: 13 },
  { kind: 'ambush', shack: 'cabin', trigger: 1.5 },
];

export const FOREST: AreaDef = {
  id: 'forest',
  chapter: 3,
  arrival: ['The river opens into a still, black lake.', 'Mom said she would be waiting.'],
  ground: 0x14170f,
  farBank: 0x0f130d,
  skyline: 'trees',
  landX: LAND_X,
  startZ: START_Z,
  endZ: END_Z,
  daySpawn: { x: 0, z: 6, yaw: 0 },
  waitSpot: { x: 0.5, z: -113, yaw: Math.PI },
  barricadeZ: BARRICADE_Z,
  nightStart: { x: 1.5, z: -124, yaw: 0 },
  safeZ: SAFE_Z,
  safeProp: DAM,
  endingAt: { x: -4, z: -381, radius: 4 },
  meetAt: MOM,
  lake: { z: LAKE_Z },
  nightFog: 45,
  props: PROPS,
  shacks: SHACKS,
  pickups: PICKUPS,
  lurkers: LURKERS,
  scares: SCARES,
};
