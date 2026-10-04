import type * as THREE from 'three/webgpu';
import { precompileSky } from '../../engine/sky';
import type { AreaDef } from './areas/types';
import { playCanoeRide } from './canoe-ride';
import { createDawn, DAWN } from './dawn';
import { DIFFICULTY, nightTuning } from './difficulty';
import {
  FAREWELL_PAGES,
  goToIt,
  hand,
  lastPack,
  loadPackOnWater,
  shoreFor,
  song,
  strand,
  type Bed,
  type Script,
  type Shore,
} from './ending-farewell';
import {
  buildEndingScene,
  facing,
  retreatPoint,
  SHORE,
  stopShort,
  type EndingScene,
} from './ending-scene';
import { atSafeSpot } from './flow';
import { LIGHTING, type LightPreset } from './lighting';
import { sicknessAt } from './orca-sick';
import { EDGE_X } from './river';
import type { Run, Systems } from './run';
import { addSupply, AMMO_OF, SUPPLY_LIMITS, type SupplyKind } from './state';
import { stopVoice, voiceFor, voiceHooks } from './voice';

export type EndingStep =
  'mom' | 'fight' | 'strand' | 'song' | 'hand' | 'pack' | 'dawn' | 'ride' | 'credits' | 'done';
type PagedStep = 'mom' | 'home' | 'credits';

const ORDER: readonly EndingStep[] = [
  'mom',
  'fight',
  'strand',
  'song',
  'hand',
  'pack',
  'dawn',
  'ride',
  'credits',
  'done',
];

/** Pure: the step after the current one finishes. */
export function nextEndingStep(step: EndingStep): EndingStep {
  return ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)] ?? 'done';
}

export const ENDING_PAGES: Readonly<Record<PagedStep, readonly string[]>> = {
  mom: [
    'Mom: "It\'s you. You followed the river."',
    'Mom: "I\'m so sorry. For all of it."',
    'Mom: "They\'re coming, all of them. Take this, and stay by the water. Dras will fight with us."',
  ],
  home: ['Mom: "Come on. Let\'s go home."'],
  credits: [
    "Kartik's Dreams - Follow the River",
    'A dream by Kartik',
    'Art: Kenney and Quaternius (CC0)',
    'Sound: OpenGameArt and Freesound contributors (CC0), U.S. National Park Service recordings (public domain)',
    'Made with three.js',
  ],
};

/** The pages of the ending with no scene behind them ("Watch the ending again"). */
export const REPLAY_PAGES: readonly string[] = [
  'Dras lies on the pebbles below the dam, where she held them back.',
  'Mom rows you down the river into the green. Something small swims beside the canoe.',
  ...ENDING_PAGES.credits,
];

/** Tuning knobs (metres, seconds). */
export const WAVE = {
  /** A horde too big for you alone (Plan 7): you fight it beside the orca. */
  count: 30,
  /** Zombies per spawn group, and the pause between groups. */
  group: 5,
  gap: 3.5,
  /** The fight ends when the horde is dead, or after this long (the orca's last leap takes the rest). */
  seconds: 75,
  /** Strikes the orca is armed with: far more than the wave has zombies. */
  strikes: 99,
  /**
   * Its last stand (a normal night: 1.1 s apart, 4.5 m, pace 1, no sweep): grabs close together,
   * further up the bank, quicker, and its body knocks the zombies beside its jaws into the river.
   */
  orca: { cooldown: 0.4, reach: 7, pace: 0.6, sweep: 2.5 },
  /** Upstream of the player (+z), and the spread between lanes along the bank (m). */
  upstream: 34,
  laneGap: 1.5,
  laneStep: 2,
  /** The whole wave keeps hearing the player (m), so nobody gives up the hunt mid-fight. */
  hearing: 60,
} as const;
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
  /** Per frame: Mom always animates; the steps only advance while unpaused (and not cancelled). */
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
  /** The fish pack you lay on the water at the end (loaded with Mom). */
  pack: THREE.Object3D | null;
  /** The dawn's looping beds (birds, water), stopped at the end. */
  beds: Bed[];
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
  st.pack ??= await loadPackOnWater(h.sys.world.scene);
  st.pack.visible = false;
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
  const tuning = nightTuning(h.sys.area.chapter, ctx.difficulty());
  // The pool is smaller than the horde: when it is full, the rest wait for the dead to make room.
  while (spawned.n < waveDue(elapsed)) {
    const at = waveSpot(spawned.n, cam.z);
    const yaw = Math.atan2(cam.x - at.x, cam.z - at.z);
    if (horde.spawn(at.x, at.z, yaw, tuning) < 0) return;
    horde.alert(at.x, at.z, 1);
    spawned.n++;
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

/** Mom's bag: `share` of the limit in ammo for every gun you carry and in arrows (never less than you hold), and a spare battery. */
export function armForLastStand(run: Pick<Run, 'live'>, share: number): void {
  const { live } = run;
  if (live.guns.length === 0) live.guns = ['pistol'];
  let supplies = { ...live.supplies };
  const fill = (kind: SupplyKind): void => {
    supplies[kind] = Math.max(supplies[kind], Math.round(SUPPLY_LIMITS[kind] * share));
  };
  for (const gun of live.guns) fill(AMMO_OF[gun]);
  fill('arrows');
  supplies = addSupply(supplies, 'cells', 1);
  live.supplies = supplies;
}

/**
 * The last stand: you and the orca against a horde too big for you. It ends when the horde is
 * dead (or after WAVE.seconds); the orca gets sicker with every one it takes (`fish.onEat`).
 */
async function fight(h: EndingHost, st: State): Promise<void> {
  const { fish, horde, ctx } = h.sys;
  const cam = ctx.stage.camera.position;
  const spawned = { n: 0 };
  let t = 0;
  let left: number = WAVE.strikes;
  backOff(h, st);
  fish.arm(WAVE.strikes, WAVE.orca);
  await until(st, (dt) => {
    t += dt;
    if (fish.strikes < left) {
      left = fish.strikes;
      st.scene?.mom.play('HitRecieve', true); // the orca struck: she flinches
    }
    spawnWave(h, spawned, t);
    horde.alert(cam.x, cam.z, WAVE.hearing);
    const done = spawned.n >= WAVE.count && horde.aliveCount() === 0;
    return done || t >= WAVE.seconds;
  });
}

/** Night 3's own night: the area's tighter fog, as `setFogFar` left it. Built once per dawn. */
function nightPreset(area: AreaDef): LightPreset {
  const { night } = LIGHTING;
  return { ...night, fog: { ...night.fog, far: area.nightFog ?? night.fog.far } };
}

/** Night to sunrise over `DAWN.seconds` (the moon sets, the sun rises, every frame), the birds swelling in with it over the water's lapping. */
async function dawn(h: EndingHost, st: State): Promise<void> {
  const { world, ctx, sounds } = h.sys;
  const birds = sounds.birds ? ctx.audio.loop(sounds.birds, 0) : null;
  const water = ctx.audio.loop(sounds.water, DAWN.water);
  st.beds.push(water);
  if (birds) st.beds.push(birds);
  const { lights } = world;
  const sky = createDawn(lights, nightPreset(h.sys.area), h.lantern);
  await precompileSky(ctx.stage.renderer, world.scene, ctx.stage.camera, lights.physical);
  let t = 0;
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
    birds?.setVolume(DAWN.volume * k);
    sky.step(k, t);
    return k >= 1;
  });
}

/** Mom walks to the player, stops `SHORE.meet` m short and faces them. */
async function comeToPlayer(h: EndingHost, st: State): Promise<void> {
  const actor = st.scene?.actor;
  if (!actor || !st.scene) return;
  const cam = h.sys.ctx.stage.camera.position;
  const at = stopShort(st.scene.mom.group.position, cam, SHORE.meet);
  st.scene.mom.rest = 'Idle_Neutral'; // up off her knees, and she stands with you
  await actor.walkTo([at]);
  if (!st.cancelled) actor.faceTo(cam.x, cam.z);
}

/** What the farewell steps need, while Mom is on the shore. */
function scriptOf(h: EndingHost, st: State): Script | null {
  if (!st.scene) return null;
  return {
    sys: h.sys,
    run: h.run,
    scene: st.scene,
    until: (pred) => until(st, pred),
    track: (bed) => st.beds.push(bed),
    read: (pages) => read(h, pages),
    get cancelled() {
      return st.cancelled;
    },
  };
}

/** On the shore she is dying: full sickness (the fight only gets her to the cap), so her breath is red. */
export function sickenToEnd(fish: { setSickness(k: number): void }): void {
  fish.setSickness(sicknessAt('end', 0));
}

/** The last leap: the horde is gone, the run is won, and Mom goes to it. */
async function stranded(h: EndingHost, st: State, s: Script, at: Shore): Promise<void> {
  sickenToEnd(h.sys.fish);
  await strand(s, at);
  if (st.cancelled) return;
  h.run.ending = 'calm';
  h.persist(); // the wave is won: from here the run is saved as finished
  h.sys.horde.reset();
  await goToIt(s, at);
  if (!st.cancelled) await read(h, FAREWELL_PAGES.stranded);
}

/** Dawn comes up, Mom comes to you: time to go home. */
async function dawnAndHome(h: EndingHost, st: State): Promise<void> {
  h.sys.flashlight.on = false;
  await dawn(h, st);
  if (st.cancelled) return;
  await comeToPlayer(h, st);
  if (!st.cancelled) await read(h, ENDING_PAGES.home);
  if (!st.cancelled) await until(st, bedFade(st.beds, BED_FADE)); // the ride brings its own water and birds
}

/** One step of the ending (see ORDER). */
async function runStep(h: EndingHost, st: State, step: EndingStep, at: Shore): Promise<void> {
  const s = scriptOf(h, st);
  if (!s) return;
  if (step === 'mom') {
    await read(h, ENDING_PAGES.mom);
    armForLastStand(h.run, DIFFICULTY[h.sys.ctx.difficulty()].bag);
  } else if (step === 'fight') await fight(h, st);
  else if (step === 'strand') await stranded(h, st, s, at);
  else if (step === 'song') await song(s, at);
  else if (step === 'hand') await hand(s, at);
  else if (step === 'pack' && st.pack) await lastPack(s, at, st.pack);
  else if (step === 'dawn') await dawnAndHome(h, st);
  else if (step === 'ride') {
    h.run.frozen = true; // the chapter stops: the ride is its own scene
    await playCanoeRide(h.sys.ctx, h.sys.sounds);
  } else if (step === 'credits') await read(h, ENDING_PAGES.credits);
}

/** The whole ending, step by step; every await is followed by a cancelled check. */
async function play(h: EndingHost, st: State): Promise<void> {
  const { meetAt, lake } = h.sys.area;
  if (!meetAt || !lake) return;
  const at = shoreFor(meetAt, lake.z);
  let step: EndingStep = 'mom';
  await setUp(h, st);
  while (step !== 'done' && !st.cancelled) {
    await runStep(h, st, step, at);
    step = nextEndingStep(step);
  }
  if (!st.cancelled) h.sys.ctx.finish();
}

/** Seconds the dawn's beds take to fade out before the ride starts its own. */
const BED_FADE = 0.5;

/**
 * Pure-ish: a per-frame predicate that fades `beds` out over `seconds`, then stops and frees them
 * (and empties the list). True once done.
 */
export function bedFade(beds: Bed[], seconds: number): (dt: number) => boolean {
  const from = beds.map((b) => b.getVolume());
  let t = 0;
  return (dt) => {
    t += dt;
    const k = Math.min(1, t / seconds);
    beds.forEach((b, i) => b.setVolume((from[i] ?? 0) * (1 - k)));
    if (k < 1) return false;
    for (const b of beds) {
      b.stop();
      b.disconnect();
    }
    beds.length = 0;
    return true;
  };
}

function stopBeds(st: State): void {
  for (const bed of st.beds) {
    bed.stop();
    bed.disconnect();
  }
  st.beds.length = 0;
}

const freshState = (scene: EndingScene | null, pack: THREE.Object3D | null): State => ({
  started: false,
  cancelled: false,
  wait: null,
  scene,
  pack,
  beds: [],
});

export function createEnding(h: EndingHost): Ending {
  let st = freshState(null, null);
  const stand = (): void => {
    st.cancelled = true; // the running `play` sees this after its next await and stops
    st.wait = null;
    stopBeds(st);
    stopVoice();
  };
  return {
    start() {
      if (st.started) return;
      st.started = true;
      void play(h, st);
    },
    update(dt) {
      if (!st.started || st.cancelled) return;
      st.scene?.update(dt); // Mom keeps moving behind the pages: she kneels as Mom speaks
      if (h.sys.ctx.isPaused()) return;
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
      h.run.interact = null;
      h.sys.fish.reset(); // a death mid-farewell can't leave it on the shore
      st = freshState(st.scene, st.pack); // Mom stays built; reaching the shore again starts over
    },
    dispose() {
      stand();
      st.scene?.dispose();
      st.scene = null;
    },
  };
}
