import type * as THREE from 'three/webgpu';
import type { AreaDef } from './areas/types';
import { playCanoeRide } from './canoe-ride';
import { DIFFICULTY, nightTuning } from './difficulty';
import { BED_FADE, bedFade, comeToPlayer, dawn, type Dawning } from './ending-dawn';
import {
  ENDING_GOALS,
  FAREWELL_PAGES,
  goal,
  goToIt,
  kneel,
  lastPack,
  loadPackOnWater,
  look,
  orbit,
  shoreFor,
  song,
  standUp,
  swim,
  turnToMom,
  type Bed,
  type Script,
  type Shore,
} from './ending-farewell';
import { buildEndingScene, facing, retreatPoint, type EndingScene } from './ending-scene';
import { FLINCH, struckNear, WAVE, waveCount, waveDue, waveSpot } from './ending-wave';
import { createCast, type Cast } from './farewell-cast';
import { shotsFor, type Shots } from './farewell-shots';
import { atSafeSpot } from './flow';
import { sicknessAt } from './orca-sick';
import type { Run, Systems } from './run';
import { addSupply, AMMO_OF, SUPPLY_LIMITS, type SupplyKind } from './state';
import type { VoiceName } from './voice';
import { prepareVoices, stopVoice, voiceFor, voiceHooks } from './voice';

export type EndingStep =
  | 'mom'
  | 'fight'
  | 'swim'
  | 'song'
  | 'kneel'
  | 'look'
  | 'orbit'
  | 'pack'
  | 'dawn'
  | 'ride'
  | 'credits'
  | 'done';
type PagedStep = 'mom' | 'home' | 'credits';

const ORDER: readonly EndingStep[] = [
  'mom',
  'fight',
  'swim',
  'song',
  'kneel',
  'look',
  'orbit',
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
  // Every source in public/assets/LICENSES.md (ending.test.ts checks the names).
  credits: [
    "Kartik's Dreams - Follow the River",
    'A dream by Kartik',
    'Models: Kenney (kenney.nl): Furniture Kit, City Kit (Commercial, Roads, Suburban), Car Kit, Survival Kit, Nature Kit. CC0.',
    'Characters, animation and plants: Quaternius (quaternius.com): Ultimate Modular Men, Ultimate Modular Women, Universal Animation Library 1 and 2, Stylized Nature MegaKit. CC0.',
    'Textures: Poly Haven (polyhaven.com). CC0. Everything else (Dras, the guns, the bow, the river town) was made for this game in Blender.',
    'Gunshots: The Free Firearm Sound Library by Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney. Zombies: Zombies Sound Pack by artisticdude. All on OpenGameArt. CC0.',
    'Ambience and water: 30 CC0 SFX loops, Ambient Bird Sounds by isaiah658, and 40 CC0 water, splash and slime SFX by rubberduck (OpenGameArt). Splashes by roboroo, Bird_man and qubodup, paddle strokes by EpicWizard (Freesound). CC0.',
    "Dras's voice and breath: killer whale recordings by the U.S. National Park Service (Glacier Bay) and the U.S. Fish and Wildlife Service. Public domain.",
    'Fonts: IM Fell English (SIL Open Font License 1.1) and Special Elite (Apache License 2.0), from Google Fonts via Fontsource.',
    'Made with three.js (MIT License) and Vite.',
    'Thank you for playing.',
  ],
};

export { bedFade } from './ending-dawn';
export { FLINCH, struckNear, WAVE, waveCount, waveDue, waveSpot } from './ending-wave';

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
  /** Builds Mom, her lights and the pack now (behind the loading screen), so the ending adds nothing to the scene later. */
  prepare(): Promise<void>;
  /** Warm-up: everything the ending shows, on; returns the undo. */
  warmShow(): () => void;
  dispose(): void;
}

export interface EndingHost {
  sys: Systems;
  run: Run;
  lantern: THREE.PointLight;
  /** Writes the `end` save (called once the wave is won). */
  persist: () => void;
}

/** Seconds after her guard lifts at which the fight is over whatever is left (the wave is won). */
const FIGHT_GIVE_UP = 90;

export const NO_ENDING: Ending = {
  start: () => undefined,
  update: () => undefined,
  cancel: () => undefined,
  prepare: () => Promise.resolve(),
  warmShow: () => () => undefined,
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
  /** What runs behind the farewell every frame, and where everything stands (see farewell-cast.ts, farewell-shots.ts). */
  cast: Cast | null;
  shots: Shots | null;
  /** A page is open (the orca keeps breathing behind it). */
  reading: boolean;
}

const until = (st: State, pred: Wait['pred']): Promise<void> =>
  new Promise((resolve) => {
    st.wait = { pred, resolve };
  });

/** A wait whose step throws is over: the ending moves on instead of freezing forever on that frame. */
export function waitDone(wait: Pick<Wait, 'pred'>, dt: number): boolean {
  try {
    return wait.pred(dt);
  } catch {
    return true;
  }
}

/** Fade to black, clear the bank, put Mom on the shore, turn to her, fade back in. */
async function setUp(h: EndingHost, st: State): Promise<void> {
  const { ctx } = h.sys;
  h.run.ending = 'fight';
  h.run.frozen = true;
  ctx.hold();
  await ctx.overlay.fade(true);
  if (st.cancelled) return;
  const stopLoading = ctx.overlay.loading();
  try {
    await buildLake(h, st);
  } finally {
    stopLoading();
  }
  if (st.cancelled) return;
  await ctx.overlay.fade(false);
  if (st.cancelled) return;
  h.run.frozen = false;
}

/** The behind-black work of `setUp`: the lake scene, the pack, Mom on the shore, the compile. */
async function buildLake(h: EndingHost, st: State): Promise<void> {
  const { ctx, horde } = h.sys;
  horde.reset();
  const scene = st.scene ?? (await buildEndingScene(h.sys));
  if (st.cancelled) return scene.dispose();
  st.scene = scene;
  st.pack ??= await loadPackOnWater(h.sys.world.scene);
  if (st.cancelled) return;
  prepareLines(h);
  st.cast ??= createCast(scene, ctx.stage.camera, h.sys.fish);
  ctx.warmFocus(); // the depth-of-field graph compiles here, behind the black
  st.pack.visible = false;
  const cam = ctx.stage.camera.position;
  scene.place(cam.x, cam.z, h.lantern);
  const mom = h.sys.area.meetAt;
  if (mom) ctx.player.teleport(cam.x, cam.z, facing(cam.x, cam.z, mom.x, mom.z) + Math.PI);
  await ctx.stage.renderer.compileAsync(h.sys.world.scene, ctx.stage.camera);
}

const sceneVoice = (page: string): VoiceName | null => voiceFor(page, 'scene');

/** Synthesizes Mom's lines (the fight's and the farewell's) so no page pays for it as it opens. */
function prepareLines(h: EndingHost): void {
  const pages = [...Object.values(ENDING_PAGES), ...Object.values(FAREWELL_PAGES)].flat();
  prepareVoices(h.sys.ctx.audio, pages, sceneVoice);
}

const read = (h: EndingHost, st: State, pages: readonly string[]): Promise<void> =>
  new Promise((resolve) => {
    const { ctx } = h.sys;
    st.reading = true;
    ctx.read(
      pages,
      () => {
        st.reading = false;
        resolve();
      },
      voiceHooks(ctx.audio, sceneVoice),
    );
  });

/** Spawns every wave zombie that is due and has not appeared yet; they come running. */
function spawnWave(h: EndingHost, spawned: { n: number }, elapsed: number, count: number): void {
  const { horde, ctx } = h.sys;
  const cam = ctx.stage.camera.position;
  const tuning = nightTuning(h.sys.area.chapter, ctx.difficulty());
  // The pool is smaller than the horde: when it is full, the rest wait for the dead to make room.
  while (spawned.n < waveDue(elapsed, count)) {
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
 * The last stand: you and the orca against a horde too big for you, `waveCount` zombies. She fights
 * beside you, taking only the ones near you or Mom (`fish.setGuards`); it ends only when every one
 * is dead. After `WAVE.safety` s her guard lifts so she clears any the pool left far upstream. The
 * orca gets sicker with every one it takes (`fish.onEat`). Mom holds the lantern up behind you.
 */
async function fight(h: EndingHost, st: State): Promise<void> {
  const { fish, horde, ctx } = h.sys;
  const cam = ctx.stage.camera.position;
  const count = waveCount(ctx.difficulty());
  const spawned = { n: 0 };
  let t = 0;
  let left: number = WAVE.strikes;
  let lifted = false;
  goal({ run: h.run }, ENDING_GOALS.fight);
  backOff(h, st);
  if (st.scene) {
    st.scene.mom.rest = 'Lantern'; // she stands behind you, lantern held up
    st.scene.mom.play('Lantern');
    fish.setGuards([cam, st.scene.mom.group.position]);
  } else fish.setGuards([cam]);
  fish.arm(WAVE.strikes, WAVE.orca);
  await until(st, (dt) => {
    t += dt;
    if (fish.strikes < left) {
      left = fish.strikes;
      const mom = st.scene?.mom;
      if (mom && struckNear(fish.lastStrike, mom.group.position)) mom.play('HitRecieve', true);
    }
    if (!lifted && t >= WAVE.safety) {
      lifted = true;
      fish.arm(fish.strikes, { ...WAVE.orca, guard: Infinity });
    }
    spawnWave(h, spawned, t, count);
    horde.alert(cam.x, cam.z, WAVE.hearing);
    if (t > WAVE.safety + FIGHT_GIVE_UP) horde.reset(); // a zombie stuck far upstream must not hold the ending forever
    return spawned.n >= count && horde.aliveCount() === 0;
  });
  fish.setGuards([]);
}

/** What the farewell steps need, while Mom is on the shore. */
function scriptOf(h: EndingHost, st: State): Script | null {
  if (!st.scene || !st.cast || !st.shots) return null;
  return {
    sys: h.sys,
    run: h.run,
    scene: st.scene,
    cast: st.cast,
    shots: st.shots,
    until: (pred) => until(st, pred),
    track: (bed) => st.beds.push(bed),
    read: (pages) => read(h, st, pages),
    get cancelled() {
      return st.cancelled;
    },
  };
}

/** On the shore she is dying: full sickness (the fight only gets her to the cap), so her breath is red. */
export function sickenToEnd(fish: { setSickness(k: number): void }): void {
  fish.setSickness(sicknessAt('end', 0));
}

/** The last leap, seen: the horde is gone, the run is won, and Mom goes to her. */
async function stranded(h: EndingHost, st: State, s: Script, at: Shore): Promise<void> {
  sickenToEnd(h.sys.fish);
  await swim(s, at);
  if (st.cancelled) return;
  h.run.ending = 'calm';
  h.persist(); // the wave is won: from here the run is saved as finished
  h.sys.horde.reset();
  await goToIt(s);
  if (!st.cancelled) await read(h, st, FAREWELL_PAGES.stranded);
}

const dawning = (h: EndingHost, st: State): Dawning => ({
  sys: h.sys,
  lantern: h.lantern,
  scene: st.scene,
  beds: st.beds,
  until: (pred) => until(st, pred),
});

/** Dawn comes up while you stand, Mom stands and comes to you: time to go home. */
async function dawnAndHome(h: EndingHost, st: State, s: Script): Promise<void> {
  h.sys.flashlight.on = false;
  st.scene?.lightFarewell(false); // the sun is coming: the night light goes
  goal(s, ENDING_GOALS.dawn);
  const stand = standUp(s);
  let standing = false;
  const d = dawning(h, st);
  await dawn(d, (dt) => {
    if (!standing) standing = stand(dt);
  });
  if (st.cancelled) return;
  const turning = turnToMom(s);
  await Promise.all([
    comeToPlayer(d, () => st.cancelled),
    until(st, turning), // the camera turns from the lake to her as she walks up
  ]);
  if (!st.cancelled) {
    st.scene?.mom.play('Talk'); // she talks while you read
    goal(s, ENDING_GOALS.home);
    await read(h, st, ENDING_PAGES.home);
  }
  if (!st.cancelled) await until(st, bedFade(st.beds, BED_FADE)); // the ride brings its own water and birds
}

/** One step of the ending (see ORDER). */
async function runStep(h: EndingHost, st: State, step: EndingStep, at: Shore): Promise<void> {
  const s = scriptOf(h, st);
  if (!s) return;
  if (step === 'mom') {
    goal(s, ENDING_GOALS.mom);
    await read(h, st, ENDING_PAGES.mom);
    armForLastStand(h.run, DIFFICULTY[h.sys.ctx.difficulty()].bag);
  } else if (step === 'fight') await fight(h, st);
  else if (step === 'swim') await stranded(h, st, s, at);
  else if (step === 'song') await song(s, at);
  else if (step === 'kneel') await kneel(s, at);
  else if (step === 'look') await look(s);
  else if (step === 'orbit') await orbit(s);
  else if (step === 'pack' && st.pack) await lastPack(s, st.pack);
  else if (step === 'dawn') await dawnAndHome(h, st, s);
  else if (step === 'ride') {
    goal(s, ENDING_GOALS.ride);
    h.run.frozen = true; // the chapter stops: the ride is its own scene
    st.scene?.releaseReflection(); // the dawn's sharp mirror is done
    st.cast?.release(); // and its camera is the ride's, not the farewell's
    h.sys.ctx.cinematic(false); // and your mouse look is the ride's too (it brings its own end shot)
    await playCanoeRide(h.sys.ctx, h.sys.sounds);
  } else if (step === 'credits') await read(h, st, ENDING_PAGES.credits);
}

/** A load or a step failed: give the player the world back and read them out (home, credits) instead of a black, held screen. */
async function recover(h: EndingHost, st: State): Promise<void> {
  const { ctx, fish } = h.sys;
  h.run.frozen = false;
  h.run.endingGoal = ENDING_GOALS.ride;
  stopBeds(st);
  endCinema(h, st);
  fish.setGuards([]);
  await ctx.overlay.fade(false); // the next `read` also releases the hold
  if (st.cancelled) return;
  await read(h, st, ENDING_PAGES.home);
  if (!st.cancelled) await read(h, st, ENDING_PAGES.credits);
}

/** The whole ending, step by step; every await is followed by a cancelled check. It always settles, and a failure never strands the player. */
async function play(h: EndingHost, st: State): Promise<void> {
  const { meetAt, lake } = h.sys.area;
  if (!meetAt || !lake) return;
  try {
    const at = shoreFor(meetAt, lake.z);
    st.shots = shotsFor(at);
    let step: EndingStep = 'mom';
    await setUp(h, st);
    while (step !== 'done' && !st.cancelled) {
      await runStep(h, st, step, at);
      step = nextEndingStep(step);
    }
  } catch {
    await recover(h, st).catch(() => undefined);
  }
  if (!st.cancelled) h.sys.ctx.finish();
}

function stopBeds(st: State): void {
  for (const bed of st.beds) {
    bed.stop();
    bed.disconnect();
  }
  st.beds.length = 0;
}

const freshState = (
  scene: EndingScene | null,
  pack: THREE.Object3D | null,
  cast: Cast | null,
): State => ({
  started: false,
  cancelled: false,
  wait: null,
  scene,
  pack,
  beds: [],
  cast,
  shots: null,
  reading: false,
});

/** The cutscene over for good (a quit or a restart): input, HUD, bow, depth of field and everything the cast held, back to normal. */
function endCinema(h: EndingHost, st: State): void {
  if (!st.started) return;
  const { ctx, fish } = h.sys;
  h.run.cutscene = false;
  h.run.interact = null;
  ctx.cinematic(false);
  ctx.focus(false);
  fish.lookAtTarget(null, 0);
  fish.setJaw(0);
  const cast = st.cast;
  if (cast) {
    cast.follow(false);
    cast.hold = cast.arm = cast.float = null;
  }
  if (st.pack) {
    h.sys.world.scene.attach(st.pack); // a quit while it is in your hand must not leave it on the arm
    st.pack.visible = false;
  }
  st.scene?.lightFarewell(false);
  st.scene?.releaseReflection();
}

export function createEnding(h: EndingHost): Ending {
  let st = freshState(null, null, null);
  const stand = (): void => {
    st.cancelled = true; // the running `play` sees this after its next await and stops
    st.wait = null;
    stopBeds(st);
    stopVoice();
    endCinema(h, st);
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
      const paused = h.sys.ctx.isPaused();
      if (!paused && st.wait && waitDone(st.wait, dt)) {
        const { resolve } = st.wait;
        st.wait = null;
        resolve();
      }
      st.cast?.update(paused ? 0 : dt); // a page or the menu freezes the shuffle, the arm and the bob; the camera stays put
      // The world is frozen behind a page, but she keeps breathing, and the camera and your arm stay put.
      if (paused && st.reading && h.sys.fish.beached)
        h.sys.fish.update(dt, h.sys.ctx.stage.camera.position, null, false);
    },
    cancel() {
      if (!st.started) return;
      stand();
      h.run.ending = 'no';
      h.run.endingGoal = '';
      st.scene?.remove(h.lantern);
      h.run.interact = null;
      h.sys.fish.reset(); // a death mid-farewell can't leave it on the shore
      st = freshState(st.scene, st.pack, st.cast); // Mom stays built; reaching the shore again starts over
    },
    async prepare() {
      st.scene ??= await buildEndingScene(h.sys);
      st.pack ??= await loadPackOnWater(h.sys.world.scene);
      prepareLines(h);
    },
    warmShow() {
      const undoScene = st.scene?.warmShow();
      const pack = st.pack;
      const packShown = pack?.visible;
      if (pack) pack.visible = true;
      return () => {
        undoScene?.();
        if (pack) pack.visible = packShown ?? false;
      };
    },
    dispose() {
      stand();
      st.scene?.dispose();
      st.scene = null;
    },
  };
}
