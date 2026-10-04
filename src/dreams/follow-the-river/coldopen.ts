import * as THREE from 'three/webgpu';
import type { DreamContext } from '../types';
import { buildColdOpenScene, LAMP, LAMP_LIGHT, WINDOW, type ColdOpenScene } from './coldopen-scene';
import { TV_LIGHT } from './intro-scene';
import { applyLighting, LIGHTING } from './lighting';
import type { PlayerSense } from './zombies/horde';

export type ColdOpenStep = 'aerial' | 'corner' | 'window' | 'done';
export type ShotStep = Exclude<ColdOpenStep, 'done'>;

const ORDER: readonly ColdOpenStep[] = ['aerial', 'corner', 'window', 'done'];

/** Pure: the step after the current one finishes. */
export function nextColdOpenStep(step: ColdOpenStep): ColdOpenStep {
  return ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)] ?? 'done';
}

/** The caption read after each shot. */
export const COLD_OPEN_PAGES: Readonly<Record<ShotStep, readonly string[]>> = {
  aerial: ['It started on an ordinary evening.'],
  corner: ['By night, the city was not the city any more.'],
  window: ['Across the river, a TV was still on.'],
};
/** The title card, read over the first frame of the intro (its click also regains control). */
export const TITLE_PAGES: readonly string[] = ['Follow the River'];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A camera move: eased from `from` to `to` while the look target slides `lookFrom` → `lookTo`. */
export interface CameraShot {
  from: Vec3;
  to: Vec3;
  lookFrom: Vec3;
  lookTo: Vec3;
  seconds: number;
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** Shot list (metres, seconds). Tuning knobs, set by eye in the browser. */
export const SHOTS: Readonly<Record<ShotStep, CameraShot>> = {
  // Slow drift down the river at dusk, high over the embankment, the lit city to the right.
  aerial: {
    from: v(-6, 22, 20),
    to: v(-4, 18, -28),
    lookFrom: v(4, 0, -25),
    lookTo: v(2, 0, -75),
    seconds: 10,
  },
  // Street level, north of the lamp at z −26, slowly sliding left as the shamblers come up the road.
  corner: {
    from: v(-2, 1.7, -17),
    to: v(-4, 1.6, -20),
    lookFrom: v(LAMP.x + 1, 1, LAMP.z - 1),
    lookTo: v(LAMP.x + 2, 1, LAMP.z - 5),
    seconds: 12,
  },
  // From over the water, pushing in on the glowing window of the riverside house.
  window: {
    from: v(10, 3.5, WINDOW.z + 3),
    to: v(-5, WINDOW.y + 0.3, WINDOW.z + 0.5),
    lookFrom: v(WINDOW.x, WINDOW.y, WINDOW.z),
    lookTo: v(WINDOW.x, WINDOW.y, WINDOW.z),
    seconds: 8,
  },
};

/** Sound cues (seconds into a shot) and levels. Tuning knobs. */
export const CUES = {
  /** A siren far away: the car alarm, quiet, in the aerial shot. */
  siren: { at: 2, volume: 0.12 },
  /** The car alarm going off at the corner. */
  alarm: { at: 5, volume: 0.6 },
  wind: 0.25,
} as const;

/** Where the shamblers start (x, z), the one that staggers up first, and where they all head. */
export const SHAMBLERS = {
  stagger: { x: LAMP.x + 1, z: LAMP.z - 1.5 },
  walkers: [v(-9, 0, -34), v(-5, 0, -38), v(-7.5, 0, -41), v(-3.5, 0, -36)],
  /** Far up the road behind the camera: they never arrive, so they never strike. */
  goal: { x: -6, z: 12 },
  tuning: { sight: 60, speed: 1.2, giveUp: 200 },
} as const;

/** Between shots: a quick dip to black. */
const CUT_MS = 500;
/** Presses within this long after a page closes are the page's own key, not a skip. */
const SKIP_GRACE = 0.4;
const SKIP_KEYS = ['Enter', 'NumpadEnter', 'Space'] as const;
/** The shamblers never reach anyone: nothing to do on a hit. */
const NO_HIT = (): void => undefined;

/** Pure: smoothstep ease, clamped to 0..1. */
export function ease(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

/** Pure: the camera position and look target `elapsed` seconds into a shot, written into `pos`/`look`. */
export function shotAt(shot: CameraShot, elapsed: number, pos: Vec3, look: Vec3): void {
  const k = ease(shot.seconds > 0 ? elapsed / shot.seconds : 1);
  pos.x = shot.from.x + (shot.to.x - shot.from.x) * k;
  pos.y = shot.from.y + (shot.to.y - shot.from.y) * k;
  pos.z = shot.from.z + (shot.to.z - shot.from.z) * k;
  look.x = shot.lookFrom.x + (shot.lookTo.x - shot.lookFrom.x) * k;
  look.y = shot.lookFrom.y + (shot.lookTo.y - shot.lookFrom.y) * k;
  look.z = shot.lookFrom.z + (shot.lookTo.z - shot.lookFrom.z) * k;
}

export interface ColdOpen {
  dispose(): void;
}

interface Wait {
  pred: () => boolean;
  resolve: () => void;
}

/** Mutable state of the running cold open. */
interface State {
  cancelled: boolean;
  skipped: boolean;
  time: number;
  shot: CameraShot | null;
  elapsed: number;
  grace: number;
  /** The game was paused last frame (a menu was open). */
  paused: boolean;
  wait: Wait | null;
  wind: THREE.Audio | null;
  sting: THREE.Audio | null;
}

const until = (st: State, pred: () => boolean): Promise<void> =>
  new Promise((resolve) => {
    st.wait = { pred, resolve };
  });

/** Reads pages; resolves when they close. Sets `st.skipped` when the player pressed Skip. */
function read(ctx: DreamContext, st: State, pages: readonly string[]): Promise<void> {
  return new Promise((resolve) => {
    const hooks = {
      onClose(skipped: boolean) {
        if (skipped) st.skipped = true;
      },
    };
    ctx.read(
      pages,
      () => {
        st.grace = SKIP_GRACE;
        resolve();
      },
      hooks,
    );
  });
}

/** Runs a shot: fade in, the camera move (with a sound cue), fade back to black. */
async function runShot(
  ctx: DreamContext,
  sc: ColdOpenScene,
  st: State,
  shot: CameraShot,
  cue: { at: number; volume: number } | null,
): Promise<void> {
  st.shot = shot;
  st.elapsed = 0;
  await ctx.overlay.fade(false, CUT_MS);
  if (st.cancelled) return;
  if (cue) {
    await until(st, () => st.skipped || st.elapsed >= cue.at);
    if (st.cancelled) return;
    if (!st.skipped) st.sting = ctx.audio.once(sc.sounds.alarm, cue.volume);
  }
  await until(st, () => st.skipped || st.elapsed >= shot.seconds);
  if (st.cancelled) return;
  await ctx.overlay.fade(true, CUT_MS);
  st.sting?.stop();
  st.sting = null;
}

/** The corner is the first night shot: street lamp on, the stagger figure and the shamblers placed. */
function setNight(sc: ColdOpenScene): void {
  applyLighting(sc.lights, LIGHTING.night);
  sc.lamp.intensity = LAMP_LIGHT.intensity;
  const { stagger, walkers, goal, tuning } = SHAMBLERS;
  const face = (x: number, z: number): number => Math.atan2(goal.x - x, goal.z - z);
  sc.horde.spawn(stagger.x, stagger.z, face(stagger.x, stagger.z), tuning, true);
  sc.horde.alert(stagger.x, stagger.z, 1); // it heard something: it gets up
  for (const w of walkers) sc.horde.spawn(w.x, w.z, face(w.x, w.z), tuning);
}

/** The shots and captions in order; every await is followed by a cancelled check. */
async function play(
  ctx: DreamContext,
  sc: ColdOpenScene,
  st: State,
  onDone: () => void,
): Promise<void> {
  let step: ColdOpenStep = 'aerial';
  while (step !== 'done' && !st.cancelled && !st.skipped) {
    if (step === 'corner') setNight(sc);
    if (step === 'window') sc.tvLight.intensity = TV_LIGHT.intensity;
    const cue = step === 'aerial' ? CUES.siren : step === 'corner' ? CUES.alarm : null;
    await runShot(ctx, sc, st, SHOTS[step], cue);
    if (st.cancelled) return;
    if (!st.skipped) await read(ctx, st, COLD_OPEN_PAGES[step]); // a key skip drops the caption too
    if (st.cancelled) return;
    step = nextColdOpenStep(step);
  }
  st.shot = null;
  onDone();
}

/** The camera's look target and the shamblers' "player", allocated once. */
interface Rig {
  look: THREE.Vector3;
  sense: PlayerSense;
}

/** Per unpaused frame: the clock, the skip key, the camera move, the TV flicker and the horde. */
function tick(ctx: DreamContext, sc: ColdOpenScene, st: State, dt: number, rig: Rig): void {
  const { camera } = ctx.stage;
  const { look } = rig;
  st.time += dt;
  st.grace -= dt;
  let pressed = false;
  for (const key of SKIP_KEYS) if (ctx.keys.consumePress(key)) pressed = true;
  if (pressed && st.grace <= 0) st.skipped = true;
  if (st.shot) {
    st.elapsed += dt;
    shotAt(st.shot, st.elapsed, camera.position, look);
    camera.lookAt(look.x, look.y, look.z);
    sc.lights.sky.position.set(camera.position.x, 0, camera.position.z);
  }
  if (sc.tvLight.intensity > 0) {
    const flicker = Math.abs(Math.sin(st.time * 23) * Math.sin(st.time * 7.3));
    sc.tvLight.intensity = TV_LIGHT.intensity * (1 - TV_LIGHT.flicker * flicker);
  }
  sc.horde.update(dt, rig.sense, NO_HIT);
  if (st.wait?.pred()) {
    const { resolve } = st.wait;
    st.wait = null;
    resolve();
  }
}

/** The shamblers' "player" is a spot far up the road, never lit, so they only ever walk toward it. */
function makeRig(): Rig {
  const { goal } = SHAMBLERS;
  return {
    look: new THREE.Vector3(),
    sense: {
      x: goal.x,
      z: goal.z,
      eye: new THREE.Vector3(goal.x, 1.6, goal.z),
      look: new THREE.Vector3(),
      beamOn: false,
      beamRange: 0,
      beamHalfAngle: 0,
    },
  };
}

/** Two bodies on show while the shaders compile (as the chapter does), then parked again. */
async function warmUp(ctx: DreamContext, sc: ColdOpenScene): Promise<void> {
  sc.horde.spawn(0, 0, 0, SHAMBLERS.tuning);
  sc.horde.spawn(0, 0, 0, SHAMBLERS.tuning);
  await ctx.stage.renderer.compileAsync(sc.scene, ctx.stage.camera);
  sc.horde.reset();
}

const NO_COLD_OPEN: ColdOpen = { dispose: () => undefined };

/**
 * Builds the city at dusk and plays the cold open once the game is unpaused; `onDone` after the
 * last caption, or at once on Skip. If `isCancelled()` is true once built, everything is freed.
 */
export async function runColdOpen(
  ctx: DreamContext,
  onDone: () => void,
  isCancelled: () => boolean = () => false,
): Promise<ColdOpen> {
  const sc = await buildColdOpenScene(ctx);
  if (!isCancelled()) await warmUp(ctx, sc);
  if (isCancelled()) {
    sc.dispose();
    return NO_COLD_OPEN;
  }
  const st: State = {
    cancelled: false,
    skipped: false,
    time: 0,
    shot: null,
    elapsed: 0,
    grace: SKIP_GRACE, // the key that closed the dream's own intro pages is not a skip
    paused: false,
    wait: null,
    wind: null,
    sting: null,
  };
  const rig = makeRig();
  const { camera } = ctx.stage;
  shotAt(SHOTS.aerial, 0, camera.position, rig.look); // the first frame is the first shot's
  camera.lookAt(rig.look);
  const stop = ctx.stage.addUpdater((dt) => {
    if (st.cancelled) return;
    // Keys pressed in a menu (Enter/Space on Resume) must not skip the cold open when play resumes:
    // the press that resumes lands on the same frame, so drain and ignore skips for a moment.
    if (ctx.isPaused()) {
      st.paused = true;
      return;
    }
    if (st.paused) {
      st.paused = false;
      for (const key of SKIP_KEYS) ctx.keys.consumePress(key);
      st.grace = SKIP_GRACE;
    }
    st.wind ??= ctx.audio.loop(sc.sounds.wind, CUES.wind); // first unpaused frame: audio is unlocked
    tick(ctx, sc, st, dt, rig);
  });
  ctx.stage.scene = sc.scene;
  void play(ctx, sc, st, onDone);
  return {
    dispose() {
      st.cancelled = true;
      st.wait = null;
      stop();
      st.wind?.stop();
      st.sting?.stop();
      sc.dispose();
    },
  };
}
