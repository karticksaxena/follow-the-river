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

/** Loader label refresh at most this often while a download reports progress (ms). Tuning knob. */
export const PROGRESS_INTERVAL_MS = 250;

/** Integer percent of items loaded, clamped to 0..100 and never below `prev` (totals grow as items queue). */
export function progressPercent(loaded: number, total: number, prev = 0): number {
  const raw = total > 0 && Number.isFinite(loaded / total) ? Math.floor((loaded / total) * 100) : 0;
  return Math.max(prev, Math.min(100, Math.max(0, raw)));
}

/** The label with a percent: "Falling asleep… 45%". */
export const progressLabel = (base: string, percent: number): string => `${base} ${percent}%`;

/** Shown once every download is done but shaders are still compiling: no number to sit at 100%. */
export const READY_LABEL = 'Getting ready…';

/** The slice of three's LoadingManager the tracker uses. */
export interface ProgressSource {
  onStart?: (url: string, loaded: number, total: number) => void;
  onProgress?: (url: string, loaded: number, total: number) => void;
  onLoad?: () => void;
}

/**
 * Wires a loading manager to a label: percent while downloads run (throttled), `READY_LABEL` when they end.
 * `text()` is the wait's base label, or null when no wait is on (then nothing is written).
 */
export function trackProgress(
  source: ProgressSource,
  text: () => string | null,
  write: (label: string) => void,
  now: () => number = () => performance.now(),
): void {
  let best = 0;
  let last = -Infinity;
  source.onStart = () => {
    best = 0;
    last = -Infinity;
  };
  source.onProgress = (_url: string, loaded: number, total: number) => {
    const base = text();
    const t = now();
    if (base === null || t - last < PROGRESS_INTERVAL_MS) return;
    last = t;
    best = progressPercent(loaded, total, best);
    write(progressLabel(base, best));
  };
  source.onLoad = () => {
    if (text() !== null && best > 0) write(READY_LABEL);
  };
}

/** Takes the page's first-paint loader (index.html) away; the title or an error message is ready behind it. */
export function endBootLoader(doc: {
  getElementById(id: string): { remove(): void } | null;
}): void {
  doc.getElementById('boot-loader')?.remove();
}
