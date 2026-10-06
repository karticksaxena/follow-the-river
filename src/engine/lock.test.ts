import { describe, expect, it } from 'vitest';
import { NO_READER, openReaderState, pauseReader, resumeReaderState, screenAfter } from './lock';

describe('reader pause', () => {
  it('Esc over pages opens the menu once; a second Esc does nothing', () => {
    const paused = pauseReader(openReaderState(true));
    expect(paused?.menuOver).toBe(true);
    expect(paused && pauseReader(paused)).toBeNull();
  });

  it('Resume returns to the same open reader, and Esc works again', () => {
    const paused = pauseReader(openReaderState(true));
    const back = paused && resumeReaderState(paused);
    expect(back).toEqual(openReaderState(true));
    expect(back && pauseReader(back)?.menuOver).toBe(true);
  });

  it('a bare hold or no reader cannot be paused', () => {
    expect(pauseReader(openReaderState(false))).toBeNull();
    expect(pauseReader(NO_READER)).toBeNull();
  });
});

describe('screenAfter', () => {
  it('shows the game once the mouse is locked', () => {
    expect(screenAfter('locked', false)).toBe('game');
  });

  it('opens the pause menu when the player presses Esc', () => {
    expect(screenAfter('unlocked', false)).toBe('pause-menu');
  });

  it('keeps the pause menu up when the lock is refused', () => {
    expect(screenAfter('lock-error', false)).toBe('pause-menu');
  });

  it('keeps the reader open while the player is reading pages', () => {
    expect(screenAfter('unlocked', true)).toBe('reader');
  });

  it('stays on the reader when a late lock lands while pages are open', () => {
    expect(screenAfter('locked', true)).toBe('reader');
  });
});
