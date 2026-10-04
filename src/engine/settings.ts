import type { SaveStore } from './save';

export type Difficulty = 'story' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['story', 'normal', 'hard'];

export interface Settings {
  /** Mouse-look multiplier. */
  sensitivity: number;
  /** Master volume, 0 to 1. */
  volume: number;
  /** How hard the nights are (the pause menu changes it; new runs ask). */
  difficulty: Difficulty;
}

/** What a save may hold: settings from before the difficulty existed lack it. */
export type SavedSettings = Omit<Settings, 'difficulty'> & { difficulty?: unknown };

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  sensitivity: 1.5,
  volume: 0.8,
  difficulty: 'normal',
};
export const SENSITIVITY_RANGE = { min: 0.2, max: 3 } as const;

export function isSettings(value: unknown): value is SavedSettings {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof Settings, unknown>>;
  return typeof candidate.sensitivity === 'number' && typeof candidate.volume === 'number';
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Pulls hand-edited or out-of-range values back into the playable range. */
export function clampSettings(settings: SavedSettings): Settings {
  return {
    sensitivity: clamp(
      settings.sensitivity,
      SENSITIVITY_RANGE.min,
      SENSITIVITY_RANGE.max,
      DEFAULT_SETTINGS.sensitivity,
    ),
    volume: clamp(settings.volume, 0, 1, DEFAULT_SETTINGS.volume),
    difficulty: DIFFICULTIES.find((d) => d === settings.difficulty) ?? DEFAULT_SETTINGS.difficulty,
  };
}

export function loadSettings(store: SaveStore<SavedSettings>): Settings {
  const saved = store.load();
  return saved ? clampSettings(saved) : { ...DEFAULT_SETTINGS };
}
