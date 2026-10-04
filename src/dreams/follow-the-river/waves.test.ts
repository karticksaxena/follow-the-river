import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import { spawnFor } from './flow';
import { newWaveState, stepWaves, WAVE, waveCrates, waveLeft, waveSpawn } from './waves';

const waves = CITY.waves;

/** Runs the waves: the player stands at `z`, the horde kills whatever spawned after `killAfter` s. */
function fight(z: number, frames: number, kill: boolean): { events: string[]; alive: number } {
  const w = newWaveState();
  let alive = 0;
  const events: string[] = [];
  for (let i = 0; i < frames; i++) {
    const e = stepWaves(w, waves, z, alive, 1 / 30);
    if (e?.kind === 'spawn') alive += e.count;
    if (e) events.push(e.kind);
    if (kill) alive = 0;
  }
  return { events, alive };
}

describe('waves', () => {
  it('waits until you walk past its start', () => {
    expect(fight((waves[0]?.z ?? 0) + 5, 300, false).events).toEqual([]);
  });

  it('brings the whole wave in groups, then clears once every zombie is dead', () => {
    const w = newWaveState();
    const def = waves[0];
    if (!def) throw new Error('city has waves');
    expect(stepWaves(w, waves, def.z - 1, 0, 0.1)).toEqual({ kind: 'start', wave: 0 });
    const groups: number[] = [];
    for (let i = 0; i < 600 && groups.reduce((a, b) => a + b, 0) < def.count; i++) {
      const e = stepWaves(w, waves, def.z - 1, 0, 0.1);
      if (e?.kind === 'spawn') groups.push(e.count);
    }
    expect(Math.max(...groups)).toBeLessThanOrEqual(WAVE.group);
    expect(groups.reduce((a, b) => a + b, 0)).toBe(def.count);
    expect(waveLeft(w, 4)).toBe(4);
    expect(stepWaves(w, waves, def.z - 1, 1, 0.1)).toBeNull(); // one still standing
    expect(stepWaves(w, waves, def.z - 1, 0, 0.1)).toEqual({ kind: 'clear', wave: 0 });
    expect([w.cleared, w.fighting]).toEqual([1, false]);
  });

  it('never runs past the last wave', () => {
    const w = newWaveState(waves.length);
    expect(stepWaves(w, waves, -999, 0, 1)).toBeNull();
  });

  it('spawns on the bank, never beyond the barricade ahead', () => {
    let seed = 3;
    const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 200; i++) {
      const at = waveSpawn({ x: 0, z: -170 }, -180, -17, 2.5, random);
      expect(at.x).toBeGreaterThanOrEqual(-17);
      expect(at.x).toBeLessThanOrEqual(2.5);
      expect(at.z).toBeGreaterThan(-180);
      const d = Math.abs(at.z + 170);
      expect(d).toBeGreaterThanOrEqual(WAVE.near);
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
