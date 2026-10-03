import { describe, expect, it } from 'vitest';
import { screenAfter } from './lock';

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
});
