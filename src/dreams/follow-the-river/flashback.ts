import * as THREE from 'three/webgpu';
import { drawBehind } from '../../engine/frames';
import type { PageHooks } from '../../engine/menus';
import type { DreamContext } from '../types';
import { buildFlashback, type Flashback, type Tape } from './flashback-scene';

/** Fade for the cut into and out of the flashback (ms). Tuning knob. */
export const FLASHBACK_FADE_MS = 500;

/**
 * Plays a tape as a flashback: the stage shows the tape's scene behind its pages and the
 * chapter is frozen (ctx.hold / ctx.read keep the gate on the reader screen) until they close.
 *
 * The stage camera is readonly and baked into the post pipeline, so the flashback camera is a
 * pose source: its position and quaternion are copied onto the stage camera each frame and the
 * player's pose is restored exactly afterwards. The updater runs while `isPaused()` is true on
 * purpose: the reader *is* the pause, and the pause menu can't open over it.
 *
 * Quit-safe: if anything else replaces the stage scene (session clean-up, dropScene), the next
 * frame tears the flashback down; nothing is left behind.
 */
export function playFlashback(
  ctx: DreamContext,
  tape: Tape,
  pages: readonly string[],
  hooks?: PageHooks,
): Promise<void> {
  return new Promise((resolve) => {
    ctx.hold(); // freezes the chapter while the models load
    void run(ctx, tape, pages, hooks, resolve);
  });
}

async function run(
  ctx: DreamContext,
  tape: Tape,
  pages: readonly string[],
  hooks: PageHooks | undefined,
  done: () => void,
): Promise<void> {
  const { stage, overlay } = ctx;
  const previous = stage.scene;
  const stopLoading = overlay.loading();
  const [flashback] = await Promise.all([
    buildFlashback(tape, ctx)
      .then(async (built) => {
        // compiled off stage, behind the fade: the first drawn frame builds no pipeline
        await stage.renderer.compileAsync(built.scene, stage.camera).catch(() => undefined);
        return built;
      })
      .catch(() => null), // a failed load still plays the tape as text
    overlay.fade(true, FLASHBACK_FADE_MS),
  ]).finally(stopLoading);
  if (stage.scene !== previous) {
    // The dream was quit or swapped scenes while we loaded.
    flashback?.dispose();
    return done();
  }
  const restore = flashback ? show(ctx, flashback, previous) : (): void => undefined;
  // still black: the first frames build the post chain's own pipelines (compileAsync can't reach them)
  if (flashback) await drawBehind(stage).catch(() => undefined);
  void overlay.fade(false, FLASHBACK_FADE_MS);
  // Restore synchronously when the pages close: the gate unfreezes the chapter right then, and
  // its logic must never see the flashback camera's pose. A hard cut back, like the pager closing.
  ctx.read(
    pages,
    () => {
      restore();
      done();
    },
    {
      ...hooks,
      onPage: (page, index) => {
        hooks?.onPage?.(page, index);
        flashback?.onPage?.(index);
      },
    },
  );
}

/** Overlay class that hides the HUD while a cutscene owns the screen (see style.css). */
export const CINEMATIC = 'cinematic';

/** Puts the flashback on stage; returns the (idempotent) teardown that restores what was there. */
function show(ctx: DreamContext, flashback: Flashback, previous: THREE.Scene): () => void {
  const { stage } = ctx;
  const { camera } = stage;
  const savedPosition = new THREE.Vector3().copy(camera.position);
  const savedQuaternion = new THREE.Quaternion().copy(camera.quaternion);
  let live = true;
  const graded = ctx.grade('flashback');
  const teardown = (): void => {
    if (!live) return;
    live = false;
    stop();
    ctx.overlay.root.classList.remove(CINEMATIC);
    if (stage.scene === flashback.scene) {
      ctx.grade(graded);
      // Still ours: give the chapter back. After a quit the next screen owns the camera.
      stage.scene = previous;
      camera.position.copy(savedPosition);
      camera.quaternion.copy(savedQuaternion);
    }
    flashback.dispose();
  };
  const stop = stage.addUpdater((dt) => {
    if (stage.scene !== flashback.scene) return teardown(); // someone else took the stage
    flashback.update(dt);
    camera.position.copy(flashback.camera.position);
    camera.quaternion.copy(flashback.camera.quaternion);
    // The camera still hangs off the chapter's scene, which is not being drawn, so nothing else
    // refreshes its world matrix: without this the flashback rendered from the old spot (black).
    camera.updateMatrixWorld(true);
  });
  stage.scene = flashback.scene;
  ctx.overlay.root.classList.add(CINEMATIC);
  return teardown;
}
