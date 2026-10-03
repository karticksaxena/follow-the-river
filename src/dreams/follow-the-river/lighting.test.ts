import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  applyDim,
  applyLighting,
  createWorldLights,
  LIGHTING,
  mixHex,
  mixPreset,
  skyDirection,
} from './lighting';

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
