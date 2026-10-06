import type * as THREE from 'three/webgpu';
import type { App } from '../app';
import { dreamFromSearch } from '../dreams/deepLink';
import { DREAMS } from '../dreams/registry';
import type { DreamInfo } from '../dreams/types';
import { disposeScene } from '../engine/dispose';
import { frames, gpuIdle, revealInBatches } from '../engine/frames';
import { enterFullscreen, toggleFullscreen } from '../engine/fullscreen';
import { button, el } from '../engine/ui';
import { buildBedroom } from './bedroom';
import { breathBuffer } from './breath';
import { addDreamCloud, tweenCamera } from './cloud';
import { spunAngle } from './fan';
import { nextHomeState, type HomeEvent, type HomeState } from './flow';
import { createZzz } from './zzzSprites';

/** Real frames drawn behind black before the title shows. */
const WARM_FRAMES = 3;

export interface HomeHandle {
  dispose(): void;
}

/** Starts a dream; resolves to an error message, or null once the dream is running. */
export type Play = (info: DreamInfo) => Promise<string | null>;

/** The room's shaders build behind the black the title opens from, so its first visible frame does not hitch. */
async function warmRoom(stage: App['stage'], scene: THREE.Scene): Promise<void> {
  stage.hold = true;
  try {
    stage.scene = scene;
    await stage.renderer.compileAsync(scene, stage.camera);
  } catch {
    // the first frames compile what is missing
  } finally {
    stage.hold = false;
  }
  stage.warming = true; // real frames build what compileAsync cannot (shadows, the post graph)
  await revealInBatches(stage);
  await frames(stage, WARM_FRAMES);
  await gpuIdle(stage.renderer);
  stage.warming = false;
}

export async function startHome(app: App, play: Play): Promise<HomeHandle> {
  const { stage, overlay, audio } = app;
  const room = await buildBedroom();
  stage.grade('night');
  stage.camera.position.copy(room.view.position);
  stage.camera.lookAt(room.view.target);
  await warmRoom(stage, room.scene);
  const zzz = createZzz(room.scene, room.head);
  const stopZzz = stage.addUpdater((dt) => {
    zzz.update(dt);
    room.blades.rotation.y = spunAngle(room.blades.rotation.y, dt);
  });
  let state: HomeState = 'sleeping';
  let tone: THREE.Audio | null = null;
  const send = (event: HomeEvent): boolean => {
    const next = nextHomeState(state, event);
    if (next === state) return false;
    state = next;
    return true;
  };

  const showCards = (message?: string): void => {
    overlay.panel((panel) => {
      panel.append(el('h1', '', 'Choose a dream'));
      if (message) panel.append(el('p', 'error', message));
      for (const info of DREAMS) {
        const card = button('', () => send('pick') && showWarning(info), 'card');
        card.append(
          el('strong', '', info.title),
          el('span', '', `${info.minutes} min · ${info.warnings.join(' · ')}`),
        );
        panel.append(card);
      }
      panel.append(button('Full screen on/off', toggleFullscreen, 'btn quiet'));
    });
  };

  const showWarning = (info: DreamInfo): void => {
    overlay.panel((panel) => {
      panel.append(
        el('h1', '', info.title),
        el('p', 'big', `This dream contains: ${info.warnings.join(', ')}.`),
        el('p', '', 'Headphones recommended. Play somewhere quiet.'),
        button('Enter the dream', () => void enter(info), 'btn primary'),
        button('Back', () => send('back') && showCards(), 'btn quiet'),
      );
    });
  };

  const enter = async (info: DreamInfo): Promise<void> => {
    if (!send('confirm')) return;
    overlay.closePanel();
    await overlay.fade(true);
    const stopLoading = overlay.loading('Falling asleep…'); // the moving ring, over the black fader
    const error = await play(info)
      .catch(() => `Something went wrong starting "${info.title}". Please try again.`)
      .finally(stopLoading);
    if (error === null) return void send('loaded');
    send('load-failed');
    await overlay.fade(false);
    showCards(error);
  };

  const rise = async (): Promise<void> => {
    if (!send('start')) return;
    overlay.closePanel();
    enterFullscreen();
    audio.unlock().catch(() => undefined);
    // Just the sleeper's slow breathing: the home screen should feel quiet.
    tone = audio.loop(breathBuffer(audio.listener.context), 0.12);
    const center = room.head.clone().setY(6);
    addDreamCloud(room.scene, center);
    const to = {
      position: room.head
        .clone()
        .setY(3.2)
        .setZ(room.head.z + 0.6),
      target: center,
    };
    await tweenCamera(stage, room.view, to, 3.5);
    send('risen');
    const linked = dreamFromSearch(location.search, DREAMS);
    if (linked && send('pick')) showWarning(linked);
    else showCards();
  };

  overlay.panel((panel) => {
    panel.classList.add('low');
    panel.append(
      el('h1', 'title', "Kartik's Dreams"),
      el('p', 'big', 'Every dream here really happened.'),
      button('Start', () => void rise(), 'btn primary'),
    );
  });

  return {
    dispose() {
      stopZzz();
      zzz.dispose();
      tone?.stop();
      disposeScene(room.scene);
    },
  };
}
