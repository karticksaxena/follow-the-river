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

/** Asked of every adapter and WebGL 2 context: a hint (Chrome ignores it for WebGPU on Windows, macOS honours it). */
export const POWER_PREFERENCE = 'high-performance';

/** Pages shown once on Windows when the adapter looks integrated (the hint alone does not pick the discrete GPU there). */
export const HIGH_PERFORMANCE_TIP = [
  'This game runs best on your fastest graphics card, but Windows may be using the slower one built into your processor.',
  'To fix it: open Windows Settings, then System, Display, Graphics. Add Google Chrome (or pick it in the list), choose Options, select High performance and Save.',
  'Then close every Chrome window and open this page again.',
] as const;

/** True for a Windows user agent (`userAgentData.platform` when present, else the user agent string). */
export function isWindows(platform: string | undefined, userAgent: string): boolean {
  return /^windows/i.test(platform ?? '') || /windows/i.test(userAgent);
}

/** An integrated GPU by its adapter info: Intel, or an AMD APU ("Radeon Graphics", Vega) that is not an RX card. */
export function looksIntegrated(info: GpuInfo): boolean {
  const vendor = info.vendor.toLowerCase();
  const text = `${info.description} ${info.architecture}`.toLowerCase();
  if (vendor === 'intel') return true;
  if (vendor !== 'amd' && vendor !== 'ati') return false;
  return !has(text, /\brx\b|\bpro w|\bpro v/) && has(text, /radeon\W*(tm\W*)?graphics|vega/);
}

/** Whether to show the "set Chrome to High performance" tip: Windows and an integrated adapter in use. */
export function shouldTipHighPerformance(windows: boolean, info: GpuInfo | null): boolean {
  return windows && info !== null && !info.isFallback && looksIntegrated(info);
}

interface AdapterLike {
  info?: { vendor?: string; architecture?: string; description?: string };
  isFallbackAdapter?: boolean;
}

/** Asks the browser for the default adapter and reads its info; null when WebGPU or the info is missing. */
export async function readGpuInfo(): Promise<GpuInfo | null> {
  try {
    const gpu = (
      navigator as { gpu?: { requestAdapter(options: object): Promise<AdapterLike | null> } }
    ).gpu;
    const adapter = await gpu?.requestAdapter({ powerPreference: POWER_PREFERENCE });
    if (!adapter) return null;
    const info = adapter.info ?? {}; // no info: unknown vendor, which starts High
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

/** The `webgl2` context attributes three's WebGLBackend would use (alpha always on, no MSAA: the game's renderer is `antialias: false`, depth and stencil per renderer), plus the power hint. */
export function webglAttributes(depth = true, stencil = false): WebGLContextAttributes {
  return { antialias: false, alpha: true, depth, stencil, powerPreference: POWER_PREFERENCE };
}
