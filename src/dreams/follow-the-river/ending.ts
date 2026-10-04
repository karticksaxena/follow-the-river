import type * as THREE from 'three/webgpu';
import type { AreaDef } from './areas/types';
import { nightTuning } from './difficulty';
import {
  buildEndingScene,
  facing,
  retreatPoint,
  SHORE,
  stopShort,
  type EndingScene,
} from './ending-scene';
import { atSafeSpot } from './flow';
import { applyLighting, LIGHTING, mixPreset, type LightPreset } from './lighting';
import { EDGE_X } from './river';
import type { Run, Systems } from './run';
import { stopVoice, voiceFor, voiceHooks } from './voice';

export type EndingStep = 'mom' | 'fight' | 'silence' | 'dawn' | 'epilogue' | 'credits' | 'done';
type PagedStep = 'mom' | 'silence' | 'epilogue' | 'credits';

const ORDER: readonly EndingStep[] = [
  'mom',
  'fight',
  'silence',
  'dawn',
  'epilogue',
  'credits',
  'done',
];

/** Pure: the step after the current one finishes. */
export function nextEndingStep(step: EndingStep): EndingStep {
  return ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)] ?? 'done';
}

export const ENDING_PAGES: Readonly<Record<PagedStep, readonly string[]>> = {
  mom: ['Mom: "It\'s you. You followed the river."', 'Mom: "I\'m so sorry. For all of it."'],
  silence: ['Mom: "It held on for us. It held on for you."', 'Mom: "We made it. Because of it."'],
  epilogue: [
    'The sky goes pale over the dam. Nothing moves on the bank.',
    'Somewhere under the still water, a great black shape is resting at last.',
    'You are alive. You will not forget what it cost.',
    'You never saw it again. You are not sure you were ever meant to.',
  ],
  credits: [
    "Kartik's Dreams — Follow the River",
    'A dream by Kartik',
    'Art and sound: Kenney, Quaternius and OpenGameArt contributors (CC0)',
    'Made with three.js',
  ],
};

/** The pages of the ending with no scene behind them ("Watch the ending again"). */
export const REPLAY_PAGES: readonly string[] = [...ENDING_PAGES.epilogue, ...ENDING_PAGES.credits];

/** Tuning knobs (metres, seconds). */
export const WAVE = {
  count: 12,
  /** Zombies per spawn group, and the pause between groups. */
  group: 4,
  gap: 3,
  /** How long the orca keeps striking before its last lunge. */
  seconds: 25,
  /** Strikes the orca is armed with: far more than the wave has zombies. */
  strikes: 99,
  /** Its last stand: seconds between strikes (a normal night 1.4) and reach from the water (3.5). */
  orcaCooldown: 0.6,
  orcaReach: 7,
  /** Upstream of the player (+z), and the spread between lanes along the bank (m). */
  upstream: 34,
  laneGap: 1.5,
  laneStep: 2,
  /** The whole wave keeps hearing the player (m), so nobody gives up the hunt mid-fight. */
  hearing: 60,
} as const;
export const DAWN = { seconds: 8, step: 0.25, volume: 0.35 } as const;
const CRY_VOLUME = 0.8;
const FLINCH = { lookUp: 12 } as const; // m up the bank Mom watches during the fight

/** How many zombies of the wave should exist `elapsed` seconds in (all of them once the last group is due). */
export function waveDue(elapsed: number): number {
  return Math.min(WAVE.count, (Math.floor(Math.max(0, elapsed) / WAVE.gap) + 1) * WAVE.group);
}

/** Where wave zombie `i` appears, relative to the player's z: a lane along the river bank. */
export function waveSpot(i: number, playerZ: number): { x: number; z: number } {
  const lane = i % WAVE.group;
  return { x: EDGE_X - 1 - lane * WAVE.laneGap, z: playerZ + WAVE.upstream + lane * WAVE.laneStep };
}

/** How the night ends at depth `z`: the safe spot, the lake shore (Night 3), or not yet. */
export function nightEnd(
  area: Pick<AreaDef, 'safeZ' | 'endingAt'>,
  z: number,
): 'safe' | 'ending' | null {
  const at = area.endingAt;
  // A line across the whole bank, not a circle: hugging the water must not miss Mom.
  if (at) return z <= at.z + at.radius ? 'ending' : null;
  return atSafeSpot(z, area.safeZ) ? 'safe' : null;
}

export interface Ending {
  /** Begins the ending (once); gameplay keeps running for the wave. */
  start(): void;
  /** Per frame, while gameplay ticks. Does nothing while paused or cancelled. */
  update(dt: number): void;
  /** The player died mid-wave: stand everything down so the night can restart. */
  cancel(): void;
  dispose(): void;
}

export interface EndingHost {
  sys: Systems;
  run: Run;
  lantern: THREE.PointLight;
  /** Writes the `end` save (called once the wave is won). */
  persist: () => void;
}

export const NO_ENDING: Ending = {
  start: () => undefined,
  update: () => undefined,
  cancel: () => undefined,
  dispose: () => undefined,
};

interface Wait {
  /** Called each unpaused frame; true ends the wait. */
  pred: (dt: number) => boolean;
  resolve: () => void;
}

/** Mutable state of the running ending. */
interface State {
  started: boolean;
  cancelled: boolean;
  wait: Wait | null;
  scene: EndingScene | null;
  pad: { stop(): unknown; setVolume(v: number): unknown; disconnect(): unknown } | null;
}

const until = (st: State, pred: Wait['pred']): Promise<void> =>
  new Promise((resolve) => {
    st.wait = { pred, resolve };
  });

/** Fade to black, clear the bank, put Mom on the shore, turn to her, fade back in. */
async function setUp(h: EndingHost, st: State): Promise<void> {
  const { ctx, horde } = h.sys;
  h.run.ending = 'fight';
  h.run.frozen = true;
  ctx.hold();
  await ctx.overlay.fade(true);
  if (st.cancelled) return;
  horde.reset();
  const scene = st.scene ?? (await buildEndingScene(h.sys));
  if (st.cancelled) return scene.dispose();
  st.scene = scene;
  const cam = ctx.stage.camera.position;
  scene.place(cam.x, cam.z, h.lantern);
  const mom = h.sys.area.meetAt;
  if (mom) ctx.player.teleport(cam.x, cam.z, facing(cam.x, cam.z, mom.x, mom.z) + Math.PI);
  await ctx.stage.renderer.compileAsync(h.sys.world.scene, ctx.stage.camera);
  if (st.cancelled) return;
  await ctx.overlay.fade(false);
  if (st.cancelled) return;
  h.run.frozen = false;
}

const read = (h: EndingHost, pages: readonly string[]): Promise<void> =>
  new Promise((resolve) => {
    const { ctx } = h.sys;
    ctx.read(
      pages,
      resolve,
      voiceHooks(ctx.audio, (page) => voiceFor(page, 'scene')),
    );
  });

/** Spawns every wave zombie that is due and has not appeared yet; they come running. */
function spawnWave(h: EndingHost, spawned: { n: number }, elapsed: number): void {
  const { horde, ctx } = h.sys;
  const cam = ctx.stage.camera.position;
  const tuning = nightTuning(h.sys.area.chapter);
  for (; spawned.n < waveDue(elapsed); spawned.n++) {
    const at = waveSpot(spawned.n, cam.z);
    const yaw = Math.atan2(cam.x - at.x, cam.z - at.z);
    if (horde.spawn(at.x, at.z, yaw, tuning) >= 0) horde.alert(at.x, at.z, 1);
  }
}

/** Mom backs toward the water (kept on the pebbles) and watches the bank. */
function backOff(h: EndingHost, st: State): void {
  const { meetAt: mom, lake } = h.sys.area;
  if (!st.scene || !mom || !lake) return;
  const cam = h.sys.ctx.stage.camera.position;
  const { actor } = st.scene;
  void actor.walkTo([retreatPoint(mom, lake.z)]).then(() => {
    if (!st.cancelled) actor.faceTo(cam.x, cam.z + FLINCH.lookUp);
  });
}

/** The wave, the orca's strikes, its last lunge and its sinking. Resolves when it is gone. */
async function fight(h: EndingHost, st: State): Promise<void> {
  const { fish, horde, ctx, sounds } = h.sys;
  const cam = ctx.stage.camera.position;
  const spawned = { n: 0 };
  let t = 0;
  let left: number = WAVE.strikes;
  backOff(h, st);
  fish.arm(WAVE.strikes, WAVE.orcaCooldown, WAVE.orcaReach);
  await until(st, (dt) => {
    t += dt;
    if (fish.strikes < left) {
      left = fish.strikes;
      st.scene?.mom.play('HitRecieve', true); // the orca struck: she flinches
    }
    spawnWave(h, spawned, t);
    horde.alert(cam.x, cam.z, WAVE.hearing);
    return t >= WAVE.seconds;
  });
  if (st.cancelled) return;
  fish.lastLunge(horde, cam);
  await until(st, () => fish.finale === 'sink');
  if (st.cancelled) return;
  ctx.audio.once(sounds.orcaCry, CRY_VOLUME);
  horde.forEachAlive((id) => horde.takeByFish(id)); // the water takes the rest
  await until(st, () => fish.finale === 'gone');
}

/** Night 3's own night: the area's tighter fog, as `setFogFar` left it. Built once per dawn. */
function nightPreset(area: AreaDef): LightPreset {
  const { night } = LIGHTING;
  return { ...night, fog: { ...night.fog, far: area.nightFog ?? night.fog.far } };
}

/** Night to dawn over `DAWN.seconds`, the pad swelling in with it. */
async function dawn(h: EndingHost, st: State): Promise<void> {
  const { world, ctx, sounds } = h.sys;
  const pad = ctx.audio.loop(sounds.dawn, 0);
  st.pad = pad;
  const from = nightPreset(h.sys.area);
  let t = 0;
  let nextPaint = 0;
  let turned = false;
  const lake = h.sys.area.lake;
  const mom = st.scene?.mom.group.position;
  if (lake && mom) st.scene?.actor.faceTo(mom.x, lake.z - 10); // looks out over the water
  await until(st, (dt) => {
    t += dt;
    if (!turned && t >= DAWN.seconds / 2) {
      turned = true;
      const cam = ctx.stage.camera.position;
      st.scene?.actor.faceTo(cam.x, cam.z); // then back to you
    }
    const k = Math.min(1, t / DAWN.seconds);
    pad.setVolume(DAWN.volume * k);
    if (t >= nextPaint || k >= 1) {
      nextPaint = t + DAWN.step;
      applyLighting(world.lights, mixPreset(from, LIGHTING.dawn, k));
    }
    return k >= 1;
  });
}

/** Mom walks to the player, stops `SHORE.meet` m short and faces them. */
async function comeToPlayer(h: EndingHost, st: State): Promise<void> {
  const actor = st.scene?.actor;
  if (!actor || !st.scene) return;
  const cam = h.sys.ctx.stage.camera.position;
  const at = stopShort(st.scene.mom.group.position, cam, SHORE.meet);
  await actor.walkTo([at]);
  if (!st.cancelled) actor.faceTo(cam.x, cam.z);
}

/** The whole ending, step by step; every await is followed by a cancelled check. */
async function play(h: EndingHost, st: State): Promise<void> {
  const { ctx, flashlight } = h.sys;
  let step: EndingStep = 'mom';
  await setUp(h, st);
  while (step !== 'done' && !st.cancelled) {
    if (step === 'mom') await read(h, ENDING_PAGES.mom);
    else if (step === 'fight') await fight(h, st);
    else if (step === 'silence') {
      h.run.ending = 'calm';
      flashlight.on = false;
      h.persist(); // the wave is won: from here the run is saved as finished
      h.sys.horde.reset();
      await comeToPlayer(h, st);
      if (st.cancelled) return;
      await read(h, ENDING_PAGES.silence);
    } else if (step === 'dawn') await dawn(h, st);
    else if (step === 'epilogue') await read(h, ENDING_PAGES.epilogue);
    else await read(h, ENDING_PAGES.credits);
    step = nextEndingStep(step);
  }
  if (!st.cancelled) ctx.finish();
}

function stopPad(st: State): void {
  if (!st.pad) return;
  st.pad.stop();
  st.pad.disconnect();
  st.pad = null;
}

const freshState = (scene: EndingScene | null): State => ({
  started: false,
  cancelled: false,
  wait: null,
  scene,
  pad: null,
});

export function createEnding(h: EndingHost): Ending {
  let st = freshState(null);
  const stand = (): void => {
    st.cancelled = true; // the running `play` sees this after its next await and stops
    st.wait = null;
    stopPad(st);
    stopVoice();
  };
  return {
    start() {
      if (st.started) return;
      st.started = true;
      void play(h, st);
    },
    update(dt) {
      if (!st.started || st.cancelled || h.sys.ctx.isPaused()) return;
      st.scene?.update(dt);
      if (st.wait?.pred(dt)) {
        const { resolve } = st.wait;
        st.wait = null;
        resolve();
      }
    },
    cancel() {
      if (!st.started) return;
      stand();
      h.run.ending = 'no';
      st.scene?.remove(h.lantern);
      st = freshState(st.scene); // Mom stays built; reaching the shore again starts over
    },
    dispose() {
      stand();
      st.scene?.dispose();
      st.scene = null;
    },
  };
}
