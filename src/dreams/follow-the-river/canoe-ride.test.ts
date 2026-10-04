import { describe, expect, it } from 'vitest';
import {
  CALF,
  calfPose,
  canoePose,
  CLOSING_PAGES,
  RIDE,
  rowAmount,
  toWorld,
  travelled,
  type CalfPose,
  type Pose,
} from './canoe-ride';
import { pathSlope, pathX, RIVER_HALF, rng, terrainY, WATER_LEVEL } from './canoe-scene';

const blank = (): Pose => ({ x: 0, y: 0, z: 0, yaw: 0, roll: 0 });
const calfBlank = (): CalfPose => ({ x: 0, z: 0, y: 0, pitch: 0, visible: false, surfaced: 0 });

describe('travel', () => {
  it('starts at rest, eases in, then moves at full speed and never backs up', () => {
    expect(travelled(0)).toBe(0);
    expect(travelled(-4)).toBe(0);
    let last = 0;
    for (let t = 0; t <= RIDE.seconds; t += 0.5) {
      const d = travelled(t);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
    const t = RIDE.easeIn + 10;
    expect(travelled(t + 1) - travelled(t)).toBeCloseTo(RIDE.speed);
  });
});

describe('river path', () => {
  it('has a slope that matches its x numerically', () => {
    for (const z of [0, -37, -120, -260]) {
      const h = 0.01;
      expect(pathSlope(z)).toBeCloseTo((pathX(z + h) - pathX(z - h)) / (2 * h), 3);
    }
  });

  it('is deep in the middle and above the water on the banks', () => {
    for (const z of [0, -80, -200]) {
      expect(terrainY(pathX(z), z)).toBeLessThan(WATER_LEVEL - 1);
      expect(terrainY(pathX(z) + RIVER_HALF + 12, z)).toBeGreaterThan(WATER_LEVEL + 0.5);
    }
  });

  it('winds gently: the bend radius stays well above the canoe length', () => {
    for (let z = 0; z > -300; z -= 5) {
      const dz = 0.5;
      const curve = (pathSlope(z + dz) - pathSlope(z - dz)) / (2 * dz);
      expect(Math.abs(curve)).toBeLessThan(1 / 15);
    }
  });
});

describe('canoe pose', () => {
  it('floats at the water, heading down-river (-z) with the bow forward', () => {
    const p = canoePose(10, blank());
    expect(p.z).toBeCloseTo(-travelled(10));
    expect(Math.abs(p.y - WATER_LEVEL)).toBeLessThan(0.3);
    expect(Math.cos(p.yaw)).toBeLessThan(-0.8); // forward is (sin yaw, cos yaw): mostly -z
  });

  it('stays on the river centre line', () => {
    const p = canoePose(33, blank());
    expect(p.x).toBeCloseTo(pathX(p.z));
  });
});

describe('toWorld', () => {
  it('maps canoe-local ahead and left through the yaw', () => {
    const out = { x: 0, z: 0 };
    toWorld({ ...blank(), yaw: Math.PI / 2, x: 5, z: 1 }, 2, 3, out);
    expect(out.x).toBeCloseTo(5 + 3); // ahead is +x when yaw is 90 degrees
    expect(out.z).toBeCloseTo(1 - 2);
    toWorld({ ...blank(), yaw: 0 }, 2, 3, out);
    expect(out).toEqual({ x: 2, z: 3 });
  });
});

describe('rowing and the calf', () => {
  it('rows until the last seconds, then stops', () => {
    expect(rowAmount(0)).toBe(1);
    expect(rowAmount(RIDE.seconds)).toBe(0);
  });

  it('stays hidden, then surfaces beside the canoe a few metres away and keeps pace', () => {
    expect(calfPose(RIDE.seconds - RIDE.calfLead - 1, calfBlank()).visible).toBe(false);
    const c = calfPose(RIDE.seconds - 2, calfBlank());
    expect(c.visible).toBe(true);
    expect(c.surfaced).toBe(1);
    expect(Math.hypot(c.x, c.z)).toBeGreaterThan(2);
    expect(Math.hypot(c.x, c.z)).toBeLessThan(8);
    expect(c.y).toBeGreaterThan(CALF.hidden);
    const later = calfPose(RIDE.seconds + 5, calfBlank());
    expect(Math.abs(later.z - c.z)).toBeLessThan(1.5);
  });
});

describe('closing pages and rng', () => {
  it('has no em dashes', () => {
    for (const page of CLOSING_PAGES) expect(page).not.toMatch(/—/);
  });
  it('rng is deterministic and in [0, 1)', () => {
    const a = rng(5);
    const b = rng(5);
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
