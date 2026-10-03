import { disposeScene } from '../../engine/dispose';
import type { SaveStore } from '../../engine/save';
import type { DreamContext } from '../types';
import type { AreaDef } from './areas/types';
import { assemble } from './assemble';
import { createDeath } from './death';
import { strikesFor } from './fish';
import { MAX_HEALTH, phaseTitle, spawnFor } from './flow';
import { HINTS, type HintId } from './hints';
import { applyLighting, LIGHTING } from './lighting';
import { createPlay } from './play';
import type { Events, Run } from './run';
import { completePhase, isNight, restartPhase, type RunSave } from './state';
import { DAY_TUNING } from './zombies/brain';

export interface Chapter {
  /** The title card, then the phase's first-time hints (all player-paced). */
  announce(title: boolean): void;
  /** Stops gameplay ticking (used while the scene is being swapped out). */
  freeze(): void;
  dispose(): void;
}

/** Lantern brightness at night (tuning knob); it is 0 by day. */
const LANTERN_NIGHT = 6;

/** Builds the area once and runs its day and night. Calls `onDone(save)` after the night is survived. */
export async function startChapter(
  ctx: DreamContext,
  area: AreaDef,
  initial: RunSave,
  store: SaveStore<RunSave>,
  onDone: (save: RunSave) => void,
): Promise<Chapter> {
  const { sys, lantern } = await assemble(ctx, area);
  const { horde, bow, fish, pickups, flashlight } = sys;
  const camera = ctx.stage.camera;
  const scene = sys.world.scene;
  let save = initial;
  let disposed = false;
  const run: Run = {
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

  /** The hint's pages if it has not been shown this run (and marks it seen), else none. */
  function hintPages(id: HintId): readonly string[] {
    if (run.live.hints.includes(id)) return [];
    run.live.hints.push(id);
    return HINTS[id];
  }

  function beginPhase(): void {
    const night = isNight(save.phase);
    run.phase = save.phase;
    run.live = restartPhase(save, run.live.hints);
    run.taken = new Set(run.live.taken);
    run.health = MAX_HEALTH;
    run.dim = 0;
    run.appliedDim = 0;
    run.frozen = false;
    run.dying = 'no';
    applyLighting(sys.world.lights, night ? LIGHTING.night : LIGHTING.day);
    lantern.intensity = night ? LANTERN_NIGHT : 0;
    horde.reset();
    bow.reset();
    fish.reset();
    if (night) fish.arm(strikesFor(run.live.fed));
    pickups.place(night ? [] : area.pickups, run.taken);
    if (!night) for (const l of area.lurkers) horde.spawn(l.x, l.z, l.yaw, DAY_TUNING, l.lying);
    flashlight.on = night;
    const at = spawnFor(save.phase, area);
    ctx.player.teleport(at.x, at.z, at.yaw);
    play.reset();
  }

  function announce(title: boolean): void {
    const pages = [
      ...(title ? [phaseTitle(save.phase)] : []),
      ...hintPages(isNight(save.phase) ? 'night' : 'pickup'),
    ];
    if (pages.length > 0) ctx.read(pages);
  }

  async function waitForDark(): Promise<void> {
    const pick = await ctx.choose('Wait for dark? You cannot come back here.', ['Wait', 'Not yet']);
    if (disposed || pick !== 0) return;
    run.frozen = true;
    save = completePhase(save, run.live);
    store.save(save);
    await ctx.overlay.fade(true);
    if (disposed) return;
    beginPhase();
    run.frozen = true;
    await ctx.overlay.fade(false);
    if (disposed) return;
    run.frozen = false;
    announce(true);
  }

  function arrive(): void {
    if (run.frozen) return;
    run.frozen = true;
    save = completePhase(save, run.live);
    store.save(save);
    onDone(save);
  }

  const death = createDeath(ctx, run);
  const restart = (): void => {
    if (disposed) return;
    beginPhase();
    announce(false);
  };
  const events: Events = {
    hint(id) {
      const pages = ctx.isPaused() ? [] : hintPages(id);
      if (pages.length > 0) ctx.read(pages);
    },
    wait: () => void waitForDark(),
    die: () => death.start(),
    arrive,
  };
  const play = createPlay(sys, run, events);
  beginPhase();
  ctx.stage.scene = scene;
  const stop = ctx.stage.addUpdater((dt) => {
    if (run.dying === 'no') play.update(dt);
    else death.step(dt, () => save.phase, restart);
  });

  return {
    announce,
    freeze: () => void (run.frozen = true),
    dispose() {
      disposed = true;
      stop();
      sys.ambience.dispose();
      horde.dispose();
      bow.dispose();
      fish.dispose();
      pickups.dispose();
      sys.hud.dispose();
      flashlight.dispose();
      camera.removeFromParent();
      camera.rotation.set(0, camera.rotation.y, 0);
      disposeScene(scene);
    },
  };
}
