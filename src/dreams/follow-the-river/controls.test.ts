import { describe, expect, it, vi, type Mock } from 'vitest';
import { createControls, cutsceneChange, viewVisible, type Controls } from './controls';
import { EDGE_X } from './river';

describe('viewmodels', () => {
  it('shows only the weapon in hand, and nothing during a cutscene', () => {
    expect(viewVisible('bow', 'bow', ['pistol'], false)).toBe(true);
    expect(viewVisible('pistol', 'bow', ['pistol'], false)).toBe(false);
    expect(viewVisible('bow', 'bow', ['pistol'], true)).toBe(false);
    expect(viewVisible('pistol', 'pistol', [], false)).toBe(false);
  });
});

describe('cutsceneChange', () => {
  it('enters, leaves, and a phase reset in between never leaves', () => {
    expect(cutsceneChange(false, true)).toBe('enter');
    expect(cutsceneChange(true, false)).toBe('leave');
    expect(cutsceneChange(true, true)).toBeNull();
    // reset() sets the seen flag to false while beginPhase already cleared run.cutscene
    expect(cutsceneChange(false, false)).toBeNull();
  });
});

interface Rig {
  c: Controls;
  sys: { fish: { arm: Mock; feed: Mock } };
  presses: Set<string>;
  run: { interact: { use: Mock } | null };
}
type Args = Parameters<typeof createControls>;

const view = (): unknown => ({ view: { visible: false, position: { y: 0 } } });

function rig(over: { cutscene?: boolean; ending?: string; interactAt?: number } = {}): Rig {
  const presses = new Set<string>(['KeyE']);
  const sys = {
    ctx: {
      keys: { consumePress: (k: string) => presses.delete(k), isDown: () => false },
      stage: { camera: { position: { x: EDGE_X, z: 0 } } },
      audio: { once: vi.fn<() => void>() },
      difficulty: () => 'normal',
    },
    armory: { guns: { pistol: view(), shotgun: view(), rifle: view() } },
    bow: view(),
    area: { waitSpot: null },
    fish: { feed: vi.fn<() => void>(), arm: vi.fn<() => void>() },
    sounds: {},
  };
  const at = over.interactAt;
  const run = {
    cutscene: over.cutscene ?? false,
    ending: over.ending ?? 'no',
    phase: 'night1',
    pickups: [],
    taken: new Set(),
    live: { guns: [], supplies: { fishPacks: 3 }, fed: 0 },
    interact:
      at === undefined
        ? null
        : { at: { x: at, z: 0 }, radius: 2, use: vi.fn<() => void>(), prompt: 'E: kneel' },
  };
  const args = [sys, run, {}, {}];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- partial fakes
  const c = createControls(...(args as unknown as Args));
  return { c, sys, presses, run };
}

describe('scripted E', () => {
  it('drops a press made out of range instead of firing on arrival', () => {
    const r = rig({ cutscene: true, interactAt: EDGE_X + 50 });
    r.c.update(0.016);
    expect(r.presses.has('KeyE')).toBe(false);
    expect(r.run.interact?.use).not.toHaveBeenCalled();
  });

  it('uses the action on a press in range', () => {
    const r = rig({ cutscene: true, interactAt: EDGE_X });
    r.c.update(0.016);
    expect(r.run.interact?.use).toHaveBeenCalledTimes(1);
  });
});

describe('feeding Dras', () => {
  it('is offered at the water in a night', () => {
    const r = rig();
    r.presses.clear();
    r.c.update(0.016);
    expect(r.c.prompt()).toBe('E: feed Dras');
  });

  it('is not offered, and not thrown, during the last stand', () => {
    const r = rig({ ending: 'fight' });
    r.c.update(0.016); // E is pressed
    expect(r.c.prompt()).toBeNull();
    expect(r.sys.fish.arm).not.toHaveBeenCalled();
    expect(r.sys.fish.feed).not.toHaveBeenCalled();
  });
});
