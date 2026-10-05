import * as THREE from 'three/webgpu';
import { ANATOMY } from './dras-anatomy';
import { playBlow, playSplash } from './fish-sound';
import type { FishState } from './fish-state';
import { blowAt } from './orca-sick';
import { beached, STRAND, strandBend, strandPhases, strandPose, type Strand } from './orca-strand';

/** The jaw, the blow and the last leap: the orca's bone and mist work, kept out of fish.ts. */
const FADE = 0.25;
const SETTLE_FADE = 0.5;
/** Where the blow rises from: ahead of the body's centre and up near its back (m). */
const BLOWHOLE = ANATOMY.blowhole;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const turn = new THREE.Quaternion();

/** Opens her jaw bone `k` (0 shut .. 1 open) on top of the animation (call after `mixer.update`). */
export function openJaw(f: FishState, k: number): void {
  f.jaw?.quaternion.multiply(turn.setFromAxisAngle(X_AXIS, -ANATOMY.jawOpen * k));
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
