/** Longest step the game advances in one frame, in seconds. Tab switches can report gaps of minutes. */
export const MAX_FRAME_SECONDS = 0.1;

export function clampDelta(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, MAX_FRAME_SECONDS);
}

/** Where "is the player looking" comes from; injectable so it tests without a DOM. */
export interface VisibilitySource {
  visible(): boolean;
  /** Calls `cb` on every change; returns the unsubscribe. */
  subscribe(cb: () => void): () => void;
}

export const pageVisibility: VisibilitySource = {
  visible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
  subscribe: (cb) => {
    if (typeof document === 'undefined') return () => undefined;
    document.addEventListener('visibilitychange', cb);
    return () => document.removeEventListener('visibilitychange', cb);
  },
};

/**
 * Rejects if `promise` hasn't settled after `ms` of VISIBLE time, so a stalled download can't hang the game
 * forever, yet a load left in a background tab (rAF paused, timers running) never times out.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  source: VisibilitySource = pageVisibility,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let left = ms;
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = (): void => {
      clearTimeout(timer);
      timer = undefined;
    };
    const arm = (): void => {
      stop();
      if (!source.visible()) return;
      startedAt = Date.now();
      timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out after ${ms} ms`));
      }, left);
    };
    const onChange = (): void => {
      if (timer !== undefined) left -= Date.now() - startedAt;
      arm();
    };
    const unsubscribe = source.subscribe(onChange);
    arm();
    const done = (): void => {
      stop();
      unsubscribe();
    };
    promise.then(
      (value) => {
        done();
        resolve(value);
      },
      (error: unknown) => {
        done();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
