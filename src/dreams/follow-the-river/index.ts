import * as THREE from 'three/webgpu';
import { showMessage } from '../../engine/menus';
import { browserStorage, createSaveStore, type SaveStore } from '../../engine/save';
import { withTimeout } from '../../engine/time';
import { LOAD_TIMEOUT_MS } from '../load';
import type { DreamContext, DreamModule } from '../types';
import { areaFor } from './areas';
import type { AreaDef } from './areas/types';
import { startChapter, type Chapter } from './chapter';
import { runColdOpen, TITLE_PAGES, type ColdOpen } from './coldopen';
import { REPLAY_PAGES } from './ending';
import { phaseTitle } from './flow';
import { runIntro, type Intro } from './intro';
import {
  completePhase,
  freshRun,
  isRunSave,
  normalizeSave,
  restartPhase,
  type Phase,
  type RunSave,
  type StoredRun,
} from './state';

/** Every phase that has a chapter; the saved `end` has none. */
const PLAYABLE: readonly Phase[] = ['day1', 'night1', 'day2', 'night2', 'day3', 'night3'];
/** Show "Loading…" only when a scene swap takes longer than this. */
const LOADING_DELAY_MS = 300;
const LOAD_FAILED = "Couldn't load the next part. Check your internet connection and try again.";
/** The page whose click regains control after a scene swap. */
const RESUME_PAGES: readonly string[] = ['The dream begins again.'];

/** The intro is played by `runIntro`; this fallback (a finished run restarting) skips it. */
function playable(save: RunSave): RunSave {
  return save.phase === 'intro' ? completePhase(save, restartPhase(save)) : save;
}

/** Dev only: `?phase=intro|day1…night3` starts that phase with fresh supplies, ignoring the save. */
function devOverride(): RunSave | null {
  if (!import.meta.env.DEV) return null;
  const phase = new URLSearchParams(location.search).get('phase');
  const found = [...PLAYABLE, 'intro' as const].find((p) => p === phase);
  return found ? { ...freshRun(), phase: found } : null;
}

export function createDream(): DreamModule {
  let ctx: DreamContext | null = null;
  let store: SaveStore<StoredRun> | null = null;
  let chapter: Chapter | null = null;
  let intro: Intro | null = null;
  /** The cold open (how it started) plays once per new run, before the intro. */
  let cold: ColdOpen | null = null;
  let coldDue = false;
  let save: RunSave = freshRun();
  let resumable = false;
  let disposed = false;

  let area: AreaDef | null = null;

  /** "Watch the ending again": the epilogue and credits (the live finale plays inside Night 3). */
  const onFinale = (): void => {
    if (ctx) ctx.stage.scene = new THREE.Scene(); // dark behind the pages, never a stale stage
    ctx?.read(REPLAY_PAGES, () => ctx?.finish());
  };

  /** A night is survived: show the area's arrival pages, then hand over to the next chapter. */
  const onDone = (done: RunSave): void => {
    const arrival = area?.arrival ?? [];
    save = done;
    ctx?.read(arrival, () => void nextChapter());
  };

  /** Builds a chapter for `from`; null if the dream was disposed meanwhile. */
  async function build(from: RunSave): Promise<Chapter | null> {
    if (!ctx || !store) return null;
    const next = areaFor(from.phase);
    if (!next) return null;
    area = next;
    const built = await startChapter(ctx, next, playable(from), store, onDone, () => disposed);
    if (!disposed) return built;
    built.dispose();
    return null;
  }

  /** The cold open, then the intro scene for a fresh run; else the chapter for the save's phase. */
  async function enter(from: RunSave): Promise<void> {
    if (!ctx) return;
    if (from.phase !== 'intro') {
      // A finished run gets the ending menu in begin(), not a chapter built behind it.
      if (PLAYABLE.includes(from.phase)) chapter = await build(from);
      return;
    }
    if (coldDue) {
      coldDue = false;
      const built = await runColdOpen(
        ctx,
        () => void toIntro(),
        () => disposed,
      );
      if (disposed) built.dispose();
      else cold = built;
      return;
    }
    const built = await runIntro(
      ctx,
      () => void finishIntro(),
      () => disposed,
    );
    if (disposed) built.dispose();
    else intro = built;
  }

  /**
   * Fade out, run `swap` (with "Loading…" if slow), fade in, title card. Input is frozen throughout;
   * without a chapter, reading `pages` is what hands control back.
   */
  async function transition(swap: () => Promise<void>, pages = RESUME_PAGES): Promise<void> {
    if (!ctx) return;
    const { overlay } = ctx;
    ctx.hold();
    await overlay.fade(true);
    if (disposed) return;
    const loading = setTimeout(() => showMessage(overlay, '', 'Loading…'), LOADING_DELAY_MS);
    let failed = false;
    try {
      await withTimeout(swap(), LOAD_TIMEOUT_MS);
    } catch {
      failed = true;
    } finally {
      clearTimeout(loading);
    }
    if (disposed) return;
    if (failed || (!chapter && !intro && !cold)) {
      dropScene();
      await ctx.choose(LOAD_FAILED, ['Back to dreams']);
      return ctx.finish();
    }
    overlay.closePanel();
    await overlay.fade(false);
    if (disposed) return;
    if (chapter) chapter.announce(true);
    else ctx.read(pages); // the player's click regains control
  }

  function release(): void {
    chapter?.dispose();
    chapter = null;
    intro?.dispose();
    intro = null;
    cold?.dispose();
    cold = null;
  }

  /** Frees the scene; the stage gets an empty one first so three never draws freed resources. */
  function dropScene(): void {
    if (ctx) ctx.stage.scene = new THREE.Scene();
    release();
  }

  /** The cold open is over (or skipped): swap to the intro under the title card. */
  function toIntro(): Promise<void> {
    return transition(async () => {
      dropScene();
      await enter(save);
    }, TITLE_PAGES);
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

  /** Hand over to the chapter the new `save` points at (the old one is dropped first). */
  function nextChapter(): Promise<void> {
    return transition(async () => {
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
      coldDue = true;
      await enter(save);
    });
  }

  async function begin(): Promise<void> {
    if (!ctx) return;
    if (save.phase === 'end') {
      const pick = await ctx.choose('You reached the lake.', [
        'Watch the ending again',
        'Start over',
      ]);
      if (disposed) return;
      return pick === 0 ? onFinale() : startOver();
    }
    if (resumable) {
      const label = `Continue from ${phaseTitle(save.phase)}?`;
      const pick = await ctx.choose(label, ['Continue', 'Start over']);
      if (disposed) return;
      if (pick === 1) return startOver();
    }
    chapter?.announce(true);
  }

  return {
    async start(context) {
      ctx = context;
      store = createSaveStore(browserStorage(), 'follow-the-river', isRunSave);
      const forced = devOverride();
      const stored = store.load();
      const loaded = forced ?? (stored && normalizeSave(stored));
      save = loaded ?? freshRun();
      resumable = !forced && loaded !== null && loaded.phase !== 'intro';
      coldDue = !forced && !resumable; // a new run (not Continue, not a dev `?phase=`)
      await enter(save);
    },
    begin() {
      void begin();
    },
    dispose() {
      disposed = true;
      release();
    },
  };
}
