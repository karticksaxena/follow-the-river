export type LockEvent = 'locked' | 'unlocked' | 'lock-error';
export type Screen = 'game' | 'pause-menu' | 'reader';

/**
 * What to show after the mouse lock changes. A failed lock (denied, or retried too soon
 * after Esc) keeps a menu up so the player can click Resume again.
 */
export function screenAfter(event: LockEvent, reading: boolean): Screen {
  // A lock that lands after another reader opened must not start the game behind its pages.
  if (event === 'locked') return reading ? 'reader' : 'game';
  return reading ? 'reader' : 'pause-menu';
}
