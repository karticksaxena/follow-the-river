import { describe, expect, it } from 'vitest';
import { nextSpawn, SPAWNER } from './spawner';

const strip = { minX: -18, maxX: 2.5, minZ: -415, maxZ: -120 };
const never = (): boolean => false;
const wall = (x: number): boolean => x < -6;
function seeded(seed = 1): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe('nextSpawn', () => {
  it('waits for the interval', () => {
    const state = { timer: SPAWNER.interval };
    expect(nextSpawn(state, 0.1, 0, { x: 0, z: -150 }, strip, -400, never, seeded())).toBeNull();
  });

  it('spawns in the fog on land, inside the strip', () => {
    const random = seeded(3);
    for (let i = 0; i < 200; i++) {
      const p = nextSpawn({ timer: 0 }, 0.1, 0, { x: 0, z: -200 }, strip, -400, never, random);
      if (!p) continue;
      const d = Math.hypot(p.x, p.z + 200);
      expect(d).toBeGreaterThanOrEqual(SPAWNER.minDistance - 1e-9);
      expect(d).toBeLessThanOrEqual(SPAWNER.maxDistance + 1e-9);
      expect(p.x).toBeGreaterThanOrEqual(strip.minX);
      expect(p.x).toBeLessThanOrEqual(strip.maxX);
      expect(p.z).toBeGreaterThanOrEqual(strip.minZ);
      expect(p.z).toBeLessThanOrEqual(strip.maxZ);
    }
  });

  it('mostly spawns ahead (downstream)', () => {
    const random = seeded(5);
    let ahead = 0;
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const p = nextSpawn({ timer: 0 }, 0.1, 0, { x: 0, z: -200 }, strip, -400, never, random);
      if (!p) continue;
      total++;
      if (p.z < -200) ahead++;
    }
    expect(ahead / total).toBeGreaterThan(0.55);
  });

  it('stops at the cap and near the safe spot', () => {
    expect(
      nextSpawn({ timer: 0 }, 0.1, SPAWNER.cap, { x: 0, z: -200 }, strip, -400, never, seeded()),
    ).toBeNull();
    const nearSafe = { x: 0, z: -400 + SPAWNER.quietNearSafe - 1 };
    expect(nextSpawn({ timer: 0 }, 0.1, 0, nearSafe, strip, -400, never, seeded())).toBeNull();
  });

  it('never spawns inside walls', () => {
    const random = seeded(9);
    const xs: number[] = [];
    for (let i = 0; i < 200; i++) {
      const p = nextSpawn({ timer: 0 }, 0.1, 0, { x: 0, z: -200 }, strip, -400, wall, random);
      if (p) xs.push(p.x);
    }
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-6);
  });

  it('never spawns a zombie itself inside the quiet zone near the safe spot', () => {
    const random = seeded(11);
    const player = { x: 0, z: -400 + SPAWNER.quietNearSafe + 1 };
    const gaps: number[] = [];
    for (let i = 0; i < 200; i++) {
      const p = nextSpawn({ timer: 0 }, 0.1, 0, player, strip, -400, never, random);
      if (p) gaps.push(p.z + 400);
    }
    expect(gaps.length).toBeGreaterThan(0);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(SPAWNER.quietNearSafe);
  });
});

describe('nextSpawn pace', () => {
  it('uses the given cap and interval', () => {
    const pace = { cap: 3, interval: 1.5 };
    const at = { x: 0, z: -200 };
    expect(nextSpawn({ timer: 0 }, 0.1, 3, at, strip, -400, never, seeded(), pace)).toBeNull();
    const state = { timer: 0 };
    nextSpawn(state, 0.1, 2, at, strip, -400, never, seeded(), pace);
    expect(state.timer).toBe(1.5);
  });
});
