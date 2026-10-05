import * as THREE from 'three/webgpu';
import { loadModel } from '../../engine/models';
import type { Rail } from './camera-rail';
import type { EndingScene } from './ending-scene';
import { facing, meetPoint } from './ending-scene';
import type { Cast } from './farewell-cast';
import { keyFrom, rails, SHOTS, type Shots, type V3 } from './farewell-shots';
import { propUrl } from './kits';
import { shoreY, WATER_Y } from './river';
import type { Run, Systems } from './run';
import { spend } from './state';

/**
 * The orca's end (Plans 7 and 9): its last leap strands it on the pebbles beside Mom, too sick to
 * get back. Mom sings it the song from the lab and it answers; you kneel and put your hand on her,
 * Mom's beside it; she looks at you; the camera goes round the three of you; you lay your last fish
 * pack on the water and she breathes out. It is a cinematic: the HUD and weapon are hidden from the
 * first frame (`run.cutscene`), and you only walk (`ctx.cinematic(false)`) to reach her flank.
 * Tuning knobs (m, s, volume).
 */
export const FAREWELL = {
  /** Where its nose comes to rest, from Mom's spot (x) and from the water line (z, up the shore). */
  nose: { fromMom: 4.5, upShore: 3.5 },
  /** You may kneel from this far (m) of the kneeling spot (it is by her flank, short of the wall you cannot pass). */
  kneelRadius: 1.6,
  /** The pack's E works within this of where the camera lands. */
  packRadius: 1.6,
  cryVolume: 0.7,
  answerVolume: 0.5,
  /** How far above the pebbles her head is (m), where her voice comes from. */
  headHeight: 0.6,
  /** Her jaw's share of its opening while she answers, her head's share while she looks at Mom. */
  answerJaw: 0.15,
  answerLook: 0.8,
  /** How fast the camera turns to her at the start of the swim is `CAST.follow`; the fish pack hangs this far below the fingertips (m). */
  packHold: { x: 0.18, y: -0.32, z: -0.55 },
} as const;

export const FAREWELL_PAGES = {
  stranded: [
    'Mom: "No. No, no, no..."',
    'Mom: "She was eating the sickness for us. Every one she took, she took the sickness too."',
    'Mom: "She held on for us. She held on for you."',
  ],
  song: [
    'Mom: "Mm-mm. Mm-mm-mm."',
    'She hums the song from the lab, the one Dras learned through the glass.',
  ],
  answer: ['Dras answers her. Once, softly.'],
  hand: [
    'Her skin is cold and smooth, like wet rubber.',
    'Mom puts her hand next to yours. Neither of you says anything.',
  ],
  look: ['She lifts her head a little and looks at you.'],
  pack: [
    'You set your last fish pack on the water beside her.',
    'She breathes out once, long and slow. Then she is still.',
  ],
} as const;

export const FAREWELL_PROMPTS = {
  kneel: 'E: put your hand on her',
  pack: 'E: lay your last fish pack on the water',
} as const;

/** What the farewell needs from the running ending. */
export interface Script {
  sys: Systems;
  run: Run;
  scene: EndingScene;
  cast: Cast;
  shots: Shots;
  until(pred: (dt: number) => boolean): Promise<void>;
  read(pages: readonly string[]): Promise<void>;
  readonly cancelled: boolean;
  /** Hands a looping or one-shot sound to the ending, which stops and frees it if the ending is cancelled. */
  track(bed: Bed): void;
}

/** A sound the ending owns (see `Script.track`). */
export interface Bed {
  stop(): unknown;
  setVolume(v: number): unknown;
  getVolume(): number;
  disconnect(): unknown;
}

export interface Shore {
  /** The orca's nose on the shore, and the water line (z). */
  noseX: number;
  noseZ: number;
  lakeZ: number;
}

/** Pure: where everything happens, from Mom's meeting spot and the lake. */
export function shoreFor(mom: { x: number; z: number }, lakeZ: number): Shore {
  return { noseX: mom.x + FAREWELL.nose.fromMom, noseZ: lakeZ + FAREWELL.nose.upShore, lakeZ };
}

const v3 = ([x, y, z]: V3): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Plays her real call (the cry, the answer) at her head, on the shore. */
function callAt(s: Script, at: Shore, buffer: AudioBuffer, volume: number): void {
  const { world, ctx } = s.sys;
  const head = new THREE.Object3D();
  head.position.set(at.noseX, shoreY(at.noseZ - at.lakeZ) + FAREWELL.headHeight, at.noseZ);
  world.scene.add(head);
  const sound = ctx.audio.positional(head, 6);
  sound.setBuffer(buffer);
  sound.setVolume(volume);
  const free = (): void => {
    sound.disconnect();
    world.scene.remove(head);
  };
  sound.onEnded = free;
  // On a cancel the ending stops it (three drops onEnded then) and frees the head here.
  s.track({
    stop: () => sound.isPlaying && sound.stop(),
    setVolume: (v) => sound.setVolume(v),
    getVolume: () => sound.getVolume(),
    disconnect: free,
  });
  sound.play();
}

/** Plays `rail` on the camera (only while no page or menu is open), then holds the camera at its end; `each` runs every frame with the time. */
async function playRail(s: Script, rail: Rail, each?: (t: number) => void): Promise<void> {
  const camera = s.sys.ctx.stage.camera;
  s.cast.hold = null;
  let t = 0;
  await s.until((dt) => {
    t += dt;
    rail.pose(t, camera);
    each?.(t);
    return t >= rail.seconds;
  });
  s.cast.hold = rail;
}

/** The camera, after she has leapt, keeps her sharp: the depth of field follows her eye. */
const focusOn = (s: Script, point: THREE.Vector3) => (): void =>
  s.sys.ctx.focus(true, s.sys.ctx.stage.camera.position.distanceTo(point));

/**
 * The swim in: the cutscene starts on the first frame, the camera turns to her and follows her in
 * across the lake, she leaps onto the pebbles beside Mom and cries.
 */
export async function swim(s: Script, at: Shore): Promise<void> {
  const { fish, horde, sounds, ctx } = s.sys;
  s.run.cutscene = true; // no HUD, bow or torch from here to the ride
  ctx.cinematic(true);
  s.cast.follow(true);
  s.scene.lightFarewell(true, { x: s.shots.eye[0], y: s.shots.eye[1], z: s.shots.eye[2] });
  fish.strand(at.noseX, at.noseZ, (z) => shoreY(z - at.lakeZ), horde);
  // You go down to the pebbles (below the bank that hides the lake) while the camera keeps her in view.
  const camera = ctx.stage.camera;
  const rail = rails.watch(keyFrom(camera), s.shots);
  let t = 0;
  await s.until((dt) => {
    t = Math.min(rail.seconds, t + dt);
    rail.pose(t, camera); // its turn is overridden by the follow
    return fish.beached;
  });
  s.cast.hold = rail;
  if (s.cancelled) return;
  callAt(s, at, sounds.cry, FAREWELL.cryVolume);
}

/** Mom goes round to the front of her face, sets the lantern down beside her and kneels facing her. */
export async function goToIt(s: Script): Promise<void> {
  const { actor, mom } = s.scene;
  const { mom: spot, lantern, eye } = s.shots;
  actor.stop(); // no more tense glances and gestures: she only has eyes for her now
  mom.rest = 'Kneel'; // she kneels where the walk ends
  await actor.walkTo([spot]);
  if (s.cancelled) return;
  actor.faceTo(s.shots.eye[0], s.shots.eye[2] - 3); // down at her face, which is straight ahead of her
  s.scene.setDown({ x: lantern[0], y: lantern[1], z: lantern[2] });
  s.scene.aim.momGaze = v3(eye);
}

/** The song from the lab, and her answer: her head lifts to Mom, her jaw parts, a soft cry. Then you may walk. */
export async function song(s: Script, at: Shore): Promise<void> {
  const { fish } = s.sys;
  const { mom } = s.shots;
  await s.read(FAREWELL_PAGES.song);
  if (s.cancelled) return;
  fish.lookAtTarget(
    new THREE.Vector3(mom.x, s.shots.ground(mom.z) + 0.9, mom.z),
    FAREWELL.answerLook,
  );
  fish.setJaw(FAREWELL.answerJaw);
  callAt(s, at, s.sys.sounds.answer, FAREWELL.answerVolume);
  await s.read(FAREWELL_PAGES.answer);
  fish.lookAtTarget(null, 0);
  fish.setJaw(0);
  fish.setLiftsRare(true); // weaker now: her tail lifts come far apart
  s.cast.follow(false);
  s.cast.hold = null;
  s.sys.ctx.cinematic(false); // you walk to her
}

/** Waits for E within `radius` of `at`, showing `prompt` (see Run.interact). */
function waitForE(
  s: Script,
  at: { x: number; z: number },
  radius: number,
  prompt: string,
): Promise<void> {
  return new Promise((resolve) => {
    s.run.interact = {
      at,
      radius,
      prompt,
      use: () => {
        s.run.interact = null;
        resolve();
      },
    };
  });
}

/** Mom's hand reaches out and rests on her nose, her eyes on hers. */
function momReaches(s: Script): void {
  const { aim } = s.scene;
  aim.momHand = v3(s.shots.momHand);
  aim.momGaze = v3(s.shots.eye);
}

/** Kartik's arm comes up from below the frame and rests on her skin. */
function armOnHer(s: Script): ArmJobHandle {
  const { hand } = s.shots;
  const target = v3(hand);
  const job = {
    hand: (out: THREE.Vector3) => out.copy(target),
    along: new THREE.Vector3(0, -0.1, 1),
    palm: new THREE.Vector3(1, 0, 0),
    rise: 0,
    goal: 1,
  };
  s.cast.arm = job;
  s.scene.arm.visible = true;
  return job;
}

type ArmJobHandle = NonNullable<Cast['arm']>;

/**
 * You kneel beside her: E at her flank; the camera lowers to kneeling height looking along her body
 * to her head, Mom shuffles up beside you, your arm comes up and rests on her skin, Mom's hand next to it.
 */
export async function kneel(s: Script): Promise<void> {
  const { ctx } = s.sys;
  const { kneel: at } = s.shots;
  await waitForE(s, { x: at.at[0], z: at.at[2] }, FAREWELL.kneelRadius, FAREWELL_PROMPTS.kneel);
  if (s.cancelled) return;
  ctx.cinematic(true);
  momReaches(s);
  await playRail(s, rails.kneel(keyFrom(ctx.stage.camera), s.shots));
  if (s.cancelled) return;
  const job = armOnHer(s);
  await s.until(() => job.rise >= 1);
  if (!s.cancelled) await s.read(FAREWELL_PAGES.hand);
}

/** She lifts her head and turns it to you; the camera pushes in to her eye, the background soft. */
export async function look(s: Script): Promise<void> {
  const { fish, ctx } = s.sys;
  const eye = v3(s.shots.eye);
  if (s.cast.arm) s.cast.arm.goal = 0; // your arm lowers away: it must not float as the camera moves
  fish.lookAtTarget(ctx.stage.camera.position, 1);
  await playRail(s, rails.look(keyFrom(ctx.stage.camera), s.shots), focusOn(s, eye));
  if (!s.cancelled) await s.read(FAREWELL_PAGES.look);
}

/** The camera pulls back and goes round the three of you: Kartik's body kneels where you were. */
export async function orbit(s: Script): Promise<void> {
  const { fish, ctx } = s.sys;
  const { kartik, aim } = s.scene;
  const k = s.shots.kartik;
  const eye = v3(s.shots.eye);
  s.cast.arm = null; // your own arm is gone: now you see him
  s.scene.arm.visible = false;
  kartik.group.position.set(k.x, s.shots.ground(k.z), k.z);
  kartik.group.rotation.y = facing(k.x, k.z, s.shots.hand[0], k.z);
  kartik.rest = 'Kneel';
  kartik.play('Kneel');
  kartik.group.visible = true;
  aim.kartikHand = v3(s.shots.hand);
  aim.kartikGaze = eye;
  fish.lookAtTarget(new THREE.Vector3(k.x, s.shots.ground(k.z) + 1, k.z), 1); // she looks at him
  const focus = focusOn(s, eye);
  await playRail(s, rails.pullBack(keyFrom(ctx.stage.camera), s.shots), focus);
  if (!s.cancelled) await playRail(s, rails.orbit(s.shots), focus);
}

/** The pack hangs from your fingers: the arm rises with it at the water's edge. `lower` (0..1) takes the hand from there to the water. */
function holdPack(s: Script, pack: THREE.Object3D): { job: ArmJobHandle; lower: { t: number } } {
  const camera = s.sys.ctx.stage.camera;
  const float = v3(s.shots.float);
  const hold = new THREE.Vector3(FAREWELL.packHold.x, FAREWELL.packHold.y, FAREWELL.packHold.z);
  const lower = { t: 0 };
  const job: ArmJobHandle = {
    hand: (out) => {
      camera.localToWorld(out.copy(hold));
      return out.lerp(float, lower.t * lower.t * (3 - 2 * lower.t));
    },
    // Fingers forward and down, whichever way the camera looks.
    refresh() {
      camera.getWorldQuaternion(turn);
      this.along.set(0, -0.5, -1).applyQuaternion(turn).normalize();
    },
    along: new THREE.Vector3(),
    palm: new THREE.Vector3(0, -1, 0),
    rise: 0,
    goal: 1,
  };
  s.scene.arm.add(pack);
  pack.position.set(0, -0.12, 0.42);
  pack.rotation.set(0, 0, 0);
  pack.scale.setScalar(1);
  pack.visible = true;
  s.cast.arm = job;
  return { job, lower };
}

const turn = new THREE.Quaternion();

/** Back to first person at the water's edge, the pack in your arm; E lowers it onto the water and she breathes out. */
export async function lastPack(s: Script, pack: THREE.Object3D): Promise<void> {
  const { ctx, fish } = s.sys;
  const { packCam, float } = s.shots;
  s.scene.kartik.group.visible = false;
  s.scene.aim.kartikHand = s.scene.aim.kartikGaze = null;
  await playRail(s, rails.toPack(keyFrom(ctx.stage.camera), s.shots), focusOn(s, v3(s.shots.eye)));
  if (s.cancelled) return;
  const held = holdPack(s, pack);
  ctx.focus(false); // Dras and the pack both sharp: a focus on the water blurred him
  await s.until(() => held.job.rise >= 1);
  const spot = { x: packCam.at[0], z: packCam.at[2] };
  await waitForE(s, spot, FAREWELL.packRadius, FAREWELL_PROMPTS.pack);
  if (s.cancelled) return;
  const left = spend(s.run.live.supplies, 'fishPacks', 1);
  if (left) s.run.live.supplies = left; // with none left, it is the one Mom brought
  const lean = rails.lean(s.shots); // you dip toward the water as the hand goes down
  s.cast.hold = null;
  await s.until((dt) => {
    held.lower.t = Math.min(1, held.lower.t + dt / SHOTS.pack.lower);
    lean.pose(held.lower.t * lean.seconds, ctx.stage.camera);
    return held.lower.t >= 1;
  });
  s.cast.hold = lean;
  s.sys.world.scene.attach(pack); // off your hand, onto the water
  pack.position.set(float[0], WATER_Y + 0.05, float[2]);
  pack.rotation.set(0, 0.6, 0);
  s.cast.float = pack;
  held.job.goal = 0; // your arm goes
  fish.lookAtTarget(null, 0); // she lets her head down
  fish.breatheOut();
  if (!s.cancelled) await s.read(FAREWELL_PAGES.pack);
  ctx.focus(false);
}

/** A fish pack bobbing on the water by its side (loaded now, shown by `pack`). */
export async function loadPackOnWater(scene: THREE.Scene): Promise<THREE.Object3D> {
  const pack = await loadModel(propUrl('fishpack'));
  pack.visible = false;
  scene.add(pack);
  return pack;
}

/** Dawn: you stand up over `SHOTS.stand.seconds` and turn to the lake; Mom stands. Returns the per-frame step (true once you stand). */
export function standUp(s: Script): (dt: number) => boolean {
  const camera = s.sys.ctx.stage.camera;
  const rail = rails.stand(keyFrom(camera), s.shots);
  const { mom } = s.scene;
  s.cast.hold = null;
  s.scene.aim.momHand = null;
  s.scene.aim.momGaze = null;
  mom.rest = 'Idle_Neutral';
  mom.play('StandUp', true);
  let t = 0;
  return (dt) => {
    t += dt;
    rail.pose(t, camera);
    if (t < rail.seconds) return false;
    s.cast.hold = rail;
    return true;
  };
}

/** The camera turns from the lake to Mom as she walks up to you; true once it has (it then holds). */
export function turnToMom(s: Script): (dt: number) => boolean {
  const camera = s.sys.ctx.stage.camera;
  const rail = rails.turn(keyFrom(camera), meetPoint(s.scene.mom.group.position, camera.position));
  let t = 0;
  return (dt) => {
    t += dt;
    rail.pose(t, camera);
    if (t < rail.seconds) return false;
    s.cast.hold = rail;
    return true;
  };
}
