import { showMessage } from '../../engine/menus';
import { browserStorage, createSaveStore, type SaveStore } from '../../engine/save';
import type { DreamContext, DreamModule } from '../types';
import { CITY } from './areas/city';
import { startChapter, type Chapter } from './chapter';
import { phaseTitle } from './flow';
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

/** Task 18 inserts the intro scene here; until then the intro phase just completes. */
function playable(save: RunSave): RunSave {
  if (save.phase === 'intro') return completePhase(save, restartPhase(save));
  if (PLAYABLE.includes(save.phase)) return save;
  return playable(freshRun());
}

/** Dev only: `?phase=day1|night1` starts that phase with fresh supplies, ignoring the save. */
function devOverride(): RunSave | null {
  if (!import.meta.env.DEV) return null;
  const phase = new URLSearchParams(location.search).get('phase');
  const found = PLAYABLE.find((p) => p === phase);
  return found ? { ...freshRun(), phase: found } : null;
}

export function createDream(): DreamModule {
  let ctx: DreamContext | null = null;
  let store: SaveStore<RunSave> | null = null;
  let chapter: Chapter | null = null;
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
    const built = await startChapter(ctx, CITY, playable(from), store, onDone);
    if (!disposed) return built;
    built.dispose();
    return null;
  }

  /** Fade out, drop the old chapter, build a fresh run (with "Loading…" if slow), fade in, title card. */
  async function startOver(): Promise<void> {
    if (!ctx || !store) return;
    chapter?.freeze();
    await ctx.overlay.fade(true);
    if (disposed) return;
    chapter?.dispose();
    chapter = null;
    store.clear();
    save = freshRun();
    resumable = false;
    const { overlay } = ctx;
    const loading = setTimeout(() => showMessage(overlay, '', 'Loading…'), LOADING_DELAY_MS);
    chapter = await build(save);
    clearTimeout(loading);
    overlay.closePanel();
    if (!chapter) return;
    await overlay.fade(false);
    if (!disposed) chapter.announce(true);
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
      chapter = await build(save);
    },
    begin() {
      void begin();
    },
    dispose() {
      disposed = true;
      chapter?.dispose();
      chapter = null;
    },
  };
}
