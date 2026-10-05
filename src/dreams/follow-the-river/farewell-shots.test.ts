import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import type { Rail } from './camera-rail';
import { ANATOMY } from './dras-anatomy';
import { shoreFor } from './ending-farewell';
import { rails, SHOTS, shotsFor, type V3 } from './farewell-shots';
import { SHORE_CELL, shoreHeight } from './lake';
import { restGaps, strandRest } from './orca-strand';
import { EDGE_X, LAKE, shoreY, WATER_Y } from './river';
import { mouthFlare } from './shore-shape';

const LAKE_Z = -392;
const at = shoreFor({ x: -3, z: -387.5 }, LAKE_Z);
const shots = shotsFor(at);
/** Everywhere Mom is before the hand: her meeting spot, where she backs off to (retreatPoint), and kneeling at her face. */
const MOMS = [{ x: -3, z: -387.5 }, { x: -3, z: LAKE_Z + 2.5 }, shots.mom];

/** Every camera point of the farewell (keys of every rail, and the kneeling spots). */
const POINTS: [string, V3][] = [
  ['kneel', shots.kneel.at],
  ['eyeClose', shots.eyeClose.at],
  ['swing', shots.swing.at],
  ['packCam', shots.packCam.at],
  ['stand', shots.stand.at],
  ...shots.orbit.map((k, i): [string, V3] => [`orbit ${i}`, k.at]),
];

const REST = strandRest(at.noseX, at.noseZ, (z) => shoreY(z - LAKE_Z));

/** Clear above her back (and the dorsal fin by her middle; her tail is thin and mostly under water) at depth z. */
function overHer(y: number, z: number): boolean {
  const ahead = z - REST.z;
  const thick = ahead < -1.2 ? 0.3 : ANATOMY.halfWidth + (ahead < 1 ? ANATOMY.finHeight : 0);
  return y > REST.y + ahead * Math.tan(REST.pitch) + thick + 0.3;
}

/** Horizontal distance from (x, z) to her centre line (she lies from her tail at noseZ - 7 to her nose at noseZ). */
function toCentreLine(x: number, z: number): number {
  const zc = Math.min(at.noseZ, Math.max(at.noseZ - ANATOMY.length, z));
  return Math.hypot(x - at.noseX, z - zc);
}

describe('the farewell shots', () => {
  it('keeps every camera point on the pebbles or above the water', () => {
    const bad = POINTS.filter(([, [, y, z]]) => {
      const onPebbles = z >= LAKE_Z + 0.5 && z <= LAKE_Z + 9; // the pebbles end at 6, flat grass goes on level with them
      const overWater = z < LAKE_Z + 0.5 && y >= WATER_Y + 1;
      return !(onPebbles || overWater);
    }).map(([name]) => name);
    expect(bad).toEqual([]);
  });

  it('never puts a camera inside her body', () => {
    const bad = POINTS.filter(
      ([, [x, y, z]]) => !(toCentreLine(x, z) > ANATOMY.halfWidth + 0.4 || overHer(y, z)),
    ).map(([name]) => name);
    expect(bad).toEqual([]);
  });

  it('keeps the rails clear of her too, along their whole way', () => {
    const cam = new THREE.PerspectiveCamera();
    const all = [
      rails.watch({ at: [at.noseX - 4, 1.6, LAKE_Z + 12], look: [0, 1, LAKE_Z + 5] }, shots),
      rails.kneel({ at: [at.noseX - 3, 1.6, LAKE_Z + 3], look: [0, 1, LAKE_Z + 5] }, shots),
      rails.look(shots.kneel, shots),
      rails.pullBack(shots.eyeClose, shots),
      rails.orbit(shots),
      rails.toPack(shots.orbit[shots.orbit.length - 1], shots),
      rails.stand(shots.packCam, shots),
    ];
    for (const rail of all) {
      for (let i = 0; i <= 120; i++) {
        rail.pose((i / 120) * rail.seconds, cam);
        const { x, y, z } = cam.position;
        expect(toCentreLine(x, z) > ANATOMY.halfWidth + 0.25 || overHer(y, z)).toBe(true);
      }
    }
  });

  it('puts both hands on her skin on the kneeling side, outside the body', () => {
    const [x] = shots.hand;
    expect(at.noseX - x).toBeLessThan(ANATOMY.halfWidth);
    expect(at.noseX - x).toBeGreaterThan(ANATOMY.halfWidth * 0.8);
    expect(at.noseX - shots.momHand[0]).toBeLessThan(ANATOMY.halfWidth + 0.15); // Mom's wrist is just off her skin, on the same side
    expect(shots.momHand[2]).toBeGreaterThan(shots.hand[2]); // ahead of yours, toward her head
  });

  it('keeps every rail 0.6 m from Mom (wherever she kneels) at every one of 1000 samples', () => {
    const cam = new THREE.PerspectiveCamera();
    const far = { at: [at.noseX - 3, 1.6, LAKE_Z + 3] as V3, look: [0, 1, LAKE_Z + 5] as V3 };
    const all = [
      rails.watch(far, shots),
      rails.kneel(shots.watch, shots),
      rails.kneel(far, shots),
      rails.look(shots.kneel, shots),
      rails.pullBack(shots.eyeClose, shots),
      rails.orbit(shots),
      rails.toPack(shots.orbit[shots.orbit.length - 1], shots),
      rails.stand(shots.packCam, shots),
    ];
    // Where she is while each rail plays: the early spots only until the kneel; beside your hand for the kneel and the hand page; then back at her face.
    const moms = (rail: Rail): readonly { x: number; z: number }[] =>
      rail === all[0]
        ? MOMS
        : rail === all[1] || rail === all[2]
          ? [shots.mom, shots.momSide]
          : [shots.mom];
    for (const rail of all) {
      for (let i = 0; i <= 1000; i++) {
        rail.pose((i / 1000) * rail.seconds, cam);
        for (const mom of moms(rail)) {
          // Beside your hand she is shuffling in while you kneel (from wherever you stood): 0.45 m, never through her.
          const least = mom === shots.momSide ? 0.45 : 0.6;
          expect(Math.hypot(cam.position.x - mom.x, cam.position.z - mom.z)).toBeGreaterThan(least);
        }
      }
    }
  });

  it('never has Mom between the camera and her eye, at the kneel and at the look', () => {
    for (const key of [shots.kneel, shots.eyeClose]) {
      const [cx, , cz] = key.at;
      const [ex, , ez] = shots.eye;
      const len = Math.hypot(ex - cx, ez - cz);
      for (const mom of [shots.mom]) {
        const along = ((mom.x - cx) * (ex - cx) + (mom.z - cz) * (ez - cz)) / len;
        const across = Math.abs(((mom.x - cx) * (ez - cz) - (mom.z - cz) * (ex - cx)) / len);
        expect(along > len || along < 0 || across > 0.5).toBe(true);
      }
    }
  });

  it('puts both hand targets in front of the kneeling camera', () => {
    const cam = new THREE.Vector3(...shots.kneel.at);
    const view = new THREE.Vector3(...shots.kneel.look).sub(cam).normalize();
    for (const target of [shots.hand, shots.momHand]) {
      const to = new THREE.Vector3(...target).sub(cam).normalize();
      expect(view.dot(to)).toBeGreaterThan(0.8);
    }
  });

  it('kneels at eye height beside her flank, her head ahead of you', () => {
    const ground = shots.ground(shots.kneel.at[2]);
    expect(shots.kneel.at[1] - ground).toBeCloseTo(SHOTS.kneel.eye);
    expect(shots.eye[2]).toBeGreaterThan(shots.hand[2]);
  });

  it('keeps Mom and her lantern outside her body, Mom in front of her face', () => {
    const spots = [shots.mom, { x: shots.lantern[0], z: shots.lantern[2] }];
    for (const { x, z } of spots) expect(toCentreLine(x, z)).toBeGreaterThan(0.45); // knees clear of her nose
    expect(shots.mom.z).toBeGreaterThan(at.noseZ); // in front of her face
    expect(shots.kartik.z).toBeLessThan(shots.eye[2]);
  });

  it('lays the pack by her head, with the camera beside her (Kartik: "we are not even near our orca")', () => {
    const [fx, fy, fz] = shots.float;
    const [cx, , cz] = shots.packCam.at;
    const head = { x: at.noseX, z: at.noseZ };
    expect(fy).toBeGreaterThan(shoreY(fz - LAKE_Z)); // on the pebbles
    expect(fz).toBeGreaterThan(LAKE_Z);
    expect(Math.hypot(fx - head.x, fz - head.z)).toBeLessThan(2.5);
    expect(Math.hypot(cx - head.x, cz - head.z)).toBeLessThan(2.5);
    expect(Math.hypot(fx - cx, fz - cz)).toBeLessThan(1.5); // within reach
    expect(toCentreLine(cx, cz)).toBeGreaterThan(ANATOMY.halfWidth); // beside her, not on her
    const look = shots.packCam.look;
    expect(Math.hypot(look[0] - head.x, look[2] - head.z)).toBeLessThan(3); // looking at her
  });

  it('orbits at the radius round the centre, climbing, and ends on a different side', () => {
    const first = shots.orbit[0];
    const last = shots.orbit[shots.orbit.length - 1];
    for (const k of shots.orbit) {
      expect(Math.hypot(k.at[0] - shots.centre[0], k.at[2] - shots.centre[2])).toBeCloseTo(4.5, 1);
    }
    expect(last.at[1]).toBeGreaterThan(first.at[1]);
    expect(Math.abs(last.at[0] - first.at[0]) + Math.abs(last.at[2] - first.at[2])).toBeGreaterThan(
      4,
    );
  });

  it('turns on the spot to look at Mom, the short way round by the east, never past her', () => {
    const cam = new THREE.PerspectiveCamera();
    const to = { x: -2, z: LAKE_Z + 4 };
    const rail = rails.turn(shots.stand, to);
    rail.pose(0, cam);
    const [sx, sy, sz] = shots.stand.at;
    for (let i = 0; i <= 50; i++) {
      rail.pose((i / 50) * rail.seconds, cam);
      expect(cam.position.distanceTo(new THREE.Vector3(sx, sy, sz))).toBeLessThan(1e-6);
    }
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const want = new THREE.Vector3(to.x - sx, SHOTS.turnToMom.height - sy, to.z - sz).normalize();
    expect(dir.dot(want)).toBeGreaterThan(0.999);
  });

  it('keeps the dawn look off the sun: out over the lake to the east of the south-west sun', () => {
    const [sx, , sz] = shots.stand.at;
    const [lx, , lz] = shots.stand.look;
    const az = Math.atan2(lx - sx, lz - sz); // 0 is +z, toward +x
    const sun = Math.atan2(-0.675, -0.737); // dawn.ts: the sun's azimuth (about 222 degrees)
    const gap = Math.abs(Math.atan2(Math.sin(az - sun), Math.cos(az - sun)));
    expect(gap).toBeGreaterThan((95 * Math.PI) / 180); // beyond the frame's half width and its glow
  });
});

/** The z of the shore mesh's k-th row from the pebbles' end. */
const row = (k: number): number => LAKE_Z + LAKE.pebbleDepth - k * SHORE_CELL;

/** The shore mesh's height at z: linear between its rows. */
const mesh = (z: number): number => {
  const k = Math.floor((LAKE_Z + LAKE.pebbleDepth - z) / SHORE_CELL);
  const [a, b] = [row(k), row(k + 1)];
  const u = (a - z) / (a - b);
  return shoreHeight(LAKE_Z - a) * (1 - u) + shoreHeight(LAKE_Z - b) * u;
};

describe('where she lies, the same in every beat', () => {
  const lo = REST.z - (ANATOMY.length / 2) * Math.cos(REST.pitch); // tail end
  const hi = REST.z + (ANATOMY.length / 2) * Math.cos(REST.pitch); // nose

  it('has 70-80 % of her out of the water, her back well above it and only the tail end in the shallows', () => {
    const share = (hi - LAKE_Z) / (hi - lo);
    expect(share).toBeGreaterThanOrEqual(0.7);
    expect(share).toBeLessThanOrEqual(0.8);
    expect(lo).toBeLessThan(LAKE_Z); // the tail end is in the water
    expect(REST.y - WATER_Y).toBeGreaterThan(1); // the root (her mid-body) is more than a metre over the water: her back well above it
  });

  it('is the one placement the shots, the stranding and the dawn are all built on', () => {
    const f = Math.cos(REST.pitch);
    const [, ey] = shots.eye;
    expect(ey).toBeCloseTo(
      REST.y + ANATOMY.eye.ahead * Math.sin(REST.pitch) + ANATOMY.eye.up * f,
      6,
    );
    expect(shots.hand[2]).toBeCloseTo(
      REST.z + SHOTS.flank.ahead * f - SHOTS.flank.up * Math.sin(REST.pitch),
      6,
    );
  });

  it('lies on the rendered shore (its 2 m grid), not just on the formula', () => {
    // The shore mesh is linear between rows every SHORE_CELL m down from the pebbles' end; rows fall on the slope's kinks.
    expect(LAKE.pebbleDepth % SHORE_CELL).toBe(0);
    expect(LAKE.slopeStart % SHORE_CELL).toBe(0);
    for (let z = LAKE_Z - 3; z < LAKE_Z + 7; z += 0.1) {
      expect(mesh(z)).toBeCloseTo(shoreY(z - LAKE_Z), 6);
    }
    const gaps = restGaps(REST, mesh);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(-0.001); // no ground through her
    expect(Math.min(...gaps)).toBeLessThan(0.01);
  });

  it('keeps her body west of the river mouth bank (it crossed her in two when she lay further east)', () => {
    for (let ahead = -1; ahead <= 3; ahead += 0.25) {
      const z = REST.z + ahead * Math.cos(REST.pitch);
      if (z < LAKE_Z + 0.5) continue;
      const half = ahead > 2.8 ? 0.2 : ANATOMY.halfWidth;
      expect(at.noseX + half).toBeLessThan(EDGE_X - mouthFlare(z, LAKE_Z) - 0.1);
    }
  });

  it("puts Mom's hand within 0.35 m of yours, on her skin, with Mom close enough to reach it", () => {
    const d = Math.hypot(...shots.hand.map((v, i) => v - (shots.momHand[i] ?? 0)));
    expect(d).toBeLessThan(0.35);
    expect(d).toBeGreaterThan(0.15); // side by side, not on top of each other
    const reach = Math.hypot(
      shots.momSide.x - shots.momHand[0],
      shots.momSide.z - shots.momHand[2],
    );
    expect(reach).toBeLessThan(0.55); // across the floor; her shoulder is about 0.5 m above
    expect(toCentreLine(shots.momSide.x, shots.momSide.z)).toBeGreaterThan(
      ANATOMY.halfWidth + 0.25,
    );
  });
});
