export type Updater = (dt: number) => void;

/** Reports a broken updater in the console without stopping the frame (oxlint forbids console.*). */
function rethrowLater(error: unknown): void {
  queueMicrotask(() => {
    throw error;
  });
}

/**
 * Runs every updater for this frame. One that throws is dropped and reported, so a single bug
 * can't freeze the whole game: everything else keeps running and the frame still renders.
 */
export function runUpdaters(
  updaters: Set<Updater>,
  dt: number,
  report: (error: unknown) => void = rethrowLater,
): void {
  for (const fn of updaters) {
    try {
      fn(dt);
    } catch (error) {
      updaters.delete(fn);
      report(error);
    }
  }
}
