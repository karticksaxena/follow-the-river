import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCKED_KEYS, lockKeyboard, unlockKeyboard } from './fullscreen';

describe('keyboard lock', () => {
  const lock = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const unlock = vi.fn<() => void>();
  const doc = Object.assign(new EventTarget(), { fullscreenElement: null as object | null });
  const fullscreen = (on: boolean): void => {
    doc.fullscreenElement = on ? {} : null;
    doc.dispatchEvent(new Event('fullscreenchange'));
  };

  beforeEach(() => {
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', { keyboard: { lock, unlock } });
  });
  afterEach(() => {
    unlockKeyboard();
    fullscreen(false);
    vi.clearAllMocks();
  });

  it('locks the game keys, never Escape, once full screen is on', () => {
    lockKeyboard();
    expect(lock).not.toHaveBeenCalled();
    fullscreen(true);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(LOCKED_KEYS).not.toContain('Escape');
    expect(LOCKED_KEYS).toContain('KeyW');
  });

  it('locks only once, and unlocks on request', () => {
    fullscreen(true);
    lockKeyboard();
    lockKeyboard();
    expect(lock).toHaveBeenCalledTimes(1);
    unlockKeyboard();
    expect(unlock).toHaveBeenCalledTimes(1);
    unlockKeyboard();
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('locks again after leaving and re-entering full screen', () => {
    fullscreen(true);
    lockKeyboard();
    fullscreen(false);
    fullscreen(true);
    expect(lock).toHaveBeenCalledTimes(2);
  });

  it('does nothing where Keyboard Lock does not exist (Safari)', () => {
    vi.stubGlobal('navigator', {});
    fullscreen(true);
    expect(() => lockKeyboard()).not.toThrow();
    expect(lock).not.toHaveBeenCalled();
  });
});
