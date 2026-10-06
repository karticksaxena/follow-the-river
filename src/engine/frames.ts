import * as THREE from 'three/webgpu';
import { warmEnvironment } from './environment';
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
    if (stage.backend === 'webgl2') await revealInBatches(stage); // also builds the sky-lighting programs
    await frames(stage, n);
    await gpuIdle(stage.renderer);
  } finally {
    stage.warming = was;
  }
}

/**
 * New materials shown per frame while a scene first draws on WebGL 2 (a tuning knob). There every
 * program compiles and links synchronously in the frame that first draws it (~0.2 s each on
 * ANGLE/Metal): all at once the page froze for 38 s, in batches no frame is much over a second.
 */
export const WEBGL_BATCH = 4;

/** `items` cut into runs of `size` (the last may be shorter): every item lands in exactly one run, in order. */
export function splitBatches<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}

type Drawable = THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite;

const isDrawable = (o: THREE.Object3D): o is Drawable =>
  o instanceof THREE.Mesh ||
  o instanceof THREE.Line ||
  o instanceof THREE.Points ||
  o instanceof THREE.Sprite;

/** Materials a reveal has already shown (their programs exist), so later reveals skip them. */
const revealed = new WeakSet<THREE.Material>();

/** The visible drawables of `root` grouped by the materials not yet revealed. */
function unrevealed(root: THREE.Object3D): Map<THREE.Material, Drawable[]> {
  const groups = new Map<THREE.Material, Drawable[]>();
  root.traverse((o) => {
    if (!o.visible || !isDrawable(o)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (revealed.has(m)) continue;
      const list = groups.get(m);
      if (list) list.push(o);
      else groups.set(m, [o]);
    }
  });
  return groups;
}

/**
 * WebGL 2 only (a no-op on WebGPU): hides everything not yet drawn, then draws one real frame per
 * `WEBGL_BATCH` new materials with just those added, so the synchronous program compiles are spread
 * over many frames and the loader keeps animating. Everything is visible again on return, even if a
 * frame throws.
 */
export async function revealInBatches(stage: Stage): Promise<void> {
  if (stage.backend !== 'webgl2' || stage.hold) return;
  warmEnvironment(); // the sky-lighting refresh's programs build now, not at the first lighting change
  const groups = unrevealed(stage.scene);
  const hidden = new Set<Drawable>();
  for (const list of groups.values()) for (const o of list) hidden.add(o);
  for (const o of hidden) o.visible = false;
  try {
    for (const batch of splitBatches([...groups], WEBGL_BATCH)) {
      for (const [m, list] of batch) {
        for (const o of list) o.visible = true;
        revealed.add(m);
      }
      await frames(stage, 1);
    }
  } finally {
    for (const o of hidden) o.visible = true;
  }
}
