import * as THREE from 'three/webgpu';
import { LOAD_TIMEOUT_MS, loadDream } from './dreams/load';
import type { DreamInfo } from './dreams/types';
import type { AudioBus } from './engine/audio';
import { disposeScene } from './engine/dispose';
import type { KeyState } from './engine/input';
import { screenAfter, type LockEvent, type Screen } from './engine/lock';
import { showPages, showPauseMenu } from './engine/menus';
import { createPlayer } from './engine/player';
import type { Settings } from './engine/settings';
import type { Stage } from './engine/stage';
import { withTimeout } from './engine/time';
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
  // If the dream fails to start, put the home screen back exactly as it was.
  const homeScene = app.stage.scene;
  const homePose = app.stage.camera.matrix.clone();
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
    // A dream that failed before setting its own scene must not free the bedroom.
    if (app.stage.scene !== homeScene) disposeScene(app.stage.scene);
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
    const starting = dream.start({
      stage: app.stage,
      overlay: app.overlay,
      audio: app.audio,
      keys: app.keys,
      player,
      read,
      isPaused: () => screen !== 'game',
    });
    await withTimeout(starting, LOAD_TIMEOUT_MS);
  } catch {
    // A model or sound failed or stalled: back to the dream cards, over the bedroom, with a message.
    cleanUp();
    app.stage.scene = homeScene;
    homePose.decompose(
      app.stage.camera.position,
      app.stage.camera.quaternion,
      app.stage.camera.scale,
    );
    return `Couldn't start "${info.title}". Check your internet connection and try again.`;
  }
  await app.overlay.fade(false);
  read(info.intro);
  return null;
}
