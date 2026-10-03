import { showMessage } from '../../engine/menus';
import { browserStorage, createSaveStore, type SaveStore } from '../../engine/save';
import type { DreamContext, DreamModule } from '../types';
import { CITY } from './areas/city';
import { startChapter, type Chapter } from './chapter';
import { phaseTitle } from './flow';
import { runIntro, type Intro } from './intro';
import {
  completePhase,
  freshRun,
  isRunSave,
  restartPhase,
  type Phase,
  type RunSave,
} from './state';

/** Phases the city can play so far. Later phases arrive with the next areas (Plan 3). */
const PLAYABLE: readonly Phase[] = ['day1', 'night1'];
/** Show "Loading…" only when a scene swap takes longer than this. */
const LOADING_DELAY_MS = 300;
const THE_END = ['You made it to the boathouse.', 'Night 1 survived.', 'To be continued…'];

/** The intro is played by `runIntro`; this fallback (a finished run restarting) skips it. */
function playable(save: RunSave): RunSave {
  if (save.phase === 'intro') return completePhase(save, restartPhase(save));
  if (PLAYABLE.includes(save.phase)) return save;
  return playable(freshRun());
}

/** Dev only: `?phase=day1|night1` starts that phase with fresh supplies, ignoring the save. */
function devOverride(): RunSave | null {
  if (!import.meta.env.DEV) return null;
  const phase = new URLSearchParams(location.search).get('phase');
  const found = [...PLAYABLE, 'intro' as const].find((p) => p === phase);
  return found ? { ...freshRun(), phase: found } : null;
}

export function createDream(): DreamModule {
  let ctx: DreamContext | null = null;
  let store: SaveStore<RunSave> | null = null;
  let chapter: Chapter | null = null;
  let intro: Intro | null = null;
  let save: RunSave = freshRun();
  let resumable = false;
  let disposed = false;

  const onDone = (done: RunSave): void => {
    save = done;
    ctx?.read(THE_END, () => ctx?.finish());
  };

  /** Builds a chapter for `from`; null if the dream was disposed meanwhile. */
  async function build(from: RunSave): Promise<Chapter | null> {
    if (!ctx || !store) return null;
    const built = await startChapter(ctx, CITY, playable(from), store, onDone, () => disposed);
    if (!disposed) return built;
    built.dispose();
    return null;
  }

  /** The intro scene for a fresh run, else the chapter for the save's phase. */
  async function enter(from: RunSave): Promise<void> {
    if (!ctx) return;
    if (from.phase !== 'intro') {
      chapter = await build(from);
      return;
    }
    const built = await runIntro(ctx, () => void finishIntro());
    if (disposed) built.dispose();
    else intro = built;
  }

  /** Fade out, run `swap` (with "Loading…" if slow), fade in, title card. */
  async function transition(swap: () => Promise<void>): Promise<void> {
    if (!ctx) return;
    const { overlay } = ctx;
    await overlay.fade(true);
    if (disposed) return;
    const loading = setTimeout(() => showMessage(overlay, '', 'Loading…'), LOADING_DELAY_MS);
    await swap();
    clearTimeout(loading);
    if (disposed || (!chapter && !intro)) return;
    overlay.closePanel();
    await overlay.fade(false);
    if (!disposed) chapter?.announce(true);
  }

  function dropScene(): void {
    chapter?.dispose();
    chapter = null;
    intro?.dispose();
    intro = null;
  }

  /** Mom has sent you off: save the end of the intro, swap to Day 1. */
  async function finishIntro(): Promise<void> {
    if (!store) return;
    save = completePhase(save, restartPhase(save));
    store.save(save);
    await transition(async () => {
      dropScene();
      await enter(save);
    });
  }

  async function startOver(): Promise<void> {
    chapter?.freeze();
    await transition(async () => {
      dropScene();
      store?.clear();
      save = freshRun();
      resumable = false;
      await enter(save);
    });
  }

  async function begin(): Promise<void> {
    if (!ctx) return;
    if (resumable) {
      const label = `Continue from ${phaseTitle(save.phase)}?`;
      const pick = await ctx.choose(label, ['Continue', 'Start over']);
      if (disposed) return;
      if (pick === 1) return startOver();
      if (!PLAYABLE.includes(save.phase)) return ctx.read(THE_END, () => ctx?.finish());
    }
    chapter?.announce(true);
  }

  return {
    async start(context) {
      ctx = context;
      store = createSaveStore(browserStorage(), 'follow-the-river', isRunSave);
      const forced = devOverride();
      const loaded = forced ?? store.load();
      save = loaded ?? freshRun();
      resumable = !forced && loaded !== null && loaded.phase !== 'intro';
      await enter(save);
    },
    begin() {
      void begin();
    },
    dispose() {
      disposed = true;
      dropScene();
    },
  };
}
