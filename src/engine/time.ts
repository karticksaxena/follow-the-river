/** Longest step the game advances in one frame, in seconds. Tab switches can report gaps of minutes. */
export const MAX_FRAME_SECONDS = 0.1;

export function clampDelta(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, MAX_FRAME_SECONDS);
}

/** Rejects if `promise` hasn't settled within `ms`, so a stalled download can't hang the game forever. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
