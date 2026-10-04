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
    expect(clampSettings({ sensitivity: 999, volume: -3, difficulty: 'normal' })).toEqual({
      sensitivity: 3,
      volume: 0,
      difficulty: 'normal',
      graphics: 'auto',
      maxFps: '90',
    });
  });

  it('old settings without a frame cap load at 90; bad values fall back', () => {
    expect(clampSettings({ sensitivity: 1, volume: 0.5 }).maxFps).toBe('90');
    expect(clampSettings({ sensitivity: 1, volume: 0.5, maxFps: 144 }).maxFps).toBe('90');
    expect(clampSettings({ sensitivity: 1, volume: 0.5, maxFps: '60' }).maxFps).toBe('60');
    expect(clampSettings({ sensitivity: 1, volume: 0.5, maxFps: 'display' }).maxFps).toBe(
      'display',
    );
  });

  it('old settings without graphics load as Auto; bad values fall back', () => {
    expect(clampSettings({ sensitivity: 1, volume: 0.5 }).graphics).toBe('auto');
    expect(clampSettings({ sensitivity: 1, volume: 0.5, graphics: 'ultra' }).graphics).toBe('auto');
    expect(clampSettings({ sensitivity: 1, volume: 0.5, graphics: 'low' }).graphics).toBe('low');
  });

  it('old settings without a difficulty load as Normal; bad values fall back', () => {
    expect(isSettings({ sensitivity: 1, volume: 0.5 })).toBe(true);
    expect(clampSettings({ sensitivity: 1, volume: 0.5 }).difficulty).toBe('normal');
    expect(clampSettings({ sensitivity: 1, volume: 0.5, difficulty: 'easy' }).difficulty).toBe(
      'normal',
    );
    expect(clampSettings({ sensitivity: 1, volume: 0.5, difficulty: 'hard' }).difficulty).toBe(
      'hard',
    );
  });

  it('falls back to defaults when nothing loads', () => {
    expect(loadSettings(storeWith(null))).toEqual(DEFAULT_SETTINGS);
  });

  it('returns a copy of the defaults, not the shared object', () => {
    expect(loadSettings(storeWith(null))).not.toBe(DEFAULT_SETTINGS);
  });
});
