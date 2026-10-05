import type { Stage } from './stage';

/** Resolves after the stage's loop has drawn `n` frames. */
export function frames(stage: Stage, n: number): Promise<void> {
  return new Promise((done) => {
    let left = n;
    const stop = stage.addUpdater(() => {
      if (--left > 0) return;
      stop();
      done();
    });
  });
}
