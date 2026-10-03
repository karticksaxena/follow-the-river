import { describe, expect, it } from 'vitest';
import {
  addSupply,
  chapterOf,
  completePhase,
  freshRun,
  isNight,
  isRunSave,
  nextPhase,
  normalizeSave,
  restartPhase,
  spend,
  START_SUPPLIES,
  SUPPLY_LIMITS,
} from './state';

describe('phases', () => {
  it('runs intro → day1 → night1 → … → end and stays at end', () => {
    expect(nextPhase('intro')).toBe('day1');
    expect(nextPhase('day1')).toBe('night1');
    expect(nextPhase('night3')).toBe('end');
    expect(nextPhase('end')).toBe('end');
  });

  it('knows nights and chapters', () => {
    expect([isNight('night2'), isNight('day2')]).toEqual([true, false]);
    expect([chapterOf('intro'), chapterOf('day1'), chapterOf('night3'), chapterOf('end')]).toEqual([
      0, 1, 3, 0,
    ]);
  });
});

describe('supplies', () => {
  it('adds up to the limit', () => {
    const full = addSupply(START_SUPPLIES, 'battery', 1000);
    expect(full.battery).toBe(SUPPLY_LIMITS.battery);
  });

  it('never goes negative and does not mutate', () => {
    const before = { ...START_SUPPLIES };
    expect(addSupply(START_SUPPLIES, 'arrows', -999).arrows).toBe(0);
    expect(START_SUPPLIES).toEqual(before);
  });

  it('refuses to spend what you do not have', () => {
    const none = { ...START_SUPPLIES, fishPacks: 0 };
    expect(spend(none, 'fishPacks', 1)).toBeNull();
    expect(spend(START_SUPPLIES, 'arrows', 1)?.arrows).toBe(START_SUPPLIES.arrows - 1);
  });
});

describe('saves', () => {
  it('accepts a fresh run', () => {
    expect(isRunSave(freshRun())).toBe(true);
  });

  it('accepts a Plan 2 save without hasGun and normalizes it to false', () => {
    const old = {
      version: 1,
      phase: 'night1',
      supplies: { battery: 80, arrows: 3, ammo: 0, fishPacks: 0 },
      fed: 1,
      taken: ['a'],
      tapes: [1],
      hints: ['bow'],
    };
    expect(isRunSave(old)).toBe(true);
    if (!isRunSave(old)) return;
    const fixed = normalizeSave(old);
    expect(fixed).toEqual({ ...old, hasGun: false });
    expect(fixed).not.toBe(old);
    expect(normalizeSave({ ...fixed, hasGun: true }).hasGun).toBe(true);
  });

  it('rejects a non-boolean hasGun', () => {
    expect(isRunSave({ ...freshRun(), hasGun: 'yes' })).toBe(false);
  });

  it.each([
    null,
    42,
    {},
    { ...freshRun(), version: 2 },
    { ...freshRun(), phase: 'day9' },
    { ...freshRun(), supplies: { battery: 'full' } },
    { ...freshRun(), supplies: { ...START_SUPPLIES, arrows: -1 } },
    { ...freshRun(), supplies: { ...START_SUPPLIES, arrows: Number.NaN } },
    { ...freshRun(), taken: 'all' },
    { ...freshRun(), tapes: [1, 'two'] },
    { ...freshRun(), fed: Infinity },
    { ...freshRun(), hasGun: 1 },
  ])('rejects a corrupt save %#', (value) => {
    expect(isRunSave(value)).toBe(false);
  });
});

describe('checkpoints', () => {
  it('restarts a phase with the supplies it began with, keeping hints seen since', () => {
    const save = { ...freshRun(), phase: 'night1' as const, fed: 2 };
    const live = restartPhase(save, ['flashlight']);
    live.supplies.arrows = 0;
    live.taken.push('battery-3');
    const again = restartPhase(save, live.hints);
    expect(again.supplies).toEqual(save.supplies);
    expect(again.taken).toEqual(save.taken);
    expect(again.fed).toBe(2);
    expect(again.hints).toContain('flashlight');
  });

  it('carries fish fed by day into that night, then clears it for the next day', () => {
    const day = { ...freshRun(), phase: 'day1' as const };
    const night = completePhase(day, { ...restartPhase(day), fed: 3 });
    expect([night.phase, night.fed]).toEqual(['night1', 3]);
    const nextDay = completePhase(night, restartPhase(night));
    expect([nextDay.phase, nextDay.fed]).toEqual(['day2', 0]);
  });

  it('keeps what was found when a phase is completed', () => {
    const day = { ...freshRun(), phase: 'day1' as const };
    const live = { ...restartPhase(day), taken: ['tape-1'], tapes: [1] };
    const night = completePhase(day, live);
    expect([night.taken, night.tapes]).toEqual([['tape-1'], [1]]);
  });

  it('carries the gun through restarts and completed phases', () => {
    const day = { ...freshRun(), phase: 'day2' as const, hasGun: true };
    expect(restartPhase(day).hasGun).toBe(true);
    expect(completePhase(day, restartPhase(day)).hasGun).toBe(true);
    const found = completePhase(freshRun(), { ...restartPhase(freshRun()), hasGun: true });
    expect(found.hasGun).toBe(true);
  });
});
