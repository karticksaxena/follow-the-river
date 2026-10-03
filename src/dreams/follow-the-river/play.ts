import * as THREE from 'three/webgpu';
import { createControls, type Controls } from './controls';
import { nightDifficulty, nightTuning, spawnInterval } from './difficulty';
import { BEAM, drainBattery } from './flashlight';
import { atSafeSpot, nearSpot, takeDamage } from './flow';
import type { HudState } from './hud';
import { applyDim, LIGHTING } from './lighting';
import { EDGE_X } from './river';
import type { Events, Run, Systems } from './run';
import { addSupply, chapterOf, isNight } from './state';
import type { PlayerSense } from './zombies/horde';
import { nextSpawn, type Pace, type Strip } from './zombies/spawner';

/** Shack darkness eases at this rate (per second); lights are touched only past `DIM_EPSILON`. */
const DIM_RATE = 1.5;
const DIM_EPSILON = 0.01;
/** Health at or below which the heartbeat starts: one hit from death. */
const HURT_HEALTH = 34;
/** Within this many metres of the wait spot the `wait` hint appears. */
const WAIT_HINT_RANGE = 12;
/** After the "you are hurt" page closes, zombie hits can't land for this long (s). */
const HURT_GRACE = 1;
const NIGHT_STRIP_MARGIN = 0.5;
const NIGHT_SAFE_BUFFER = 15;

export interface Play {
  update(dt: number): void;
  /** Call at every phase start. */
  reset(): void;
}

/** What the per-frame functions share (everything preallocated, so frames allocate nothing). */
interface State {
  sys: Systems;
  run: Run;
  events: Events;
  sense: PlayerSense;
  controls: Controls;
  look: THREE.Vector3;
  spawnTimer: { timer: number };
  strip: Strip;
  /** The night's pace, refreshed each frame (a gunshot's noise halves the interval). */
  pace: Pace;
  hudState: HudState;
  wasPaused: boolean;
  /** A non-lethal hit this frame: if the game pauses next (hint page), grace starts on resume. */
  hitPause: boolean;
  grace: number;
  toldAboutWait: boolean;
  wasInShack: boolean;
  blocked: (x: number, z: number) => boolean;
  onHit: (damage: number) => void;
}

function newSense(): PlayerSense {
  return {
    x: 0,
    z: 0,
    eye: { x: 0, y: 0, z: 0 },
    look: { x: 0, y: 0, z: -1 },
    beamOn: false,
    beamRange: BEAM.range,
    beamHalfAngle: BEAM.halfAngle,
  };
}

function createState(sys: Systems, run: Run, events: Events): State {
  const { area, hud, grid } = sys;
  const sense = newSense();
  const state: State = {
    sys,
    run,
    events,
    sense,
    controls: createControls(sys, run, events, sense),
    look: new THREE.Vector3(),
    spawnTimer: { timer: nightDifficulty(chapterOf(run.phase)).interval },
    strip: {
      minX: area.landX,
      maxX: EDGE_X - NIGHT_STRIP_MARGIN,
      minZ: area.safeZ + NIGHT_SAFE_BUFFER,
      maxZ: area.barricadeZ,
    },
    hudState: {
      battery: 0,
      arrows: 0,
      fishPacks: 0,
      ammo: 0,
      health: 0,
      showAmmo: false,
      weapon: 'bow',
    },
    pace: { ...nightDifficulty(chapterOf(run.phase)) },
    wasPaused: true,
    hitPause: false,
    grace: 0,
    toldAboutWait: false,
    wasInShack: false,
    blocked(x, z) {
      for (const box of grid.near(x, z, 1)) {
        if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) return true;
      }
      return false;
    },
    onHit(damage) {
      if (state.grace > 0) return;
      run.health = takeDamage(run.health, damage);
      hud.hurt();
      if (run.health === 0) events.die();
      else {
        state.hitPause = true;
        events.hint('hurt');
      }
    },
  };
  return state;
}

function updateSense(p: State): void {
  const { sense, look, sys, run } = p;
  const { x, y, z } = sys.ctx.stage.camera.position;
  sys.ctx.stage.camera.getWorldDirection(look);
  sense.x = x;
  sense.z = z;
  sense.eye.x = x;
  sense.eye.y = y;
  sense.eye.z = z;
  sense.look.x = look.x;
  sense.look.y = look.y;
  sense.look.z = look.z;
  sense.beamOn = sys.flashlight.on && run.live.supplies.battery > 0;
}

function tickWorld(p: State, dt: number): void {
  const { sys, run, sense } = p;
  const night = isNight(run.phase);
  const supplies = run.live.supplies;
  supplies.battery = drainBattery(supplies.battery, sys.flashlight.on, dt);
  sys.flashlight.apply(supplies.battery, run.time);
  sys.horde.update(dt, sense, p.onHit);
  sys.gun.update(dt);
  const recovered = sys.bow.update(dt, sys.horde, sys.grid, sense);
  if (recovered > 0) run.live.supplies = addSupply(run.live.supplies, 'arrows', recovered);
  sys.fish.update(dt, sense, night ? sys.horde : null, night);
  sys.pickups.update(dt);
}

function spawnNight(p: State, dt: number): void {
  const { sys, sense } = p;
  const chapter = chapterOf(p.run.phase);
  const base = nightDifficulty(chapter);
  p.pace.cap = base.cap;
  p.pace.interval = spawnInterval(base.interval, sys.gun.noiseLeft);
  const at = nextSpawn(
    p.spawnTimer,
    dt,
    sys.horde.aliveCount(),
    sense,
    p.strip,
    sys.area.safeZ,
    p.blocked,
    Math.random,
    p.pace,
  );
  if (!at) return;
  sys.horde.spawn(at.x, at.z, Math.atan2(sense.x - at.x, sense.z - at.z), nightTuning(chapter));
}

/** Shack darkness: eases toward 1 inside, 0 outside; lights are touched only when it moved. */
function tickDim(p: State, dt: number): void {
  const { run, sys, sense } = p;
  const inside = sys.world.insideShack(sense.x, sense.z);
  if (inside && !p.wasInShack && !isNight(run.phase)) p.events.hint('shack');
  p.wasInShack = inside;
  const target = inside ? 1 : 0;
  const move = DIM_RATE * dt;
  run.dim += Math.max(-move, Math.min(move, target - run.dim));
  const moved = Math.abs(run.dim - run.appliedDim) > DIM_EPSILON;
  if (moved || (run.dim === target && run.appliedDim !== target)) {
    run.appliedDim = run.dim;
    applyDim(sys.world.lights, isNight(run.phase) ? LIGHTING.night : LIGHTING.day, run.dim);
  }
}

function tickView(p: State, dt: number): void {
  const { sys, run, sense, hudState } = p;
  const s = run.live.supplies;
  sys.world.lights.sky.position.set(sense.x, 0, sense.z);
  sys.ambience.update(
    dt,
    sense.x,
    isNight(run.phase),
    sys.horde.aliveCount(),
    run.health <= HURT_HEALTH,
  );
  hudState.battery = s.battery;
  hudState.arrows = s.arrows;
  hudState.fishPacks = s.fishPacks;
  hudState.ammo = s.ammo;
  hudState.showAmmo = run.live.hasGun;
  hudState.weapon = p.controls.weapon();
  hudState.health = run.health;
  sys.hud.set(hudState);
  sys.hud.prompt(p.controls.prompt());
}

function tickHints(p: State): void {
  if (p.toldAboutWait || isNight(p.run.phase)) return;
  if (nearSpot(p.sense.x, p.sense.z, p.sys.area.waitSpot, WAIT_HINT_RANGE)) {
    p.toldAboutWait = true;
    p.events.hint('wait');
  }
}

function tick(p: State, dt: number): void {
  const { sys, run, sense } = p;
  if (sys.ctx.isPaused()) {
    p.controls.drain();
    p.wasPaused = true;
    return;
  }
  if (p.wasPaused) {
    p.controls.drain();
    if (p.hitPause) p.grace = HURT_GRACE;
  }
  p.hitPause = false;
  p.grace = Math.max(0, p.grace - dt);
  p.wasPaused = false;
  if (run.frozen) {
    sys.ambience.hush(dt);
    return;
  }
  run.time += dt;
  updateSense(p);
  p.controls.update(dt);
  tickWorld(p, dt);
  sys.scares.update(dt, sense, isNight(run.phase));
  if (isNight(run.phase)) spawnNight(p, dt);
  tickDim(p, dt);
  tickHints(p);
  tickView(p, dt);
  if (isNight(run.phase) && atSafeSpot(sense.z, sys.area.safeZ)) p.events.arrive();
}

/** The per-frame gameplay the chapter registers: input, supplies, zombies, spawns, light and sound. */
export function createPlay(sys: Systems, run: Run, events: Events): Play {
  const p = createState(sys, run, events);
  return {
    reset() {
      p.spawnTimer.timer = nightDifficulty(chapterOf(run.phase)).interval;
      p.toldAboutWait = false;
      p.wasInShack = false;
      p.hitPause = false;
      p.grace = 0;
      p.sys.gun.reset();
      p.controls.reset();
      p.controls.drain(); // a stale click (e.g. on "Continue") must not fire an arrow
    },
    update: (dt) => tick(p, dt),
  };
}
