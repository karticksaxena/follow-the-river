import * as THREE from 'three/webgpu';
import { createRail, orbitKeys, type Rail, type RailKey } from './camera-rail';
import { ANATOMY } from './dras-anatomy';
import type { Shore } from './ending-farewell';
import { strandRest } from './orca-strand';
import { shoreY, WATER_Y } from './river';

/**
 * Where everything stands for the farewell (Plan 9): she lies along +z on the shore, her nose toward
 * +z and her centre line at x = noseX; Kartik and Mom kneel on her -x flank. Every point here is
 * computed from the shore and her rest pose (`strandRest`), so nothing is hand-placed in the world.
 * Tuning knobs (m, s, radians).
 */
export const SHOTS = {
  /** Kartik's hand on her flank, this far ahead of her centre; Mom's is `momGap` further toward her head; hands press this far into the skin. */
  flank: { ahead: 1.8, momGap: 0.35, press: 0.06 },
  /** The kneel: eye height, out from her skin and back from the hand, and how far ahead of the hand the camera looks. */
  kneel: { eye: 1.05, out: 0.5, back: 0.25, lookAhead: 0.5, lookDown: 0.45, seconds: 2.5 },
  /** Mom kneels here by her head (ahead of her centre, out from her skin), and here beside you. */
  momHead: { ahead: 3.1, out: 0.8 },
  momFlank: { ahead: 2.4, out: 0.45 },
  /** Her eye: the look rail stops this far from it (out to her side, `angle` rad back toward her tail) and this much above it; seconds. */
  look: { stop: 0.9, up: 0.25, angle: (37 * Math.PI) / 180, seconds: 3 },
  /** The camera backs away from her eye to the start of the orbit. */
  pullBack: { seconds: 2.5 },
  /** The orbit round the three of them (see `orbitKeys`): the sweep goes round her tail, over the lake. */
  orbit: { radius: 4.5, sweep: -(150 * Math.PI) / 180, heights: [1.4, 2.6], keys: 9, seconds: 12 },
  /** The last pack: you kneel at the water's edge, it floats this far out; the camera gets there over this long. */
  pack: {
    out: 1.6,
    edge: 0.35,
    floatOut: 0.5,
    floatInto: 0.5,
    seconds: 3.5,
    eye: 1.05,
    lower: 0.8,
  },
  /** The camera swings over the lake on its way from the orbit to the water's edge. */
  swing: { out: 2.2, up: 2.6, into: 2 },
  /** Standing again for the dawn. */
  stand: { eye: 1.6, seconds: 3, look: 40 },
  /** Where Mom sets her lantern down: out from her knees, so its light stays off her dress. */
  lantern: { out: 0.7, up: 0.12 },
} as const;

export type V3 = readonly [number, number, number];

/** Where the farewell's people and cameras are, for one shore. */
export interface Shots {
  ground(z: number): number;
  /** Her -x eye. */
  eye: V3;
  /** Kartik's hand on her skin, and Mom's beside it. */
  hand: V3;
  momHand: V3;
  /** The camera kneeling beside her, and Kartik's body (a little behind it). */
  kneel: RailKey;
  kartik: { x: number; z: number };
  /** Mom's two kneeling places and her lantern's. */
  momHead: { x: number; z: number };
  momFlank: { x: number; z: number };
  lantern: V3;
  /** The camera close to her eye, the orbit, the swing to the water's edge, the pack's camera and its float spot. */
  eyeClose: RailKey;
  orbit: RailKey[];
  swing: RailKey;
  packCam: RailKey;
  float: V3;
  /** Standing again at the water's edge, looking out over the lake. */
  stand: RailKey;
  /** Orbit centre (the look point). */
  centre: V3;
}

export function shotsFor(at: Shore): Shots {
  const ground = (z: number): number => shoreY(z - at.lakeZ);
  const rest = strandRest(at.noseX, at.noseZ, ground);
  const cp = Math.cos(rest.pitch);
  const sp = Math.sin(rest.pitch);
  /** A point on her centre line `ahead` m from her centre, and `side` m out to her -x. */
  const on = (ahead: number, side = 0, up = 0): V3 => [
    at.noseX - side,
    rest.y + ahead * sp + up * cp,
    rest.z + ahead * cp - up * sp,
  ];
  const skin = ANATOMY.halfWidth - SHOTS.flank.press;
  const hand = on(SHOTS.flank.ahead, skin);
  const momHand = on(SHOTS.flank.ahead + SHOTS.flank.momGap, skin);
  const eye = on(ANATOMY.eye.ahead, ANATOMY.eye.side, ANATOMY.eye.up);
  const k = SHOTS.kneel;
  const camX = at.noseX - ANATOMY.halfWidth - k.out;
  const camZ = hand[2] - k.back;
  const eyeY = ground(camZ) + k.eye;
  const kneel: RailKey = {
    at: [camX, eyeY, camZ],
    look: [at.noseX - 0.2, eyeY - k.lookDown, hand[2] + k.lookAhead],
  };
  const spot = (ahead: number, out: number): { x: number; z: number } => ({
    x: at.noseX - ANATOMY.halfWidth - out,
    z: on(ahead)[2],
  });
  const centre: V3 = [at.noseX - 0.65, ground(on(2.2)[2]) + 0.7, on(2.2)[2]];
  const orbitFrom = Math.atan2(camX - centre[0], camZ - centre[2]);
  const o = SHOTS.orbit;
  const p = SHOTS.pack;
  const packX = at.noseX - p.out;
  const packZ = at.lakeZ + p.edge;
  const packEye = ground(packZ) + p.eye;
  const float: V3 = [packX + p.floatInto, WATER_Y + 0.05, at.lakeZ - p.floatOut];
  const L = SHOTS.look;
  const lantern = spot(SHOTS.momHead.ahead, SHOTS.momHead.out + SHOTS.lantern.out);
  return {
    ground,
    eye,
    hand,
    momHand,
    kneel,
    kartik: { x: camX, z: camZ },
    momHead: spot(SHOTS.momHead.ahead, SHOTS.momHead.out),
    momFlank: spot(SHOTS.momFlank.ahead, SHOTS.momFlank.out),
    lantern: [lantern.x, ground(lantern.z) + SHOTS.lantern.up, lantern.z],
    eyeClose: {
      at: [eye[0] - Math.cos(L.angle) * L.stop, eye[1] + L.up, eye[2] - Math.sin(L.angle) * L.stop],
      look: eye,
    },
    orbit: orbitKeys(
      { x: centre[0], y: centre[1], z: centre[2] },
      o.radius,
      orbitFrom,
      orbitFrom + o.sweep,
      o.heights,
      o.keys,
    ),
    swing: {
      at: [at.noseX - SHOTS.swing.out, SHOTS.swing.up, at.lakeZ - SHOTS.swing.into],
      look: centre,
    },
    packCam: { at: [packX, packEye, packZ], look: float },
    float,
    stand: {
      at: [packX, ground(packZ) + SHOTS.stand.eye, packZ],
      look: [packX + 6, 2.2, at.lakeZ - SHOTS.stand.look],
    },
    centre,
  };
}

const dir = new THREE.Vector3();

/** The key where the camera is now, looking `ahead` m along its view (for rails that start from the player's own view). */
export function keyFrom(camera: THREE.Camera, ahead = 3): RailKey {
  camera.getWorldDirection(dir);
  const { x, y, z } = camera.position;
  return { at: [x, y, z], look: [x + dir.x * ahead, y + dir.y * ahead, z + dir.z * ahead] };
}

/** The rails between the shots. `from` is where the camera is when each starts. */
export const rails = {
  /** Turn on the spot to look at `to`. */
  turn: (from: RailKey, to: V3, seconds: number): Rail =>
    createRail([from, { at: from.at, look: to }], seconds),
  /** Lower to the kneeling camera. */
  kneel: (from: RailKey, s: Shots): Rail => createRail([from, s.kneel], SHOTS.kneel.seconds),
  /** Push in toward her eye. */
  look: (from: RailKey, s: Shots): Rail => createRail([from, s.eyeClose], SHOTS.look.seconds),
  /** Back away from her eye to where the orbit starts. */
  pullBack: (from: RailKey, s: Shots): Rail =>
    createRail([from, { at: s.orbit[0]?.at ?? from.at, look: s.centre }], SHOTS.pullBack.seconds),
  /** Round the three of them. */
  orbit: (s: Shots): Rail => createRail(s.orbit, SHOTS.orbit.seconds),
  /** From the end of the orbit, swinging over the lake, to kneeling at the water's edge. */
  toPack: (from: RailKey, s: Shots): Rail =>
    createRail([from, s.swing, s.packCam], SHOTS.pack.seconds),
  /** Up to standing, turning to the lake. */
  stand: (from: RailKey, s: Shots): Rail => createRail([from, s.stand], SHOTS.stand.seconds),
};
