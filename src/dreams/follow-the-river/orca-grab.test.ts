import { describe, expect, it } from 'vitest';
import { NIGHT_STRIKE, pickStrike } from './fish-parts';
import {
  FACE_LAND,
  GRAB,
  grabPose,
  grabSeconds,
  jawAt,
  jawOf,
  landX,
  newGrab,
  stepGrab,
  type GrabPose,
  type Prey,
} from './orca-grab';
import { EDGE_X, WATER_Y } from './river';

const ground = (x: number): number => (x < EDGE_X ? 0 : WATER_Y);
const pose = (): GrabPose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
const CRUISE_Y = WATER_Y - 0.5;
const start = (vx: number, vz = -40): ReturnType<typeof newGrab> =>
  newGrab(
    { x: EDGE_X + 5, y: CRUISE_Y, z: vz + 6, yaw: 0, pitch: 0 },
    7,
    vx,
    vz,
    CRUISE_Y,
    NIGHT_STRIKE,
    EDGE_X,
  );

interface FakePrey extends Prey {
  seized: number;
  held: number;
  drowned: number[];
  swept: number[];
}

/** A horde with one zombie (id 7) at (x, z) that stays put, and a bystander (id 8) beside it. */
function fakePrey(x: number, z: number): FakePrey {
  let alive = true;
  const prey: FakePrey = {
    seized: 0,
    held: 0,
    drowned: [],
    swept: [],
    forEachAlive(fn) {
      if (alive) fn(7, x, z);
      fn(8, x, z + 1.5);
    },
    throwByFish(id) {
      prey.swept.push(id);
    },
    locate(id, out) {
      if (id !== 7 || !alive) return false;
      out.x = x;
      out.z = z;
      return true;
    },
    seize() {
      prey.seized++;
      alive = false;
      return true;
    },
    hold() {
      prey.held++;
    },
    drown(id) {
      prey.drowned.push(id);
    },
  };
  return prey;
}

interface Run {
  out: GrabPose;
  breaches: number;
  splashes: number;
  frames: number;
}

function run(vx: number, prey: Prey | null): Run {
  const g = start(vx);
  const r: Run = { out: pose(), breaches: 0, splashes: 0, frames: 0 };
  const hooks = { breach: (): void => void r.breaches++, splash: (): void => void r.splashes++ };
  while (stepGrab(g, 1 / 60, prey, ground, hooks, r.out) && r.frames < 1000) r.frames++;
  return r;
}

describe('the orca grab', () => {
  it('reaches a zombie at full reach with its jaws while its tail stays over the water', () => {
    const vx = EDGE_X - 4.5;
    const g = start(vx);
    g.t = g.approach + GRAB.burst + 0.01; // beached, start of the shake
    const out = grabPose(g, ground, pose());
    const jaw = { x: 0, y: 0, z: 0 };
    jawOf({ ...out, yaw: FACE_LAND }, jaw);
    expect(jaw.x).toBeCloseTo(vx, 0);
    expect(out.x + 3.5).toBeGreaterThanOrEqual(EDGE_X);
    expect(jaw.y).toBeGreaterThan(0); // above the road, not in it
  });

  it('crawls back over the road (never into it) and only drops once its jaws are past the edge', () => {
    for (const vx of [EDGE_X - 4.5, EDGE_X - 2, EDGE_X - 0.3]) {
      const g = start(vx);
      const out = pose();
      const jaw = { x: 0, y: 0, z: 0 };
      let deepest = Infinity; // jaws' height above the ground while over the land, after landing
      for (g.t = g.approach + g.burst; g.t < grabSeconds(g); g.t += 1 / 60) {
        grabPose(g, ground, out);
        jawOf(out, jaw);
        if (jaw.x < EDGE_X - 0.1) deepest = Math.min(deepest, jaw.y - ground(jaw.x));
      }
      expect(deepest).toBeGreaterThan(-0.05);
    }
  });

  it('never goes further inland than its reach', () => {
    expect(landX(-50, 4.5)).toBeCloseTo(EDGE_X - 4.5 + GRAB.jawAhead);
  });

  it('bites, thrashes, drags the zombie under and drowns it, breaking the bank once', () => {
    const prey = fakePrey(EDGE_X - 2, -40);
    const { out, breaches, splashes, frames } = run(EDGE_X - 2, prey);
    expect(prey.seized).toBe(1);
    expect(prey.held).toBeGreaterThan(30);
    expect(prey.drowned).toEqual([7]);
    expect(prey.swept).toEqual([]); // a normal night takes only the one it bites
    expect([breaches, splashes]).toEqual([1, 1]);
    expect(out.y).toBeLessThan(WATER_Y);
    expect(frames).toBeLessThan(Math.ceil(grabSeconds(start(0)) * 60) + 2);
  });

  it('in the last stand, also knocks the zombies beside its jaws into the river', () => {
    const prey = fakePrey(EDGE_X - 2, -40);
    const g = newGrab(
      { x: EDGE_X + 5, y: CRUISE_Y, z: -34, yaw: 0, pitch: 0 },
      7,
      EDGE_X - 2,
      -40,
      CRUISE_Y,
      { ...NIGHT_STRIKE, sweep: 2.5 },
      EDGE_X,
    );
    const hooks = { breach: (): void => undefined, splash: (): void => undefined };
    const out = pose();
    while (stepGrab(g, 1 / 60, prey, ground, hooks, out));
    expect(prey.swept).toEqual([8]);
    expect(prey.drowned).toEqual([7]);
  });

  it('comes back empty-mouthed if the zombie ran out of reach', () => {
    const prey = fakePrey(EDGE_X - 12, -40);
    run(EDGE_X - 2, prey);
    expect(prey.seized).toBe(0);
    expect(prey.drowned).toEqual([]);
  });

  it('rushes in faster from close by, but never in under half a second', () => {
    const near = newGrab(
      { x: EDGE_X + 4, y: CRUISE_Y, z: -40, yaw: 0, pitch: 0 },
      1,
      0,
      -40,
      CRUISE_Y,
      NIGHT_STRIKE,
      EDGE_X,
    );
    expect(near.approach).toBe(GRAB.approachMin);
  });

  it('opens her jaws on the way in, snaps them shut on the bite, holds the zombie between them', () => {
    const g = newGrab({ x: 10, y: -2, z: 0, yaw: 0, pitch: 0 }, 3, 1, 0, -2, NIGHT_STRIKE, EDGE_X);
    g.t = g.approach * 0.5;
    expect(jawAt(g)).toBeLessThan(0.2);
    g.t = g.approach + g.burst * 0.8;
    expect(jawAt(g)).toBeGreaterThan(0.8);
    g.bitten = true;
    g.t = g.approach + g.burst + 0.1;
    expect(jawAt(g)).toBeCloseTo(GRAB.hold, 1);
    g.victim = -1; // the bite missed: the jaws close on nothing
    expect(jawAt(g)).toBe(0);
  });

  it('holds the zombie with its middle at the jaws (crosswise), not beside them', () => {
    const prey = fakePrey(EDGE_X - 2, -40);
    const g = start(EDGE_X - 2);
    const out = pose();
    const jaw = { x: 0, y: 0, z: 0 };
    let worst = 0;
    prey.hold = (_id, x, y, z, yaw, tilt) => {
      prey.held++;
      jawOf(out, jaw);
      // The zombie's middle: its feet plus 0.9 m along its tipped "up" (rotation order XYZ).
      const mid = {
        x: x - 0.9 * Math.sin(tilt) * Math.cos(yaw),
        y: y + 0.9 * Math.cos(tilt),
        z: z + 0.9 * Math.sin(tilt) * Math.sin(yaw),
      };
      worst = Math.max(worst, Math.hypot(mid.x - jaw.x, mid.y - jaw.y, mid.z - jaw.z));
    };
    const hooks = { breach: (): void => undefined, splash: (): void => undefined };
    while (stepGrab(g, 1 / 60, prey, ground, hooks, out));
    expect(prey.held).toBeGreaterThan(30);
    expect(worst).toBeLessThan(0.05);
  });
});

describe('the last stand: she only takes zombies near you or Mom', () => {
  it('ignores zombies far from every guard', () => {
    const buf = new Float32Array([1, 2, -40, 2, 2, -8]); // id 1 is 40 m upstream, id 2 is 8 m away
    const guards = [
      { x: 0, z: 0 },
      { x: -3, z: -3 },
    ];
    expect(pickStrike(buf, 2, { x: 0, z: 0 }, EDGE_X, 7, guards, 9)).toBe(2);
    expect(
      pickStrike(new Float32Array([1, 2, -40]), 1, { x: 0, z: 0 }, EDGE_X, 7, guards, 9),
    ).toBeNull();
  });
});
