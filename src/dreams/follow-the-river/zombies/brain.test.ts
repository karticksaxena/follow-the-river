import { describe, expect, it } from 'vitest';
import {
  ATTACK,
  DAY_TUNING,
  hitKills,
  HUNT_SECONDS,
  isAlive,
  kill,
  newMind,
  NIGHT_TUNING,
  RISE_SECONDS,
  seize,
  takeByFish,
  think,
  WAKE,
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

  it('is dragged away by the fish and cannot be killed twice', () => {
    const mind = newMind();
    takeByFish(mind);
    kill(mind);
    expect(mind.state).toBe('taken');
    expect(run(mind, touching, 0.1).last.intent).toBe('dragged');
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
});
