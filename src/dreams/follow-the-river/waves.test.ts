import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { FOREST } from './areas/forest';
import { SUBURBS } from './areas/suburbs';
import type { WaveDef } from './areas/types';
import { NIGHT_DIFFICULTY } from './difficulty';
import { spawnFor } from './flow';
import { nearBox } from './houses';
import { EDGE_X } from './river';
import { shackBounds } from './shack';
import {
  ambushPlace,
  ambushSpot,
  edgePickups,
  fallbackSpot,
  inCone,
  isPlaced,
  newWaveState,
  objective,
  passedBy,
  placeOk,
  spawnSpot,
  stepWaves,
  WAVE,
  waveCrates,
  wavesWake,
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
    expect(CITY.waves.map((w) => w.quota)).toEqual([13, 17, 21]);
    expect(SUBURBS.waves.map((w) => w.quota)).toEqual([11, 14, 17]);
    expect(FOREST.waves.map((w) => w.quota)).toEqual([13, 16]);
    expect(CITY.waves.map(waveTotal)).toEqual([5, 6, 10]);
  });

  it('Night 1 waves are 40% bigger, never alive past the night cap', () => {
    expect(CITY.waves.map((w) => w.cap)).toEqual([7, 9, 11]);
    expect(Math.max(...CITY.waves.map((w) => w.cap))).toBeLessThanOrEqual(NIGHT_DIFFICULTY[1].cap);
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
  const FOG = 45;
  const cos = Math.cos((75 * Math.PI) / 180);

  /** 2000 draws: on the bank, short of the gate, 12 m off, and never seen popping in. */
  function check(p: { x: number; z: number }, lookZ: number, seed: number): string[] {
    const bad: string[] = [];
    const r = rng(seed);
    const view = { lookX: 0, lookZ, fogFar: FOG };
    for (let i = 0; i < 2000; i++) {
      const s = spawnSpot(p, zone, view, r);
      const dist = Math.hypot(s.x - p.x, s.z - p.z);
      const inView = ((s.z - p.z) * lookZ) / dist > cos;
      if (dist < 12 - 1e-9) bad.push(`too close ${dist}`);
      if (s.x < zone.minX || s.x > zone.maxX) bad.push(`off the bank ${s.x}`);
      if (s.z < zone.gateZ + 2 || s.z > zone.startZ + 10) bad.push(`out of the zone ${s.z}`);
      if (inView && dist < FOG - 3 - 1e-9) bad.push(`pops in at ${dist}`);
    }
    return bad;
  }

  it('never pops in view inside the fog when you face downstream', () => {
    expect(check({ x: -2, z: -180 }, -1, 9)).toEqual([]);
  });
  it('and when you backtrack facing upstream', () => {
    expect(check({ x: -2, z: -180 }, 1, 10)).toEqual([]);
  });
  it('and against the gate, where ahead is impossible', () => {
    expect(check({ x: -5, z: -237 }, -1, 4)).toEqual([]);
  });
  it('and at the start of the zone facing upstream', () => {
    expect(check({ x: -5, z: -135 }, 1, 6)).toEqual([]);
  });
  it('mostly spawns behind or beside you, not ahead', () => {
    const r = rng(2);
    const view = { lookX: 0, lookZ: -1, fogFar: FOG };
    let ahead = 0;
    for (let i = 0; i < 1000; i++)
      if (spawnSpot({ x: -2, z: -180 }, zone, view, r).z < -180) ahead++;
    expect(ahead).toBeLessThan(300);
  });
});

describe('fallback and ambush placement', () => {
  const zone = { startZ: -134, gateZ: -239, minX: -17, maxX: 2.5 };
  const down = { lookX: 0, lookZ: -1, fogFar: 45 };

  it('the fallback is 12-20 m off, on the bank, random, and flips at the zone ends', () => {
    const r = rng(8);
    const zs = new Set<number>();
    for (const [pz, look] of [
      [-180, -1],
      [-237, -1],
      [-124, -1], // at the upstream end facing downstream: behind is outside, so flip is unseen only if out of cone
      [-135, 1],
    ] as const) {
      for (let i = 0; i < 300; i++) {
        const s = fallbackSpot({ x: 2.7, z: pz }, zone, { ...down, lookZ: look }, r);
        zs.add(s.z);
        expect(s.x).toBeLessThanOrEqual(zone.maxX);
        expect(s.x).toBeGreaterThanOrEqual(zone.minX);
        const dist = Math.hypot(s.x - 2.7, s.z - pz);
        expect(dist).toBeGreaterThanOrEqual(12 - 1e-9);
        expect(dist).toBeLessThanOrEqual(25);
        expect(inCone({ x: 2.7, z: pz }, s, { ...down, lookZ: look })).toBe(false);
      }
    }
    expect(zs.size).toBeGreaterThan(100);
  });

  it('street and behind ambushes never appear in view inside the fog', () => {
    const r = rng(12);
    const cone = Math.cos((75 * Math.PI) / 180);
    const bad: string[] = [];
    for (const look of [-1, 1])
      for (const kind of ['street', 'behind'] as const)
        for (let i = 0; i < 1000; i++) {
          const p = { x: -2, z: -180 };
          const s = ambushPlace({ z: -180, count: 1, kind }, p, zone, { ...down, lookZ: look }, r);
          const dist = Math.hypot(s.x - p.x, s.z - p.z);
          if (dist < 12 - 1e-9) bad.push(`close ${dist}`);
          if (((s.z - p.z) * look) / dist > cone && dist < 42) bad.push(`seen ${dist}`);
        }
    expect(bad).toEqual([]);
  });

  it('street ambushes still come from the land side', () => {
    const r = rng(13);
    let land = 0;
    for (let i = 0; i < 300; i++) {
      const s = ambushPlace(
        { z: -180, count: 1, kind: 'street' },
        { x: -2, z: -180 },
        zone,
        down,
        r,
      );
      if (s.x < -10) land++;
    }
    expect(land).toBeGreaterThan(150);
  });

  it('puts lying and cover zombies down at the start: not reserved, trigger only alerts', () => {
    const placed: WaveDef = {
      ...def,
      quota: 8,
      ambushes: [
        { z: -150, count: 2, kind: 'lying', x: -4, at: -170 },
        { z: -160, count: 1, kind: 'street' },
      ],
    };
    const w = newWaveState();
    const r = rng(2);
    expect(stepWaves(w, [placed], -136, 0, 0.1, N, r)?.kind).toBe('start');
    expect(w.toSpawn).toBe(6); // 8 minus the 2 placed
    let spawned = 0;
    for (let t = 0; t < 200; t += 0.1) {
      const e = stepWaves(w, [placed], -136, 2, 0.1, N, r); // the two lying ones are alive
      if (e?.kind === 'one') spawned++;
    }
    expect(spawned).toBe(5); // 6 minus the street ambush still reserved
    const e = stepWaves(w, [placed], -151, 2, 0.1, N, r);
    expect(e).toMatchObject({ kind: 'spawn' });
    expect(w.toSpawn).toBe(1); // the lying trigger took nothing
  });

  it('wakes a wave corpse when you pass it or come within 9 m, otherwise not', () => {
    const c = { x: -4, z: -200 };
    expect(wavesWake({ x: -4, z: -210 }, c)).toBe(true); // passed, 10 m downstream
    expect(wavesWake({ x: 2, z: -203.5 }, c)).toBe(true); // passed (6 m to the side)
    expect(wavesWake({ x: -4, z: -192 }, c)).toBe(true); // 8 m short: within 9 m
    expect(wavesWake({ x: -4, z: -190 }, c)).toBe(false); // 10 m short, not passed
    expect(wavesWake({ x: 2, z: -190 }, c)).toBe(false); // 6 m across, 10 short: 11.7 m, not passed

    expect(passedBy({ x: -4, z: -203.5 }, c)).toBe(true);
  });

  it('every corpse of a wave is awake by the time you are past all of their spots', () => {
    const r = rng(21);
    for (const area of [CITY, SUBURBS, FOREST])
      for (const w of area.waves) {
        const spots = w.ambushes
          .filter((a) => isPlaced(a))
          .flatMap((a) =>
            Array.from({ length: a.count }, () =>
              ambushSpot(a, { x: -4, z: a.z }, w.gateZ, -17, 2.5, r),
            ),
          );
        const past = Math.min(...spots.map((s) => s.z)) - 3.01;
        const asleep = spots.filter((s) => !wavesWake({ x: 2.5, z: past }, s));
        expect(asleep).toEqual([]); // the gate (spots end 2 m short of it) is always beyond reach
        expect(past).toBeGreaterThan(w.gateZ - 3 - 3.01);
      }
  });

  it('places lying zombies only out of view or far off', () => {
    const p = { x: -2, z: -180 };
    expect(placeOk(p, { x: -2, z: -200 }, down)).toBe(false); // ahead, 20 m
    expect(placeOk(p, { x: -2, z: -220 }, down)).toBe(true); // ahead, 40 m
    expect(placeOk(p, { x: -2, z: -160 }, down)).toBe(true); // behind
  });
});

describe('edge supplies and the objective', () => {
  it('puts three small supplies in every zone', () => {
    const list = edgePickups(CITY);
    expect(list).toHaveLength(CITY.waves.length * 3);
    expect(list.map((p) => p.kind).slice(0, 3)).toEqual(['ammo', 'arrows', 'ammo']);
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
    expect(list.slice(0, 3).map((p) => p.z)).toEqual([
      first().z - 25,
      first().z - 55,
      first().z - 85,
    ]);
  });

  it('spreads them across the strip, clear of shacks, houses and solid props', () => {
    for (const area of [CITY, SUBURBS, FOREST]) {
      const list = edgePickups(area);
      expect(new Set(list.map((p) => p.x)).size).toBeGreaterThanOrEqual(3);
      expect(list.some((p) => p.x > EDGE_X - 1)).toBe(true);
      const solids = area.props.filter((q) => q.collide);
      const bounds = area.shacks.map(shackBounds);
      const bad = list.filter(
        (p) =>
          p.x <= area.landX + 1 ||
          p.x >= EDGE_X ||
          nearBox(bounds, p.x, p.z, 1) ||
          solids.some((q) => Math.hypot(p.x - q.x, p.z - q.z) <= 2.5),
      );
      expect(bad.map((p) => p.id)).toEqual([]);
    }
  });

  it('always says what to do', () => {
    const o = { night: true, fighting: false, wave: 0, waves: 3, ending: false, lake: false };
    expect(objective(o)).toMatch(/Follow the river/);
    expect(objective({ ...o, fighting: true, wave: 2 })).not.toMatch(/left/);
    expect(objective({ ...o, fighting: true })).toMatch(/Kill them all/);
    expect(objective({ ...o, fighting: true })).not.toMatch(/houses/);
    expect(objective({ ...o, fighting: true, houses: true })).toBe(
      'Kill them all. Search the houses for ammo. The barricade falls when the wave is dead.',
    );
    expect(objective({ ...o, night: false })).toMatch(/Search the sheds.*Feed Dras/);
    expect(objective({ ...o, lake: true, wave: 3 })).toMatch(/Mom is waiting/);
    expect(objective({ ...o, ending: true })).toBe('');
    expect(objective({ ...o, fighting: true, waiting: true })).toBe(
      'They are waiting further on. Keep moving downstream.',
    );
  });

  it('never shows a count: no digits in any goal line', () => {
    for (const night of [true, false])
      for (const fighting of [true, false])
        for (const waiting of [true, false])
          for (const lake of [true, false])
            for (const wave of [0, 2, 3])
              for (const ending of [true, false])
                expect(
                  objective({ night, fighting, waiting, lake, wave, waves: 3, ending }),
                ).not.toMatch(/\d/);
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

  it('puts a wave crate inside its house when it names one, else on the road', () => {
    const crates = waveCrates(CITY);
    const houses = ['h1', 'h3', 'h5'].map((id) => CITY.shacks.find((h) => h.id === id));
    crates.forEach((c, i) => {
      const h = houses[i];
      if (!h) throw new Error('house');
      const b = shackBounds(h);
      expect(c.x).toBeGreaterThan(b.minX + 1);
      expect(c.x).toBeLessThan(b.maxX - 1);
      expect(c.z).toBeGreaterThan(b.minZ + 1);
      expect(c.z).toBeLessThan(b.maxZ - 1);
    });
    expect(waveCrates(SUBURBS).map((c) => c.x)).toEqual([-1, -1, -1]);
  });

  it('after a death you start just past the last barricade down', () => {
    expect(spawnFor('night1', CITY, 1).z).toBe(first().gateZ - 3);
    expect(spawnFor('night1', CITY, 0)).toBe(CITY.nightStart);
    expect(spawnFor('day1', CITY, 2)).toBe(CITY.daySpawn);
  });
});
