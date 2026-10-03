import type { SaveStore } from './save';

export interface Settings {
  /** Mouse-look multiplier. */
  sensitivity: number;
  /** Master volume, 0 to 1. */
  volume: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { sensitivity: 1, volume: 0.8 };
export const SENSITIVITY_RANGE = { min: 0.2, max: 3 } as const;

export function isSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof Settings, unknown>>;
  return typeof candidate.sensitivity === 'number' && typeof candidate.volume === 'number';
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Pulls hand-edited or out-of-range values back into the playable range. */
export function clampSettings(settings: Settings): Settings {
  return {
    sensitivity: clamp(
      settings.sensitivity,
      SENSITIVITY_RANGE.min,
      SENSITIVITY_RANGE.max,
      DEFAULT_SETTINGS.sensitivity,
    ),
    volume: clamp(settings.volume, 0, 1, DEFAULT_SETTINGS.volume),
  };
}

export function loadSettings(store: SaveStore<Settings>): Settings {
  const saved = store.load();
  return saved ? clampSettings(saved) : { ...DEFAULT_SETTINGS };
}
