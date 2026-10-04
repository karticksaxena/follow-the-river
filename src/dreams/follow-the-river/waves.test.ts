import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import type { WaveDef } from './areas/types';
import { spawnFor } from './flow';
import { EDGE_X } from './river';
import {
  ambushSpot,
  newWaveState,
  stepWaves,
  WAVE,
  waveCrates,
  waveLeft,
  waveTotal,
  type WaveEvent,
} from './waves';

/** A small deterministic random in [0, 1). */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const waves = CITY.waves;
const first = (): WaveDef => {
  const def = waves[0];
  if (!def) throw new Error('city has waves');
  return def;
};

/** Walks the whole zone of wave `i` from its start to its gate; `kill` empties the bank each frame. */
function walk(i: number, kill: boolean): { events: WaveEvent[]; fired: number[]; left: number[] } {
  const w = newWaveState(i);
  const def = waves[i];
  if (!def) throw new Error('no such wave');
  const events: WaveEvent[] = [];
  const fired: number[] = [];
  const left: number[] = [];
  let alive = 0;
  for (let z = def.z + 5; z > def.gateZ; z -= 0.5) {
    const e = stepWaves(w, waves, z, alive);
    if (e) events.push(e);
    if (e?.kind === 'spawn') {
      alive += e.ambush.count;
      fired.push(z);
    }
    left.push(waveLeft(w, alive));
    if (kill) alive = 0;
  }
  return { events, fired, left };
}

describe('waves', () => {
  it('waits until you walk past its start', () => {
    const w = newWaveState();
    expect(stepWaves(w, waves, first().z + 5, 0)).toBeNull();
  });

  it('springs each ambush as its trigger passes, in order, then clears', () => {
    const def = first();
    const { events, fired } = walk(0, true);
    expect(events[0]).toEqual({ kind: 'start', wave: 0 });
    const spawned = events.flatMap((e) => (e?.kind === 'spawn' ? [e.ambush] : []));
    expect(spawned).toEqual(def.ambushes);
    fired.forEach((z, k) => expect(z).toBeLessThanOrEqual(def.ambushes[k]?.z ?? 0));
    expect(events.at(-1)).toEqual({ kind: 'clear', wave: 0 });
  });

  it("keeps each wave's total", () => {
    expect(CITY.waves.map(waveTotal)).toEqual([6, 8, 10]);
    expect(SUBURBS.waves.map(waveTotal)).toEqual([8, 10, 12]);
    expect(FOREST.waves.map(waveTotal)).toEqual([10, 12]);
  });

  it('never clears while any zombie lives (lying ones count) or an ambush waits', () => {
    const w = newWaveState();
    const def = first();
    stepWaves(w, waves, def.z - 1, 0);
    expect(stepWaves(w, waves, def.z - 1, 0)).toMatchObject({ kind: 'spawn' });
    expect(stepWaves(w, waves, def.z - 1, 0)).toBeNull(); // nobody alive, but ambushes wait
    const z = def.gateZ + 1;
    while (w.fired < def.ambushes.length) stepWaves(w, waves, z, 0);
    expect(stepWaves(w, waves, z, 2)).toBeNull(); // two lying ones still down
    expect(waveLeft(w, 2)).toBe(2);
    expect(stepWaves(w, waves, z, 0)).toEqual({ kind: 'clear', wave: 0 });
    expect([w.cleared, w.fighting]).toEqual([1, false]);
  });

  it('the counter starts at the whole wave and never goes up', () => {
    const { left } = walk(1, false);
    const fight = left.filter((n) => n > 0);
    expect(fight[0]).toBe(waveTotal(waves[1] ?? first()));
    for (let i = 1; i < fight.length; i++) expect(fight[i]).toBeLessThanOrEqual(fight[i - 1] ?? 0);
  });

  it('restarts at a checkpoint on the next wave with none sprung', () => {
    const w = newWaveState(1);
    const def = waves[1] ?? first();
    expect(stepWaves(w, waves, def.z - 1, 0)).toEqual({ kind: 'start', wave: 1 });
    expect(w.fired).toBe(0);
    expect(waveLeft(w, 0)).toBe(waveTotal(def));
  });

  it('never runs past the last wave', () => {
    const w = newWaveState(waves.length);
    expect(stepWaves(w, waves, -999, 0)).toBeNull();
  });
});

describe('ambush spots', () => {
  const random = seededRandom(3);
  const bank = [CITY.landX + 1, EDGE_X - 0.5] as const;

  it.each([CITY, SUBURBS, FOREST])('$id: every spot is on the bank, short of the gate', (area) => {
    for (const def of area.waves) {
      for (const a of def.ambushes) {
        for (let i = 0; i < 40; i++) {
          const player = { x: -4, z: a.z };
          const at = ambushSpot(a, player, def.gateZ, bank[0], bank[1], random);
          expect(at.x).toBeGreaterThanOrEqual(bank[0]);
          expect(at.x).toBeLessThanOrEqual(bank[1]);
          expect(at.z).toBeGreaterThan(def.gateZ);
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
    const one = waves[0];
    if (!one) throw new Error('city has waves');
    expect(spawnFor('night1', CITY, 1).z).toBe(one.gateZ - 3);
    expect(spawnFor('night1', CITY, 0)).toBe(CITY.nightStart);
    expect(spawnFor('day1', CITY, 2)).toBe(CITY.daySpawn);
  });
});
