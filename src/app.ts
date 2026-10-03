import * as THREE from 'three/webgpu';
import { loadDream } from './dreams/load';
import type { DreamInfo } from './dreams/types';
import type { AudioBus } from './engine/audio';
import type { KeyState } from './engine/input';
import { screenAfter, type LockEvent, type Screen } from './engine/lock';
import { showPages, showPauseMenu } from './engine/menus';
import { createPlayer } from './engine/player';
import type { Settings } from './engine/settings';
import type { Stage } from './engine/stage';
import type { Overlay } from './engine/ui';

export interface App {
  stage: Stage;
  overlay: Overlay;
  audio: AudioBus;
  keys: KeyState;
  settings: Settings;
  saveSettings(settings: Settings): void;
}

/**
 * Dev-only `?nolock`: play without Pointer Lock so automated browser checks can walk around
 * (browsers refuse pointer lock to automated or unfocused windows). Never active in production.
 */
const NO_LOCK = import.meta.env.DEV && new URLSearchParams(location.search).has('nolock');

/**
 * Loads and runs a dream with the shared player, pause menu and paged reader.
 * Resolves to an error message, or null once the dream is running.
 */
export async function runDream(
  app: App,
  info: DreamInfo,
  onQuit: () => void,
): Promise<string | null> {
  const result = await loadDream(info);
  if (!result.ok) return result.message;
  const { dream } = result;
  let screen: Screen = 'reader';
  let reading = false;
  const onLock = (event: LockEvent): void => {
    screen = screenAfter(event, reading);
    if (screen === 'game') app.overlay.closePanel();
    if (screen === 'pause-menu') showMenu();
  };
  const player = createPlayer(app.stage.camera, app.stage.renderer.domElement, app.keys, onLock);
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
  const cleanUp = (): void => {
    removeEventListener('keydown', onEscape);
    stopMove();
    dream.dispose();
    player.dispose();
    app.overlay.closePanel();
    app.stage.scene = new THREE.Scene();
  };
  const leave = (): void => {
    cleanUp();
    onQuit();
  };
  const showMenu = (): void =>
    showPauseMenu(app.overlay, {
      title: info.title,
      howToPlay: info.howToPlay,
      settings: app.settings,
      onResume: lock,
      onSettings: (settings) => {
        app.saveSettings(settings);
        player.setSensitivity(app.settings.sensitivity);
      },
      onQuit: leave,
    });
  const read = (pages: readonly string[]): void => {
    reading = true;
    screen = 'reader';
    player.unlock();
    showPages(app.overlay, pages, () => {
      reading = false;
      lock();
    });
  };
  try {
    await dream.start({
      stage: app.stage,
      overlay: app.overlay,
      audio: app.audio,
      keys: app.keys,
      player,
      read,
      isPaused: () => screen !== 'game',
    });
  } catch {
    // A model or sound failed to download: back to the dream cards with a message.
    cleanUp();
    return `Couldn't start "${info.title}". Check your internet connection and try again.`;
  }
  await app.overlay.fade(false);
  read(info.intro);
  return null;
}
