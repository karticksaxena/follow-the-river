export type LockEvent = 'locked' | 'unlocked' | 'lock-error';
export type Screen = 'game' | 'pause-menu' | 'reader';

/**
 * What to show after the mouse lock changes. A failed lock (denied, or retried too soon
 * after Esc) keeps a menu up so the player can click Resume again.
 */
export function screenAfter(event: LockEvent, reading: boolean): Screen {
  if (event === 'locked') return 'game';
  return reading ? 'reader' : 'pause-menu';
}
