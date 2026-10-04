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
    for (const [x] of [shots.hand, shots.momHand]) {
      expect(x).toBeLessThan(at.noseX);
      expect(at.noseX - x).toBeLessThan(ANATOMY.halfWidth);
      expect(at.noseX - x).toBeGreaterThan(ANATOMY.halfWidth - 0.2);
    }
    expect(shots.momHand[2] - shots.hand[2]).toBeCloseTo(SHOTS.flank.momGap, 1);
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

  it('keeps Mom and her lantern outside her body, Mom ahead of you at her head', () => {
    const spots = [shots.momHead, shots.momFlank, { x: shots.lantern[0], z: shots.lantern[2] }];
    for (const { x, z } of spots) {
      expect(toCentreLine(x, z)).toBeGreaterThan(ANATOMY.halfWidth + 0.4);
    }
    expect(shots.momHead.z).toBeGreaterThan(shots.momFlank.z);
    expect(shots.momFlank.z).toBeGreaterThan(shots.kartik.z);
  });

  it('floats the pack on the water, within reach of the kneeling camera', () => {
    const [fx, fy, fz] = shots.float;
    expect(fy).toBeGreaterThan(WATER_Y);
    expect(fz).toBeLessThan(LAKE_Z);
    const [cx, , cz] = shots.packCam.at;
    expect(Math.hypot(fx - cx, fz - cz)).toBeLessThan(1.2);
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
});
