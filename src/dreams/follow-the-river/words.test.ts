import { describe, expect, it } from 'vitest';
import { DREAMS } from '../registry';
import { BEATS, CLOSING_PAGES, OPENING_PAGES } from './canoe-ride';
import { ENDING_PAGES } from './ending';
import { FAREWELL_PAGES } from './ending-farewell';
import { waitQuestion } from './flow';
import { HINTS } from './hints';
import { INTRO_PAGES } from './intro';
import { PROMPT as PICKUP_PROMPT } from './pickups';
import { TAPES } from './tapes';

// Prompts live in controls.ts (literals, copied here) and pickups.ts (PROMPT).
const PROMPTS = [
  'E: feed Dras',
  'E: throw a fish pack',
  'E: wait for dark',
  ...Object.values(PICKUP_PROMPT).flatMap((p) => [p.take, p.full]),
];

const all = (): string[] => [
  ...Object.values(TAPES).flat(),
  ...Object.values(INTRO_PAGES).flat(),
  ...Object.values(HINTS).flat(),
  ...Object.values(ENDING_PAGES).flat(),
  ...Object.values(FAREWELL_PAGES).flat(),
  ...OPENING_PAGES,
  ...BEATS.flatMap((b) => b.pages),
  ...CLOSING_PAGES,
  waitQuestion(1, true),
  waitQuestion(2, false),
  ...PROMPTS,
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
