import { runDream, type App } from './app';
import { createAudioBus } from './engine/audio';
import { isDesktop } from './engine/device';
import { KeyState } from './engine/input';
import { showMessage, showUnsupported } from './engine/menus';
import { browserStorage, createSaveStore } from './engine/save';
import { clampSettings, isSettings, loadSettings } from './engine/settings';
import { createStage, type Stage } from './engine/stage';
import { createOverlay } from './engine/ui';
import { startHome } from './home/home';
import './style.css';

async function tryStage(root: HTMLElement): Promise<Stage | null> {
  try {
    return await createStage(root);
  } catch {
    return null;
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  const overlayRoot = document.getElementById('overlay');
  if (!root || !overlayRoot) throw new Error('index.html needs #app and #overlay');
  const overlay = createOverlay(overlayRoot);
  if (!isDesktop((query) => window.matchMedia(query))) return showUnsupported(overlay);
  const stage = await tryStage(root);
  if (!stage) {
    return showMessage(
      overlay,
      "Kartik's Dreams",
      'Your browser could not start 3D graphics. Try the latest Chrome or Safari.',
    );
  }
  document.documentElement.dataset.backend = stage.backend;
  const keys = new KeyState();
  keys.attach(window);
  const store = createSaveStore(browserStorage(), 'settings', isSettings);
  const audio = createAudioBus(stage.camera);
  const app: App = {
    stage,
    overlay,
    audio,
    keys,
    settings: loadSettings(store),
    saveSettings(settings) {
      app.settings = clampSettings(settings);
      store.save(app.settings);
      audio.setVolume(app.settings.volume);
    },
  };
  audio.setVolume(app.settings.volume);
  // Dev-only handle for browser checks, e.g. `kd.stage.camera.position`.
  if (import.meta.env.DEV) Object.assign(window, { kd: app });
  const goHome = async (): Promise<void> => {
    const home = await startHome(app, async (info) => {
      const error = await runDream(app, info, () => void goHome());
      if (error === null) home.dispose();
      return error;
    });
  };
  await goHome();
}

void boot();
