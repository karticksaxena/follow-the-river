import * as THREE from 'three/webgpu';
import type { App } from './app';
import type { DreamContext, DreamInfo, DreamModule } from './dreams/types';
import { disposeScene } from './engine/dispose';
import { screenAfter, type LockEvent, type Screen } from './engine/lock';
import { showChoice, showPages, showPauseMenu } from './engine/menus';
import { createPlayer, type Player } from './engine/player';

/**
 * Dev-only `?nolock`: play without Pointer Lock so automated browser checks can walk around
 * (browsers refuse pointer lock to automated or unfocused windows). Never active in production.
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
  /** Pause for a reader or choice screen. */
  openReader: () => void;
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
  };
  const onLock = (event: LockEvent): void => {
    setScreen(screenAfter(event, reading));
    // A late 'locked' (requested by a closed reader) while another reader is open: stay paused.
    if (event === 'locked' && reading) player.unlock();
    if (screen === 'game') app.overlay.closePanel();
    if (screen === 'pause-menu') showMenu();
  };
  const player = createPlayer(
    app.stage.camera,
    app.stage.renderer.domElement,
    app.keys,
    onLock,
    NO_LOCK,
  );
  const lock = (): void => (NO_LOCK ? onLock('locked') : player.lock());
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
    openReader: () => {
      reading = true;
      setScreen('reader');
      player.unlock();
    },
    closeReader: () => {
      reading = false;
      lock();
    },
    dispose: () => {
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
  const read = (pages: readonly string[], onDone?: () => void): void => {
    gate.openReader();
    showPages(app.overlay, pages, () => {
      gate.closeReader();
      onDone?.();
    });
  };
  const choose = (text: string, labels: readonly string[], focus = 0): Promise<number> =>
    new Promise((resolve) => {
      gate.openReader();
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
  const hold = (): void => gate.openReader();
  const finish = (): void => {
    hold(); // freeze input so the pause menu can't open during the fade
    void app.overlay.fade(true).then(leave);
  };
  return {
    context(dream) {
      current = dream;
      const { stage, overlay, audio, keys } = app;
      const { player, isPaused } = gate;
      return { stage, overlay, audio, keys, player, isPaused, read, choose, hold, finish };
    },
    cleanUp,
    begin: () => read(info.intro, () => current?.begin?.()),
  };
}
