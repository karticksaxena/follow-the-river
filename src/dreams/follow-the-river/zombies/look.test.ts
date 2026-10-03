import { describe, expect, it } from 'vitest';
import { CLIP_FOR, OUTFITS, pickOutfit, timeScaleFor } from './look';

describe('zombie looks', () => {
  it('uses every outfit before repeating one', () => {
    const total = OUTFITS.m.length + OUTFITS.f.length;
    const seen = new Set(Array.from({ length: total }, (_, i) => JSON.stringify(pickOutfit(i))));
    expect(seen.size).toBe(total);
  });

  it('only names real outfits', () => {
    for (let i = 0; i < 40; i++) {
      const { body, outfit } = pickOutfit(i);
      expect(OUTFITS[body]).toContain(outfit);
    }
  });

  it('maps every intent to a clip that exists in the zombie files', () => {
    const clips = ['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death', 'GetUp'];
    for (const clip of Object.values(CLIP_FOR)) expect(clips).toContain(clip);
  });

  it('speeds the walk clip up with the zombie so feet do not slide', () => {
    expect(timeScaleFor('Walk', 1.8)).toBeCloseTo(2 * timeScaleFor('Walk', 0.9));
    expect(timeScaleFor('Idle', 3)).toBe(1);
  });
});
