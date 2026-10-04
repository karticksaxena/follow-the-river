import { describe, expect, it } from 'vitest';
import { autoStartTier, type GpuInfo } from './gpu-class';

const gpu = (vendor: string, architecture = '', description = ''): GpuInfo => ({
  vendor,
  architecture,
  description,
  isFallback: false,
});

describe('autoStartTier', () => {
  it.each([
    ['Intel UHD 620 (gen-9)', gpu('intel', 'gen-9', 'Intel(R) UHD Graphics 620'), 'low'],
    ['Intel UHD by name only', gpu('intel', '', 'Intel(R) UHD Graphics'), 'low'],
    ['Intel Iris Plus (gen-11)', gpu('intel', 'gen-11'), 'low'],
    [
      'Intel Iris Xe (gen-12lp)',
      gpu('intel', 'gen-12lp', 'Intel(R) Iris(R) Xe Graphics'),
      'medium',
    ],
    ['Intel Arc iGPU (xe-lpg)', gpu('intel', 'xe-lpg'), 'medium'],
    ['Intel Arc discrete (xe-hpg)', gpu('intel', 'xe-hpg', 'Intel(R) Arc(TM) A770'), 'high'],
    ['AMD Radeon 680M', gpu('amd', 'rdna-2', 'AMD Radeon(TM) 680M'), 'medium'],
    ['AMD Vega', gpu('amd', 'gcn-5', 'AMD Radeon(TM) Vega 8 Graphics'), 'medium'],
    ['AMD Radeon RX', gpu('amd', 'rdna-3', 'AMD Radeon RX 7800 XT'), 'high'],
    ['AMD, no description', gpu('amd', 'rdna-3'), 'high'],
    ['NVIDIA', gpu('nvidia', 'ampere', 'NVIDIA GeForce RTX 3060'), 'high'],
    ['Apple, unknown chip', gpu('apple', 'metal-3'), 'high'],
    ['Apple M1 base', gpu('apple', 'metal-3', 'Apple M1'), 'medium'],
    ['Apple M3 Pro', gpu('apple', 'metal-3', 'Apple M3 Pro'), 'high'],
    ['Apple M2 Max', gpu('apple', 'metal-3', 'Apple M2 Max'), 'high'],
    ['Qualcomm Adreno', gpu('qualcomm', 'adreno-7xx'), 'medium'],
    ['ARM Mali', gpu('arm', 'valhall'), 'low'],
    ['unknown vendor', gpu('', ''), 'high'],
  ] as const)('%s -> %s', (_name, info, tier) => {
    expect(autoStartTier(info)).toBe(tier);
  });

  it('a software adapter starts at Low, no adapter at High', () => {
    expect(autoStartTier({ ...gpu('google', 'swiftshader'), isFallback: true })).toBe('low');
    expect(autoStartTier(null)).toBe('high');
  });
});
