import { disposeScene } from '../../engine/dispose';
import type { SaveStore } from '../../engine/save';
import type { DreamContext } from '../types';
import type { AreaDef } from './areas/types';
import { assemble } from './assemble';
import { createDeath } from './death';
import { MAX_HEALTH } from './flow';
import {
  announce,
  arrive,
  beginPhase,
  readTape,
  restart,
  showHint,
  waitForDark,
  type Flow,
} from './phases';
import { createPlay } from './play';
import type { Events, Run, Systems } from './run';
import { restartPhase, type RunSave } from './state';
import { stopTape } from './tapes';

export interface Chapter {
  /** The title card, then the phase's first-time hints (all player-paced). */
  announce(title: boolean): void;
  /** Stops gameplay ticking (used while the scene is being swapped out). */
  freeze(): void;
  dispose(): void;
}

const NOOP_CHAPTER: Chapter = {
  announce: () => undefined,
  freeze: () => undefined,
  dispose: () => undefined,
};

function newRun(save: RunSave): Run {
  return {
    phase: save.phase,
    live: restartPhase(save),
    taken: new Set(),
    health: MAX_HEALTH,
    dim: 0,
    appliedDim: 0,
    time: 0,
    frozen: false,
    dying: 'no',
    dyingTime: 0,
  };
}

/** Stops everything the chapter started and frees its scene. */
function teardown(sys: Systems, stop: () => void): void {
  const { camera } = sys.ctx.stage;
  stop();
  sys.ambience.dispose();
  sys.horde.dispose();
  sys.scares.dispose();
  stopTape();
  sys.bow.dispose();
  sys.fish.dispose();
  sys.pickups.dispose();
  sys.hud.dispose();
  sys.flashlight.dispose();
  camera.removeFromParent();
  camera.rotation.set(0, camera.rotation.y, 0);
  disposeScene(sys.world.scene);
}

/**
 * Builds the area once and runs its day and night. Calls `onDone(save)` after the night is survived.
 * If `isCancelled()` turns true while building, everything built is freed and the returned chapter
 * does nothing.
 */
export async function startChapter(
  ctx: DreamContext,
  area: AreaDef,
  initial: RunSave,
  store: SaveStore<RunSave>,
  onDone: (save: RunSave) => void,
  isCancelled: () => boolean = () => false,
): Promise<Chapter> {
  const built = await assemble(ctx, area, isCancelled);
  if (!built) return NOOP_CHAPTER;
  const { sys, lantern } = built;
  const run = newRun(initial);
  const death = createDeath(ctx, run);
  const f: Flow = {
    sys,
    lantern,
    run,
    save: initial,
    store,
    onDone,
    onReset: () => undefined,
    disposed: false,
  };
  const events: Events = {
    hint: (id) => showHint(f, id),
    tape: (pickup) => readTape(f, pickup),
    wait: () => void waitForDark(f),
    die: () => death.start(),
    arrive: () => arrive(f),
  };
  const play = createPlay(sys, run, events);
  f.onReset = () => play.reset();
  beginPhase(f);
  ctx.stage.scene = sys.world.scene;
  const phaseOf = (): RunSave['phase'] => f.save.phase;
  const again = (): void => restart(f);
  const stop = ctx.stage.addUpdater((dt) => {
    if (run.dying === 'no') play.update(dt);
    else {
      if (!ctx.isPaused()) sys.ambience.hush(dt);
      death.step(dt, phaseOf, again);
    }
  });
  return {
    announce: (title) => announce(f, title),
    freeze: () => void (run.frozen = true),
    dispose() {
      f.disposed = true;
      teardown(sys, stop);
    },
  };
}
