import * as THREE from 'three/webgpu';
import { WET } from './fish-parts';
import type { FishState } from './fish-state';
import { blowOut, openJaw } from './fish-strand';
import { beached } from './orca-strand';

/**
 * How she dies on the shore (Plan 9): she breathes (the Beached clip, a pale blow on every other
 * breath), lifts her tail weakly now and then, lifts her head and turns it to you, parts her jaw to
 * answer Mom, and at the end breathes out (the Exhale clip) while her eye dims. Tuning knobs.
 */
export const END = {
  /** How far her head may turn (rad), and the least it lifts when she looks at you. */
  head: { yaw: 0.35, pitch: 0.25, lift: 0.12 },
  /** Seconds between tail lifts, and how many times longer they get once the song is over. */
  lifts: { min: 6, max: 9, rare: 2.5 },
  /** Her head's and jaw's ease (1/s). */
  ease: { head: 2, jaw: 3 },
  /** The Beached loop (s) and when in it she breathes out. */
  breath: { loop: 4, out: 2.3 },
  /** Crossfades (s) between her clips, and how long the last breath takes. */
  fade: { lift: 0.3, exhale: 0.5, exhaleSeconds: 3 },
  /** Her eye at the end: how rough (no glint) it gets. */
  eyeRoughness: 0.9,
} as const;

/**
 * The TailLift clip's weight on top of Beached (weight 1): the mixer blends by weight / (1 + weight),
 * so 0.4 gives ~0.29 of the clip, its 1.4 m rise becoming about 0.4 m. Tuning knob.
 */
export const TAIL_LIFT_WEIGHT = 0.4;

export interface Farewell {
  /** What her head follows (a reference, read each frame), its share now and wanted; her jaw's share now and wanted. */
  target: THREE.Vector3 | null;
  look: number;
  lookGoal: number;
  jaw: number;
  jawGoal: number;
  /** Seconds until the next tail lift, and whether they are rare now. */
  liftIn: number;
  rare: boolean;
  /** The Beached clip's time last frame, and breaths so far (she blows on every other one). */
  phase: number;
  breaths: number;
  /** Seconds into the last breath (-1: not yet), and whether she has landed (her breathing and lifts have started). */
  exhaled: number;
  landed: boolean;
}

export const newFarewell = (): Farewell => ({
  target: null,
  look: 0,
  lookGoal: 0,
  jaw: 0,
  jawGoal: 0,
  liftIn: 0,
  rare: false,
  phase: 0,
  breaths: 0,
  exhaled: -1,
  landed: false,
});

/** Pure: seconds until her next tail lift for a random `r` in 0..1. */
export const liftDelay = (r: number, rare: boolean): number =>
  (END.lifts.min + r * (END.lifts.max - END.lifts.min)) * (rare ? END.lifts.rare : 1);

/** Pure: she blows on every other breath (the first one is the quiet one). */
export const blowsOn = (breath: number): boolean => breath % 2 === 1;

/** Pure: her eye's roughness at `k` (0 bright .. 1 dull): the glint goes out. */
export const eyeRoughness = (k: number): number => WET.eye + (END.eyeRoughness - WET.eye) * k;

const a = new THREE.Vector3();
const delta = new THREE.Quaternion();
const own = new THREE.Quaternion();
const undo = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const clamp = THREE.MathUtils.clamp;

/**
 * Turns her `head` bone (the chain's root, its pivot at her nose, her body toward -z in its parent's
 * frame) to look at `target` (world), by `share`, and lifts it at least `END.head.lift`. Her `trunk`
 * (the head's child, the first spine bone) is put back where the animation had it, so only the head
 * moves, not the whole 7 m body round her nose. Call after `mixer.update`. The clips animate the
 * bones' rotations only, never their positions, so the trunk's position is set from `trunkRest`
 * (its position as loaded) every call: turning it in place would add up frame after frame.
 */
export function turnHead(
  head: THREE.Object3D,
  trunk: THREE.Object3D,
  trunkRest: THREE.Vector3,
  target: THREE.Vector3,
  share: number,
): void {
  const parent = head.parent;
  if (!parent || share <= 0) return;
  parent.updateWorldMatrix(true, false);
  a.copy(target);
  parent.worldToLocal(a);
  a.sub(head.position); // from her nose
  const yaw = clamp(Math.atan2(-a.x, -a.z), -END.head.yaw, END.head.yaw);
  const up = clamp(Math.atan2(a.y, Math.hypot(a.x, a.z)), -END.head.pitch, END.head.pitch);
  const pitch = Math.max(up, END.head.lift);
  delta.setFromEuler(euler.set(pitch * share, yaw * share, 0)); // her -z faces ahead: +pitch lifts the nose
  own.copy(head.quaternion);
  head.quaternion.premultiply(delta);
  // The trunk's world transform stays: undo = own^-1 * delta^-1 * own (the head's turn in its own frame).
  undo.copy(own).invert().multiply(delta.invert()).multiply(own);
  trunk.position.copy(trunkRest).applyQuaternion(undo);
  trunk.quaternion.premultiply(undo);
}

/** Her tail lifts once, weakly, and settles back into her breathing (see `afterLift`). */
export function liftTail(f: FishState): void {
  f.lift.reset().play();
  f.lift.setEffectiveWeight(TAIL_LIFT_WEIGHT); // over Beached, which keeps breathing
}

/** After a tail lift the breathing carries on. */
export function afterLift(f: FishState): void {
  if (f.end.exhaled >= 0) return;
  f.lift.fadeOut(END.fade.lift); // Beached never stopped; the lift fades off it
}

/** The last breath: a pale blow and the Exhale clip (she sags, her jaw closes, she is still). */
export function startExhale(f: FishState): void {
  const e = f.end;
  if (e.exhaled >= 0) return;
  e.exhaled = 0;
  blowOut(f);
  f.exhale.reset().play();
  f.exhale.crossFadeFrom(f.lift.isRunning() ? f.lift : f.settled, END.fade.exhale, false);
}

const ease = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** Her head and jaw follow what they were told. */
function pose(f: FishState, dt: number): void {
  const e = f.end;
  e.look += (e.lookGoal - e.look) * ease(END.ease.head, dt);
  e.jaw += (e.jawGoal - e.jaw) * ease(END.ease.jaw, dt);
  f.trunk?.position.copy(f.trunkRest); // un-turned unless the head turns below
  if (f.head && f.trunk && e.target && e.look > 0.001) {
    turnHead(f.head, f.trunk, f.trunkRest, e.target, e.look);
  }
  if (e.jaw > 0.001) openJaw(f, e.jaw);
}

/** Every breath: a pale blow on the out-breath of every other one. */
function breathe(f: FishState): void {
  const e = f.end;
  if (e.exhaled >= 0 || f.settled.getEffectiveWeight() < 0.5) return;
  const phase = f.settled.time % END.breath.loop;
  if (e.phase < END.breath.out && phase >= END.breath.out && blowsOn(e.breaths++)) blowOut(f);
  e.phase = phase;
}

/** The weak tail lifts, spaced out. */
function struggle(f: FishState, dt: number): void {
  const e = f.end;
  if (e.exhaled >= 0) return;
  e.liftIn -= dt;
  if (e.liftIn > 0 || f.lift.isRunning()) return;
  liftTail(f);
  e.liftIn = liftDelay(Math.random(), e.rare);
}

/** One frame of her dying on the shore (after `mixer.update` and the strand's sag). */
export function stepFarewell(f: FishState, dt: number): void {
  const e = f.end;
  if (!f.strand || !beached(f.strand)) return;
  if (!e.landed) {
    e.landed = true;
    e.liftIn = liftDelay(Math.random(), e.rare);
  }
  struggle(f, dt);
  breathe(f);
  pose(f, dt);
  if (e.exhaled < 0) return;
  e.exhaled += dt;
  dimEye(f, Math.min(1, e.exhaled / END.fade.exhaleSeconds));
}

/** Her eye at `k` (0 bright .. 1 dull): no glint (rough, no sheen) and no emissive. */
function dimEye(f: FishState, k: number): void {
  if (!f.eye) return;
  f.eye.roughness = eyeRoughness(k);
  f.eye.emissiveIntensity = 1 - k;
  f.eye.envMapIntensity = 1 - k;
}

/** Back to her living eye and a fresh farewell. */
export function resetFarewell(f: FishState): void {
  Object.assign(f.end, newFarewell());
  f.lift.stop();
  f.exhale.stop();
  dimEye(f, 0);
}
