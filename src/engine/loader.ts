/** Show the spinner only after a wait this long, so a quick load never flashes it (ms). Tuning knob. */
export const LOADER_DELAY_MS = 150;

export interface LoadingState {
  /** Begin a wait; returns its end. Waits nest: the screen stays busy until the last one ends. */
  start(): () => void;
}

/**
 * Tracks waits for the overlay's loader. `onBusy` fires at once (the HUD hides over a black screen);
 * `onVisible` fires only if the wait outlasts `delayMs` (the spinner), and again when it ends.
 */
export function createLoadingState(
  onBusy: (busy: boolean) => void,
  onVisible: (visible: boolean) => void,
  delayMs = LOADER_DELAY_MS,
): LoadingState {
  let waits = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    start() {
      if (waits++ === 0) {
        onBusy(true);
        timer = setTimeout(() => onVisible(true), delayMs);
      }
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        if (--waits > 0) return;
        clearTimeout(timer);
        onVisible(false);
        onBusy(false);
      };
    },
  };
}
