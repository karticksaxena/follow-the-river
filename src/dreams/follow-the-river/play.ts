import * as THREE from 'three/webgpu';
import type { AmbushDef } from './areas/types';
import { createControls, cutsceneChange, type Controls } from './controls';
import { DIFFICULTY, nightTuning, type DifficultyTuning } from './difficulty';
import { nightEnd } from './ending';
import { BEAM, chargeBattery } from './flashlight';
import { nearSpot, takeDamage } from './flow';
import { gunBits, type HudState } from './hud';
import { applyDim, LIGHTING } from './lighting';
import { EDGE_X } from './river';
import type { Events, Run, Systems } from './run';
import { addSupply, AMMO_OF, chapterOf, isNight } from './state';
import { ambushSpot, objective, reservedFrom, spawnSpot, stepWaves, type SpawnView } from './waves';
import type { Tuning } from './zombies/brain';
import type { PlayerSense } from './zombies/horde';

/** Shack darkness eases at this rate (per second); lights are touched only past `DIM_EPSILON`. */
const DIM_RATE = 1.5;
const DIM_EPSILON = 0.01;
/** Health at or below which the heartbeat starts: one hit from death. */
/** Within this many metres of the wait spot the `wait` hint appears. */
const WAIT_HINT_RANGE = 12;
/** After the "you are hurt" page closes, zombie hits can't land for this long (s). */
const HURT_GRACE = 1;
/** Wave zombies come out of the bank between the land wall and this far from the water (m). */
const NIGHT_STRIP_MARGIN = 0.5;
/** A running ambush is told where you are, this far around its spot (m): they hunt, they don't wander. */
const AMBUSH_ALERT = 6;
/** A spawn whose every try was blocked is retried after this many seconds. */
const RETRY_SPAWN = 0.5;

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
  /** The chapter; the night's tuning and difficulty are read at each wave's start (a menu change applies from the next wave). */
  chapter: number;
  waveD: Pick<DifficultyTuning, 'quota' | 'interval'>;
  /** The night's zombie tuning plus the wave's `faster`, built once per wave. */
  waveTuning: Tuning;
  zone: { startZ: number; gateZ: number; minX: number; maxX: number };
  view: SpawnView;
  controls: Controls;
  look: THREE.Vector3;
  /** Seconds the torch has been off (it recharges after a moment). */
  offFor: number;
  hudState: HudState;
  wasPaused: boolean;
  /** A non-lethal hit this frame: if the game pauses next (hint page), grace starts on resume. */
  hitPause: boolean;
  grace: number;
  toldAboutWait: boolean;
  /** Last cutscene state seen, and the torch as it was before the cutscene took it. */
  cutscene: boolean;
  torchBefore: boolean;
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
  const chapter = chapterOf(run.phase);
  const state: State = {
    sys,
    run,
    events,
    sense,
    chapter,
    waveD: DIFFICULTY[sys.ctx.difficulty()],
    waveTuning: nightTuning(chapter, sys.ctx.difficulty()),
    zone: { startZ: 0, gateZ: 0, minX: area.landX + 1, maxX: EDGE_X - NIGHT_STRIP_MARGIN },
    view: { lookX: 0, lookZ: -1, fogFar: 55 },
    controls: createControls(sys, run, events, sense),
    look: new THREE.Vector3(),
    offFor: 0,
    hudState: {
      battery: 0,
      cells: 0,
      arrows: 0,
      fishPacks: 0,
      ammo: 0,
      health: 0,
      damage: 0,
      guns: 0,
      weapon: 'bow',
      wave: 0,
      waves: area.waves.length,
      goal: '',
    },
    wasPaused: true,
    hitPause: false,
    grace: 0,
    toldAboutWait: false,
    cutscene: false,
    torchBefore: false,
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
  p.offFor = sys.flashlight.on ? 0 : p.offFor + dt;
  supplies.battery = chargeBattery(supplies.battery, sys.flashlight.on, p.offFor, dt);
  if (supplies.battery <= 0) sys.flashlight.on = false; // dead: off, so it starts recharging
  sys.flashlight.apply(supplies.battery, run.time);
  sys.horde.update(dt, sense, p.onHit);
  sys.armory.update(dt);
  sys.gates.update(dt);
  const recovered = sys.bow.update(dt, sys.horde, sys.grid, sense);
  if (recovered > 0) run.live.supplies = addSupply(run.live.supplies, 'arrows', recovered);
  sys.fish.update(dt, sense, night ? sys.horde : null, night);
  sys.world.railing?.update(dt);
  sys.pickups.update(dt);
}

/** A wave begins: its difficulty and zombie tuning (the night's plus the wave's `faster`) are fixed for it. */
function startWave(p: State, wave: number): void {
  const { sys } = p;
  const def = sys.area.waves[wave];
  if (!def) return;
  const base = nightTuning(p.chapter, sys.ctx.difficulty());
  p.waveTuning = { ...base, speed: base.speed + def.faster };
  p.zone.startZ = def.z;
  p.zone.gateZ = def.gateZ;
  p.events.hint('wave');
}

/** One zombie that keeps the wave coming, on a free spot out of your face, hunting at once. */
function spawnOne(p: State): void {
  const { sys, sense, zone, view, run } = p;
  const fog = sys.world.lights.scene.fog;
  view.lookX = sense.look.x;
  view.lookZ = sense.look.z;
  view.fogFar = fog instanceof THREE.Fog ? fog.far : (sys.area.nightFog ?? view.fogFar);
  for (let tries = 0; tries < 6; tries++) {
    const at = spawnSpot(sense, zone, view, Math.random);
    if (p.blocked(at.x, at.z)) continue;
    sys.horde.spawn(at.x, at.z, Math.atan2(sense.x - at.x, sense.z - at.z), p.waveTuning, false);
    sys.horde.alert(at.x, at.z, 2);
    return;
  }
  run.waves.toSpawn++; // every spot was blocked: the zombie is owed, try again shortly
  run.waves.nextIn = RETRY_SPAWN;
}

/** The night's waves: start when you pass one, keep sending zombies, spring its ambushes, open the barricade when it's dead. */
function tickWaves(p: State, dt: number): void {
  const { sys, run, sense } = p;
  if (!run.waves.fighting) p.waveD = DIFFICULTY[sys.ctx.difficulty()];
  const event = stepWaves(
    run.waves,
    sys.area.waves,
    sense.z,
    sys.horde.aliveCount(),
    dt,
    p.waveD,
    Math.random,
  );
  if (!event) return;
  if (event.kind === 'start') startWave(p, event.wave);
  else if (event.kind === 'clear') {
    sys.gates.open(event.wave);
    p.events.checkpoint(event.wave + 1);
  } else if (event.kind === 'one') spawnOne(p);
  else spawnAmbush(p, event.ambush);
}

/** One ambush's zombies, each on a free spot of the bank; the lying ones keep still until woken. */
function spawnAmbush(p: State, ambush: AmbushDef): void {
  const { sys, sense, run } = p;
  const gateZ = sys.area.waves[run.waves.cleared]?.gateZ ?? sys.area.safeZ;
  const maxX = EDGE_X - NIGHT_STRIP_MARGIN;
  const lying = ambush.kind === 'lying';
  let spot: { x: number; z: number } | null = null;
  for (let i = 0; i < ambush.count; i++) {
    for (let tries = 0; tries < 6; tries++) {
      const at = ambushSpot(ambush, sense, gateZ, sys.area.landX + 1, maxX, Math.random);
      if (p.blocked(at.x, at.z)) continue;
      sys.horde.spawn(at.x, at.z, Math.atan2(sense.x - at.x, sense.z - at.z), p.waveTuning, lying);
      spot ??= at;
      break;
    }
  }
  if (spot && !lying) sys.horde.alert(spot.x, spot.z, AMBUSH_ALERT);
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

/** On entering or leaving a cutscene: hide or show the HUD, torch off then back as it was. */
function syncCutscene(p: State): void {
  const { sys, run } = p;
  const change = cutsceneChange(p.cutscene, run.cutscene);
  if (!change) return;
  p.cutscene = run.cutscene;
  sys.hud.setHidden(run.cutscene);
  if (change === 'enter') {
    p.torchBefore = sys.flashlight.on;
    sys.flashlight.on = false;
  } else sys.flashlight.on = p.torchBefore;
}

/** Nothing of the wave is alive and only ambushes not yet sprung are left to come. */
function isWaiting(p: State): boolean {
  const def = p.sys.area.waves[p.run.waves.cleared];
  const w = p.run.waves;
  return !!def && p.sys.horde.aliveCount() === 0 && w.toSpawn <= reservedFrom(def, w.fired);
}

function tickView(p: State, dt: number): void {
  const { sys, run, sense, hudState } = p;
  const s = run.live.supplies;
  sys.world.lights.sky.position.set(sense.x, 0, sense.z);
  sys.ambience.update(
    dt,
    sense.x,
    isNight(run.phase) && run.ending !== 'calm', // after the wave only the wind is left
    sys.horde.aliveCount(),
    run.health <= DIFFICULTY[sys.ctx.difficulty()].damage,
    p.chapter,
  );
  const weapon = p.controls.weapon();
  hudState.battery = s.battery;
  hudState.cells = s.cells;
  hudState.arrows = s.arrows;
  hudState.fishPacks = s.fishPacks;
  hudState.ammo = weapon === 'bow' ? 0 : s[AMMO_OF[weapon]];
  hudState.guns = gunBits(run.live.guns);
  hudState.weapon = weapon;
  hudState.health = run.health;
  hudState.damage = DIFFICULTY[sys.ctx.difficulty()].damage;
  const fighting = isNight(run.phase) && run.ending === 'no' && run.waves.fighting;
  hudState.wave = fighting ? run.waves.cleared + 1 : 0;
  hudState.goal = objective({
    night: isNight(run.phase),
    fighting,
    wave: run.waves.cleared,
    waves: hudState.waves,
    ending: run.ending !== 'no',
    waiting: fighting && isWaiting(p),
    lake: sys.area.lake !== undefined,
  });
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
  syncCutscene(p);
  p.controls.update(dt);
  tickWorld(p, dt);
  sys.scares.update(dt, sense, isNight(run.phase) && run.ending !== 'calm');
  if (isNight(run.phase) && run.ending === 'no') tickWaves(p, dt);
  tickDim(p, dt);
  tickHints(p);
  tickView(p, dt);
  if (isNight(run.phase) && run.ending === 'no') endNight(p);
}

/** Night 1–2: the safe spot ends the night. Night 3: the lake shore starts the ending. */
function endNight(p: State): void {
  if (p.run.dying !== 'no') return; // died this frame: the death restart wins over arriving
  const end = nightEnd(p.sys.area, p.sense.z);
  if (end === 'safe') p.events.arrive();
  else if (end === 'ending') p.events.ending();
}

/** The per-frame gameplay the chapter registers: input, supplies, zombies, spawns, light and sound. */
export function createPlay(sys: Systems, run: Run, events: Events): Play {
  const p = createState(sys, run, events);
  return {
    reset() {
      p.offFor = 0;
      // beginPhase already cleared run.cutscene and set the torch: just forget the cutscene (no restore).
      p.cutscene = false;
      p.torchBefore = false;
      p.sys.hud.setHidden(false);
      p.toldAboutWait = false;
      p.wasInShack = false;
      p.hitPause = false;
      p.grace = 0;
      p.sys.armory.reset();
      p.controls.reset();
      p.controls.drain(); // a stale click (e.g. on "Continue") must not fire an arrow
    },
    update: (dt) => tick(p, dt),
  };
}
