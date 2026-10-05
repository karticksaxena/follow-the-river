import * as THREE from 'three/webgpu';
import { ANATOMY } from './dras-anatomy';
import { WAKE_SIZE, wakeScroll } from './fish-parts';
import { playBlow, playSplash } from './fish-sound';
import type { FishState } from './fish-state';
import { blowAt } from './orca-sick';
import {
  beached,
  STRAND,
  strandBend,
  strandPhases,
  strandPose,
  swimming,
  type Strand,
} from './orca-strand';
import { WATER_Y } from './river';

/** The jaw, the blow and the last leap: the orca's bone and mist work, kept out of fish.ts. */
const FADE = 0.25;
const SETTLE_FADE = 0.5;
/** Where the blow rises from: ahead of the body's centre and up near its back (m). */
const BLOWHOLE = ANATOMY.blowhole;
const WAKE_HIDE_Y = WATER_Y + 0.35; // the orca is airborne above this: no shadow
const X_AXIS = new THREE.Vector3(1, 0, 0);
const turn = new THREE.Quaternion();

/** Opens her jaw bone `k` (0 shut .. 1 open) on top of the animation (call after `mixer.update`). */
export function openJaw(f: FishState, k: number): void {
  f.jaw?.quaternion.multiply(turn.setFromAxisAngle(X_AXIS, -ANATOMY.jawOpen * k));
}

/**
 * Remembers the jaw, head and trunk as the mixer posed them (call right after `mixer.update`, before
 * `openJaw` / `turnHead`). The mixer only rewrites a bone whose animated value changed, so a bone a
 * clip holds still would keep every frame's turn on top of the last: the jaw span in circles.
 */
export function keepPose(f: FishState): void {
  for (let i = 0; i < f.modBones.length; i++) f.modQ[i].copy(f.modBones[i].quaternion);
  f.modded = true;
}

/** Puts them back (call before `mixer.update`, after `unsag`: the sag went on first, the turns after). */
export function restorePose(f: FishState): void {
  if (!f.modded) return;
  for (let i = 0; i < f.modBones.length; i++) f.modBones[i].quaternion.copy(f.modQ[i]);
  f.modded = false;
}

/** It breathes out: the blow's sound and its mist. */
export function blowOut(f: FishState): void {
  playBlow(f);
  f.mistT = 0;
  f.mist.visible = true;
}

/** The mist rises from the blowhole, grows and fades. */
export function stepMist(f: FishState, dt: number): void {
  if (f.mistT < 0) return;
  f.mistT += dt;
  const b = f.blowOut;
  if (!blowAt(f.mistT, f.sickness, b)) {
    f.mistT = -1;
    f.mist.visible = false;
    return;
  }
  const { x, y, z } = f.root.position;
  const ahead = BLOWHOLE.ahead;
  f.mist.position.set(
    x - Math.sin(f.yaw) * ahead,
    y + BLOWHOLE.up + b.rise,
    z - Math.cos(f.yaw) * ahead,
  );
  f.mist.scale.setScalar(b.size);
  f.mist.material.opacity = b.opacity;
}

/** Her spine and tail sag `k` (0..1) of `STRAND.bend` on top of the animation (after `mixer.update`). */
export function sag(f: FishState, k: number): void {
  f.sagK = k;
  if (k <= 0) return;
  const q = turn.setFromAxisAngle(X_AXIS, -STRAND.bend.angle * k);
  for (const bone of f.sagBones) bone.quaternion.multiply(q);
}

/**
 * Takes last frame's sag off (call before `mixer.update`). The mixer only writes a bone whose
 * animated value changed, so a bone a clip holds still would keep every frame's sag and pile it up.
 */
export function unsag(f: FishState): void {
  if (f.sagK <= 0) return;
  const q = turn.setFromAxisAngle(X_AXIS, STRAND.bend.angle * f.sagK);
  for (const bone of f.sagBones) bone.quaternion.multiply(q);
  f.sagK = 0;
}

/** One frame of the last leap: pose her, blow when she surfaces, the splash on landing, then settle. */
export function stepStrand(f: FishState, s: Strand, dt: number): void {
  const { rise, dip, leap } = strandPhases(s);
  const was = s.t;
  s.t += dt;
  strandPose(s, f.pose);
  const { pose } = f;
  f.root.position.set(pose.x, pose.y, pose.z);
  f.yaw = pose.yaw;
  f.root.rotation.set(pose.pitch, pose.yaw, 0);
  if (was < rise && s.t >= rise) {
    playSplash(f, pose.x, pose.z); // she breaks the surface and blows
    blowOut(f);
  }
  if (was < dip && s.t >= dip) {
    f.lunge.reset().play();
    f.lunge.crossFadeFrom(f.swim, FADE, false);
  }
  if (was < leap && beached(s)) {
    playSplash(f, pose.x, pose.z - 3, true);
    f.settled.reset().play(); // the Beached clip: the pose her rest is fitted to
    f.settled.crossFadeFrom(f.lunge, SETTLE_FADE, false);
  }
  sag(f, strandBend(s));
}

/** The V's tip sits by the fin and opens out behind the orca (its back is +z turned by yaw). */
export function placeWake(f: FishState): void {
  const behind = WAKE_SIZE.length / 2 - 1;
  const { x, z } = f.root.position;
  f.wake.position.set(x + Math.sin(f.yaw) * behind, WATER_Y + 0.02, z + Math.cos(f.yaw) * behind);
  f.wake.rotation.set(-Math.PI / 2, f.yaw, 0, 'YXZ');
  if (f.wake.material.map) f.wake.material.map.offset.y = wakeScroll(f.time);
  // The wake shows while she swims in across the lake, never once she is leaping or lying.
  f.wake.visible = f.strand
    ? swimming(f.strand)
    : f.root.position.y < WAKE_HIDE_Y && f.finale === 'no';
}

/** Takes last frame's sag, jaw and head turns off, lets the clips pose her, and remembers that pose. */
export function stepMixer(f: FishState, dt: number): void {
  unsag(f);
  restorePose(f);
  f.mixer.update(dt);
  keepPose(f);
}
