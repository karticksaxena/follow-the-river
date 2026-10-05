import * as THREE from 'three/webgpu';
import type { App } from './app';
import type { DreamContext, DreamInfo, DreamModule } from './dreams/types';
import { disposeScene } from './engine/dispose';
import { lockKeyboard, unlockKeyboard } from './engine/fullscreen';
import { screenAfter, type LockEvent, type Screen } from './engine/lock';
import { showChoice, showPages, showPauseMenu, type PageHooks } from './engine/menus';
import { createPlayer, type Player } from './engine/player';

/**
 * Dev-only `?nolock`: play on even when the browser refuses Pointer Lock, so automated browser
 * checks can walk around (browsers refuse it to automated or unfocused windows). The real lock is
 * still requested. Never active in production.
 */
const NO_LOCK = import.meta.env.DEV && new URLSearchParams(location.search).has('nolock');

export interface Session {
  /** The context handed to `dream.start`; remembers the dream so `cleanUp` can dispose it. */
  context(dream: DreamModule): DreamContext;
  cleanUp(): void;
  /** Show the intro pages, then lock the pointer and play. */
  begin(): void;
}

interface Gate {
  player: Player;
  lock: () => void;
  isPaused: () => boolean;
  /**
   * Pause for pages or a choice. The pointer stays locked (no new Chrome full-screen bubble on
   * every page) unless `cursor`: a choice's buttons need the mouse.
   */
  openReader: (cursor: boolean) => void;
  /** Leave the reader screen and resume play. */
  closeReader: () => void;
  dispose: () => void;
}

/** Screen state, the shared player and pointer-lock wiring (including dev `?nolock`). */
function createGate(app: App, showMenu: () => void): Gate {
  let screen: Screen = 'reader';
  let reading = false;
  const setScreen = (next: Screen): void => {
    screen = next;
    app.audio.setWorldPaused(next !== 'game');
    app.keys.blockDefaults = next === 'game';
    if (next === 'game') lockKeyboard();
    else if (next === 'pause-menu') unlockKeyboard();
    // Dev `?nolock` acts like a real lock: the mouse turns the view and hides only while playing.
    if (NO_LOCK) {
      player.freeLook(next === 'game');
      document.body.style.cursor = next === 'game' ? 'none' : '';
    }
  };
  const onLock = (event: LockEvent): void => {
    // Dev `?nolock` plays on when the browser refuses the lock (automated or unfocused windows).
    if (NO_LOCK && event === 'lock-error') return;
    setScreen(screenAfter(event, reading));
    // A late 'locked' (requested by a closed reader) while another reader is open: stay paused.
    if (event === 'locked' && reading) player.unlock();
    if (screen === 'game') app.overlay.closePanel();
    if (screen === 'pause-menu') showMenu();
  };
  const player = createPlayer(app.stage.camera, app.stage.renderer.domElement, app.keys, onLock);
  const lock = (): void => {
    if (NO_LOCK) onLock('locked');
    // Always ask for the real lock too: a person's click gets it (endless 360° turning, the cursor
    // never leaves the window), even on the dev link.
    player.lock();
  };
  // Without pointer lock the browser can't report Esc as an unlock, so do it here (dev only).
  const onEscape = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && screen === 'game') onLock('unlocked');
  };
  if (NO_LOCK) addEventListener('keydown', onEscape);
  player.setSensitivity(app.settings.sensitivity);
  const stopMove = app.stage.addUpdater((dt) => {
    if (screen === 'game') player.update(dt);
  });
  return {
    player,
    lock,
    isPaused: () => screen !== 'game',
    openReader: (cursor) => {
      reading = true;
      setScreen('reader');
      if (cursor) player.unlock();
      else player.holdLook(true);
    },
    closeReader: () => {
      reading = false;
      player.holdLook(false);
      // Still locked (pages): resume without asking again. Otherwise ask, which may show the bubble.
      if (player.isLocked()) onLock('locked');
      else lock();
    },
    dispose: () => {
      unlockKeyboard();
      app.keys.blockDefaults = false;
      removeEventListener('keydown', onEscape);
      stopMove();
      player.dispose();
    },
  };
}

/** The player, pause menu, paged reader, choices and lock wiring for one running dream. */
export function createSession(app: App, info: DreamInfo, onQuit: () => void): Session {
  const homeScene = app.stage.scene;
  let current: DreamModule | null = null;
  const gate: Gate = createGate(app, () =>
    showPauseMenu(app.overlay, {
      title: info.title,
      howToPlay: info.howToPlay,
      settings: app.settings,
      tier: app.stage.tier,
      onResume: gate.lock,
      onSettings: (settings) => {
        app.saveSettings(settings);
        gate.player.setSensitivity(app.settings.sensitivity);
      },
      onQuit: leave,
    }),
  );
  function cleanUp(): void {
    gate.dispose();
    current?.dispose();
    // A dream that failed before setting its own scene must not free the bedroom.
    if (app.stage.scene !== homeScene) disposeScene(app.stage.scene);
    app.overlay.closePanel();
    app.audio.setWorldPaused(false);
    app.stage.scene = new THREE.Scene();
  }
  let ended = false;
  function leave(): void {
    if (ended) return;
    ended = true;
    cleanUp();
    onQuit();
  }
  const read = (pages: readonly string[], onDone?: () => void, hooks?: PageHooks): void => {
    gate.openReader(false);
    showPages(
      app.overlay,
      pages,
      () => {
        gate.closeReader();
        onDone?.();
      },
      hooks,
    );
  };
  const choose = (text: string, labels: readonly string[], focus = 0): Promise<number> =>
    new Promise((resolve) => {
      gate.openReader(true);
      showChoice(
        app.overlay,
        text,
        labels,
        (index) => {
          gate.closeReader();
          resolve(index);
        },
        focus,
      );
    });
  const hold = (): void => gate.openReader(false);
  const finish = (): void => {
    hold(); // freeze input so the pause menu can't open during the fade
    void app.overlay.fade(true).then(leave);
  };
  const cinematic = (on: boolean): void => gate.player.setInputEnabled(!on);
  return {
    context(dream) {
      current = dream;
      const { stage, overlay, audio, keys } = app;
      const { player, isPaused } = gate;
      return {
        stage,
        overlay,
        audio,
        keys,
        player,
        isPaused,
        read,
        choose,
        hold,
        cinematic,
        focus: (on, distance) => stage.focus(on, distance),
        warmFocus: () => stage.warmFocus(),
        grade: (preset, seconds) => stage.grade(preset, seconds),
        difficulty: () => app.settings.difficulty,
        setDifficulty: (difficulty) => app.saveSettings({ ...app.settings, difficulty }),
        finish,
      };
    },
    cleanUp,
    begin: () => read(info.intro, () => current?.begin?.()),
  };
}
