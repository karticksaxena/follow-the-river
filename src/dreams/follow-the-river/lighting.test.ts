import { describe, expect, it } from 'vitest';
import { LIGHTING, skyDirection } from './lighting';

const brightness = (hex: number): number => ((hex >> 16) + ((hex >> 8) & 255) + (hex & 255)) / 765;

describe('LIGHTING', () => {
  it('is never bright: sky and fog stay dark in every preset', () => {
    for (const preset of Object.values(LIGHTING)) {
      expect(brightness(preset.skyHorizon)).toBeLessThan(0.4);
      expect(brightness(preset.fog.color)).toBeLessThan(0.4);
      expect(preset.key.intensity).toBeLessThanOrEqual(0.6);
    }
  });

  it('makes night darker than day', () => {
    expect(LIGHTING.night.hemi.intensity).toBeLessThan(LIGHTING.day.hemi.intensity);
    expect(LIGHTING.night.fog.far).toBeLessThan(LIGHTING.day.fog.far);
  });

  it('puts the sun and moon above the horizon', () => {
    for (const preset of Object.values(LIGHTING)) {
      expect(skyDirection(preset.key.elevation, preset.key.azimuth).y).toBeGreaterThan(0);
    }
  });
});

describe('skyDirection', () => {
  it('is a unit vector', () => {
    const d = skyDirection(0.4, 1.2);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
  });
});
