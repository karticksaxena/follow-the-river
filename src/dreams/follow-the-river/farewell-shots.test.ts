import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { ANATOMY } from './dras-anatomy';
import { shoreFor } from './ending-farewell';
import { rails, SHOTS, shotsFor, type V3 } from './farewell-shots';
import { strandRest } from './orca-strand';
import { shoreY, WATER_Y } from './river';

const LAKE_Z = -392;
const at = shoreFor({ x: -3, z: -387.5 }, LAKE_Z);
const shots = shotsFor(at);
/** Everywhere Mom is in the farewell: where she starts (her meeting spot), and kneeling at her face. */
const MOMS = [{ x: -3, z: -387.5 }, shots.mom];

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
      const onPebbles = z >= LAKE_Z + 0.5 && z <= LAKE_Z + 6;
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
      rails.watch({ at: [-4, 1.6, LAKE_Z + 12], look: [0, 1, LAKE_Z + 5] }, shots),
      rails.kneel({ at: [-2, 1.6, LAKE_Z + 3], look: [0, 1, LAKE_Z + 5] }, shots),
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
    expect(shots.momHand[0]).toBeCloseTo(at.noseX); // Mom's rests on her nose, in front of her face
    expect(shots.momHand[2]).toBeGreaterThan(shots.hand[2]);
  });

  it('keeps every rail 0.6 m from Mom (wherever she kneels) at every one of 1000 samples', () => {
    const cam = new THREE.PerspectiveCamera();
    const far = { at: [-2, 1.6, LAKE_Z + 3] as V3, look: [0, 1, LAKE_Z + 5] as V3 };
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
    for (const rail of all) {
      for (let i = 0; i <= 1000; i++) {
        rail.pose((i / 1000) * rail.seconds, cam);
        for (const mom of MOMS) {
          expect(Math.hypot(cam.position.x - mom.x, cam.position.z - mom.z)).toBeGreaterThan(0.6);
        }
      }
    }
  });

  it('never has Mom between the camera and her eye, at the kneel and at the look', () => {
    for (const key of [shots.kneel, shots.eyeClose]) {
      const [cx, , cz] = key.at;
      const [ex, , ez] = shots.eye;
      const len = Math.hypot(ex - cx, ez - cz);
      for (const mom of MOMS) {
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
