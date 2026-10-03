import type * as THREE from 'three/webgpu';
import type { App } from '../app';
import { DREAMS } from '../dreams/registry';
import type { DreamInfo } from '../dreams/types';
import { roomToneBuffer } from '../engine/audio';
import { enterFullscreen, toggleFullscreen } from '../engine/fullscreen';
import { button, el } from '../engine/ui';
import { buildBedroom } from './bedroom';
import { addDreamCloud, tweenCamera } from './cloud';
import { nextHomeState, type HomeEvent, type HomeState } from './flow';
import { createZzz } from './zzzSprites';

export interface HomeHandle {
  dispose(): void;
}

/** Starts a dream; resolves to an error message, or null once the dream is running. */
export type Play = (info: DreamInfo) => Promise<string | null>;

export async function startHome(app: App, play: Play): Promise<HomeHandle> {
  const { stage, overlay, audio } = app;
  const room = await buildBedroom();
  stage.scene = room.scene;
  stage.camera.position.copy(room.view.position);
  stage.camera.lookAt(room.view.target);
  const zzz = createZzz(room.scene, room.head);
  const stopZzz = stage.addUpdater((dt) => zzz.update(dt));
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
    const error = await play(info);
    if (error === null) return void send('loaded');
    send('load-failed');
    await overlay.fade(false);
    showCards(error);
  };

  const rise = async (): Promise<void> => {
    if (!send('start')) return;
    overlay.closePanel();
    enterFullscreen();
    void audio.unlock();
    tone = audio.loop(roomToneBuffer(audio.listener.context), 0.25);
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
    showCards();
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
    },
  };
}
