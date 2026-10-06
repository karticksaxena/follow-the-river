import * as THREE from 'three/webgpu';
import { drawBehind } from '../../engine/frames';
import type { DreamContext } from '../types';
import { watchCalf, type Watch } from './canoe-look';
import { gripPaddle, type Arm } from './canoe-paddle';
import { makeRide, newPose } from './canoe-ride-setup';
import { buildCanoeScene, pathSlope, pathX, WATER_LEVEL, type CanoeScene } from './canoe-scene';
import { createShot, SHOT } from './canoe-shot';
import {
  calfPose,
  CLOSING_PAGES,
  nextCue,
  OPENING_PAGES,
  RIDE,
  STOP_AT,
  travelled,
  type CalfPose,
  type Script,
} from './canoe-timing';
import { warmRide } from './canoe-warm';
import { CINEMATIC } from './flashback';
import { dripAt, type Motion } from './motion';
import { lookAt } from './rig';
import { rateIn, type Sounds } from './sounds';

export {
  BEATS,
  CALF,
  calfPose,
  CLOSING_PAGES,
  newScript,
  nextCue,
  OPENING_PAGES,
  RIDE,
  speedAt,
  STOP_AT,
  STOP_PAUSE,
  travelled,
  type CalfPose,
  type Cue,
  type Script,
} from './canoe-timing';

export const SEAT = {
  eye: [0, 1.0, 0.9],
  // Her Sit/Row pelvis is 0.575 m above her feet: this puts it on the canoe's thwart.
  mom: [0, -0.22, -0.9],
  paddle: [0, 0.68, -0.72],
  /** Kartik sits in the bow on the same thwart height, facing the bow. */
  kartik: [0, -0.22, 0.9],
  /** Where the paddle lies once she stops rowing: across the canoe between them, the blades out over the water. */
  paddleRest: [0, 0.35, 0.1],
} as const;
/** How far Mom and Kartik may turn their heads (radians). */
const HEAD_LIMITS = { yaw: 1.2, pitch: 0.7 };
export const VOLUME = {
  water: 0.25,
  birds: 0.3,
  birdsFade: 6,
  blow: 0.3,
  /** The calf's blow is a calf's: higher and quicker than Dras'. */
  blowRate: 1.25,
  paddle: 0.5,
  paddleSpread: 0.1,
} as const;

/** Pure: a blade that was above `level` last frame and is at or below it now has just gone in. */
export function crossedDown(prevY: number, y: number, level: number): boolean {
  return prevY > level && y <= level;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
}

/** Pure: the canoe at `t` (down the river toward -z, yaw faces its bow, a gentle bob and roll). */
export function canoePose(t: number, out: Pose): Pose {
  const z = -travelled(t, STOP_AT); // the same road with or without the stop (it only slows the canoe after)
  out.z = z;
  out.x = pathX(z);
  out.yaw = Math.atan2(-pathSlope(z), -1);
  out.y = WATER_LEVEL - 0.12 + Math.sin(t * 1.3) * 0.03;
  out.roll = Math.sin(t * 1.05 + 1) * 0.025;
  return out;
}

/** Pure: a canoe-local point (`lx` starboard-left, `lz` ahead) in world x and z. */
export function toWorld(at: Pose, lx: number, lz: number, out: { x: number; z: number }): void {
  const s = Math.sin(at.yaw);
  const c = Math.cos(at.yaw);
  out.x = at.x + lx * c + lz * s;
  out.z = at.z - lx * s + lz * c;
}

export interface Ride {
  ctx: DreamContext;
  sounds: Sounds;
  cs: CanoeScene;
  t: number;
  dt: number;
  started: boolean;
  /** The talks and the stop, in order (canoe-timing). */
  script: Script;
  /** A talk or the closing pages are open: the ride runs on behind them. */
  reading: boolean;
  blown: boolean;
  /** Mom is paddling (Row); she sits still (Sit) once she stops for the calf. */
  rowing: boolean;
  /** 0..1: how far the heads have turned (to you while she talks, to the calf once she stops). */
  look: number;
  /** The end shot (set once the closing pages are read) and its clock in seconds. */
  shot: ReturnType<typeof createShot> | null;
  shotT: number;
  fading: boolean;
  /** The end shot has faded to black: the ride ends as soon as the game is not paused. */
  ended: boolean;
  /** Seconds the ride has waited, ended, for the pause menu to close. */
  endedFor: number;
  onEnd: () => void;
  /** Mom's and Kartik's head bones. */
  heads: { mom: THREE.Object3D; kartik: THREE.Object3D };
  /** The ride has been torn down: late page callbacks do nothing. */
  over: boolean;
  /** Mom's arms: the paddle's shaft is held between the hands, the arms reach to its grips (null if the rig has none). */
  arms: [Arm, Arm] | null;
  /** The paddle has been placed once (a paused frame must not tilt it again). */
  paddled: boolean;
  lastYaw: number;
  pose: Pose;
  calf: CalfPose;
  watch: Watch;
  goalEl: HTMLElement;
  spot: { x: number; z: number };
  /** The paddle's two blades: where each last was (m up) and the sound it makes going in. */
  blades: Blade[];
  strokes: () => AudioBuffer | null;
  blows: () => AudioBuffer | null;
  /** Dawn fireflies round the canoe and the drops off the paddle. */
  motion: Motion;
}

/**
 * Her Row clip keeps the blades 0.25-0.95 m above the water (measured), so the paddle is tilted
 * `PADDLE_TILT_GAIN` times as steeply about her hands and sunk `PADDLE_DIP` m: the low blade then
 * dips about 0.1 m into the river each stroke (well above the hull's bottom, and the blades work
 * outside the hull, which is under 1 m wide) and the high blade clears the rim.
 */
export const PADDLE_TILT_GAIN = 1.8;
export const PADDLE_DIP = 0.12;

/** Pure: steepens the paddle's `along` (unit, hand to hand) and lowers its `mid` point. Returns `along` renormalised. */
export function dipPaddle(along: THREE.Vector3, mid: THREE.Vector3): THREE.Vector3 {
  along.y *= PADDLE_TILT_GAIN;
  mid.y -= PADDLE_DIP;
  return along.normalize();
}

export interface Blade {
  mark: THREE.Object3D;
  sound: THREE.PositionalAudio;
  y: number;
}

const bladeAt = new THREE.Vector3();

/** A stroke: one of Mom's recorded strokes at the blade, a little different every time. */
function stroke(r: Ride, b: Blade): void {
  const buffer = r.strokes();
  if (!buffer) return;
  if (b.sound.isPlaying) b.sound.stop();
  b.sound.setBuffer(buffer);
  b.sound.setVolume(VOLUME.paddle + (Math.random() * 2 - 1) * VOLUME.paddleSpread);
  b.sound.setPlaybackRate(rateIn(0.95, 1.05));
  b.sound.play();
}

/** Plays a stroke whenever a blade goes down through the water, so the sound follows her Row clip. Allocates nothing. */
function stepPaddles(r: Ride): void {
  for (const b of r.blades) {
    const y = b.mark.getWorldPosition(bladeAt).y;
    if (crossedDown(b.y, y, WATER_LEVEL)) {
      stroke(r, b);
      dripAt(bladeAt.x, WATER_LEVEL, bladeAt.z);
    }
    b.y = y;
  }
}

/** Puts the canoe, Mom, paddle and the calf where time `t` says; returns nothing, allocates nothing. */
function placeAll(r: Ride): void {
  const { cs, t } = r;
  canoePose(t, r.pose);
  const p = r.pose;
  cs.canoe.position.set(p.x, p.y, p.z);
  cs.canoe.rotation.set(0, p.yaw, p.roll);
  cs.mom.group.position.set(...SEAT.mom); // her Row clip does the paddling and the twist
  cs.kartik.group.position.set(...SEAT.kartik);
  holdPaddle(r);
  placeCalf(r);
}

const handL = new THREE.Vector3();
const handR = new THREE.Vector3();
const along = new THREE.Vector3();
const PADDLE_REST = new THREE.Vector3();
const NO_TURN = new THREE.Quaternion();
const SHAFT = new THREE.Vector3(1, 0, 0); // the paddle model lies along x

/** The paddle's shaft runs from her left hand to her right, so it follows the rowing exactly. */
function holdPaddle(r: Ride): void {
  const { cs, arms } = r;
  if (!r.rowing) {
    // She has let go: it settles across the canoe.
    const k = 1 - Math.exp(-r.dt * 5);
    cs.paddle.position.lerp(PADDLE_REST.set(...SEAT.paddleRest), k);
    cs.paddle.quaternion.slerp(NO_TURN, k);
    return;
  }
  if (!arms) {
    cs.paddle.position.set(...SEAT.paddle);
    return;
  }
  if (r.dt === 0 && r.paddled) return; // paused: the arms are already on it
  r.paddled = true;
  cs.canoe.updateMatrixWorld(true);
  cs.canoe.worldToLocal(arms[0].hand.getWorldPosition(handL));
  cs.canoe.worldToLocal(arms[1].hand.getWorldPosition(handR));
  cs.paddle.position.addVectors(handL, handR).multiplyScalar(0.5);
  along.subVectors(handR, handL).normalize();
  dipPaddle(along, cs.paddle.position);
  if (along.lengthSq() > 0) cs.paddle.quaternion.setFromUnitVectors(SHAFT, along);
  gripPaddle(arms, cs.canoe, cs.paddle.position, along); // her palms on the shaft, not beside it
}

function placeCalf(r: Ride): void {
  const { root } = r.cs.calf;
  const c = calfPose(r.t, r.calf);
  root.visible = c.visible;
  if (!c.visible) return;
  toWorld(r.pose, c.x, c.z, r.spot);
  root.position.set(r.spot.x, c.y, r.spot.z);
  root.rotation.set(c.pitch, r.pose.yaw + Math.PI, 0);
}

const aim = new THREE.Vector3();

/** Opens `pages` over the moving ride; `then` runs when the player has read them all. */
function openPages(r: Ride, pages: readonly string[], then?: () => void): void {
  r.reading = true;
  r.ctx.read(pages, () => {
    r.reading = false;
    if (!r.over) then?.();
  });
}

/** The end shot: input off, Kartik's body shows in the bow, the camera leaves his eye. */
function startShot(r: Ride): void {
  r.ctx.cinematic(true);
  r.cs.kartik.group.visible = true;
  r.shot = createShot(r.cs.canoe, r.ctx.stage.camera);
  r.rowing = true; // she takes the paddle up again: the canoe glides on through the shot
  r.paddled = false;
  r.cs.mom.play('Row');
}

/** Does what the director says is due: a talk, Mom stopping, the closing pages. */
function direct(r: Ride): void {
  const cue = nextCue(r.script, r.t, r.reading || r.ctx.isPaused());
  if (!cue) return;
  if (cue.kind === 'stop') {
    r.rowing = false; // the paddle strokes stop with the rowing; the speed eases down by itself
    r.cs.mom.play('Sit');
  } else openPages(r, cue.pages, cue.kind === 'closing' ? () => startShot(r) : undefined);
}

/** Mom looks at you while she talks and, once she has stopped, they both look at the calf. */
function turnHeads(r: Ride): void {
  const { cs } = r;
  const want = r.reading || r.script.stopped ? 1 : 0;
  r.look += (want - r.look) * (1 - Math.exp(-r.dt * 4));
  if (r.look < 0.01) return;
  const toCalf = r.script.stopped;
  const camera = r.ctx.stage.camera;
  const target = toCalf ? cs.calf.root.getWorldPosition(aim) : camera.getWorldPosition(aim);
  lookAt(r.heads.mom, target, r.look, HEAD_LIMITS);
  if (toCalf) lookAt(r.heads.kartik, target, r.look, HEAD_LIMITS);
}

/** The seat camera: glued to Kartik's eye, its look is the mouse's and it turns with the bends. */
function seatCamera(r: Ride): void {
  const { camera } = r.ctx.stage;
  r.cs.canoe.localToWorld(camera.position.set(...SEAT.eye));
  camera.rotation.y += r.pose.yaw - r.lastYaw;
  r.lastYaw = r.pose.yaw;
  camera.updateMatrixWorld(true);
}

/** The end shot's rail; the picture fades to black over its last seconds, then the ride is over. */
function stepShot(r: Ride, shot: NonNullable<Ride['shot']>): void {
  r.shotT += r.dt;
  shot.place(Math.min(1, r.shotT / SHOT.seconds), r.shotT / SHOT.blendSeconds);
  if (!r.fading && r.shotT >= SHOT.seconds - SHOT.fadeSeconds) {
    r.fading = true;
    void r.ctx.overlay.fade(true, SHOT.fadeSeconds * 1000).then(r.onEnd);
  }
}

/** How long (s) a faded-out ride waits for the pause menu to close before it ends anyway: nothing may soft-lock. */
export const END_WAIT = 20;

/** Once the picture has faded out: true when the ride should end (not paused, or it has waited long enough). */
function endWait(r: Ride, dt: number): boolean {
  if (!r.ctx.isPaused()) return true;
  r.endedFor += dt;
  return r.endedFor >= END_WAIT;
}

/** Pure: the ride (and the end shot) runs while a page is open over it, or once started and not paused. */
export function rideLive(reading: boolean, started: boolean, paused: boolean): boolean {
  return reading || (started && !paused);
}

/** Per frame: the ride clock, the talks, the camera (the seat, then the end shot), animations. */
function frame(r: Ride, dt: number): void {
  const { ctx, cs } = r;
  const live = rideLive(r.reading, r.started, ctx.isPaused());
  r.dt = live ? dt : 0;
  if (live) {
    r.t += dt; // the world runs far past the drift: no clamp to freeze the canoe in the shot
    cs.mom.update(dt);
    cs.kartik.update(dt);
    cs.calf.mixer.update(dt);
    direct(r);
    watchCalf(r);
  }
  placeAll(r);
  cs.canoe.updateMatrixWorld(true);
  turnHeads(r);
  if (live && r.rowing) stepPaddles(r);
  if (r.shot) stepShot(r, r.shot);
  else seatCamera(r);
  cs.sky.position.copy(ctx.stage.camera.position);
  r.motion.env.tier = ctx.stage.tier;
  r.motion.update(r.dt);
  if (!r.blown && r.calf.surfaced > 0.6) {
    r.blown = true;
    const blow = r.blows();
    if (blow) ctx.audio.once(blow, VOLUME.blow).setPlaybackRate(VOLUME.blowRate);
  }
}

/**
 * The last scene: Mom rows the player down a sunrise river and the orca calf surfaces beside them.
 * They talk, Mom stops rowing for the calf, the closing pages are read, then a calm shot rises
 * from Kartik's eye to a wide view of the two of them in the boat and fades to black. Resolves
 * then, with the previous scene back on the stage (the caller shows the credits). A replay does
 * not fade from the lake first. Safe against quits: if anything else replaces the stage scene,
 * the ride tears itself down and resolves.
 */
export function playCanoeRide(
  ctx: DreamContext,
  sounds: Sounds,
  opts: { replay?: boolean } = {},
): Promise<void> {
  return new Promise((resolve) => {
    ctx.hold(); // freezes the chapter while the world builds
    void run(ctx, sounds, resolve, opts.replay === true);
  });
}

async function run(
  ctx: DreamContext,
  sounds: Sounds,
  done: () => void,
  replay: boolean,
): Promise<void> {
  const { stage, overlay } = ctx;
  const previous = stage.scene;
  const length = travelled(RIDE.seconds + RIDE.tail, STOP_AT);
  const stopLoading = overlay.loading('Setting out…');
  const [cs] = await Promise.all([
    buildCanoeScene(length, stage).catch(() => null),
    replay ? undefined : overlay.fade(true, RIDE.fadeMs),
  ]);
  if (stage.scene !== previous || !cs) {
    stopLoading();
    cs?.dispose();
    if (cs) return done();
    // A failed load still ends the dream with the pages as text.
    return ctx.read(CLOSING_PAGES, done);
  }
  const fail = (): void => {
    // Anything thrown after the fade must not leave a black screen: same fallback as a failed build.
    cs.dispose();
    if (stage.scene === cs.scene) stage.scene = previous;
    void ctx.overlay.fade(false, RIDE.fadeMs);
    ctx.read(CLOSING_PAGES, done);
  };
  try {
    const r = makeRide(ctx, sounds, cs);
    // Still behind black and the loader: compile everything the ride shows (canoe-warm.ts).
    await warmRide(
      r,
      previous,
      [0, RIDE.seconds / 2, RIDE.seconds].map((t) => canoePose(t, newPose())),
    );
    stopLoading();
    stageRide(ctx, sounds, cs, r, previous, done);
  } catch {
    stopLoading();
    fail();
  }
}

/** Black seconds between freeing the ride and handing on (its garbage collection lands here, not on the credits). */
export const HANDOFF_SECONDS = 0.8;

/** Calls `done` after `HANDOFF_SECONDS` of stage time; the screen is black meanwhile. */
function handOff(stage: DreamContext['stage'], done: () => void): void {
  let left = HANDOFF_SECONDS;
  const stop = stage.addUpdater((dt) => {
    left -= dt;
    if (left > 0) return;
    stop();
    done();
  });
}

/** Builds the ride around the loaded scene, wires its teardown and starts it. May throw; `run` catches. */
function stageRide(
  ctx: DreamContext,
  sounds: Sounds,
  cs: CanoeScene,
  r: Ride,
  previous: THREE.Scene,
  done: () => void,
): void {
  const { stage } = ctx;
  const water = ctx.audio.loop(sounds.water, VOLUME.water);
  const birds = sounds.birds ? ctx.audio.loop(sounds.birds, 0) : null;
  const graded = ctx.grade('sunrise');
  let live = true;
  const teardown = (finished = false): void => {
    if (!live) return;
    live = false;
    r.over = true;
    r.goalEl.remove();
    stop();
    const beds = birds ? [water, birds] : [water];
    for (const sound of [...beds, ...r.blades.map((b) => b.sound)]) {
      if (sound.isPlaying) sound.stop();
      sound.disconnect();
    }
    ctx.overlay.root.classList.remove(CINEMATIC);
    if (r.shot) ctx.cinematic(false);
    if (finished) ctx.hold(); // input stays off until the credits open
    if (stage.scene === cs.scene) {
      stage.scene = previous;
      ctx.grade(graded);
    }
    r.motion.dispose();
    cs.dispose();
    if (finished) handOff(stage, done);
    else done();
  };
  const stop = stage.addUpdater((dt) => {
    if (stage.scene !== cs.scene) return teardown(); // someone else took the stage
    try {
      frame(r, dt);
      if (r.ended && endWait(r, dt)) return teardown(true);
      birds?.setVolume(VOLUME.birds * Math.min(1, r.t / VOLUME.birdsFade));
    } catch (error) {
      teardown();
      throw error;
    }
  });
  void begin(r);
}

/** Puts the world on stage, faces the camera down the river and shows the opening page. */
async function begin(r: Ride): Promise<void> {
  const { ctx, cs } = r;
  const { camera } = ctx.stage;
  canoePose(0, r.pose);
  r.lastYaw = r.pose.yaw;
  camera.rotation.set(0, r.pose.yaw + Math.PI, 0, 'YXZ');
  ctx.stage.scene = cs.scene;
  ctx.overlay.root.classList.add(CINEMATIC);
  await drawBehind(ctx.stage).catch(() => undefined); // still black: the first frames build here
  if (r.over) return; // torn down while drawing
  void ctx.overlay.fade(false, RIDE.fadeMs);
  ctx.read(OPENING_PAGES, () => {
    r.started = true;
  });
}
