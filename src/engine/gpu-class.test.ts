import { describe, expect, it } from 'vitest';
import {
  autoStartTier,
  isWindows,
  looksIntegrated,
  shouldTipHighPerformance,
  webglAttributes,
  type GpuInfo,
} from './gpu-class';

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

describe('the fastest GPU on laptops', () => {
  it("asks WebGL 2 for the high-performance GPU, with three's own attributes", () => {
    expect(webglAttributes()).toEqual({
      antialias: false,
      alpha: true,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
  });

  it('tells integrated adapters from discrete ones', () => {
    expect(looksIntegrated(gpu('intel', 'gen-12lp'))).toBe(true);
    expect(looksIntegrated(gpu('amd', '', 'AMD Radeon(TM) Graphics'))).toBe(true);
    expect(looksIntegrated(gpu('amd', '', 'AMD Radeon RX 6700M'))).toBe(false);
    expect(looksIntegrated(gpu('nvidia', 'ada', 'NVIDIA GeForce RTX 4050 Laptop GPU'))).toBe(false);
    expect(looksIntegrated(gpu('apple', 'metal-3'))).toBe(false);
  });

  it('shows the Windows "High performance" tip only on Windows with an integrated adapter', () => {
    const win = isWindows('Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(win).toBe(true);
    expect(isWindows('macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
    expect(shouldTipHighPerformance(win, gpu('intel'))).toBe(true);
    expect(shouldTipHighPerformance(win, gpu('nvidia', 'ada'))).toBe(false);
    expect(shouldTipHighPerformance(false, gpu('intel'))).toBe(false); // macOS honours the hint
    expect(shouldTipHighPerformance(win, gpu(''))).toBe(false); // unknown: say nothing
    expect(shouldTipHighPerformance(win, null)).toBe(false); // WebGL 2: no adapter info
    expect(shouldTipHighPerformance(win, { ...gpu('intel'), isFallback: true })).toBe(false);
  });
});
