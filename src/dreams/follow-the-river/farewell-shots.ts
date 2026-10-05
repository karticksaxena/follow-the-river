import * as THREE from 'three/webgpu';
import { createRail, orbitKeys, type Rail, type RailKey } from './camera-rail';
import { ANATOMY } from './dras-anatomy';
import type { Shore } from './ending-farewell';
import { strandRest } from './orca-strand';
import { shoreY } from './river';

/**
 * Where everything stands for the farewell (Plan 9): she lies along +z on the shore, her nose toward
 * +z and her centre line at x = noseX; Kartik and Mom kneel on her -x flank. Every point here is
 * computed from the shore and her rest pose (`strandRest`), so nothing is hand-placed in the world.
 * Tuning knobs (m, s, radians).
 */
export const SHOTS = {
  /** Kartik's hand on her flank, this far ahead of her centre and this high above her centre line (her body is an ellipse `tall` m high there: the skin tilts up, so the back of your hand faces you); hands press this far into the skin. */
  flank: { ahead: 2.2, up: 0.15, tall: 0.66, press: 0.06 },
  /**
   * Mom's hand lies on her skin `gap` m ahead of yours (toward her head) and her wrist is held `off` m off the skin;
   * Mom kneels `out` m from her skin and `behind` m behind her hand (so her right arm reaches about 0.65 m across the floor).
   */
  momHand: { gap: 0.27, off: 0.05, out: 0.4, behind: 0.5 },
  /** The kneel: eye height, out from her skin, how far ahead of her centre the camera kneels, and what it looks at (her flank by your hand, `side` m in from her centre line, `ahead` of her centre, `down` below the eye). */
  kneel: {
    eye: 1.2,
    out: 0.45,
    ahead: 2.0,
    seconds: 2.5,
    look: { side: 0.1, ahead: 3.1, down: 0.45 },
  },
  /** Mom kneels in front of her face, facing her (never between you and her eye): `side` m out from her centre line, `beyond` her nose. */
  mom: { side: 0.25, beyond: 0.6 },
  /** After she lands the camera goes to watch from the pebbles: `side` m out from her centre line, `beyond` her nose, at this eye height, looking at her eye. */
  watch: { side: 4.2, beyond: 2.3, eye: 1.55, seconds: 2.5 },
  /** Her eye: the look rail stops this far from it (out to her side, `angle` rad back toward her tail, negative: ahead) and this much above it; the look point is `shift` m toward the camera (her head turns to you, so her eye comes toward you); seconds. */
  look: { stop: 1.5, up: 0.3, shift: 0.3, angle: (-10 * Math.PI) / 180, seconds: 3 },
  /** The camera backs away from her eye to the start of the orbit. */
  pullBack: { seconds: 2.5 },
  /** The orbit round the three of them (see `orbitKeys`): the sweep goes round her tail, over the lake. */
  orbit: {
    centreAhead: 2.8,
    radius: 4.5,
    sweep: -(150 * Math.PI) / 180,
    heights: [1.4, 2.6],
    keys: 9,
    seconds: 12,
  },
  /**
   * The last pack: you kneel beside her head, `out` m from her skin and `ahead` of her centre (about
   * 2 m from her nose), looking along her and toward the lake; the pack lies by her chin (`floatAhead`
   * of her centre, `floatOut` m from her skin). The camera looks at a point `lookAhead` m behind
   * where it kneels, on her centre line. `lean`: as you lower the pack the camera dips this far
   * toward it (m) and `leanDown` lower; seconds.
   */
  pack: {
    out: 1.0,
    ahead: 2.2,
    floatAhead: 2.9,
    floatOut: 0.35,
    seconds: 3.5,
    eye: 1.3,
    lower: 0.8,
    lookBack: 0.8,
    lean: 0.35,
    leanDown: 0.2,
  },
  /** The camera swings over the lake on its way from the orbit to kneeling beside her head. */
  swing: { out: 2.2, up: 2.6, into: 2 },
  /** Standing again for the dawn: `out` m west of her centre line, looking at a point `look.x` m east and `look.ahead` m out over the lake, `look.y` high: the lake and the far shore with the sun off to the left, out of frame (it glared). */
  stand: { eye: 1.6, out: 9, seconds: 3, look: { x: 34, y: 0.6, ahead: 22 } },
  /** Then she turns to Mom coming up the shore: the look point's height (m) and how long the turn takes (s). */
  turnToMom: { height: 1.2, seconds: 2.5 },
  /** Where Mom sets her lantern down: beside her knees on the camera's side, so its light stays off her dress. */
  lantern: { side: 0.95, beyond: 0.45, up: 0.12 },
} as const;

export type V3 = readonly [number, number, number];

/** Where the farewell's people and cameras are, for one shore. */
export interface Shots {
  ground(z: number): number;
  /** Her -x eye. */
  eye: V3;
  /** Kartik's hand on her skin, and where Mom's wrist is held next to it (and where she kneels to do it). */
  hand: V3;
  /** The unit vector straight into her skin at your hand (for the palm). */
  handIn: V3;
  momHand: V3;
  momSide: { x: number; z: number };
  /** The camera kneeling beside her, and Kartik's body (a little behind it). */
  kneel: RailKey;
  kartik: { x: number; z: number };
  /** Mom's kneeling place (facing her nose) and her lantern's. */
  mom: { x: number; z: number };
  lantern: V3;
  /** Watching her from the pebbles, just after she lands. */
  watch: RailKey;
  /** The camera close to her eye, the orbit, the swing over the lake, the pack's camera and where the pack lies. */
  eyeClose: RailKey;
  orbit: RailKey[];
  swing: RailKey;
  packCam: RailKey;
  /** Leaning toward the water as the pack goes down. */
  lean: RailKey;
  float: V3;
  /** Standing again beside her, looking out over the lake. */
  stand: RailKey;
  /** Orbit centre (the look point). */
  centre: V3;
}

/** Her rest pose on the shore and the frame everything is measured in. */
interface Frame {
  at: Shore;
  ground(z: number): number;
  /** A point on her centre line `ahead` m from her centre, `side` m out to her -x and `up` above it. */
  on(ahead: number, side?: number, up?: number): V3;
}

function frameOf(at: Shore): Frame {
  const ground = (z: number): number => shoreY(z - at.lakeZ);
  const rest = strandRest(at.noseX, at.noseZ, ground);
  const cp = Math.cos(rest.pitch);
  const sp = Math.sin(rest.pitch);
  return {
    at,
    ground,
    on: (ahead, side = 0, up = 0) => [
      at.noseX - side,
      rest.y + ahead * sp + up * cp,
      rest.z + ahead * cp - up * sp,
    ],
  };
}

interface Spot {
  x: number;
  z: number;
}

/** A kneeling place `out` m from her skin, `ahead` of her centre. */
const spotAt = (f: Frame, ahead: number, out: number): Spot => ({
  x: f.at.noseX - ANATOMY.halfWidth - out,
  z: f.on(ahead)[2],
});

/** The camera kneeling beside her flank, and Kartik's body (a little ahead of it, so his hand reaches her). */
function kneelKey(f: Frame, hand: V3): { key: RailKey; spot: Spot; body: Spot } {
  const k = SHOTS.kneel;
  const spot = spotAt(f, k.ahead, k.out);
  const y = f.ground(spot.z) + k.eye;
  const look: V3 = [f.at.noseX - k.look.side, y - k.look.down, f.on(k.look.ahead)[2]];
  return { key: { at: [spot.x, y, spot.z], look }, spot, body: { x: spot.x, z: hand[2] - 0.25 } };
}

/** The orbit round the three of them, starting where the camera backs away to. */
function orbitOf(f: Frame, from: Spot): { keys: RailKey[]; centre: V3 } {
  const z = f.on(SHOTS.orbit.centreAhead)[2];
  const centre: V3 = [f.at.noseX - 0.65, f.ground(z) + 0.7, z];
  const o = SHOTS.orbit;
  const a = Math.atan2(from.x - centre[0], from.z - centre[2]);
  const c = { x: centre[0], y: centre[1], z: centre[2] };
  return { keys: orbitKeys(c, o.radius, a, a + o.sweep, o.heights, o.keys), centre };
}

/** The pack step: kneeling beside her head, the spot the pack lies, the swing over the lake, standing again. */
function packOf(
  f: Frame,
  centre: V3,
): Pick<Shots, 'packCam' | 'lean' | 'float' | 'swing' | 'stand'> {
  const { at } = f;
  const p = SHOTS.pack;
  const cam = spotAt(f, p.ahead, p.out);
  const spot = spotAt(f, p.floatAhead, p.floatOut);
  const sx = at.noseX - SHOTS.stand.out;
  const float: V3 = [spot.x, f.ground(spot.z) + 0.04, spot.z];
  const y = f.ground(cam.z) + p.eye;
  const look: V3 = [at.noseX, y - 0.45, cam.z - p.lookBack];
  const toFloat = Math.hypot(float[0] - cam.x, float[2] - cam.z);
  return {
    float,
    packCam: { at: [cam.x, y, cam.z], look },
    lean: {
      at: [
        cam.x + ((float[0] - cam.x) / toFloat) * p.lean,
        y - p.leanDown,
        cam.z + ((float[2] - cam.z) / toFloat) * p.lean,
      ],
      look,
    },
    swing: {
      at: [at.noseX - SHOTS.swing.out, SHOTS.swing.up, at.lakeZ - SHOTS.swing.into],
      look: centre,
    },
    stand: {
      at: [sx, f.ground(cam.z) + SHOTS.stand.eye, cam.z],
      look: [sx + SHOTS.stand.look.x, SHOTS.stand.look.y, at.lakeZ - SHOTS.stand.look.ahead],
    },
  };
}

export function shotsFor(at: Shore): Shots {
  const f = frameOf(at);
  const { up, tall } = SHOTS.flank;
  const wide = ANATOMY.halfWidth * Math.sqrt(1 - (up / tall) ** 2); // her flank's half width at that height (an ellipse)
  const hand = f.on(SHOTS.flank.ahead, wide - SHOTS.flank.press, up);
  // Straight into her skin there (the ellipse's inward normal), for the palm.
  const into = new THREE.Vector3(wide / ANATOMY.halfWidth ** 2, -up / tall ** 2, 0).normalize();
  const M = SHOTS.momHand;
  const eye = f.on(ANATOMY.eye.ahead, ANATOMY.eye.side, ANATOMY.eye.up);
  const kneel = kneelKey(f, hand);
  const orbit = orbitOf(f, kneel.spot);
  const L = SHOTS.look;
  const lamp = { x: f.at.noseX - SHOTS.lantern.side, z: f.at.noseZ + SHOTS.lantern.beyond };
  return {
    ground: (z) => f.ground(z),
    eye,
    hand,
    handIn: [into.x, into.y, into.z],
    momHand: f.on(SHOTS.flank.ahead + M.gap, wide + M.off, up),
    momSide: {
      x: at.noseX - ANATOMY.halfWidth - M.out,
      z: f.on(SHOTS.flank.ahead + M.gap)[2] + M.behind,
    },
    kneel: kneel.key,
    kartik: kneel.body,
    mom: { x: at.noseX - SHOTS.mom.side, z: at.noseZ + SHOTS.mom.beyond },
    lantern: [lamp.x, f.ground(lamp.z) + SHOTS.lantern.up, lamp.z],
    eyeClose: {
      at: [eye[0] - Math.cos(L.angle) * L.stop, eye[1] + L.up, eye[2] - Math.sin(L.angle) * L.stop],
      look: [
        eye[0] - Math.cos(L.angle) * L.shift,
        eye[1] + 0.1,
        eye[2] - Math.sin(L.angle) * L.shift,
      ],
    },
    watch: {
      at: [at.noseX - SHOTS.watch.side, SHOTS.watch.eye, at.noseZ + SHOTS.watch.beyond],
      look: eye,
    },
    orbit: orbit.keys,
    centre: orbit.centre,
    ...packOf(f, orbit.centre),
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
  /** From where you stood to the pebbles, to watch her. */
  watch: (from: RailKey, s: Shots): Rail => createRail([from, s.watch], SHOTS.watch.seconds),
  /** Lower to the kneeling camera. */
  kneel: (from: RailKey, s: Shots): Rail => createRail([from, s.kneel], SHOTS.kneel.seconds),
  /** Push in toward her eye. */
  look: (from: RailKey, s: Shots): Rail => createRail([from, s.eyeClose], SHOTS.look.seconds),
  /** Back away from her eye to where the orbit starts. */
  pullBack: (from: RailKey, s: Shots): Rail =>
    createRail([from, { at: s.orbit[0]?.at ?? from.at, look: s.centre }], SHOTS.pullBack.seconds),
  /** Round the three of them. */
  orbit: (s: Shots): Rail => createRail(s.orbit, SHOTS.orbit.seconds),
  /** From the end of the orbit, swinging over the lake, to kneeling beside her head. */
  toPack: (from: RailKey, s: Shots): Rail =>
    createRail([from, s.swing, s.packCam], SHOTS.pack.seconds),
  /** Dip toward the water as the pack is lowered. */
  lean: (s: Shots): Rail => createRail([s.packCam, s.lean], SHOTS.pack.lower),
  /** Up to standing, turning to the lake. */
  stand: (from: RailKey, s: Shots): Rail => createRail([from, s.stand], SHOTS.stand.seconds),
  /** Turning on the spot (the camera stays put) to look at `to`, at Mom's height, the short way round by the east. */
  turn: (from: RailKey, to: { x: number; z: number }): Rail => {
    const [x, , z] = from.at;
    const h = SHOTS.turnToMom.height;
    return createRail(
      [from, { at: from.at, look: [x + 6, h, z - 2] }, { at: from.at, look: [to.x, h, to.z] }],
      SHOTS.turnToMom.seconds,
    );
  },
};
