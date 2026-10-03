import { describe, expect, it } from 'vitest';
import { INTRO_PAGES, nextIntroStep, type IntroStep } from './intro';

describe('intro', () => {
  it('runs news → Mom leaves → Mom back → outside → throw → goodbye → done', () => {
    const steps: IntroStep[] = ['news'];
    while (steps[steps.length - 1] !== 'done') steps.push(nextIntroStep(steps[steps.length - 1]));
    expect(steps).toEqual([
      'news',
      'mom-leaves',
      'mom-back',
      'outside',
      'throw',
      'goodbye',
      'done',
    ]);
  });

  it('has pages for every step, and Mom says the line', () => {
    for (const pages of Object.values(INTRO_PAGES)) expect(pages.length).toBeGreaterThan(0);
    expect(INTRO_PAGES.goodbye.join(' ')).toMatch(/Always follow the river/);
    expect(INTRO_PAGES.goodbye.join(' ')).toMatch(/What have we done/);
  });
});
