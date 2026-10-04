import { disposeScene } from '../../engine/dispose';
import type { DreamContext } from '../types';
import { createHud, type Hud } from './hud';
import {
  AT,
  buildIntroScene,
  MOM_PATH,
  OUTSIDE_COLLIDERS,
  REACH,
  ROOM_COLLIDERS,
  TV_LIGHT,
  YAW_EAST,
  YAW_TO_TV,
  type IntroScene,
} from './intro-scene';
import { applyDim, LIGHTING } from './lighting';
import { createMomActor, TURN_RATE, wrapAngle, type MomActor } from './mom-actor';
import { introVoice, stopVoice, voiceHooks } from './voice';

export type IntroStep =
  'news' | 'mom-leaves' | 'mom-back' | 'outside' | 'throw' | 'goodbye' | 'done';
type ActiveStep = Exclude<IntroStep, 'done'>;

const ORDER: readonly IntroStep[] = [
  'news',
  'mom-leaves',
  'mom-back',
  'outside',
  'throw',
  'goodbye',
  'done',
];

/** Pure: the next step after the player finishes the current step's pages. */
export function nextIntroStep(step: IntroStep): IntroStep {
  return ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)] ?? 'done';
}

export const INTRO_PAGES: Readonly<Record<ActiveStep, readonly string[]>> = {
  news: [
    'BREAKING NEWS - An unknown infection is spreading through the city.',
    '"…patients become violent within hours. Hospitals are not accepting new cases…"',
    '"…residents are urged to stay indoors and lock their doors…"',
  ],
  'mom-leaves': [
    'Mom: "No. No, no, no. That\'s… I know what that is."',
    'Mom: "Stay here. Lock the door. I\'m going to the store. I\'ll be right back."',
  ],
  'mom-back': ['An hour later.', 'Mom: "Come with me. Now. To the river. Don\'t ask."'],
  outside: ['Mom is holding a pack of fish from the store. Her hands are shaking.'],
  throw: [
    'Mom: "Here, Dras. Here, girl."',
    'Something enormous moves under the water. Black and white. She takes the fish and is gone.',
  ],
  goodbye: [
    'Mom: "She knows me. She will know you."',
    'Mom: "Listen to me. Whatever happens, run. Always follow the river."',
    'Mom: "Feed her, and she will keep you safe at night. Go!"',
    'She lifts her phone and starts filming the water. You hear her whisper: "What have we done…"',
  ],
};

export interface Intro {
  dispose(): void;
}

const THROW_DELAY = 0.7; // Mom's wind-up before the pack leaves her hand
const TAKE_WAIT = 3.5; // pack flight + splash + the orca rising and sinking, watched unpaused
const FILM_HOLD = 1.5; // Mom raises her phone before the last page
const TURN_WAIT = 0.4; // Mom turns to face you before she speaks (~90% of the turn at TURN_RATE)
const LOOK_TIME = 1.2; // the camera eases toward the water this long when the pack is thrown
const WATER_VOLUME = 0.4;
const HAND_REACH = 0.4;
const HAND_HEIGHT = 1.2;
const WATER_GLANCE = { x: AT.momRiver.x + 3, z: 0 }; // out over the river

interface Spot {
  at: { x: number; z: number };
  reach: number;
  prompt: string;
  hint: string;
}

/** Mutable state of the running intro. */
interface State {
  step: IntroStep;
  inside: boolean;
  busy: boolean;
  disposed: boolean;
  time: number;
  /** Seconds left of easing the camera toward the river. */
  look: number;
  waitLeft: number;
  waitDone: (() => void) | null;
  water: { stop(): unknown } | null;
}

function makeSpots(sc: IntroScene): Record<ActiveStep, Spot> {
  const mom = (prompt: string, hint: string): Spot => ({
    at: sc.mom.group.position, // world position (Mom lives directly in the scene)
    reach: REACH.mom,
    prompt,
    hint,
  });
  return {
    news: {
      at: AT.tv,
      reach: REACH.tv,
      prompt: 'E: watch the news',
      hint: 'Walk to the TV: W A S D to move, mouse to look',
    },
    'mom-leaves': mom('E: talk to Mom', 'Go to Mom'),
    'mom-back': mom('E: talk to Mom', 'Go to Mom'),
    outside: {
      at: AT.door,
      reach: REACH.door,
      prompt: 'E: go outside',
      hint: 'Go to the front door',
    },
    throw: mom('E: stand with Mom', 'Go to Mom, by the water'),
    goodbye: mom('', ''),
  };
}

interface Io {
  read: (pages: readonly string[]) => Promise<void>;
  wait: (seconds: number) => Promise<void>;
  fade: (toBlack: boolean) => Promise<void>;
}

function makeIo(ctx: DreamContext, st: State): Io {
  return {
    // Stray-style: Mom and the TV anchor 'speak' each line without words.
    read: (pages) =>
      new Promise((resolve) => ctx.read(pages, resolve, voiceHooks(ctx.audio, introVoice))),
    wait: (seconds) =>
      new Promise((resolve) => {
        st.waitLeft = seconds;
        st.waitDone = resolve;
      }),
    fade: (toBlack) => ctx.overlay.fade(toBlack),
  };
}

function goOutside(ctx: DreamContext, sc: IntroScene, st: State): void {
  st.inside = false;
  sc.tvLight.intensity = 0;
  applyDim(sc.lights, LIGHTING.dusk, 0);
  ctx.player.setColliders(OUTSIDE_COLLIDERS);
  ctx.player.teleport(AT.spawnRiver.x, AT.spawnRiver.z, YAW_EAST);
  sc.mom.group.position.set(AT.momRiverStart.x, 0, AT.momRiverStart.z);
  st.water = ctx.audio.loop(sc.sounds.water, WATER_VOLUME);
}

type Actions = Record<ActiveStep, () => Promise<void>>;
type Part<K extends ActiveStep> = Pick<Actions, K>;

/** Mom turns to face the player, then speaks: a short unpaused beat so the turn shows. */
async function turnAndRead(
  st: State,
  actor: MomActor,
  io: Io,
  cam: { x: number; z: number },
  pages: readonly string[],
): Promise<void> {
  actor.faceTo(cam.x, cam.z);
  await io.wait(TURN_WAIT);
  if (st.disposed) return;
  await io.read(pages);
}

/** The living room: the news, Mom leaving through the door and coming back an hour later. */
function houseActions(
  ctx: DreamContext,
  sc: IntroScene,
  st: State,
  actor: MomActor,
  io: Io,
): Part<'news' | 'mom-leaves' | 'mom-back'> {
  const { read, fade } = io;
  const { mom } = sc;
  const cam = ctx.stage.camera.position;
  return {
    news: () => read(INTRO_PAGES.news),
    'mom-leaves': async () => {
      actor.stop();
      await turnAndRead(st, actor, io, cam, INTRO_PAGES['mom-leaves']);
      if (st.disposed) return;
      await actor.walkTo(MOM_PATH.out);
      if (st.disposed) return;
      mom.group.visible = false;
      await fade(true);
      if (st.disposed) return;
      mom.pack.visible = true;
      await fade(false);
      if (st.disposed) return;
      await read(INTRO_PAGES['mom-back'].slice(0, 1)); // "An hour later."
      if (st.disposed) return;
      mom.group.visible = true;
      await actor.walkTo(MOM_PATH.in);
      if (st.disposed) return;
      actor.faceTo(cam.x, cam.z);
      actor.idleTense([cam, AT.tv]);
    },
    'mom-back': () => read(INTRO_PAGES['mom-back'].slice(1)),
  };
}

/** Mom walks the last steps to the edge and throws; the orca takes the pack (unpaused). */
async function throwAction(sc: IntroScene, st: State, actor: MomActor, io: Io): Promise<void> {
  const { mom } = sc;
  actor.stop();
  await io.read(INTRO_PAGES.throw.slice(0, 1)); // "Here, girl." — then the beat plays unpaused
  if (st.disposed) return;
  st.look = LOOK_TIME;
  await actor.walkTo([AT.momRiver]); // the last steps
  if (st.disposed) return;
  mom.play('Interact', true);
  await io.wait(THROW_DELAY);
  if (st.disposed) return;
  mom.pack.visible = false;
  const { x, z } = mom.group.position;
  sc.fish.feed({ x: x + HAND_REACH, y: HAND_HEIGHT, z });
  await io.wait(TAKE_WAIT);
  if (st.disposed) return;
  await io.read(INTRO_PAGES.throw.slice(1));
}

/** The riverbank: Mom walks ahead to the water, feeds the orca, films it. */
function riverActions(
  ctx: DreamContext,
  sc: IntroScene,
  st: State,
  actor: MomActor,
  io: Io,
): Part<'outside' | 'throw' | 'goodbye'> {
  const { read, wait, fade } = io;
  const { mom } = sc;
  const cam = ctx.stage.camera.position;
  return {
    outside: async () => {
      await fade(true);
      if (st.disposed) return;
      goOutside(ctx, sc, st);
      actor.faceTo(AT.momRiver.x, AT.momRiver.z);
      actor.idleTense([WATER_GLANCE, cam]); // first beat lands well after the fade
      await fade(false);
      if (st.disposed) return;
      await read(INTRO_PAGES.outside);
      if (st.disposed) return;
      await actor.walkTo([AT.momRiverNear]);
    },
    throw: () => throwAction(sc, st, actor, io),
    goodbye: async () => {
      await turnAndRead(st, actor, io, cam, INTRO_PAGES.goodbye.slice(0, 3));
      if (st.disposed) return;
      await actor.walkTo([AT.momRiverBack]); // backs off a step
      if (st.disposed) return;
      actor.faceTo(AT.momRiver.x + 1, AT.momRiver.z); // back to the water, phone up
      mom.play('Idle_Gun_Pointing');
      await wait(FILM_HOLD);
      if (st.disposed) return;
      await read(INTRO_PAGES.goodbye.slice(3));
    },
  };
}

function makeActions(ctx: DreamContext, sc: IntroScene, st: State, actor: MomActor): Actions {
  const io = makeIo(ctx, st);
  return { ...houseActions(ctx, sc, st, actor, io), ...riverActions(ctx, sc, st, actor, io) };
}

/** Runs the current step, then the next; after `throw` the goodbye follows straight away. */
function makePerform(actions: Actions, st: State, hud: Hud, onDone: () => void) {
  return async (current: ActiveStep): Promise<void> => {
    st.busy = true;
    hud.prompt(null);
    await actions[current]();
    if (st.disposed) return;
    st.step = nextIntroStep(current);
    if (st.step === 'goodbye') {
      await actions.goodbye();
      if (st.disposed) return;
      st.step = 'done';
      onDone();
    }
    st.busy = false;
  };
}

/** Per-frame motion: Mom, the TV picture and flicker, the orca, and the timed waits. */
function makeTick(
  sc: IntroScene,
  st: State,
  actor: MomActor,
  camera: { position: { x: number; z: number }; rotation: { y: number } },
) {
  const cam = camera.position;
  return (dt: number): void => {
    st.time += dt;
    actor.update(dt);
    sc.mom.update(dt);
    if (st.look > 0) {
      st.look -= dt;
      const ease = 1 - Math.exp(-TURN_RATE * dt);
      camera.rotation.y += wrapAngle(YAW_EAST - camera.rotation.y) * ease;
    }
    if (st.inside) {
      sc.news.update(st.time);
      const flicker = Math.abs(Math.sin(st.time * 23) * Math.sin(st.time * 7.3));
      sc.tvLight.intensity = TV_LIGHT.intensity * (1 - TV_LIGHT.flicker * flicker);
    } else sc.fish.update(dt, cam, null, false);
    if (!st.waitDone) return;
    st.waitLeft -= dt;
    if (st.waitLeft > 0) return;
    const resolve = st.waitDone;
    st.waitDone = null;
    resolve();
  };
}

function freeIntroScene(sc: IntroScene): void {
  stopVoice(); // a voiced page may still be playing when the intro is torn down
  sc.fish.dispose();
  sc.mom.dispose();
  sc.news.dispose();
  disposeScene(sc.scene);
}

const NO_INTRO: Intro = { dispose: () => undefined };

/**
 * Builds the house and riverbank at dusk and runs the intro; `onDone` when Mom sends you off.
 * If `isCancelled()` is true once the scene is built, it is freed and nothing else is touched.
 */
export async function runIntro(
  ctx: DreamContext,
  onDone: () => void,
  isCancelled: () => boolean = () => false,
): Promise<Intro> {
  const sc = await buildIntroScene(ctx);
  if (isCancelled()) {
    freeIntroScene(sc);
    return NO_INTRO;
  }
  const hud = createHud(ctx.overlay.root);
  const cam = ctx.stage.camera.position;
  const st: State = {
    step: 'news',
    inside: true,
    busy: false,
    disposed: false,
    time: 0,
    look: 0,
    waitLeft: 0,
    waitDone: null,
    water: null,
  };
  const actor = createMomActor(sc.mom);
  actor.idleTense(MOM_PATH.glances);
  actor.pace(MOM_PATH.pace, MOM_PATH.paceDwell);
  const spots = makeSpots(sc);
  const perform = makePerform(makeActions(ctx, sc, st, actor), st, hud, onDone);
  const tick = makeTick(sc, st, actor, ctx.stage.camera);

  const stop = ctx.stage.addUpdater((dt) => {
    const pressed = ctx.keys.consumePress('KeyE');
    sc.lights.sky.position.set(cam.x, 0, cam.z);
    if (ctx.isPaused() || st.disposed) return; // frozen while pages / the pause menu are open
    tick(dt);
    if (st.busy || st.step === 'done') return;
    const spot = spots[st.step];
    const near = Math.hypot(cam.x - spot.at.x, cam.z - spot.at.z) <= spot.reach;
    hud.prompt(near ? spot.prompt : spot.hint);
    if (near && pressed) void perform(st.step);
  });

  ctx.player.setColliders(ROOM_COLLIDERS);
  ctx.player.teleport(AT.spawnRoom.x, AT.spawnRoom.z, YAW_TO_TV);
  ctx.stage.scene = sc.scene;
  ctx.grade('dusk');

  return {
    dispose() {
      st.disposed = true;
      stop();
      actor.stop();
      st.water?.stop();
      hud.dispose();
      freeIntroScene(sc);
    },
  };
}
