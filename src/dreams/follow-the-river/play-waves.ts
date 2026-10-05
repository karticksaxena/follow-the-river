import * as THREE from 'three/webgpu';
import type { AmbushDef, LurkerDef, WaveDef } from './areas/types';
import { DIFFICULTY, nightTuning } from './difficulty';
import { isDry, styleFor, waveBudget } from './fish-parts';
import type { State } from './play';
import {
  ambushPlace,
  ambushSpot,
  isPlaced,
  passedBy,
  placeOk,
  quotaOf,
  spawnSpot,
  stepWaves,
  wavesWake,
} from './waves';

/** A running ambush is told where you are, this far around its spot (m): they hunt, they don't wander. */
const AMBUSH_ALERT = 6;
/** A spawn whose every try was blocked is retried after this many seconds. */
const RETRY_SPAWN = 0.5;
/** An alert this wide (m) wakes the one body at a spot. */
const WAKE_ALERT = 1.5;
/** A sleeper in a house wakes when you come this close (m) or step inside its house. */
const SLEEPER_WAKE = 3;

/** What the player sees now: the look direction and how far the fog lets them see. */
function refreshView(p: State): void {
  const { sys, sense, view } = p;
  const fog = sys.world.lights.scene.fog;
  view.lookX = sense.look.x;
  view.lookZ = sense.look.z;
  view.fogFar = fog instanceof THREE.Fog ? fog.far : (sys.area.nightFog ?? view.fogFar);
}

/** A free spot of `ambush` on the bank (6 tries), or null. */
function freeAmbushSpot(p: State, ambush: AmbushDef): { x: number; z: number } | null {
  const { sense, zone, view } = p;
  for (let tries = 0; tries < 6; tries++) {
    const at = isPlaced(ambush)
      ? ambushSpot(ambush, sense, zone.gateZ, zone.minX, zone.maxX, Math.random)
      : ambushPlace(ambush, sense, zone, view, Math.random);
    if (!p.blocked(at.x, at.z)) return at;
  }
  return null;
}

/** An awake zombie out of sight, hunting at once (the continuous spawner's rule). False if every spot was blocked. */
function spawnAwake(p: State): boolean {
  const { sys, sense, zone, view } = p;
  for (let tries = 0; tries < 6; tries++) {
    const at = spawnSpot(sense, zone, view, Math.random);
    if (p.blocked(at.x, at.z)) continue;
    sys.horde.spawn(at.x, at.z, Math.atan2(sense.x - at.x, sense.z - at.z), p.waveTuning, false);
    sys.horde.alert(at.x, at.z, 2);
    return true;
  }
  return false;
}

/**
 * Puts down the waiting lying and cover zombies whose spot is out of sight (or far off); the rest
 * stay queued. One whose spot you have already passed is not laid down: it comes awake instead.
 */
function flushPending(p: State): void {
  const { sys, sense, view, run } = p;
  for (let i = p.pendingN - 1; i >= 0; i--) {
    const q = p.pending[i];
    if (!q) continue;
    const passed = passedBy(sense, q);
    if (!passed && !placeOk(sense, q, view)) continue;
    if (passed) {
      if (!spawnAwake(p)) run.waves.toSpawn++; // owed: the continuous spawner sends it
    } else {
      sys.horde.spawn(q.x, q.z, Math.atan2(sense.x - q.x, sense.z - q.z), p.waveTuning, q.lying);
      const t = p.tracked[p.trackedN];
      if (t && p.trackedN < p.tracked.length) {
        t.x = q.x;
        t.z = q.z;
        p.trackedN++;
      }
    }
    p.pendingN--;
    const last = p.pending[p.pendingN];
    if (last) Object.assign(q, last); // ponytail: swap-remove keeps the queue allocation-free
  }
}

/** The body you passed (or came within 9 m of) gets up and comes after you: wakes by an alert on its spot. */
function wakeTracked(p: State): void {
  const { sys, sense } = p;
  for (let i = p.trackedN - 1; i >= 0; i--) {
    const t = p.tracked[i];
    if (!t || !wavesWake(sense, t)) continue;
    sys.horde.alert(t.x, t.z, WAKE_ALERT);
    p.trackedN--;
    const last = p.tracked[p.trackedN];
    if (last) Object.assign(t, last);
  }
}

/** Lays one sleeper down in its house (an extra: the wave never waits for it). */
function laySleeper(p: State, l: LurkerDef): void {
  const slot = p.sleepers[p.sleeperN];
  if (!slot || p.sys.horde.spawn(l.x, l.z, l.yaw, p.waveTuning, true, true) < 0) return;
  slot.x = l.x;
  slot.z = l.z;
  slot.box =
    p.houses.find((b) => l.x > b.minX && l.x < b.maxX && l.z > b.minZ && l.z < b.maxZ) ?? null;
  p.sleeperN++;
}

/** The sleeper whose house you entered, or that you came within 3 m of, wakes and hunts like the rest. */
function wakeSleepers(p: State): void {
  const { sys, sense } = p;
  for (let i = p.sleeperN - 1; i >= 0; i--) {
    const q = p.sleepers[i];
    if (!q) continue;
    const { box } = q;
    const entered =
      box !== null &&
      sense.x > box.minX &&
      sense.x < box.maxX &&
      sense.z > box.minZ &&
      sense.z < box.maxZ;
    if (!entered && Math.hypot(sense.x - q.x, sense.z - q.z) >= SLEEPER_WAKE) continue;
    sys.horde.alert(q.x, q.z, WAKE_ALERT);
    p.sleeperN--;
    const last = p.sleepers[p.sleeperN];
    if (last) Object.assign(q, last); // ponytail: swap-remove keeps the list allocation-free
  }
}

/** A wave begins: tuning fixed for it, and its lying and cover zombies are put in place (queued while in sight). */
function startWave(p: State, wave: number): void {
  const { sys } = p;
  const def = sys.area.waves[wave];
  if (!def) return;
  const base = nightTuning(p.chapter, sys.ctx.difficulty());
  p.waveTuning = { ...base, speed: base.speed + def.faster };
  p.zone.startZ = def.z;
  p.zone.gateZ = def.gateZ;
  p.pendingN = 0;
  p.trackedN = 0;
  p.sleeperN = 0;
  for (const l of def.sleepers ?? []) laySleeper(p, l);
  for (const a of def.ambushes) {
    if (!isPlaced(a)) continue;
    for (let i = 0; i < a.count && p.pendingN < p.pending.length; i++) {
      const at = freeAmbushSpot(p, a);
      const q = p.pending[p.pendingN];
      if (!at || !q) continue;
      q.x = at.x;
      q.z = at.z;
      q.lying = a.kind === 'lying';
      p.pendingN++;
    }
  }
  refreshView(p);
  flushPending(p);
  armOrca(p, def);
  p.events.hint(def.crate.house ? 'waveHouse' : 'wave');
}

/** Dras helps for this wave: a budget of strikes (her share of the wave), near you only. */
function armOrca(p: State, def: WaveDef): void {
  const { sys, run } = p;
  const d = sys.ctx.difficulty();
  const { quota, orca } = DIFFICULTY[d];
  sys.fish.setGuards([sys.ctx.stage.camera.position]); // live reference: she follows you
  sys.fish.arm(waveBudget(quotaOf(def, quota), orca.share), styleFor(run.live.fed, d));
}

/** One zombie that keeps the wave coming, on a free spot out of sight, hunting at once. */
function spawnOne(p: State): void {
  const { sys, sense, zone, view, run } = p;
  refreshView(p);
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

/** An ambush springs: street and behind zombies come out of sight and hunt; the placed ones are alerted. */
function springAmbush(p: State, ambush: AmbushDef): void {
  const { sys, sense, run } = p;
  if (isPlaced(ambush)) {
    if (ambush.kind === 'cover')
      sys.horde.alert(ambush.x ?? sense.x, ambush.at ?? sense.z, AMBUSH_ALERT);
    return;
  }
  refreshView(p);
  let spot: { x: number; z: number } | null = null;
  for (let i = 0; i < ambush.count; i++) {
    const at = freeAmbushSpot(p, ambush);
    if (!at) {
      run.waves.toSpawn++; // owed: the continuous spawner sends it instead
      continue;
    }
    sys.horde.spawn(at.x, at.z, Math.atan2(sense.x - at.x, sense.z - at.z), p.waveTuning, false);
    spot ??= at;
  }
  if (spot) sys.horde.alert(spot.x, spot.z, AMBUSH_ALERT);
}

/** The night's waves: start when you pass one, keep sending zombies, spring its ambushes, open the barricade when it's dead. */
export function tickWaves(p: State, dt: number): void {
  const { sys, run, sense } = p;
  sys.fish.dry = run.waves.fighting && isDry(run.live.supplies, run.live.guns);
  if (!run.waves.fighting) p.waveD = DIFFICULTY[sys.ctx.difficulty()];
  else {
    if (p.pendingN > 0) {
      refreshView(p);
      flushPending(p);
    }
    if (p.trackedN > 0) wakeTracked(p);
    if (p.sleeperN > 0) wakeSleepers(p);
  }
  const event = stepWaves(
    run.waves,
    sys.area.waves,
    sense.z,
    sys.horde.aliveCount() + p.pendingN - sys.horde.sleepingCount(), // sleepers are extras
    dt,
    p.waveD,
    Math.random,
  );
  if (!event) return;
  if (event.kind === 'start') startWave(p, event.wave);
  else if (event.kind === 'clear') {
    sys.fish.arm(0, styleFor(run.live.fed, sys.ctx.difficulty())); // between waves she strikes nothing
    sys.gates.open(event.wave);
    p.events.checkpoint(event.wave + 1);
  } else if (event.kind === 'one') spawnOne(p);
  else springAmbush(p, event.ambush);
}
