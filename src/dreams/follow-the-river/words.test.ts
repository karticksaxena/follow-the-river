import { describe, expect, it } from 'vitest';
import { DREAMS } from '../registry';
import { CLOSING_PAGES } from './canoe-ride';
import { ENDING_PAGES, REPLAY_PAGES } from './ending';
import { FAREWELL_PAGES } from './ending-farewell';
import { HINTS } from './hints';
import { INTRO_PAGES } from './intro';
import { TAPES } from './tapes';

const all = (): string[] => [
  ...Object.values(TAPES).flat(),
  ...Object.values(INTRO_PAGES).flat(),
  ...Object.values(HINTS).flat(),
  ...Object.values(ENDING_PAGES).flat(),
  ...Object.values(FAREWELL_PAGES).flat(),
  ...REPLAY_PAGES,
  ...CLOSING_PAGES,
  ...DREAMS.flatMap((d) => [...d.intro, ...d.howToPlay]),
];

describe('on-screen words', () => {
  it('never call her "the orca" (only the lab line about the cell line may say orca)', () => {
    const bad = all().filter((t) => /orca/i.test(t) && !/orca cell line/i.test(t));
    expect(bad).toEqual([]);
  });
  it('call him Kartik, never "K"', () => {
    expect(all().filter((t) => /\bK\b(?!artik)/.test(t))).toEqual([]);
  });
  it('have no em dashes', () => {
    expect(all().filter((t) => t.includes('—'))).toEqual([]);
  });
  it('name Dras and Subject R-7 on the first tape', () => {
    const tape = TAPES[1]?.join(' ') ?? '';
    expect(tape).toMatch(/Subject R-7/);
    expect(tape).toMatch(/Dras/);
    expect(tape).toMatch(/fresh water|freshwater|river/);
  });
});
