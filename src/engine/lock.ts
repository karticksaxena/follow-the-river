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

/** An open reader (pages, a choice or a bare hold) and whether the pause menu is over it. */
export interface ReaderState {
  readonly open: boolean;
  /** Pages and choices can be paused with Esc; a bare hold (a fade, a cutscene beat) cannot. */
  readonly pausable: boolean;
  readonly menuOver: boolean;
}

export const NO_READER: ReaderState = { open: false, pausable: false, menuOver: false };

export const openReaderState = (pausable: boolean): ReaderState => ({
  open: true,
  pausable,
  menuOver: false,
});

/** Esc over a reader: the state with the menu over it, or null when Esc does nothing here. */
export function pauseReader(state: ReaderState): ReaderState | null {
  if (!state.open || !state.pausable || state.menuOver) return null;
  return { ...state, menuOver: true };
}

/** Resume: the same reader, uncovered. */
export const resumeReaderState = (state: ReaderState): ReaderState => ({
  ...state,
  menuOver: false,
});
