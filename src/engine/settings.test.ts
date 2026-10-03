import { describe, expect, it } from 'vitest';
import type { SaveStore } from './save';
import {
  clampSettings,
  DEFAULT_SETTINGS,
  isSettings,
  loadSettings,
  type Settings,
} from './settings';

function storeWith(value: Settings | null): SaveStore<Settings> {
  return { load: () => value, save: () => true, clear: () => undefined };
}

describe('settings', () => {
  it('recognises a settings object', () => {
    expect(isSettings({ sensitivity: 1, volume: 0.5 })).toBe(true);
    expect(isSettings({ sensitivity: '1', volume: 0.5 })).toBe(false);
    expect(isSettings(null)).toBe(false);
  });

  it('clamps tampered values into range', () => {
    expect(clampSettings({ sensitivity: 999, volume: -3 })).toEqual({ sensitivity: 3, volume: 0 });
  });

  it('falls back to defaults when nothing loads', () => {
    expect(loadSettings(storeWith(null))).toEqual(DEFAULT_SETTINGS);
  });

  it('returns a copy of the defaults, not the shared object', () => {
    expect(loadSettings(storeWith(null))).not.toBe(DEFAULT_SETTINGS);
  });
});
