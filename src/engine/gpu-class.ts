import type { Tier } from './quality';

/** What `GPUAdapter.info` says (Chrome/Safari give vendor, architecture, often an empty description). */
export interface GpuInfo {
  vendor: string;
  architecture: string;
  description: string;
  isFallback: boolean;
}

const has = (text: string, pattern: RegExp): boolean => pattern.test(text);

function intel(arch: string, text: string): Tier {
  if (has(arch, /xe-hp|xe2-hp|xe-hpg/) || has(text, /\barc\b.*\b[ab]\d{3}\b/)) return 'high';
  if (has(arch, /^gen-?(9|11)\b/) || has(text, /\buhd\b/)) return 'low';
  return 'medium';
}

function amd(arch: string, text: string): Tier {
  if (has(text, /\brx\b|\bpro w|\bpro v/)) return 'high';
  if (has(text, /\b\d{3,4}m\b|vega|graphics/)) return 'medium';
  if (has(arch, /gcn/)) return 'medium';
  return 'high'; // unknown AMD: Auto steps down in 2-3 s if wrong, never stuck low
}

function apple(text: string): Tier {
  if (has(text, /\b(pro|max|ultra)\b/)) return 'high';
  if (has(text, /\bm\d\b/)) return 'medium'; // base M1/M2/M3/M4: about 8-10 GPU cores
  return 'high'; // Chrome hides the chip name: assume the dev-class machine, Auto corrects it
}

/**
 * The tier Auto starts at, from the adapter. Wrong guesses are cheap one way (too high: Auto steps
 * down in 2-3 s) and costly the other (too low: Auto never climbs), so unknown means High.
 */
export function autoStartTier(info: GpuInfo | null): Tier {
  if (!info) return 'high';
  if (info.isFallback) return 'low';
  const arch = info.architecture.toLowerCase();
  const text = `${info.description} ${info.architecture}`.toLowerCase();
  switch (info.vendor.toLowerCase()) {
    case 'intel':
      return intel(arch, text);
    case 'amd':
    case 'ati':
      return amd(arch, text);
    case 'apple':
      return apple(text);
    case 'qualcomm':
      return 'medium';
    case 'arm':
    case 'imagination':
    case 'img':
      return 'low';
    default:
      return 'high';
  }
}

interface AdapterLike {
  info?: { vendor?: string; architecture?: string; description?: string };
  isFallbackAdapter?: boolean;
}

/** Asks the browser for the default adapter and reads its info; null when WebGPU or the info is missing. */
export async function readGpuInfo(): Promise<GpuInfo | null> {
  try {
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<AdapterLike | null> } }).gpu;
    const adapter = await gpu?.requestAdapter();
    const info = adapter?.info;
    if (!adapter || !info) return null;
    return {
      vendor: info.vendor ?? '',
      architecture: info.architecture ?? '',
      description: info.description ?? '',
      isFallback: adapter.isFallbackAdapter === true,
    };
  } catch {
    return null;
  }
}
