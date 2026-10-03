import * as THREE from 'three/webgpu';
import { createControls } from './controls';
import { BEAM, drainBattery } from './flashlight';
import { atSafeSpot, nearSpot, takeDamage } from './flow';
import type { HudState } from './hud';
import { applyDim, LIGHTING } from './lighting';
import { EDGE_X } from './river';
import type { Events, Run, Systems } from './run';
import { addSupply, isNight } from './state';
import { NIGHT_TUNING } from './zombies/brain';
import type { PlayerSense } from './zombies/horde';
import { nextSpawn, SPAWNER, type Strip } from './zombies/spawner';

/** Shack darkness eases at this rate (per second); lights are touched only past `DIM_EPSILON`. */
const DIM_RATE = 1.5;
const DIM_EPSILON = 0.01;
/** Health at or below which the heartbeat starts: one hit from death. */
const HURT_HEALTH = 34;
/** Within this many metres of the wait spot the `wait` hint appears. */
const WAIT_HINT_RANGE = 12;
const NIGHT_STRIP_MARGIN = 0.5;
const NIGHT_SAFE_BUFFER = 15;

export interface Play {
  update(dt: number): void;
  /** Call at every phase start. */
  reset(): void;
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

/** The per-frame gameplay the chapter registers: input, supplies, zombies, spawns, light and sound. */
export function createPlay(sys: Systems, run: Run, events: Events): Play {
  const { ctx, area, horde, bow, fish, pickups, hud, flashlight, world } = sys;
  const camera = ctx.stage.camera;
  const sense = newSense();
  const controls = createControls(sys, run, events, sense);
  const look = new THREE.Vector3();
  const spawnTimer = { timer: SPAWNER.interval };
  const strip: Strip = {
    minX: area.landX,
    maxX: EDGE_X - NIGHT_STRIP_MARGIN,
    minZ: area.safeZ + NIGHT_SAFE_BUFFER,
    maxZ: area.barricadeZ,
  };
  const hudState: HudState = {
    battery: 0,
    arrows: 0,
    fishPacks: 0,
    ammo: 0,
    health: 0,
    showAmmo: false,
  };
  let wasPaused = true;
  let toldAboutWait = false;
  let wasInShack = false;

  const blocked = (x: number, z: number): boolean => {
    for (const box of sys.grid.near(x, z, 1)) {
      if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) return true;
    }
    return false;
  };

  const onHit = (damage: number): void => {
    run.health = takeDamage(run.health, damage);
    hud.hurt();
    if (run.health === 0) events.die();
    else events.hint('hurt');
  };

  function updateSense(): void {
    const { x, y, z } = camera.position;
    camera.getWorldDirection(look);
    sense.x = x;
    sense.z = z;
    sense.eye.x = x;
    sense.eye.y = y;
    sense.eye.z = z;
    sense.look.x = look.x;
    sense.look.y = look.y;
    sense.look.z = look.z;
    sense.beamOn = flashlight.on && run.live.supplies.battery > 0;
  }

  function tickWorld(dt: number): void {
    const night = isNight(run.phase);
    const supplies = run.live.supplies;
    supplies.battery = drainBattery(supplies.battery, flashlight.on, dt);
    flashlight.apply(supplies.battery, run.time);
    horde.update(dt, sense, onHit);
    const recovered = bow.update(dt, horde, sys.grid, sense);
    if (recovered > 0) run.live.supplies = addSupply(run.live.supplies, 'arrows', recovered);
    fish.update(dt, sense, night ? horde : null, night);
    pickups.update(dt);
  }

  function spawnNight(dt: number): void {
    const at = nextSpawn(
      spawnTimer,
      dt,
      horde.aliveCount(),
      sense,
      strip,
      area.safeZ,
      blocked,
      Math.random,
    );
    if (!at) return;
    horde.spawn(at.x, at.z, Math.atan2(sense.x - at.x, sense.z - at.z), NIGHT_TUNING);
  }

  /** Shack darkness: eases toward 1 inside, 0 outside; lights are touched only when it moved. */
  function tickDim(dt: number): void {
    const inside = world.insideShack(sense.x, sense.z);
    if (inside && !wasInShack) events.hint('shack');
    wasInShack = inside;
    const target = inside ? 1 : 0;
    const move = DIM_RATE * dt;
    run.dim += Math.max(-move, Math.min(move, target - run.dim));
    const moved = Math.abs(run.dim - run.appliedDim) > DIM_EPSILON;
    if (moved || (run.dim === target && run.appliedDim !== target)) {
      run.appliedDim = run.dim;
      applyDim(world.lights, isNight(run.phase) ? LIGHTING.night : LIGHTING.day, run.dim);
    }
  }

  function tickView(dt: number): void {
    const night = isNight(run.phase);
    world.lights.sky.position.set(sense.x, 0, sense.z);
    sys.ambience.update(dt, sense.x, night, horde.aliveCount(), run.health <= HURT_HEALTH);
    const s = run.live.supplies;
    hudState.battery = s.battery;
    hudState.arrows = s.arrows;
    hudState.fishPacks = s.fishPacks;
    hudState.ammo = s.ammo;
    hudState.health = run.health;
    hud.set(hudState);
    hud.prompt(controls.prompt());
  }

  function tickHints(): void {
    if (toldAboutWait || isNight(run.phase)) return;
    if (nearSpot(sense.x, sense.z, area.waitSpot, WAIT_HINT_RANGE)) {
      toldAboutWait = true;
      events.hint('wait');
    }
  }

  return {
    reset() {
      spawnTimer.timer = SPAWNER.interval;
      toldAboutWait = false;
      wasInShack = false;
    },
    update(dt) {
      if (ctx.isPaused()) {
        controls.drain();
        wasPaused = true;
        return;
      }
      if (wasPaused) controls.drain();
      wasPaused = false;
      if (run.frozen) return;
      run.time += dt;
      updateSense();
      controls.update(dt);
      tickWorld(dt);
      if (isNight(run.phase)) spawnNight(dt);
      tickDim(dt);
      tickHints();
      tickView(dt);
      if (isNight(run.phase) && atSafeSpot(sense.z, area.safeZ)) events.arrive();
    },
  };
}
