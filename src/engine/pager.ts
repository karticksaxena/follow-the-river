export interface PagerState {
  readonly index: number;
  readonly total: number;
  readonly done: boolean;
}

export type PagerAction = 'next' | 'prev' | 'skip';

export function startPager(total: number): PagerState {
  return { index: 0, total, done: total === 0 };
}

/** Pages only move when the player asks; nothing here runs on a timer. */
export function stepPager(state: PagerState, action: PagerAction): PagerState {
  if (state.done) return state;
  if (action === 'skip') return { ...state, done: true };
  if (action === 'prev') return { ...state, index: Math.max(0, state.index - 1) };
  if (state.index + 1 >= state.total) return { ...state, done: true };
  return { ...state, index: state.index + 1 };
}

/** Keyboard shortcuts for reading: Enter, → or Space = next; ← or Backspace = previous. */
export function pagerActionForKey(code: string): PagerAction | null {
  if (code === 'Enter' || code === 'NumpadEnter' || code === 'ArrowRight' || code === 'Space') {
    return 'next';
  }
  if (code === 'ArrowLeft' || code === 'Backspace') return 'prev';
  return null;
}

export interface ReadingKey {
  code: string;
  /** The key is held down and the browser is auto-repeating it. */
  repeat: boolean;
  /** Alt, Ctrl or Cmd is held (a browser shortcut such as Alt+← back). */
  modifier: boolean;
  /** A button has focus; Enter and Space already click it natively. */
  onButton: boolean;
}

/**
 * The page action for a key press, or null to leave the key alone. Ignores held-down
 * repeats (no racing through pages), browser shortcuts, and Enter/Space on a focused
 * button (the button's own click handles those). Arrows and Backspace always work.
 */
export function pagerActionForKeyEvent(key: ReadingKey): PagerAction | null {
  if (key.repeat || key.modifier) return null;
  if (
    key.onButton &&
    key.code !== 'ArrowRight' &&
    key.code !== 'ArrowLeft' &&
    key.code !== 'Backspace'
  ) {
    return null;
  }
  return pagerActionForKey(key.code);
}
