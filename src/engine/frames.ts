import type { Stage } from './stage';

/** Longest the game waits for the GPU to go idle behind black (ms). A guard, never a gate. */
export const GPU_IDLE_TIMEOUT_MS = 3000;

/** The slice of the WebGPU backend `gpuIdle` needs; the WebGL 2 fallback has none of it. */
interface IdleBackend {
  device?: { queue?: { onSubmittedWorkDone?: () => Promise<unknown> } };
}

/**
 * Resolves once the GPU has finished all submitted work (WebGPU only; WebGL 2 returns at once).
 * Pipelines made in a real frame finish compiling later and stall a later frame, so cutscenes
 * wait here behind black. Raced against a timeout; a lost device or any error is ignored.
 */
export async function gpuIdle(renderer: { backend: object }): Promise<void> {
  const queue = (renderer.backend as IdleBackend | undefined)?.device?.queue; // oxlint-disable-line typescript/no-unsafe-type-assertion -- duck-typed WebGPU backend
  if (!queue?.onSubmittedWorkDone) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((done) => {
    timer = setTimeout(done, GPU_IDLE_TIMEOUT_MS);
  });
  try {
    await Promise.race([queue.onSubmittedWorkDone().catch(() => undefined), timeout]);
  } catch {
    // never block the game on this
  } finally {
    clearTimeout(timer);
  }
}

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

/** Frames drawn behind black: the far shadow cascade and Medium's reflection draw every 2nd frame. */
export const BEHIND_FRAMES = 3;

/**
 * Draws `n` real frames with `stage.warming` on (Auto quality ignores them), then restores it, even
 * if a frame throws. Skipped while `stage.hold` is set: the loop runs no updaters then, so the
 * frames would never resolve.
 */
export async function drawBehind(stage: Stage, n = BEHIND_FRAMES): Promise<void> {
  if (stage.hold) return;
  const was = stage.warming;
  stage.warming = true;
  try {
    await frames(stage, n);
    await gpuIdle(stage.renderer);
  } finally {
    stage.warming = was;
  }
}
