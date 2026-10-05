/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-type-assertion -- partial fakes of big interfaces */
import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';

const CLIPS = ['Swim', 'Lunge', 'Beached', 'TailLift', 'Exhale'].map(
  (name) => new THREE.AnimationClip(name, 1, []),
);
vi.mock('../../engine/models', () => ({
  loadSkinned: () => Promise.resolve({ scene: new THREE.Group(), clips: CLIPS }),
  loadModel: () => Promise.resolve(new THREE.Group()),
}));
vi.mock('./fish-parts', async (orig) => ({
  ...(await orig<typeof import('./fish-parts')>()),
  makeWake: () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()),
}));
vi.mock('./orca-sick', async (orig) => ({
  ...(await orig<typeof import('./orca-sick')>()),
  makeMist: () => new THREE.Sprite(),
  makeSick: () => ({ k: 0, set: vi.fn(), dispose: vi.fn() }),
}));

import { createFish, type Fish } from './fish';
import { styleFor } from './fish-parts';
import { EDGE_X } from './river';
import type { Horde } from './zombies/horde';

const voice = (): object => ({
  isPlaying: false,
  play: vi.fn(),
  stop: vi.fn(),
  setVolume: vi.fn(),
});
const audio = { positional: voice } as never;
const sounds = { blows: [], splashes: [], splashesBig: [], callsShort: [] } as never;

/** A horde of zombies on the bank that the orca can seize. */
function stubHorde(zombies: { id: number; x: number; z: number }[]): Horde {
  return {
    forEachAlive: (fn: (id: number, x: number, z: number) => void) => {
      for (const z of zombies) fn(z.id, z.x, z.z);
    },
    locate: (id: number, out: { x: number; z: number }) => {
      const z = zombies.find((q) => q.id === id);
      if (z) Object.assign(out, z);
      return !!z;
    },
    seize: () => true,
    hold: vi.fn(),
    drown: vi.fn(),
    throwByFish: vi.fn(),
    onSplash: null,
  } as never;
}

async function setup(): Promise<{ fish: Fish; me: { x: number; z: number } }> {
  const fish = await createFish(new THREE.Scene(), audio, sounds);
  const me = { x: EDGE_X - 3, z: 0 };
  fish.setGuards([me]);
  return { fish, me };
}

/** Steps up to `seconds`; true once she has struck. */
function struck(fish: Fish, me: { x: number; z: number }, horde: Horde, seconds: number): boolean {
  for (let t = 0; t < seconds; t += 0.1) {
    fish.update(0.1, me, horde, true);
    if (fish.lastStrike) return true;
  }
  return false;
}

describe('the orca in a wave', () => {
  const near = { id: 1, x: EDGE_X - 1, z: 2 };
  const beside = { id: 2, x: EDGE_X - 1, z: 2.5 };

  it('opens a wave with a wait, never an instant strike', async () => {
    const { fish, me } = await setup();
    fish.arm(3, styleFor(0, 'normal'));
    fish.update(0.1, me, stubHorde([near]), true);
    expect(fish.lastStrike).toBeNull();
  });

  it('a strike spends the budget, and a sweep spends it too', async () => {
    const { fish, me } = await setup();
    fish.arm(5, { ...styleFor(0, 'normal'), sweep: 2 });
    const thrown = vi.fn();
    const horde = { ...stubHorde([near, beside]), throwByFish: thrown } as unknown as Horde;
    expect(struck(fish, me, horde, 12)).toBe(true);
    for (let t = 0; t < 10 && !thrown.mock.calls.length; t += 0.1)
      fish.update(0.1, me, horde, true);
    expect(thrown).toHaveBeenCalled();
    fish.update(0.1, me, horde, true);
    expect(fish.strikes).toBe(3); // the bite and the swept one
  });

  it('strikes while dry with no budget left', async () => {
    const { fish, me } = await setup();
    fish.arm(0, styleFor(0, 'normal'));
    fish.dry = true;
    expect(struck(fish, me, stubHorde([near]), 30)).toBe(true);
    expect(fish.strikes).toBe(0);
  });

  it('never strikes after arm(0) (wave cleared) while armed', async () => {
    const { fish, me } = await setup();
    fish.arm(0, styleFor(0, 'normal'));
    expect(struck(fish, me, stubHorde([near]), 30)).toBe(false);
  });

  it('the last stand style (no dry wait) clears a stale dry flag', async () => {
    const { fish } = await setup();
    fish.dry = true;
    fish.arm(3, { cooldown: 0.5, reach: 7, pace: 0.7, sweep: 2, guard: 9 });
    expect(fish.dry).toBe(false);
  });
});
