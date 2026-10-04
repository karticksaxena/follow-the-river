import { describe, expect, it } from 'vitest';
import { bodyHit, CLIP_FOR, OUTFITS, pickOutfit, RIM, rimStrength, timeScaleFor } from './look';

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

  it('says whether a ray struck the head or the body', () => {
    const dir = { x: 0, y: 0, z: -1 };
    expect(bodyHit({ x: 0, y: 1.6, z: 5 }, dir, 0, 0, 0, false)?.head).toBe(true);
    expect(bodyHit({ x: 0, y: 1.0, z: 5 }, dir, 0, 0, 0, false)?.head).toBe(false);
    expect(bodyHit({ x: 0, y: 0.25, z: 5 }, dir, 0, 0, 0, true)?.head).toBe(false);
    expect(bodyHit({ x: 3, y: 1.6, z: 5 }, dir, 0, 0, 0, false)).toBeNull();
  });
});

describe('moon rim', () => {
  it('follows the moon: full at night, none by day, never above the cap', () => {
    expect(rimStrength(1)).toBe(RIM.strength);
    expect(rimStrength(0)).toBe(0);
    expect(rimStrength(0.5)).toBeCloseTo(RIM.strength / 2);
    expect(rimStrength(3)).toBe(RIM.strength);
    expect(RIM.strength).toBeLessThan(0.5); // faint: it must not brighten the scene
  });
});
