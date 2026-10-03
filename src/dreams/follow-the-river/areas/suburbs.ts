import { EDGE_X } from '../river';
import { seeded } from '../skyline';
import type { AreaDef, LurkerDef, PickupDef, PropPlacement, ScareDef, ShackDef } from './types';

const ROAD_X = -5;
const START_Z = 14;
const END_Z = -415;
const BARRICADE_Z = -120;
const LAND_X = -18;
const NIGHT_FOG = 50;
/** Garage interiors: back wall at x ≈ -17; the barn reaches past the strip edge. */
const GARAGE_X = -13.74;
const GARAGE_BACK_X = -16;
const GARAGE_MID_X = -13.7;
const BARN_X = -15;
const BARN_Z = -90;
const BARN_BACK_X = -17;
const FACE_DOOR = -Math.PI / 2;
const HOUSE_SEED = 31;
const HOUSE_COUNT = 8;
const HOUSE_STEP = 14;
const BARRICADE_PIECES = 8;
const HOUSES = 'abcdefghijklmnop'.split('').map((c) => `building-type-${c}`);

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

/** Houses behind the shacks facing the river, each with a driveway, planter and a fence run. */
function street(): PropPlacement[] {
  const random = seeded(HOUSE_SEED);
  const out: PropPlacement[] = [];
  for (let i = 0; i < HOUSE_COUNT; i++) {
    const z = 4 - i * HOUSE_STEP;
    const model = HOUSES[Math.floor(random() * HOUSES.length)];
    out.push({ kit: 'suburb', model, x: -27 - random() * 3, z, yaw: FACE_DOOR });
    out.push({ kit: 'suburb', model: 'driveway-short', x: -20.5, z, yaw: FACE_DOOR });
    out.push({ kit: 'suburb', model: 'planter', x: -19, z: z + 3.5 });
    if (i % 2 === 0) out.push({ kit: 'suburb', model: 'tree-small', x: -21, z: z - 5 });
  }
  return [
    ...out,
    ...row('suburb', 'fence-2x3', 12, -78, 12, -19.5, { yaw: Math.PI / 2 }),
    ...row('suburb', 'fence-2x3', -102, -120, 12, -19.5, { yaw: Math.PI / 2 }),
    ...row('suburb', 'tree-large', 0, -110, 38, -22),
  ];
}

/** Road, wrecks (the police car is the crash), and clutter. */
function streetProps(): PropPlacement[] {
  return [
    ...row('roads', 'road-straight', 12, -126, 6, ROAD_X, { yaw: Math.PI / 2 }),
    car('sedan', -8.5, START_Z - 2, 0.3),
    car('suv', -1.5, START_Z - 2, -0.2),
    car('sedan', -4, -30, 0.1),
    car('police', -5, -45, 0.5),
    car('van', -8, -50, -0.3),
    car('taxi', -4, -72, 0.1),
    car('suv', -8.5, -108),
    solid('survival', 'barrel', -9.5, -22),
    solid('survival', 'box-large', -9.5, -80),
    solid('roads', 'dumpster', -9.3, -8, Math.PI / 2),
    { kit: 'survival', model: 'campfire-pit', x: 0.3, z: -113 },
    { kit: 'survival', model: 'bedroll', x: -0.9, z: -113.5, yaw: 0.5 },
    // Hay behind which the barn's lying zombie waits.
    { kit: 'survival', model: 'box-large', x: -16.5, z: -94.5 },
    { kit: 'survival', model: 'box-large', x: -16.8, z: -92.5 },
  ];
}

/** Farm gates and fences across the whole strip, hay bales in front. */
function barricade(): PropPlacement[] {
  const out: PropPlacement[] = [];
  const first = LAND_X + 1.1;
  const step = (EDGE_X - 1.2 - first) / (BARRICADE_PIECES - 1);
  for (let i = 0; i < BARRICADE_PIECES; i++) {
    const x = first + i * step;
    const model = i % 3 === 1 ? 'fence_gate' : 'fence_planks';
    out.push({ kit: 'nature', model, x, z: BARRICADE_Z, yaw: Math.PI / 2, scale: 0.6 });
    if (i % 2 === 0) {
      out.push({
        kit: 'survival',
        model: 'box-large',
        x: x + 1,
        z: BARRICADE_Z + 1.4,
        yaw: i * 0.4,
      });
    }
  }
  return out;
}

/** Corn fields (not collidable, they hide zombies), farm fences, vehicles, poles, silos. */
function farm(): PropPlacement[] {
  const corn: Extra = { scale: 0.35 };
  const out: PropPlacement[] = [];
  for (const x of [-16, -13.5, -11, -8.5, -6]) {
    out.push(...row('nature', 'crops_cornStageD', -135, -230, 2.2, x, corn));
    out.push(...row('nature', 'crops_cornStageD', -255, -345, 2.2, x, corn));
  }
  return [
    ...out,
    ...row('nature', 'fence_planks', -126, -392, 2.7, -17.5, { yaw: Math.PI / 2, scale: 0.55 }),
    ...row('roads', 'electricity-pole', -140, -400, 40, -9.5),
    car('delivery', -3, -180, 0.3),
    car('delivery', -2.5, -240, 0.5),
    car('garbage-truck', -4.5, -350, -0.4),
    ...row('survival', 'barrel', -200, -330, 65, -24, { scale: 5 }),
    ...row('nature', 'tree_default_dark', -150, -390, 60, -21),
  ];
}

/** The ranger camp at the forest edge: tents, a fire and logs (the cabin is the safe prop). */
function camp(): PropPlacement[] {
  return [
    { kit: 'nature', model: 'tent_detailedOpen', x: -5, z: -396, yaw: 0.3 },
    { kit: 'nature', model: 'tent_detailedOpen', x: -5, z: -409, yaw: -0.2 },
    { kit: 'nature', model: 'campfire_logs', x: -2, z: -402, scale: 0.4 },
    { kit: 'nature', model: 'log_stack', x: -7, z: -392, yaw: 1, scale: 0.6 },
  ];
}

const PROPS: readonly PropPlacement[] = [
  ...street(),
  ...streetProps(),
  ...barricade(),
  ...farm(),
  ...camp(),
];

const SHACKS: readonly ShackDef[] = [
  { id: 'g1', x: GARAGE_X, z: -18, width: 2, depth: 2 },
  { id: 'g2', x: GARAGE_X, z: -60, width: 2, depth: 2 },
  { id: 'barn', x: BARN_X, z: BARN_Z, width: 3, depth: 3 },
];

const PICKUPS: readonly PickupDef[] = [
  { id: 'fish-1', kind: 'fishPack', x: GARAGE_BACK_X, z: -16.5 },
  { id: 'battery-1', kind: 'battery', x: GARAGE_BACK_X, z: -20 },
  { id: 'arrows-1', kind: 'arrows', x: GARAGE_BACK_X, z: -58 },
  { id: 'ammo-1', kind: 'ammo', x: GARAGE_BACK_X, z: -62 },
  { id: 'gun', kind: 'gun', x: -1.2, z: -45 },
  { id: 'battery-2', kind: 'battery', x: -1.5, z: -75 },
  { id: 'arrows-2', kind: 'arrows', x: -2.5, z: -8 },
  { id: 'fish-2', kind: 'fishPack', x: -1.5, z: -100 },
  { id: 'tape-2', kind: 'tape', x: BARN_BACK_X, z: -89.5, tape: 2 },
];

const LURKERS: readonly LurkerDef[] = [
  { x: GARAGE_MID_X, z: -16.5, yaw: FACE_DOOR },
  { x: GARAGE_MID_X, z: -61, yaw: FACE_DOOR, lying: true },
  // The ambush: a "corpse" behind the hay, just over WAKE (4 m) from the tape.
  { x: BARN_BACK_X, z: -93.9, yaw: 0, lying: true },
  { x: -16, z: -34, yaw: 0, lying: true },
  { x: -12, z: -108, yaw: FACE_DOOR },
];

const SCARES: readonly ScareDef[] = [
  { kind: 'watcher', x: -14, z: -70, trigger: 14 },
  { kind: 'ambush', shack: 'barn', trigger: 1.5 },
  { kind: 'alarm', x: -4, z: -30, trigger: 4 },
];

export const SUBURBS: AreaDef = {
  id: 'suburbs',
  chapter: 2,
  arrival: ['You reach a ranger camp where the fields meet the forest.', 'Night 2 survived.'],
  ground: 0x1a2016,
  farBank: 0x13170f,
  skyline: 'houses',
  landX: LAND_X,
  startZ: START_Z,
  endZ: END_Z,
  daySpawn: { x: 0, z: 6, yaw: 0 },
  waitSpot: { x: 0.5, z: -113, yaw: Math.PI },
  barricadeZ: BARRICADE_Z,
  nightStart: { x: 1.5, z: -124, yaw: 0 },
  safeZ: -400,
  safeProp: { prop: 'cabin', x: -10, z: -402, yaw: 0 },
  nightFog: NIGHT_FOG,
  props: PROPS,
  shacks: SHACKS,
  pickups: PICKUPS,
  lurkers: LURKERS,
  scares: SCARES,
};
