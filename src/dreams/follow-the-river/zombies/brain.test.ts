import { describe, expect, it } from 'vitest';
import {
  ATTACK,
  DAY_TUNING,
  flinch,
  FLINCH_SECONDS,
  hitKills,
  HUNT_SECONDS,
  isAlive,
  kill,
  newMind,
  NIGHT_TUNING,
  REARM_SECONDS,
  RISE_SECONDS,
  seize,
  TENT_WAKE,
  think,
  throwByFish,
  THROWN_SECONDS,
  WAKE,
  type Mind,
  type Senses,
  type Thought,
} from './brain';

const out: Thought = { intent: 'stand', hit: false };
const far: Senses = { distance: 50, lit: false, heard: false };
const near: Senses = { distance: 5, lit: false, heard: false };
const touching: Senses = { distance: 1, lit: false, heard: false };

function run(
  mind = newMind(),
  senses: Senses,
  seconds: number,
  tuning = DAY_TUNING,
): { mind: typeof mind; hits: number; last: Thought } {
  let hits = 0;
  for (let t = 0; t < seconds; t += 0.05) if (think(mind, senses, tuning, 0.05, out).hit) hits++;
  return { mind, hits, last: { ...out } };
}

const stunnedCount = (mind: Mind, seq: [Senses, number][]): number => {
  let n = 0;
  let was = mind.state === 'stunned';
  for (const [senses, seconds] of seq) {
    for (let t = 0; t < seconds; t += 0.05) {
      think(mind, senses, NIGHT_TUNING, 0.05, out);
      const now = mind.state === 'stunned';
      if (now && !was) n++;
      was = now;
    }
  }
  return n;
};

describe('zombie brain', () => {
  it('stands still until the player comes close', () => {
    expect(run(undefined, far, 2).last.intent).toBe('stand');
    expect(run(undefined, near, 0.1).mind.state).toBe('chase');
  });

  it('walks by day and runs by night', () => {
    expect(run(undefined, near, 0.2, DAY_TUNING).last.intent).toBe('walk');
    expect(run(undefined, near, 0.2, NIGHT_TUNING).last.intent).toBe('run');
  });

  it('hears noise from any distance and hunts for a while after a one-frame pulse', () => {
    const mind = newMind();
    think(mind, { ...far, heard: true }, DAY_TUNING, 0.05, out);
    expect(mind.state).toBe('chase');
    run(mind, far, HUNT_SECONDS - 0.5);
    expect(mind.state).toBe('chase');
    run(mind, far, 1);
    expect(mind.state).toBe('idle');
  });

  it('winds up before landing a blow, then recovers', () => {
    const { mind } = run(undefined, touching, 0.1);
    expect(mind.state).toBe('attack');
    const { hits } = run(mind, touching, ATTACK.windup + 0.1);
    expect(hits).toBe(1);
  });

  it('misses when the player steps away during the windup', () => {
    const { mind } = run(undefined, touching, 0.1);
    expect(run(mind, near, ATTACK.windup + 0.1).hits).toBe(0);
  });

  it('lands about one blow per windup + recover while the player stands still', () => {
    const seconds = 10;
    const expected = seconds / (ATTACK.windup + ATTACK.recover);
    expect(run(undefined, touching, seconds).hits).toBeGreaterThanOrEqual(Math.floor(expected) - 1);
    expect(run(undefined, touching, seconds).hits).toBeLessThanOrEqual(Math.ceil(expected) + 1);
  });

  it('is stunned by a steady flashlight beam, then resumes the chase', () => {
    const { mind } = run(undefined, near, 0.1);
    run(mind, { ...near, lit: true }, DAY_TUNING.stun.exposure + 0.05);
    expect(mind.state).toBe('stunned');
    expect(run(mind, touching, 0.5).hits).toBe(0);
    run(mind, near, DAY_TUNING.stun.seconds);
    expect(mind.state).toBe('chase');
  });

  it('forgets flicks of light that are too short to stun', () => {
    const mind = newMind();
    for (let i = 0; i < 10; i++) {
      run(mind, { ...near, lit: true }, DAY_TUNING.stun.exposure / 2);
      run(mind, near, DAY_TUNING.stun.exposure);
    }
    expect(mind.state).not.toBe('stunned');
  });

  it('gives up when the player gets far away', () => {
    const { mind } = run(undefined, near, 0.2);
    run(mind, { ...far, distance: DAY_TUNING.giveUp + 1 }, 0.2);
    expect(mind.state).toBe('idle');
  });

  it('dies from a kill and is dead after the fall', () => {
    const mind = newMind();
    kill(mind);
    expect([isAlive(mind), run(mind, touching, 0.1).last.intent]).toEqual([false, 'fall']);
    expect(run(mind, touching, 5).mind.state).toBe('dead');
  });

  it('is thrown by the fish, cannot be killed twice, and is gone once it has sunk', () => {
    const mind = newMind();
    throwByFish(mind);
    kill(mind);
    expect([mind.state, isAlive(mind)]).toEqual(['thrown', false]);
    expect(run(mind, touching, 0.1).last.intent).toBe('thrown');
    expect(run(mind, touching, THROWN_SECONDS + 0.1).mind.state).toBe('dead');
  });

  it("struggles in the orca's jaws, never hits, and can't be seized twice or shot", () => {
    const mind = newMind();
    expect(seize(mind)).toBe(true);
    expect(seize(mind)).toBe(false);
    kill(mind);
    expect([mind.state, isAlive(mind)]).toEqual(['held', false]);
    const held = run(mind, touching, 10);
    expect([held.last.intent, held.hits, mind.state]).toEqual(['struggle', 0, 'held']);
  });

  it('is not seized once dead (shot while the orca came in)', () => {
    const mind = newMind();
    kill(mind);
    expect(seize(mind)).toBe(false);
  });

  it('lies still until the player comes close, then gets up before chasing', () => {
    const mind = newMind(true);
    expect(run(mind, { ...near, distance: WAKE + 1 }, 1).last.intent).toBe('lie');
    run(mind, { ...near, distance: WAKE - 1 }, 0.05);
    expect(mind.state).toBe('rising');
    expect(run(mind, touching, RISE_SECONDS - 0.2).hits).toBe(0);
    run(mind, touching, 0.3);
    expect(['chase', 'attack']).toContain(mind.state);
  });

  it('can be shot while lying down', () => {
    const mind = newMind(true);
    kill(mind);
    expect(mind.state).toBe('dying');
  });

  it('never hits while dying, taken or dead', () => {
    const mind = newMind();
    kill(mind);
    expect(run(mind, touching, 10).hits).toBe(0);
  });
});

describe('wounds and stuns', () => {
  it('a head hit always kills; body hits count up to bodyHits', () => {
    expect(hitKills(0, true, 2)).toBe(true);
    expect(hitKills(0, false, 2)).toBe(false);
    expect(hitKills(1, false, 2)).toBe(true);
    expect(hitKills(0, false, 1)).toBe(true);
    // Hard: 3 body hits, a head hit still one.
    expect(hitKills(0, true, 3)).toBe(true);
    expect(hitKills(1, false, 3)).toBe(false);
    expect(hitKills(2, false, 3)).toBe(true);
  });
  it("the stun lasts the tuning's seconds", () => {
    const m = newMind();
    m.state = 'chase';
    const t = { ...NIGHT_TUNING, stun: { exposure: 0.6, seconds: 0.9 }, damage: 34, bodyHits: 2 };
    const o: Thought = { intent: 'stand', hit: false };
    const stunned = (): boolean => m.state === 'stunned';
    for (let i = 0; i < 60 && !stunned(); i++) {
      think(m, { distance: 10, lit: true, heard: false }, t, 1 / 60, o);
    }
    expect(m.state).toBe('stunned');
    expect(m.timer).toBeCloseTo(0.9, 1);
  });
  it('a hit that does not kill wakes a lying zombie through rising', () => {
    const m = newMind(true);
    flinch(m);
    expect([m.state, m.timer]).toEqual(['rising', RISE_SECONDS]);
  });
  it('a flinch never shortens a stun or a rise, and never lengthens a recover', () => {
    const stunned = newMind();
    stunned.state = 'stunned';
    stunned.timer = 0.8;
    flinch(stunned);
    expect([stunned.state, stunned.timer]).toEqual(['stunned', 0.8]);
    const recovering = newMind();
    recovering.state = 'recover';
    recovering.timer = 0.9;
    flinch(recovering);
    expect(recovering.timer).toBe(0.9);
    const standing = newMind();
    standing.state = 'chase';
    flinch(standing);
    expect([standing.state, standing.timer]).toEqual(['recover', FLINCH_SECONDS]);
  });
  it('light built up in the chase stuns during the attack windup', () => {
    const m = newMind();
    m.state = 'chase';
    const t = { ...DAY_TUNING, stun: { exposure: 0.6, seconds: 0.9 } };
    const o: Thought = { intent: 'stand', hit: false };
    const attacking = (): boolean => m.state === 'attack';
    for (let i = 0; i < 20; i++) think(m, { distance: 5, lit: true, heard: false }, t, 0.02, o);
    expect(m.state).toBe('chase'); // 0.4 s of light so far
    think(m, { distance: 1, lit: true, heard: false }, t, 0.02, o);
    expect(attacking()).toBe(true);
    for (let i = 0; i < 12 && attacking(); i++) {
      think(m, { distance: 1, lit: true, heard: false }, t, 0.02, o);
    }
    expect(m.state).toBe('stunned');
  });

  describe('torchlight', () => {
    const lit: Senses = { distance: 20, lit: true, heard: false };
    const dark: Senses = { distance: 20, lit: false, heard: false };
    it('stuns once under steady light, then walks slowly', () => {
      const mind = newMind();
      expect(stunnedCount(mind, [[lit, 5]])).toBe(1);
      expect(out.intent).toBe('walk');
      expect(out.slow).toBe(true);
    });
    it('does not re-stun after a short break, does after a long one', () => {
      const short = newMind();
      expect(
        stunnedCount(short, [
          [lit, 2],
          [dark, REARM_SECONDS - 0.3],
          [lit, 3],
        ]),
      ).toBe(1);
      const long = newMind();
      expect(
        stunnedCount(long, [
          [lit, 2],
          [dark, REARM_SECONDS + 0.3],
          [lit, 3],
        ]),
      ).toBe(2);
    });
    it('chases an unlit zombie at full speed', () => {
      const mind = newMind();
      stunnedCount(mind, [
        [lit, 2],
        [dark, 0.5],
      ]);
      expect(out.intent).toBe('run');
      expect(out.slow).toBe(false);
    });
  });

  describe('tent sleepers', () => {
    it('ignore noise and stay lying at 3 m, wake at the tent mouth', () => {
      const mind = newMind(true, true);
      think(mind, { distance: 3.5, lit: false, heard: true }, DAY_TUNING, 0.05, out);
      expect(mind.state).toBe('lying');
      think(mind, { distance: TENT_WAKE - 0.3, lit: false, heard: false }, DAY_TUNING, 0.05, out);
      expect(mind.state).toBe('rising');
    });
    it('an ordinary lurker still wakes at WAKE or on noise', () => {
      const a = newMind(true);
      think(a, { distance: WAKE - 0.5, lit: false, heard: false }, DAY_TUNING, 0.05, out);
      expect(a.state).toBe('rising');
      const b = newMind(true);
      think(b, { distance: 30, lit: false, heard: true }, DAY_TUNING, 0.05, out);
      expect(b.state).toBe('rising');
    });
    it('a hit still wakes a tent sleeper', () => {
      const mind = newMind(true, true);
      flinch(mind);
      expect(mind.state).toBe('rising');
    });
  });
});
