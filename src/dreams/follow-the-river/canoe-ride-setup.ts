import * as THREE from 'three/webgpu';
import type { DreamContext } from '../types';
import { findArms } from './canoe-paddle';
import type { Blade, Ride } from './canoe-ride';
import type { CanoeScene } from './canoe-scene';
import { WATER_LEVEL } from './canoe-scene';
import { newScript } from './canoe-timing';
import { createMotion } from './motion';
import { picker, type Sounds } from './sounds';

/** Half the paddle's length: its blades sit this far from its middle, along x (see canoe-scene). */
const BLADE_X = 1.2;

/** One marker and one positional sound per blade, on the paddle (they move with it). */
function makeBlades(cs: CanoeScene, ctx: DreamContext): Blade[] {
  return [-BLADE_X, BLADE_X].map((x) => {
    const mark = new THREE.Object3D();
    mark.position.x = x;
    cs.paddle.add(mark);
    return { mark, sound: ctx.audio.positional(mark, 3), y: -Infinity };
  });
}

/** The ride's state at t = 0: the scene's actors, the sounds' pickers, the fireflies. */
export function makeRide(ctx: DreamContext, sounds: Sounds, cs: CanoeScene): Ride {
  const { stage } = ctx;
  const r: Ride = {
    ctx,
    sounds,
    cs,
    t: 0,
    dt: 0,
    started: false,
    script: newScript(),
    reading: false,
    look: 0,
    shot: null,
    shotT: 0,
    fading: false,
    ended: false,
    endedFor: 0,
    onEnd: () => {
      r.ended = true;
    },
    heads: { mom: cs.mom.bone('Head'), kartik: cs.kartik.bone('Head') },
    over: false,
    blown: false,
    rowing: true,
    arms: findArms(cs.mom.group),
    paddled: false,
    lastYaw: 0,
    pose: { x: 0, y: 0, z: 0, yaw: 0, roll: 0 },
    calf: { x: 0, z: 0, y: 0, pitch: 0, visible: false, surfaced: 0 },
    spot: { x: 0, z: 0 },
    blades: makeBlades(cs, ctx),
    strokes: picker(sounds.paddles),
    blows: picker(sounds.blows),
    motion: createMotion(cs.scene, stage.camera, {
      fires: [],
      fireflies: { kind: 'ring', y: WATER_LEVEL + 0.3 },
    }),
  };
  r.motion.env.fireflies = true; // it is dawn: the banks are alive
  return r;
}
