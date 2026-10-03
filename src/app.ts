import { LOAD_TIMEOUT_MS, loadDream } from './dreams/load';
import type { DreamInfo } from './dreams/types';
import type { AudioBus } from './engine/audio';
import type { KeyState } from './engine/input';
import type { Settings } from './engine/settings';
import type { Stage } from './engine/stage';
import { withTimeout } from './engine/time';
import type { Overlay } from './engine/ui';
import { createSession } from './session';

export interface App {
  stage: Stage;
  overlay: Overlay;
  audio: AudioBus;
  keys: KeyState;
  settings: Settings;
  saveSettings(settings: Settings): void;
}

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
  const session = createSession(app, info, onQuit);
  try {
    await withTimeout(dream.start(session.context(dream)), LOAD_TIMEOUT_MS);
  } catch {
    // A model or sound failed or stalled: back to the dream cards, over the bedroom, with a message.
    session.cleanUp();
    app.stage.scene = homeScene;
    homePose.decompose(
      app.stage.camera.position,
      app.stage.camera.quaternion,
      app.stage.camera.scale,
    );
    return `Couldn't start "${info.title}". Check your internet connection and try again.`;
  }
  await app.overlay.fade(false);
  session.begin();
  return null;
}
