import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  applyDim,
  applyLighting,
  createWorldLights,
  LIGHTING,
  mixHex,
  mixPreset,
  mixPresetInto,
  skyDirection,
} from './lighting';

const brightness = (hex: number): number => ((hex >> 16) + ((hex >> 8) & 255) + (hex & 255)) / 765;

describe('LIGHTING', () => {
  it('is never bright: sky and fog stay dark in every preset', () => {
    // The sunrise is the one deliberate exception (the end of the farewell and the canoe ride).
    const { sunrise: _sunrise, ...dark } = LIGHTING;
    for (const preset of Object.values(dark)) {
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

describe('applyDim', () => {
  it('scales hemi and key by 0.3 at full dim and leaves disc and fog alone', () => {
    const lights = createWorldLights(new THREE.Scene());
    const preset = LIGHTING.night;
    applyLighting(lights, preset);
    expect(lights.scene.fog).toBeInstanceOf(THREE.Fog);
    const fogFar = lights.scene.fog instanceof THREE.Fog ? lights.scene.fog.far : -1;
    const discScale = lights.disc.scale.x;
    applyDim(lights, preset, 1);
    expect(lights.hemi.intensity).toBeCloseTo(preset.hemi.intensity * 0.3);
    expect(lights.key.intensity).toBeCloseTo(preset.key.intensity * 0.3);
    expect(lights.scene.fog instanceof THREE.Fog && lights.scene.fog.far).toBe(fogFar);
    expect(lights.disc.scale.x).toBe(discScale);
    applyDim(lights, preset, 0);
    expect(lights.hemi.intensity).toBeCloseTo(preset.hemi.intensity);
  });
});

describe('skyDirection', () => {
  it('is a unit vector', () => {
    const d = skyDirection(0.4, 1.2);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
  });
});

describe('dawn', () => {
  it('is brighter than night but still dim and grey', () => {
    expect(LIGHTING.dawn.hemi.intensity).toBeGreaterThan(LIGHTING.night.hemi.intensity);
    expect(LIGHTING.dawn.hemi.intensity).toBeLessThanOrEqual(LIGHTING.day.hemi.intensity);
  });
});

describe('mixPreset', () => {
  it('mixes colours per channel and numbers linearly', () => {
    expect(mixHex(0x000000, 0xff8040, 0.5)).toBe(0x804020);
    const { night, dawn } = LIGHTING;
    expect(mixPreset(night, dawn, 0)).toEqual(night);
    expect(mixPreset(night, dawn, 1)).toEqual(dawn);
    const half = mixPreset(night, dawn, 0.5);
    expect(half.hemi.intensity).toBeCloseTo((night.hemi.intensity + dawn.hemi.intensity) / 2);
    expect(half.fog.far).toBeCloseTo((night.fog.far + dawn.fog.far) / 2);
  });
});

describe('mixPresetInto', () => {
  it('mixes in place, the same as mixPreset', () => {
    const out = structuredClone(LIGHTING.night);
    for (const t of [0, 0.3, 1]) {
      expect(mixPresetInto(LIGHTING.night, LIGHTING.predawn, t, out)).toEqual(
        mixPreset(LIGHTING.night, LIGHTING.predawn, t),
      );
    }
  });

  it('reuses its output (no allocation per frame), sky block included', () => {
    const out = structuredClone(LIGHTING.predawn);
    mixPresetInto(LIGHTING.predawn, LIGHTING.sunrise, 0.2, out);
    const [fog, key, sky] = [out.fog, out.key, out.sky];
    expect(sky).toBeDefined();
    mixPresetInto(LIGHTING.predawn, LIGHTING.sunrise, 0.7, out);
    expect([out.fog, out.key, out.sky]).toEqual([fog, key, sky]);
    expect(out.fog).toBe(fog);
    expect(out.sky).toBe(sky);
    expect(out.sky).not.toBe(LIGHTING.sunrise.sky);
  });

  it('turns the sun the short way round', () => {
    const a = { ...LIGHTING.night, key: { ...LIGHTING.night.key, azimuth: 3.0 } };
    const b = { ...LIGHTING.night, key: { ...LIGHTING.night.key, azimuth: -3.0 } };
    const mid = mixPreset(a, b, 0.5).key.azimuth;
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.01);
  });
});

describe('the real sunrise', () => {
  it('has the sun above the horizon, a warm key light and a physical blue sky', () => {
    const s = LIGHTING.sunrise;
    expect(s.key.elevation).toBeGreaterThan(0.05);
    const key = new THREE.Color(s.key.color);
    expect(key.r).toBeGreaterThan(key.b);
    expect(s.sky).toBeDefined();
  });

  it('keeps the night and the predawn dark', () => {
    for (const preset of [LIGHTING.night, LIGHTING.predawn]) {
      const top = new THREE.Color(preset.skyTop);
      expect(top.r + top.g + top.b).toBeLessThan(0.15);
      expect(preset.environment).toBeLessThanOrEqual(0.2);
      expect(preset.sky).toBeUndefined();
    }
    expect(LIGHTING.night.environment).toBe(0.15);
  });

  it('lights the image more as the day brightens', () => {
    expect(LIGHTING.sunrise.environment).toBe(1);
    expect(LIGHTING.day.environment).toBe(0.5);
    expect(LIGHTING.sunrise.shadow).toBeGreaterThan(LIGHTING.night.shadow);
  });
});
