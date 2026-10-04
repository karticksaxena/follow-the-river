import * as THREE from 'three/webgpu';
import type { DreamContext } from '../types';
import { buildCanoeScene, pathSlope, pathX, WATER_LEVEL, type CanoeScene } from './canoe-scene';
import { CINEMATIC } from './flashback';
import type { Sounds } from './sounds';

/** Tuning knobs (seconds, metres, m/s). The ride is `seconds` long, then the closing pages. */
export const RIDE = {
  seconds: 72,
  speed: 2.4,
  /** Push-off: the canoe eases up to full speed over this long. */
  easeIn: 3.5,
  /** The calf starts to surface this long before the end, rising over `surface` seconds. */
  calfLead: 20,
  surface: 2.5,
  /** Mom stops rowing this long before the end. */
  rowStopLead: 5,
  /** Glide allowed past `seconds` while the closing pages are read (world is built this long). */
  tail: 40,
  fadeMs: 700,
} as const;

export const SEAT = {
  eye: [0, 1.0, 0.9],
  // Her Sit/Row pelvis is 0.575 m above her feet: this puts it on the canoe's thwart.
  mom: [0, -0.22, -0.9],
  paddle: [0, 0.68, -0.72],
} as const;
/** Calf: side of the canoe (m), pace-keeping drift and how deep it starts. */
export const CALF = { side: 4.2, ahead: 1.6, hidden: -1.7, cruise: -0.15, blow: 0.35 } as const;
export const VOLUME = { water: 0.3, dawn: 0.22, blow: 0.3, dawnFade: 4 } as const;

export const OPENING_PAGES: readonly string[] = ['Mom pushes off from the shore.'];
export const CLOSING_PAGES: readonly string[] = [
  'Mom stops rowing. She has seen it too.',
  'Mom: "Look. She wasn\'t alone."',
  'She smiles for the first time since the river.',
];

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
}

/** Pure: metres travelled by time `t` (eases in, then constant speed). */
export function travelled(t: number): number {
  const { speed, easeIn } = RIDE;
  const s = Math.max(0, t);
  return s < easeIn ? (speed * s * s) / (2 * easeIn) : speed * (s - easeIn / 2);
}

/** Pure: the canoe at `t` (down the river toward -z, yaw faces its bow, a gentle bob and roll). */
export function canoePose(t: number, out: Pose): Pose {
  const z = -travelled(t);
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

const smooth = (k: number): number => {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
};

/** Pure: 1 while Mom rows, easing to 0 as she stops. */
export function rowAmount(t: number): number {
  return 1 - smooth((t - (RIDE.seconds - RIDE.rowStopLead)) / 1.5);
}

export interface CalfPose {
  /** Canoe-local offset and height above the world origin. */
  x: number;
  z: number;
  y: number;
  /** Pitch (nose up while rising). */
  pitch: number;
  visible: boolean;
  /** 0 hidden .. 1 fully surfaced. */
  surfaced: number;
}

/** Pure: the calf beside the canoe at `t`: rises, then keeps pace, weaving a little. */
export function calfPose(t: number, out: CalfPose): CalfPose {
  const k = smooth((t - (RIDE.seconds - RIDE.calfLead)) / RIDE.surface);
  out.surfaced = k;
  out.visible = k > 0;
  out.x = CALF.side + Math.sin(t * 0.5) * 0.5;
  out.z = CALF.ahead + Math.sin(t * 0.37) * 0.7;
  out.y = CALF.hidden + (CALF.cruise - CALF.hidden) * k + Math.sin(t * 1.7) * 0.04 * k;
  out.pitch = (1 - k) * 0.5;
  return out;
}

interface Ride {
  ctx: DreamContext;
  sounds: Sounds;
  cs: CanoeScene;
  t: number;
  started: boolean;
  closing: boolean;
  blown: boolean;
  /** Mom is paddling (Row); she sits still (Sit) once she stops for the calf. */
  rowing: boolean;
  /** Mom's hands: the paddle's shaft is held between them (null if the rig has none). */
  hands: { left: THREE.Object3D; right: THREE.Object3D } | null;
  lastYaw: number;
  pose: Pose;
  calf: CalfPose;
  spot: { x: number; z: number };
}

/** Puts the canoe, Mom, paddle and the calf where time `t` says; returns nothing, allocates nothing. */
function placeAll(r: Ride): void {
  const { cs, t } = r;
  canoePose(t, r.pose);
  const p = r.pose;
  cs.canoe.position.set(p.x, p.y, p.z);
  cs.canoe.rotation.set(0, p.yaw, p.roll);
  const amp = rowAmount(t);
  cs.mom.group.position.set(...SEAT.mom); // her Row clip does the paddling and the twist
  holdPaddle(r);
  if (r.rowing && amp < 0.5) {
    r.rowing = false;
    cs.mom.play('Sit'); // she stops rowing: she has seen it too
  }
  placeCalf(r);
}

const handL = new THREE.Vector3();
const handR = new THREE.Vector3();
const along = new THREE.Vector3();
const SHAFT = new THREE.Vector3(1, 0, 0); // the paddle model lies along x

/** The paddle's shaft runs from her left hand to her right, so it follows the rowing exactly. */
function holdPaddle(r: Ride): void {
  const { cs, hands } = r;
  if (!hands) {
    cs.paddle.position.set(...SEAT.paddle);
    return;
  }
  cs.canoe.updateMatrixWorld(true);
  cs.canoe.worldToLocal(hands.left.getWorldPosition(handL));
  cs.canoe.worldToLocal(hands.right.getWorldPosition(handR));
  cs.paddle.position.addVectors(handL, handR).multiplyScalar(0.5);
  along.subVectors(handR, handL).normalize();
  if (along.lengthSq() > 0) cs.paddle.quaternion.setFromUnitVectors(SHAFT, along);
}

/** Her wrist bones (GLTFLoader strips the '.' from Wrist.L / Wrist.R). */
function findHands(mom: THREE.Object3D): Ride['hands'] {
  const left = mom.getObjectByName('WristL');
  const right = mom.getObjectByName('WristR');
  return left && right ? { left, right } : null;
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

/** Per frame: the ride clock, the camera glued to the seat (its look is the mouse's), animations. */
function frame(r: Ride, dt: number, onEnd: () => void): void {
  const { ctx, cs } = r;
  const live = r.closing || (r.started && !ctx.isPaused());
  if (live) {
    r.t = Math.min(RIDE.seconds + RIDE.tail, r.t + dt);
    cs.mom.update(dt);
    cs.calf.mixer.update(dt);
  }
  placeAll(r);
  cs.canoe.updateMatrixWorld(true);
  const { camera } = ctx.stage;
  cs.canoe.localToWorld(camera.position.set(...SEAT.eye));
  camera.rotation.y += r.pose.yaw - r.lastYaw; // the view turns with the bend, the mouse adds to it
  r.lastYaw = r.pose.yaw;
  camera.updateMatrixWorld(true);
  cs.sky.position.copy(camera.position);
  if (!r.blown && r.calf.surfaced > 0.6) {
    r.blown = true;
    ctx.audio.once(r.sounds.blow, VOLUME.blow);
  }
  if (!r.closing && r.t >= RIDE.seconds) {
    r.closing = true;
    ctx.read(CLOSING_PAGES, onEnd);
  }
}

/**
 * The last scene: Mom rows the player down a sunrise river and the orca calf surfaces beside them.
 * Resolves when the closing pages are over, with the screen faded to black and the previous scene
 * back on the stage (the caller shows the credits). Safe against quits: if anything else replaces
 * the stage scene, the ride tears itself down and resolves.
 */
export function playCanoeRide(ctx: DreamContext, sounds: Sounds): Promise<void> {
  return new Promise((resolve) => {
    ctx.hold(); // freezes the chapter while the world builds
    void run(ctx, sounds, resolve);
  });
}

async function run(ctx: DreamContext, sounds: Sounds, done: () => void): Promise<void> {
  const { stage, overlay } = ctx;
  const previous = stage.scene;
  const length = RIDE.speed * (RIDE.seconds + RIDE.tail);
  const [cs] = await Promise.all([
    buildCanoeScene(length).catch(() => null),
    overlay.fade(true, RIDE.fadeMs),
  ]);
  if (stage.scene !== previous || !cs) {
    cs?.dispose();
    if (cs) return done();
    // A failed load still ends the dream with the pages as text.
    return ctx.read(CLOSING_PAGES, done);
  }
  const water = ctx.audio.loop(sounds.water, VOLUME.water);
  const pad = ctx.audio.loop(sounds.dawn, 0);
  const r: Ride = {
    ctx,
    sounds,
    cs,
    t: 0,
    started: false,
    closing: false,
    blown: false,
    rowing: true,
    hands: findHands(cs.mom.group),
    lastYaw: 0,
    pose: { x: 0, y: 0, z: 0, yaw: 0, roll: 0 },
    calf: { x: 0, z: 0, y: 0, pitch: 0, visible: false, surfaced: 0 },
    spot: { x: 0, z: 0 },
  };
  let live = true;
  const teardown = (): void => {
    if (!live) return;
    live = false;
    stop();
    for (const sound of [water, pad]) {
      sound.stop();
      sound.disconnect();
    }
    ctx.overlay.root.classList.remove(CINEMATIC);
    if (stage.scene === cs.scene) stage.scene = previous;
    cs.dispose();
    done();
  };
  const onEnd = (): void => void overlay.fade(true, RIDE.fadeMs).then(teardown);
  const stop = stage.addUpdater((dt) => {
    if (stage.scene !== cs.scene) return teardown(); // someone else took the stage
    try {
      frame(r, dt, onEnd);
      pad.setVolume(VOLUME.dawn * Math.min(1, r.t / VOLUME.dawnFade));
    } catch (error) {
      teardown();
      throw error;
    }
  });
  begin(r);
}

/** Puts the world on stage, faces the camera down the river and shows the opening page. */
function begin(r: Ride): void {
  const { ctx, cs } = r;
  const { camera } = ctx.stage;
  canoePose(0, r.pose);
  r.lastYaw = r.pose.yaw;
  camera.rotation.set(0, r.pose.yaw + Math.PI, 0, 'YXZ');
  ctx.stage.scene = cs.scene;
  ctx.overlay.root.classList.add(CINEMATIC);
  void ctx.overlay.fade(false, RIDE.fadeMs);
  ctx.read(OPENING_PAGES, () => {
    r.started = true;
  });
}
