import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import type { WaveDef } from './areas/types';
import { spawnFor } from './flow';
import { EDGE_X } from './river';
import {
  ambushSpot,
  edgePickups,
  newWaveState,
  objective,
  spawnSpot,
  stepWaves,
  WAVE,
  waveCrates,
  waveTotal,
  type WaveEvent,
} from './waves';

/** A small deterministic random in [0, 1). */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const waves = CITY.waves;
const first = (): WaveDef => {
  const w = waves[0];
  if (!w) throw new Error('city has waves');
  return w;
};
const N = { quota: 1, interval: 1 };
const standThenWalk = (t: number): number => (t < 1 ? -136 : -201);

/** A test wave: 9 zombies, 3 of them in ambushes (the one at z -200 stays reserved). */
const def: WaveDef = {
  z: -134,
  gateZ: -239,
  quota: 9,
  every: [4, 6],
  cap: 6,
  faster: 0,
  ambushes: [
    { z: -134, count: 2, kind: 'street' },
    { z: -200, count: 1, kind: 'behind' },
  ],
  crate: { x: -1 },
};

/** Runs a wave for `seconds` with the player at `zAt(t)`; `kill` empties the bank every frame. */
function simulate(
  d: { quota: number; interval: number },
  zAt: (t: number) => number,
  seconds: number,
  kill: boolean,
): { spawned: number; events: WaveEvent[]; w: ReturnType<typeof newWaveState> } {
  const w = newWaveState();
  const r = rng(5);
  const events: WaveEvent[] = [];
  let alive = 0;
  let spawned = 0;
  for (let t = 0; t < seconds; t += 0.1) {
    const e = stepWaves(w, [def], zAt(t), alive, 0.1, d, r);
    if (e) events.push(e);
    if (e?.kind === 'one') spawned++;
    if (e?.kind === 'spawn') spawned += e.ambush.count;
    alive += e?.kind === 'one' ? 1 : e?.kind === 'spawn' ? e.ambush.count : 0;
    if (kill) alive = 0;
  }
  return { spawned, events, w };
}

describe('waves', () => {
  it('waits until you walk past its start', () => {
    const w = newWaveState();
    expect(stepWaves(w, waves, first().z + 5, 0, 0.1, N, rng(1))).toBeNull();
  });

  it('keeps spawning over time while you stand still, up to the cap, until the quota is out', () => {
    const w = newWaveState();
    const r = rng(3);
    expect(stepWaves(w, [def], -136, 0, 0.1, N, r)?.kind).toBe('start');
    let spawned = 0;
    let alive = 0;
    for (let t = 0; t < 300; t += 0.1) {
      const e = stepWaves(w, [def], -136, alive, 0.1, N, r); // the player never moves
      if (e?.kind === 'one') {
        spawned++;
        alive++;
      }
      if (e?.kind === 'spawn') {
        spawned += e.ambush.count;
        alive += e.ambush.count;
      }
      expect(alive).toBeLessThanOrEqual(def.cap + 2); // an ambush may burst over the cap
      if (alive > 0 && t % 7 < 0.1) alive--; // the player kills one now and then
    }
    // the ambush at z -200 stays reserved until you walk there
    expect(spawned).toBe(def.quota - 1);
  });

  it('clears only when everything is spawned and dead', () => {
    const stand = simulate(N, () => -136, 200, true);
    expect(stand.events.some((e) => e?.kind === 'clear')).toBe(false); // the reserved ambush waits
    const walk = simulate(N, (t) => (t < 60 ? -136 : -201), 200, true);
    expect(walk.events.at(-1)).toEqual({ kind: 'clear', wave: 0 });
    expect(walk.spawned).toBe(def.quota);
    expect([walk.w.cleared, walk.w.fighting, walk.w.toSpawn]).toEqual([1, false, 0]);
  });

  it('never clears while a zombie lives', () => {
    const w = newWaveState();
    const r = rng(7);
    stepWaves(w, [def], -136, 0, 0.1, N, r);
    for (let t = 0; t < 300; t += 0.1) {
      expect(stepWaves(w, [def], -201, 1, 0.1, N, r)?.kind).not.toBe('clear');
    }
  });

  it('scales the quota and the spawn gap by difficulty', () => {
    expect(simulate({ quota: 1.4, interval: 0.75 }, standThenWalk, 300, true).spawned).toBe(13);
    expect(simulate(N, standThenWalk, 300, true).spawned).toBe(9);
    expect(simulate({ quota: 0.6, interval: 1.4 }, standThenWalk, 300, true).spawned).toBe(5); // 5.4 -> 5
    const fast = simulate({ quota: 1, interval: 0.75 }, standThenWalk, 30, true).events.length;
    const slow = simulate({ quota: 1, interval: 1.4 }, standThenWalk, 30, true).events.length;
    expect(fast).toBeGreaterThan(slow); // shorter gaps, more spawns in the same time
  });

  it('every zone is long: the barricade is at least 90 m past the crate, every ambush trigger before the gate', () => {
    for (const area of [CITY, SUBURBS, FOREST])
      for (const w of area.waves) {
        expect(w.z - 2 - w.gateZ).toBeGreaterThanOrEqual(90);
        for (const a of w.ambushes) expect(a.z).toBeGreaterThan(w.gateZ + 5);
        expect(w.quota).toBeGreaterThanOrEqual(w.ambushes.reduce((n, a) => n + a.count, 0));
      }
  });

  it('each wave of a night is stronger than the one before', () => {
    for (const area of [CITY, SUBURBS, FOREST])
      area.waves.forEach((w, i, all) => {
        const prev = all[i - 1];
        if (!prev) return;
        expect(w.quota).toBeGreaterThan(prev.quota);
        expect(w.faster).toBeGreaterThanOrEqual(prev.faster);
        expect(w.every[1]).toBeLessThanOrEqual(prev.every[1]);
      });
  });

  it('keeps the planned quotas', () => {
    expect(CITY.waves.map((w) => w.quota)).toEqual([9, 12, 15]);
    expect(SUBURBS.waves.map((w) => w.quota)).toEqual([11, 14, 17]);
    expect(FOREST.waves.map((w) => w.quota)).toEqual([13, 16]);
    expect(CITY.waves.map(waveTotal)).toEqual([5, 6, 10]);
  });

  it('restarts at a checkpoint on the next wave with none sprung', () => {
    const w = newWaveState(1);
    const d = waves[1] ?? first();
    expect(stepWaves(w, waves, d.z - 1, 0, 0.1, N, rng(1))).toEqual({ kind: 'start', wave: 1 });
    expect(w.fired).toBe(0);
  });

  it('never runs past the last wave', () => {
    const w = newWaveState(waves.length);
    expect(stepWaves(w, waves, -999, 0, 0.1, N, rng(1))).toBeNull();
  });
});

describe('spawn spots', () => {
  const zone = { startZ: -134, gateZ: -239, minX: -17, maxX: 2.5 };

  it('spawns out of your face: never within 12 m, always on the bank, never past the gate', () => {
    const r = rng(9);
    for (let i = 0; i < 2000; i++) {
      const p = { x: -2, z: -180 };
      const s = spawnSpot(p, zone, r);
      expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThanOrEqual(12 - 1e-9);
      expect(s.x).toBeGreaterThanOrEqual(zone.minX);
      expect(s.x).toBeLessThanOrEqual(zone.maxX);
      expect(s.z).toBeGreaterThanOrEqual(zone.gateZ + 2);
    }
  });

  it('still keeps its distance when you stand at the gate or at the start', () => {
    const r = rng(4);
    for (const z of [-237, -135]) {
      for (let i = 0; i < 500; i++) {
        const s = spawnSpot({ x: -5, z }, zone, r);
        expect(Math.hypot(s.x + 5, s.z - z)).toBeGreaterThanOrEqual(12 - 1e-9);
        expect(s.z).toBeGreaterThanOrEqual(zone.gateZ + 2);
        expect(s.z).toBeLessThanOrEqual(zone.startZ + 10);
      }
    }
  });
});

describe('edge supplies and the objective', () => {
  it('puts three small supplies at the water edge of every zone', () => {
    const list = edgePickups(CITY);
    expect(list).toHaveLength(CITY.waves.length * 3);
    for (const p of list) expect(p.x).toBeGreaterThan(EDGE_X - 1);
    expect(list.map((p) => p.kind).slice(0, 3)).toEqual(['ammo', 'arrows', 'ammo']);
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
    expect(list.slice(0, 3).map((p) => p.z)).toEqual([
      first().z - 25,
      first().z - 55,
      first().z - 85,
    ]);
  });

  it('always says what to do', () => {
    const o = { night: true, fighting: false, wave: 0, waves: 3, ending: false, lake: false };
    expect(objective(o)).toMatch(/Follow the river/);
    expect(objective({ ...o, fighting: true, wave: 2 })).not.toMatch(/left/);
    expect(objective({ ...o, fighting: true })).toMatch(/Kill them all/);
    expect(objective({ ...o, night: false })).toMatch(/Search for supplies/);
    expect(objective({ ...o, lake: true, wave: 3 })).toMatch(/Mom is waiting/);
    expect(objective({ ...o, ending: true })).toBe('');
  });
});

describe('ambush spots', () => {
  const random = rng(3);
  const bank = [CITY.landX + 1, EDGE_X - 0.5] as const;

  it.each([CITY, SUBURBS, FOREST])('$id: every spot is on the bank, short of the gate', (area) => {
    for (const w of area.waves) {
      for (const a of w.ambushes) {
        for (let i = 0; i < 40; i++) {
          const player = { x: -4, z: a.z };
          const at = ambushSpot(a, player, w.gateZ, bank[0], bank[1], random);
          expect(at.x).toBeGreaterThanOrEqual(bank[0]);
          expect(at.x).toBeLessThanOrEqual(bank[1]);
          expect(at.z).toBeGreaterThan(w.gateZ);
          const gap = a.kind === 'behind' ? at.z - player.z : player.z - at.z;
          expect(
            a.kind === 'street' || a.kind === 'behind' ? gap : WAVE.near,
          ).toBeGreaterThanOrEqual(WAVE.near - 0.01);
        }
      }
    }
  });
});

describe('wave layout', () => {
  it.each([CITY, SUBURBS, FOREST])(
    '$id: waves run downstream, each held by its barricade',
    (area) => {
      let last = area.nightStart.z;
      for (const w of area.waves) {
        expect(w.z).toBeLessThan(last);
        expect(w.gateZ).toBeLessThan(w.z);
        last = w.gateZ;
      }
      const end = area.endingAt?.z ?? area.safeZ;
      expect(last).toBeGreaterThan(end);
    },
  );

  it.each([CITY, SUBURBS, FOREST])(
    '$id: 3-4 ambushes per wave, triggered in order between its start and its gate',
    (area) => {
      for (const w of area.waves) {
        expect(w.ambushes.length).toBeGreaterThanOrEqual(3);
        expect(w.ambushes.length).toBeLessThanOrEqual(4);
        let at = w.z;
        for (const a of w.ambushes) {
          expect(a.z).toBeLessThanOrEqual(at);
          expect(a.z).toBeGreaterThanOrEqual(w.gateZ + (a.kind === 'street' ? WAVE.near + 2 : 10));
          const placed = a.kind === 'cover' || a.kind === 'lying';
          expect(placed ? a.x : area.landX + 1).toBeGreaterThanOrEqual(area.landX + 1);
          expect(placed ? a.x : 0).toBeLessThanOrEqual(EDGE_X - 0.5);
          expect(placed ? a.at : a.z - 20).toBeLessThan(a.z - 12); // out of the dark, ahead
          expect(placed ? a.at : w.gateZ + 3).toBeGreaterThan(w.gateZ + 2);
          at = a.z;
        }
      }
    },
  );

  it('crates sit just past each wave start, one per wave, with the planned guns', () => {
    const crates = waveCrates(CITY);
    expect(crates.map((c) => c.gun ?? null)).toEqual(['pistol', 'shotgun', null]);
    expect(waveCrates(SUBURBS).map((c) => c.gun ?? null)).toEqual([null, 'rifle', null]);
    expect(new Set(crates.map((c) => c.id)).size).toBe(crates.length);
  });

  it('after a death you start just past the last barricade down', () => {
    expect(spawnFor('night1', CITY, 1).z).toBe(first().gateZ - 3);
    expect(spawnFor('night1', CITY, 0)).toBe(CITY.nightStart);
    expect(spawnFor('day1', CITY, 2)).toBe(CITY.daySpawn);
  });
});
