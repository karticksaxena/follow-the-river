import { EDGE_X, FAR_EDGE_X, LAKE, RIVER_X, shoreY } from '../river';
import { shackBounds } from '../shack';
import { lakeEdgeZ } from '../shore-shape';
import { seeded } from '../skyline';
import { DEAD_TREES, PEBBLES, PINES, ROCKS, UNDERGROWTH } from '../vegetation';
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
const DAM = { prop: 'dam', x: RIVER_X, z: -440, yaw: 0 };
/** Mom on the pebbles, her canoe beside her. */
const MOM = { x: -3, z: -387.5 };
const PINE_SEED = 61;
const SHACK_BACK_X = -16;
const FACE_DOOR = -Math.PI / 2;
const TAU = Math.PI * 2;
/** Metres kept free of scenery around each shack (pine canopies are wide). */
const SHACK_CLEARANCE = 1.5;

function at(model: string, x: number, z: number, yaw = 0, scale?: number): PropPlacement {
  return { kit: 'nature', model, x, z, yaw, ...(scale ? { scale } : {}) };
}

/** A MegaKit plant, tree or rock (`nature.ts` instances them; far trees are picked by distance). */
function mega(model: string, x: number, z: number, yaw = 0, scale = 1, y?: number): PropPlacement {
  return { kit: 'megakit', model, x, z, yaw, scale, ...(y === undefined ? {} : { y }) };
}

/** One in this many forest trees is a dead one. */
const DEAD_EVERY = 7;

/** Random pines (and every few, a dead tree) in the band x0…x1 every `step` m from fromZ to toZ; the same picks every visit. */
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
    const dead = Math.floor(random() * DEAD_EVERY) === 0;
    const list = dead ? DEAD_TREES : PINES;
    const model = list[Math.floor(random() * list.length)];
    const x = x0 + random() * (x1 - x0);
    const scale = dead ? 0.7 + random() * 0.4 : 0.9 + random() * 0.5;
    out.push(mega(model, x, z - random() * step * 0.5, random() * TAU, scale));
  }
  return out;
}

/** Day forest: a thick wall of pines on the land side (two bands) and a few on the far bank. */
function dayForest(): PropPlacement[] {
  return [
    ...pines(PINE_SEED, 12, -118, 2.2, -26, -14),
    ...pines(PINE_SEED + 1, 12, -118, 2.4, -60, -26),
    ...pines(PINE_SEED + 2, 10, -118, 14, FAR_EDGE_X + 3, FAR_EDGE_X + 23),
  ];
}

/** Pebbles on the beach and the band (m) of the beach they lie in. */
const PEBBLE_COUNT = 70;
const PEBBLE_BAND = [0.4, 3.8] as const;

/** True off the river mouth, which stays open water. */
function onShore(x: number): boolean {
  return x <= EDGE_X - 4 || x >= FAR_EDGE_X + 1;
}

/** Rocks and pebbles lying on the wandering beach: a little up the slope from the local water line. */
function beach(): PropPlacement[] {
  const random = seeded(PINE_SEED + 6);
  const out: PropPlacement[] = [];
  for (let x = -34; x < FAR_EDGE_X + 29; x += 9) {
    if (!onShore(x)) continue;
    const rx = x + random() * 4;
    const edge = lakeEdgeZ(rx, LAKE_Z);
    const z = edge + 0.5 + random() * 2;
    const y = shoreY(z - edge) - 0.1; // sunk a little into the slope
    const rock = ROCKS[Math.floor(random() * ROCKS.length)];
    out.push(mega(rock, rx, z, random() * TAU, 0.25 + random() * 0.3, y));
  }
  for (let i = 0; i < PEBBLE_COUNT; i++) {
    const rx = -34 + random() * (FAR_EDGE_X + 63);
    const dz = PEBBLE_BAND[0] + random() * (PEBBLE_BAND[1] - PEBBLE_BAND[0]);
    const model = PEBBLES[Math.floor(random() * PEBBLES.length)];
    const yaw = random() * TAU;
    const scale = 0.7 + random() * 1.1;
    if (onShore(rx))
      out.push(mega(model, rx, lakeEdgeZ(rx, LAKE_Z) + dz, yaw, scale, shoreY(dz) - 0.02));
  }
  return out;
}

/** Pines along both sides of the lake, receding into the fog, and rocks and pebbles along the shore. */
function lakeShore(): PropPlacement[] {
  return [
    ...pines(PINE_SEED + 7, LAKE_Z - 2, LAKE_Z - 110, 5, -78, -64),
    ...pines(PINE_SEED + 8, LAKE_Z - 2, LAKE_Z - 110, 7, LAKE.east + 4, LAKE.east + 20),
    // West of Mom: the orca's last leap lands east of her (ending-farewell.ts FAREWELL.nose).
    { ...at('canoe', MOM.x - 3, MOM.z - 1.2, 0.35, 0.6), y: shoreY(MOM.z - 1.2 - LAKE_Z) },
    ...beach(),
  ];
}

/** Night route: the forest thins to boulders, the far bank turns rocky, the river looks narrow. */
function nightRoute(): PropPlacement[] {
  const out = [
    ...pines(PINE_SEED + 3, -124, -390, 9, -34, -16),
    ...pines(PINE_SEED + 4, -124, -390, 30, FAR_EDGE_X + 3, FAR_EDGE_X + 13),
  ];
  const random = seeded(PINE_SEED + 5);
  const rock = (): string => ROCKS[Math.floor(random() * ROCKS.length)] ?? ROCKS[0];
  for (let z = -130; z > -388; z -= 14) {
    out.push(mega(rock(), -17 - random() * 4, z, random() * TAU, 1.2 + random() * 0.8));
    out.push(
      mega(rock(), FAR_EDGE_X + 1 + random() * 6, z - 6, random() * TAU, 2 + random() * 1.5),
    );
  }
  return out;
}

/** Ferns and low plants under the trees, along the land side of the strip (not on the path). */
function undergrowth(): PropPlacement[] {
  const random = seeded(PINE_SEED + 10);
  const out: PropPlacement[] = [];
  for (let z = 10; z > -388; z -= 3.5) {
    const model = UNDERGROWTH[Math.floor(random() * UNDERGROWTH.length)];
    const x = -17.5 + random() * 8;
    out.push(mega(model, x, z - random() * 3, random() * TAU, 0.8 + random() * 0.5));
  }
  return out;
}

/** Fallen logs and rocks across the whole strip; buildWorld adds the collider. */
function barricade(): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let i = 0; i < 6; i++) {
    const x = LAND_X + 1.5 + i * 3.9;
    out.push(at('log_large', x, BARRICADE_Z, (i % 2) * 0.12));
    out.push(
      at(
        i % 2 ? 'rock_largeB' : 'rock_largeE',
        Math.min(x + 1.9, EDGE_X - 0.8),
        BARRICADE_Z + 0.8,
        i,
        0.8,
      ),
    );
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
    mega('Rock_Medium_1', -12, -10, 0.5, 0.8),
    mega('Rock_Medium_2', -11, -58, 2, 0.9),
    mega('Rock_Medium_3', -12.5, -88, 1, 1.1),
    mega('Rock_Medium_1', -10, -104, 4, 0.7),
    mega('Rock_Medium_2', -2, -96, 3, 0.5),
    mega('Rock_Medium_3', -1, -6, 1, 0.4),
    at('bridge_wood', -12, -56, FACE_DOOR, 0.5),
  ];
  const random = seeded(PINE_SEED + 9);
  for (let z = 8; z > -118; z -= 7) {
    const x = -11 - random() * 5;
    out.push(at(z % 2 ? 'stump_old' : 'stump_oldTall', x, z, random() * TAU, 0.5));
    out.push(at('mushroom_redGroup', x + 1.5 + random() * 3, z - 3, random() * TAU));
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
  ...[
    ...dayForest(),
    ...nightRoute(),
    ...lakeShore(),
    ...undergrowth(),
    ...campsite(),
    ...clutter(),
  ].filter(clearOfShacks),
  ...barricade(),
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
  { x: -9, z: -22.2, yaw: FACE_DOOR, lying: true, tent: true },
  { x: -9.5, z: -30.2, yaw: FACE_DOOR, lying: true, tent: true },
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
  ground: 0xb4b68c,
  farBank: 0xa4a684,
  skyline: 'trees',
  bank: 'natural',
  landX: LAND_X,
  startZ: START_Z,
  endZ: END_Z,
  // The lake's ending wave is the night's third. The last night is the heaviest: waves 1 and 2
  // outnumber every earlier night's (Night 1: 13/17/21, Night 2: 11/14/17).
  waves: [
    {
      z: -134,
      gateZ: -239,
      quota: 18,
      every: [2.5, 4],
      cap: 10,
      faster: 0.25,
      ambushes: [
        { z: -134, count: 4, kind: 'street' },
        { z: -156, count: 3, kind: 'cover', x: -16.5, at: -176 },
        { z: -185, count: 3, kind: 'lying', x: -5, at: -210 },
        { z: -210, count: 3, kind: 'behind' },
      ],
      crate: { x: -1 },
    },
    {
      z: -249,
      gateZ: -354,
      quota: 23,
      every: [2, 3.5],
      cap: 12,
      faster: 0.4,
      ambushes: [
        { z: -249, count: 4, kind: 'street' },
        { z: -270, count: 4, kind: 'cover', x: -16.5, at: -290 },
        { z: -300, count: 4, kind: 'behind' },
        { z: -315, count: 3, kind: 'lying', x: -5, at: -335 },
      ],
      crate: { x: -1 },
    },
  ],
  // The night's one spare battery, early on: Night 3 needs the torch on longer.
  nightPickups: [{ id: 'n3-battery', kind: 'battery', x: -3, z: -129 }],
  gate: {
    row: { kit: 'nature', model: 'log_large', yaw: 0 },
    extra: { kit: 'nature', model: 'log_stack', yaw: 0.3, scale: 0.6 },
  },
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
