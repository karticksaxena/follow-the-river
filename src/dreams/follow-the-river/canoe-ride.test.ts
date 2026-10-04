import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  BEATS,
  CALF,
  calfPose,
  canoePose,
  CLOSING_PAGES,
  crossedDown,
  dipPaddle,
  newScript,
  nextCue,
  PADDLE_DIP,
  RIDE,
  rideLive,
  speedAt,
  STOP_AT,
  STOP_PAUSE,
  toWorld,
  travelled,
  type CalfPose,
  type Cue,
  type Pose,
} from './canoe-ride';
import { meshY, pathSlope, pathX, RIVER_HALF, rng, terrainY, WATER_LEVEL } from './canoe-scene';

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

describe('the calf', () => {
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

describe('ground under the scenery', () => {
  it('meshY equals terrainY on every grid vertex', () => {
    for (const [x, z] of [
      [-125, 70],
      [0, 0],
      [12.5, -100],
      [-2.5, -297.5],
    ] as const)
      expect(meshY(x, z)).toBeCloseTo(terrainY(x, z), 5);
  });
  it('is the flat triangle between vertices (never the curve above it)', () => {
    const r = rng(5);
    let worst = 0;
    for (let i = 0; i < 20000; i++) {
      const z = 70 - r() * 400;
      const x = pathX(z) + (r() < 0.5 ? -1 : 1) * (RIVER_HALF + 1.5 + r() * 80);
      worst = Math.max(worst, Math.abs(meshY(x, z) - terrainY(x, z)));
    }
    expect(worst).toBeGreaterThan(0.2); // proves the old placement could float
    expect(worst).toBeLessThan(0.8);
  });
});

describe('crossedDown', () => {
  it('fires once, when a blade goes from above the water to at or below it', () => {
    expect(crossedDown(0.2, -0.1, 0)).toBe(true);
    expect(crossedDown(0.2, 0, 0)).toBe(true);
    expect(crossedDown(0.2, 0.1, 0)).toBe(false); // still above
    expect(crossedDown(-0.1, -0.3, 0)).toBe(false); // already in
    expect(crossedDown(-0.1, 0.2, 0)).toBe(false); // coming out
    expect(crossedDown(-Infinity, -0.2, 0)).toBe(false); // the first frame never counts
  });

  it('counts one stroke per dip of a rowing blade', () => {
    let prev = Infinity;
    let strokes = 0;
    for (let i = 0; i < 400; i++) {
      const y = Math.sin(i * 0.1) * 0.3; // 6 dips in 40 s of 0.1 s steps
      if (i > 0 && crossedDown(prev, y, 0)) strokes++;
      prev = y;
    }
    expect(strokes).toBe(6);
  });
});

// Blade heights over one rowing cycle.
function stroke(): { low: number[]; high: number[] } {
  const low: number[] = [];
  const high: number[] = [];
  for (let i = 0; i <= 200; i++) {
    const tilt = 0.29 * Math.sin((i / 200) * Math.PI * 2);
    const along = new THREE.Vector3(Math.sqrt(1 - tilt * tilt), tilt, 0);
    const mid = new THREE.Vector3(0, 0.6, 0);
    dipPaddle(along, mid);
    low.push(mid.y - 1.2 * along.y);
    high.push(mid.y + 1.2 * along.y);
  }
  return { low, high };
}

describe('the paddle dips into the river', () => {
  // Measured in the real ride: the blades swing 0.25-0.95 m above the water (mid 0.6, tilt +-0.29).
  const HULL_BOTTOM = -0.3;
  it('puts the low blade 8-15 cm under the water at the bottom of the stroke, above the hull bottom', () => {
    const { low } = stroke();
    for (const y of low) expect(y).toBeGreaterThan(HULL_BOTTOM);
    const deepest = Math.min(...low, ...stroke().high);
    expect(deepest).toBeLessThan(-0.08 + WATER_LEVEL);
    expect(deepest).toBeGreaterThan(-0.15 + WATER_LEVEL);
  });

  it('plays one stroke per cycle per blade, and keeps the high blade above the rim', () => {
    const { low, high } = stroke();
    for (const blade of [low, high]) {
      let strokes = 0;
      for (let i = 1; i < blade.length; i++) {
        if (crossedDown(blade[i - 1] ?? 0, blade[i] ?? 0, WATER_LEVEL)) strokes++;
      }
      expect(strokes).toBe(1);
    }
    expect(Math.max(...low, ...high)).toBeGreaterThan(0.5);
    expect(PADDLE_DIP).toBeGreaterThan(0);
  });
});

describe('the speed profile', () => {
  it('glides to a drift after Mom stops rowing (it does not keep her speed)', () => {
    expect(speedAt(30, null)).toBeCloseTo(RIDE.speed);
    expect(speedAt(60, 55)).toBeLessThan(RIDE.speed * 0.5);
    expect(speedAt(70, 55)).toBeCloseTo(RIDE.drift, 1);
    for (let t = 55; t < 70; t += 0.5)
      expect(speedAt(t + 0.5, 55)).toBeLessThanOrEqual(speedAt(t, 55) + 1e-9);
  });

  it('integrates the speed: distance matches a numeric sum, never backs up, slows after the stop', () => {
    let sum = 0;
    let last = 0;
    let worst = 0;
    let backed = 0;
    const dt = 0.01;
    for (let i = 0; i < 7000; i++) {
      const t = i * dt;
      const d = travelled(t, STOP_AT);
      worst = Math.max(worst, Math.abs(d - sum));
      backed = Math.min(backed, d - last);
      last = d;
      sum += speedAt(t + dt / 2, STOP_AT) * dt;
    }
    expect(worst).toBeLessThan(0.05);
    expect(backed).toBeGreaterThanOrEqual(-1e-9);
    expect(travelled(30, null)).toBeCloseTo(travelled(30, STOP_AT));
  });
});

interface Entry {
  t: number;
  page: string;
  rowing: boolean;
  stoppedAt: number;
}

/** The ride's director run by hand: a player who reads each page for 3 s. */
function simulateRide(): Entry[] {
  const s = newScript();
  const log: Entry[] = [];
  let rowing = true;
  let stoppedAt = Infinity;
  let readingUntil = 0;
  for (let i = 0; i < 1200; i++) {
    const t = i * 0.1;
    const cue: Cue | null = nextCue(s, t, t < readingUntil);
    if (!cue) continue;
    if (cue.kind === 'stop') {
      rowing = false;
      stoppedAt = t;
      continue;
    }
    for (const page of cue.pages) log.push({ t, page, rowing, stoppedAt });
    readingUntil = t + 3 * cue.pages.length;
  }
  return log;
}

describe('the director', () => {
  it('only opens the "Mom stops rowing" page after she has stopped', () => {
    const stop = simulateRide().find((e) => e.page === CLOSING_PAGES[0]);
    expect(stop?.rowing).toBe(false);
    expect(stop && stop.t - stop.stoppedAt).toBeGreaterThanOrEqual(STOP_PAUSE - 1e-6);
    expect(STOP_PAUSE).toBeGreaterThanOrEqual(1);
  });

  it('has a few short talks with Mom, in order, before the calf', () => {
    expect(BEATS.length).toBeGreaterThanOrEqual(3);
    for (const b of BEATS) expect(b.at).toBeLessThan(RIDE.seconds - RIDE.calfLead);
    for (let i = 1; i < BEATS.length; i++) expect(BEATS[i].at).toBeGreaterThan(BEATS[i - 1].at);
    expect(BEATS.flatMap((b) => b.pages).some((p) => p.includes('\u2014'))).toBe(false);
  });

  it('plays every talk in order, then the closing pages, each once; a page open holds the next', () => {
    const log = simulateRide().map((e) => e.page);
    expect(log).toEqual([...BEATS.flatMap((b) => b.pages), ...CLOSING_PAGES]);
    const s = newScript();
    expect(nextCue(s, BEATS[0].at + 1, true)).toBeNull(); // a page is open: it waits
    expect(nextCue(s, BEATS[0].at + 1, false)?.kind).toBe('beat');
  });

  it('stops Mom on time even while a page is open', () => {
    expect(nextCue(newScript(), STOP_AT, true)?.kind).toBe('stop');
  });
});

describe('rideLive', () => {
  it('freezes while paused (the end shot too), runs behind an open page, never before the start', () => {
    expect(rideLive(false, true, true)).toBe(false);
    expect(rideLive(false, true, false)).toBe(true);
    expect(rideLive(true, true, true)).toBe(true);
    expect(rideLive(false, false, false)).toBe(false);
  });
});
