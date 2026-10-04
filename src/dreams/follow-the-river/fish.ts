import type * as THREE from 'three/webgpu';
import type { AudioBus } from '../../engine/audio';
import { loadModel, loadSkinned } from '../../engine/models';
import type { Vec3 } from '../../engine/ray';
import { waterlineX } from './banks';
import { ANATOMY } from './dras-anatomy';
import {
  cruiseHeading,
  cruiseTargetX,
  FISH,
  inWaterX,
  nextSurfacing,
  NIGHT_STRIKE,
  pickStrike,
  smooth,
  surfaceRoll,
  surfaceTime,
  turnToward,
  WAKE_SIZE,
} from './fish-parts';
import { callOut, playBlow, playSplash } from './fish-sound';
import { createState, type Finale, type FishState, type Rise } from './fish-state';
import { characterUrl, propUrl } from './kits';
import { newGrab, stepGrab, type GrabHooks, type StrikeStyle } from './orca-grab';
import { blowAt, mistColor, SICK } from './orca-sick';
import {
  beached,
  newStrand,
  STRAND,
  strandPose,
  strandRest,
  strandRoll,
  type Strand,
} from './orca-strand';
import { EDGE_X, WATER_Y } from './river';
import type { Sounds } from './sounds';
import type { Horde } from './zombies/horde';
export { canThrow, cruiseHeading, FISH, pickStrike, strikesFor, styleFor } from './fish-parts';
export type { Finale } from './fish-state';

// Tuning knobs (metres, seconds); heights are relative to the river's WATER_Y.
const TAKE_PEAK_Y = WATER_Y - 0.05;
const WAKE_HIDE_Y = WATER_Y + 0.35; // the orca is airborne above this: no shadow
const TAKE_TIME = 2.6;
const FADE = 0.25;
const LAG_Z = 6;
const PACK_DISTANCE = 4;
const PACK_TIME = 1;
const PACK_ARC = 1.2;
const SURFACE_DRIFT = 1.5; // metres downstream while surfacing
/** Where the blow rises from: ahead of the body's centre and up near its back (m). */
const BLOWHOLE = ANATOMY.blowhole;

export interface Fish {
  /** The ending's state (read it each frame; it only moves forward). */
  readonly finale: Finale;
  /** True once its last leap has landed it on the shore. */
  readonly beached: boolean;
  /**
   * Its last leap: out of the lake onto the shore, nose at (noseX, noseZ), where it lies breathing.
   * `ground(z)` is the shore height. Any grab in progress lets go (the zombie drowns).
   */
  strand(noseX: number, noseZ: number, ground: (z: number) => number, horde: Horde): void;
  /** One last breath (a blow), then it is still. */
  breatheOut(): void;
  /** How sick it is (0 well .. 1 dying): duller, blotched, slower, a redder blow. */
  setSickness(k: number): void;
  /** Called when a zombie she took drowns (the run counts it and sickens her). */
  onEat: (() => void) | null;
  /** Night: strikes left this phase. */
  readonly strikes: number;
  /** Arms `strikes` for the night, struck in `style` (a normal night's by default). */
  arm(strikes: number, style?: StrikeStyle): void;
  /** Throw a pack: arc into the water, splash, the orca surfaces once to take it. */
  feed(from: Vec3): void;
  /** Swims alongside the player (fin just breaking the surface); strikes zombies at night. */
  update(dt: number, player: { x: number; z: number }, horde: Horde | null, night: boolean): void;
  reset(): void;
  dispose(): void;
}

/** It breathes out: the blow's sound and its mist. */
function blowOut(f: FishState): void {
  playBlow(f);
  f.mistT = 0;
  f.mist.visible = true;
}

/** The mist rises from the blowhole, grows and fades. */
function stepMist(f: FishState, dt: number): void {
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

function startRise(
  f: FishState,
  r: Partial<Rise> & { toX: number; toZ: number; dur: number; peak: number },
): void {
  const rise: Rise = {
    t: 0,
    fromX: f.root.position.x,
    fromZ: f.root.position.z,
    done: false,
    surface: false,
    ...r,
  };
  f.rise = rise;
}

function endRise(f: FishState): void {
  f.root.rotation.z = 0;
  f.rise = null;
}

function stepRise(f: FishState, r: Rise, dt: number): void {
  r.t += dt;
  const s = Math.min(1, r.t / r.dur);
  const move = smooth(Math.min(1, s * 2));
  const x = r.fromX + (r.toX - r.fromX) * move;
  const z = r.fromZ + (r.toZ - r.fromZ) * move;
  const dx = x - f.root.position.x;
  const dz = z - f.root.position.z;
  if (dx * dx + dz * dz > 1e-6) f.yaw = turnToward(f.yaw, Math.atan2(-dx, -dz), 6 * dt);
  const y = f.cruiseY + (r.peak - f.cruiseY) * Math.sin(Math.PI * s);
  f.root.position.set(inWaterX(x, f.yaw, f.waterline), y, z);
  if (r.surface) f.root.rotation.z = surfaceRoll(s);
  if (!r.done && s >= 0.5) {
    r.done = true;
    playSplash(f, x, z);
    if (r.surface) blowOut(f);
  }
  if (s >= 1) endRise(f);
}

function cruise(f: FishState, dt: number, player: { x: number; z: number }): void {
  const pos = f.root.position;
  const targetZ = player.z - LAG_Z;
  const targetX = cruiseTargetX(f.waterline, f.time);
  const dz = targetZ - pos.z;
  const follow = FISH.follow * (1 - SICK.slow * f.sickness);
  const stepZ = Math.sign(dz) * Math.min(Math.abs(dz), follow * dt);
  const x = pos.x + (targetX - pos.x) * Math.min(1, 2 * dt);
  const dx = x - pos.x;
  f.yaw = turnToward(f.yaw, cruiseHeading(dx / dt, stepZ / dt), 3 * dt);
  const y = pos.y + (f.cruiseY - pos.y) * Math.min(1, 3 * dt);
  pos.set(inWaterX(x, f.yaw, f.waterline), y, pos.z + stepZ);
}

function tryStrike(f: FishState, player: { x: number; z: number }, horde: Horde): void {
  f.count = 0;
  horde.forEachAlive(f.collect);
  const id = pickStrike(f.buffer, f.count, player, EDGE_X, f.style.reach);
  if (id === null) return;
  let zx = 0;
  let zz = 0;
  for (let i = 0; i < f.count; i++) {
    if (f.buffer[i * 3] === id) {
      zx = f.buffer[i * 3 + 1];
      zz = f.buffer[i * 3 + 2];
    }
  }
  f.strikes--;
  f.cooldown = f.style.cooldown;
  const { x, y, z } = f.root.position;
  const from = { x, y, z, yaw: f.yaw, pitch: 0 };
  f.grab = newGrab(from, id, zx, zz, f.cruiseY, f.style, f.waterline);
}

/** Bursting out at z: the railing there breaks and the water explodes. */
function grabHooks(f: FishState): GrabHooks {
  return {
    breach: (z) => {
      f.onBreach(z);
      playSplash(f, EDGE_X + 0.5, z, true);
    },
    splash: (x, z) => playSplash(f, x, z),
  };
}

/** One frame of a grab: pose the orca from it; the Lunge clip plays from the burst. */
function stepOrcaGrab(f: FishState, dt: number, horde: Horde | null): void {
  const g = f.grab;
  if (!g) return;
  const before = g.t;
  const going = stepGrab(g, dt, horde, f.ground, f.hooks, f.pose);
  const { pose } = f;
  f.root.position.set(pose.x, pose.y, pose.z);
  f.root.rotation.x = pose.pitch;
  f.yaw = pose.yaw;
  if (before < g.approach && g.t >= g.approach) {
    f.lunge.reset().play();
    f.lunge.crossFadeFrom(f.swim, FADE, false);
  }
  if (!going) {
    if (g.bitten && g.victim >= 0) {
      callOut(f); // an excited call
      f.onEat?.(); // stepGrab has just drowned it
    }
    endGrab(f);
  }
}

function endGrab(f: FishState): void {
  if (f.grab && f.grab.t >= f.grab.approach) {
    f.swim.enabled = true;
    f.swim.crossFadeFrom(f.lunge, FADE, false);
  }
  f.grab = null;
  f.root.rotation.x = 0;
}

function stepPack(f: FishState, dt: number): void {
  f.packT += dt;
  const s = Math.min(1, f.packT / PACK_TIME);
  f.packModel.position.lerpVectors(f.packFrom, f.packTo, s);
  f.packModel.position.y += PACK_ARC * 4 * s * (1 - s);
  f.packModel.rotation.y += 6 * dt;
  if (s < 1) return;
  f.packT = -1;
  f.packModel.visible = false;
  playSplash(f, f.packTo.x, f.packTo.z);
  f.takePending = true;
}

function placeWake(f: FishState): void {
  // The V's tip sits by the fin and opens out behind the orca (its back is +z turned by yaw).
  const behind = WAKE_SIZE.length / 2 - 1;
  const { x, z } = f.root.position;
  f.wake.position.set(x + Math.sin(f.yaw) * behind, WATER_Y + 0.02, z + Math.cos(f.yaw) * behind);
  f.wake.rotation.set(-Math.PI / 2, f.yaw, 0, 'YXZ');
  f.wake.visible = f.root.position.y < WAKE_HIDE_Y && f.finale === 'no';
}

function startTake(f: FishState): void {
  f.takePending = false;
  callOut(f); // a soft one: the pack reached her
  startRise(f, {
    toX: f.packTo.x + 1.2,
    toZ: f.packTo.z + 1.5,
    dur: TAKE_TIME,
    peak: TAKE_PEAK_Y,
  });
}

function startSurface(f: FishState): void {
  const { x, z } = f.root.position;
  f.surfaceIn = nextSurfacing(Math.random(), f.sickness);
  startRise(f, {
    toX: x,
    toZ: z - SURFACE_DRIFT,
    dur: surfaceTime(f.sickness),
    peak: f.surfaceY,
    surface: true,
  });
}

/** The last leap (see orca-strand.ts): whatever it was doing, it lets go and swims for the shore. */
function startStrand(
  f: FishState,
  noseX: number,
  noseZ: number,
  ground: (z: number) => number,
  horde: Horde,
): void {
  if (f.rise) endRise(f);
  if (f.grab) {
    if (f.grab.bitten && f.grab.victim >= 0) horde.drown(f.grab.victim);
    endGrab(f);
  }
  f.strikes = 0;
  f.takePending = false;
  f.finale = 'stranded';
  const { x, y, z } = f.root.position;
  f.strand = newStrand({ x, y, z, yaw: f.yaw, pitch: 0 }, strandRest(noseX, noseZ, ground));
}

function stepStrand(f: FishState, s: Strand, dt: number): void {
  const was = beached(s);
  s.t += dt;
  strandPose(s, f.pose);
  const { pose } = f;
  f.root.position.set(pose.x, pose.y, pose.z);
  f.yaw = pose.yaw;
  f.root.rotation.set(pose.pitch, pose.yaw, strandRoll(s));
  if (!was && s.t >= STRAND.approach) {
    f.lunge.reset().play();
    f.lunge.crossFadeFrom(f.swim, FADE, false);
  }
  if (!was && beached(s)) playSplash(f, pose.x, pose.z - 3, true);
}

function updateFish(
  f: FishState,
  dt: number,
  player: { x: number; z: number },
  horde: Horde | null,
  night: boolean,
): void {
  // A zero-length frame (the first one, or right after a pause) would make cruise() divide 0 by 0:
  // the heading turned NaN for good and the orca was never drawn again.
  if (!(dt > 0)) return;
  f.time += dt;
  f.mixer.update(dt);
  if (!f.placed) {
    f.placed = true;
    f.root.visible = true; // hidden until placed, so it never flashes at the origin
    f.root.position.set(cruiseTargetX(f.waterline, 0), f.cruiseY, player.z - LAG_Z);
    f.surfaceIn = nextSurfacing(Math.random(), f.sickness);
  }
  f.cooldown = Math.max(0, f.cooldown - dt);
  stepMist(f, dt);
  if (f.strand) {
    stepStrand(f, f.strand, dt);
    placeWake(f);
    return;
  }
  if (f.packT >= 0) stepPack(f, dt);
  if (f.grab) stepOrcaGrab(f, dt, horde);
  else if (f.rise) stepRise(f, f.rise, dt);
  else {
    if (f.takePending) startTake(f);
    else if (night && f.strikes > 0 && f.cooldown === 0 && horde) tryStrike(f, player, horde);
    if (!f.rise && !f.grab) {
      f.surfaceIn -= dt;
      if (f.surfaceIn <= 0) startSurface(f);
      else cruise(f, dt, player);
    }
  }
  f.root.rotation.y = f.yaw;
  placeWake(f);
}

function feedFish(f: FishState, from: Vec3): void {
  f.packFrom.set(from.x, from.y, from.z);
  f.packTo.set(EDGE_X + PACK_DISTANCE, WATER_Y, from.z);
  f.packT = 0;
  f.packModel.visible = true;
  f.packModel.position.copy(f.packFrom);
}

function resetFish(f: FishState): void {
  f.strikes = 0;
  f.cooldown = 0;
  f.placed = false;
  f.root.visible = false;
  f.packT = -1;
  f.takePending = false;
  f.packModel.visible = false;
  for (const a of [f.splash, f.thump, f.voice]) if (a.isPlaying) a.stop();
  if (f.grab || f.strand) {
    f.lunge.stop();
    f.swim.reset().play();
  }
  f.swim.timeScale = 1;
  f.rise = null;
  f.grab = null; // horde.reset parks a zombie still in the jaws
  f.strand = null;
  f.finale = 'no';
  f.mistT = -1;
  f.mist.visible = false;
  f.surfaceIn = nextSurfacing(Math.random(), f.sickness);
  f.root.rotation.set(0, f.yaw, 0);
}

/** Frees the orca's own resources, including its wake plane's geometry, material and texture. */
function disposeFish(f: FishState): void {
  if (f.splash.isPlaying) f.splash.stop();
  for (const a of [f.blow, f.thump, f.voice]) if (a.isPlaying) a.stop();
  f.splashAt.remove(f.splash, f.blow, f.thump);
  f.root.remove(f.voice);
  f.mixer.stopAllAction();
  f.mixer.uncacheRoot(f.body);
  f.sick.dispose();
  f.scene.remove(f.root, f.wake, f.packModel, f.splashAt, f.mist);
  f.mist.material.map?.dispose();
  f.mist.material.dispose();
  f.wake.geometry.dispose();
  f.wake.material.map?.dispose();
  f.wake.material.dispose();
}

// The intro's river has natural banks.
const NO_BANK = {
  ground: (): number => WATER_Y,
  onBreach: (): void => undefined,
  waterline: waterlineX('natural'),
};

export async function createFish(
  scene: THREE.Scene,
  audio: AudioBus,
  sounds: Sounds,
  // Without a bank (the intro), the orca never takes anyone.
  bank: {
    ground: (x: number) => number;
    onBreach: (z: number) => void;
    waterline: number;
  } = NO_BANK,
): Promise<Fish> {
  const [asset, packModel] = await Promise.all([
    loadSkinned(characterUrl('orca')),
    loadModel(propUrl('fishpack')),
  ]);
  const f = createState(scene, audio, sounds, asset, packModel, bank);
  f.hooks = grabHooks(f);
  return {
    get finale() {
      return f.finale;
    },
    get beached() {
      return f.strand !== null && beached(f.strand);
    },
    strand: (noseX, noseZ, ground, horde) => startStrand(f, noseX, noseZ, ground, horde),
    breatheOut() {
      blowOut(f);
      if (f.strand) f.strand.still = true;
      f.swim.timeScale = 0; // the tail stops
    },
    setSickness(k) {
      f.sickness = Math.min(1, Math.max(0, k));
      f.sick.set(f.sickness);
      mistColor(f.sickness, f.mist.material.color);
    },
    set onEat(fn) {
      f.onEat = fn;
    },
    get onEat() {
      return f.onEat;
    },
    get strikes() {
      return f.strikes;
    },
    arm(n, style = NIGHT_STRIKE) {
      f.strikes = n;
      f.style = { ...style };
    },
    // A second feed() before the first pack lands replaces it (one pack in flight at a time).
    feed: (from) => feedFish(f, from),
    update: (dt, player, horde, night) => updateFish(f, dt, player, horde, night),
    reset: () => resetFish(f),
    dispose: () => disposeFish(f),
  };
}
