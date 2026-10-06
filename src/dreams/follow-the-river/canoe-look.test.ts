import { describe, expect, it } from 'vitest';
import { aimAngles, flatAngle, LOOK, newWatch, sideOf, turnToward, watchStep } from './canoe-look';
import { newScript, nextCue, STOP_AT, STOP_PAUSE } from './canoe-timing';

const DT = 0.1;

describe('which way to look', () => {
  it('names the side the calf is on, from where you face', () => {
    // Facing down the river (-z): +x is your right.
    expect(sideOf(0, -1, 1, 0)).toBe('right');
    expect(sideOf(0, -1, -1, 0)).toBe('left');
    // Facing Mom at the stern (+z): the same calf at -x is now on your right.
    expect(sideOf(0, 1, -1, 0)).toBe('right');
    expect(LOOK.lines.right).toMatch(/right/);
    expect(LOOK.lines.left).toMatch(/left/);
  });

  it('counts a look by direction only: the calf rig sits 2.35 m under your eye, below the cone', () => {
    // Seen in Chrome: facing it exactly, the 3D angle to the rig was about 26 degrees (> 25).
    expect(flatAngle(-0.98, 0.2, -4.78, 0.99)).toBeLessThan(LOOK.angle);
    expect(flatAngle(0, -1, 0, -5)).toBeCloseTo(0);
    expect(flatAngle(0, -1, 5, 0)).toBeCloseTo(Math.PI / 2);
    expect(flatAngle(0, -1, 0, 5)).toBeCloseTo(Math.PI);
  });
});

describe('watchStep', () => {
  it('is done after the calf has been near the view centre for the dwell time', () => {
    const w = newWatch();
    expect(watchStep(w, 0.1, LOOK.dwell - 0.05)).toBe('wait');
    expect(watchStep(w, 0.1, 0.1)).toBe('done');
  });

  it('does not count a glance: leaving the cone restarts the dwell', () => {
    const w = newWatch();
    watchStep(w, 0, 0.3);
    expect(watchStep(w, LOOK.angle + 0.1, 0.3)).toBe('wait');
    expect(w.seen).toBe(0);
    expect(watchStep(w, 0, 0.3)).toBe('wait');
  });

  it('does not accept a calf outside the angle however long it takes (until the give-up)', () => {
    const w = newWatch();
    for (let t = 0; t < LOOK.giveUp - 1; t += DT)
      expect(watchStep(w, Math.PI / 2, DT)).toBe('wait');
  });

  it('turns the camera for a player who never looks, then goes on anyway', () => {
    const w = newWatch();
    let first: string | null = null;
    let done = 0;
    for (let t = 0; t < LOOK.giveUp + LOOK.force + 1; t += DT) {
      const v = watchStep(w, Math.PI / 2, DT);
      if (v === 'assist') first ??= v;
      if (v === 'done' && !done) done = t;
    }
    expect(first).toBe('assist');
    expect(done).toBeGreaterThanOrEqual(LOOK.giveUp + LOOK.force - 0.2);
  });
});

describe('camera help', () => {
  it('aims yaw and pitch at a point (three faces -z at yaw 0)', () => {
    expect(aimAngles(0, 0, -1).yaw).toBeCloseTo(0);
    expect(aimAngles(-1, 0, 0).yaw).toBeCloseTo(Math.PI / 2); // left of the view is +yaw
    expect(aimAngles(1, 0, 0).yaw).toBeCloseTo(-Math.PI / 2);
    expect(aimAngles(0, 1, -1).pitch).toBeCloseTo(Math.PI / 4);
  });

  it('turns the short way round', () => {
    expect(turnToward(3, -3, 1)).toBeCloseTo(-3 + 2 * Math.PI);
    expect(turnToward(0, 1, 0.5)).toBeCloseTo(0.5);
  });
});

describe('the closing beat waits for the look', () => {
  it('does not open "She has seen it too" until the player has looked', () => {
    const s = newScript();
    s.beat = 99; // the talks are over
    expect(nextCue(s, STOP_AT, false)?.kind).toBe('stop');
    expect(nextCue(s, STOP_AT + STOP_PAUSE + 30, false)).toBeNull();
    s.looked = true;
    expect(nextCue(s, STOP_AT + STOP_PAUSE + 30, false)?.kind).toBe('closing');
  });
});
