import '@fontsource/im-fell-english/index.css';
import '@fontsource/special-elite/index.css';
import { runDream, type App } from './app';
import { createAudioBus } from './engine/audio';
import { isDesktop } from './engine/device';
import { HIGH_PERFORMANCE_TIP, isWindows, shouldTipHighPerformance } from './engine/gpu-class';
import { KeyState } from './engine/input';
import { endBootLoader } from './engine/loader';
import { showMessage, showPages, showUnsupported } from './engine/menus';
import { browserStorage, createSaveStore } from './engine/save';
import { clampSettings, isSettings, loadSettings } from './engine/settings';
import { createStage, type Stage } from './engine/stage';
import { createOverlay, type Overlay } from './engine/ui';
import { startHome } from './home/home';
import './style.css';

const HOME_FAILED =
  "Couldn't load the bedroom. Check your internet connection and reload the page.";

async function tryStage(root: HTMLElement): Promise<Stage | null> {
  try {
    return await createStage(root);
  } catch {
    return null;
  }
}

const isSeen = (value: unknown): value is true => value === true;

/** Once, on Windows with an integrated adapter in use: how to set Chrome to High performance. Player-paced. */
async function tipHighPerformance(overlay: Overlay, stage: Stage): Promise<void> {
  const data: unknown = Reflect.get(navigator, 'userAgentData');
  const platform: unknown = data ? Reflect.get(Object(data), 'platform') : undefined;
  const windows = isWindows(
    typeof platform === 'string' ? platform : undefined,
    navigator.userAgent,
  );
  const seen = createSaveStore(browserStorage(), 'gpu-tip', isSeen);
  if (seen.load() || !shouldTipHighPerformance(windows, stage.gpuInfo)) return;
  seen.save(true);
  await new Promise<void>((done) => showPages(overlay, HIGH_PERFORMANCE_TIP, done));
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
  await tipHighPerformance(overlay, stage);
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
      stage.setGraphics(app.settings.graphics);
      stage.setMaxFps(app.settings.maxFps);
    },
  };
  audio.setVolume(app.settings.volume);
  stage.setGraphics(app.settings.graphics);
  stage.setMaxFps(app.settings.maxFps);
  // Dev-only handle for browser checks, e.g. `kd.stage.camera.position`, `await kd.perf.sample(10)`.
  if (import.meta.env.DEV) Object.assign(window, { kd: Object.assign(app, { perf: stage.perf }) });
  const goHome = async (): Promise<void> => {
    try {
      const home = await startHome(app, async (info) => {
        const error = await runDream(app, info, () => void goHome());
        if (error === null) home.dispose();
        return error;
      });
      void overlay.fade(false); // finish() left the screen black
    } catch {
      showMessage(overlay, "Kartik's Dreams", HOME_FAILED);
      await overlay.fade(false);
    }
  };
  await goHome();
}

void boot().finally(() => endBootLoader(document));
