import { THROWN_SECONDS } from './thrown';
export { THROWN_SECONDS };

export type ZombieState =
  | 'lying'
  | 'rising'
  | 'idle'
  | 'chase'
  | 'attack'
  | 'recover'
  | 'stunned'
  | 'dying'
  /** Knocked into the lake by the orca: flies, splashes, sinks (posed by the body, not alive). */
  | 'thrown'
  /** In the orca's jaws: posed by the orca, not by the brain, until it drowns. */
  | 'held'
  | 'dead';
export type Intent =
  'lie' | 'rise' | 'stand' | 'walk' | 'run' | 'strike' | 'stagger' | 'fall' | 'thrown' | 'struggle';

export interface Tuning {
  /** Notices the player within this many metres. */
  sight: number;
  /** Chase speed, m/s. Above 2 the zombie runs (player walks 2.2, sprints 4.2). */
  speed: number;
  /** Loses interest beyond this many metres. */
  giveUp: number;
  /** Seconds of steady light to stun, and how long it holds. */
  stun: { readonly exposure: number; readonly seconds: number };
  /** Health one blow takes. */
  damage: number;
  /** Body hits that drop it (a head hit always kills). */
  bodyHits: number;
}

/** Tuning knobs. Day: few, slow, half-asleep in the dark. Night: fast, they know where you are. */
const NORMAL_HARM = { stun: { exposure: 0.6, seconds: 0.9 }, damage: 34, bodyHits: 2 } as const;
export const DAY_TUNING: Tuning = { sight: 7, speed: 1.1, giveUp: 22, ...NORMAL_HARM };
export const NIGHT_TUNING: Tuning = { sight: 45, speed: 3.5, giveUp: 80, ...NORMAL_HARM };
export const ATTACK = { range: 1.3, windup: 0.45, recover: 0.9 } as const;
export const FALL_SECONDS = 3;
/** A lying zombie wakes when the player is this close (m) or makes noise, then takes RISE_SECONDS to get up. */
export const WAKE = 4;
export const RISE_SECONDS = 1.2;
/** A deep sleeper (in a tent) wakes only when the player is this close (m): at the tent mouth. */
export const TENT_WAKE = 1.8;
/** Seconds without light before a dazzled zombie can be stunned again. */
export const REARM_SECONDS = 1;
/** Share of its speed a zombie keeps while the torch stays on it after its stun. */
export const LIT_SLOW = 0.45;
/** `heard` is a one-frame pulse; a zombie keeps hunting this long after the last one. */
export const HUNT_SECONDS = 8;

/** Does this hit drop it? A head hit always does; a body hit once `wounds` earlier ones make `bodyHits`. */
export function hitKills(wounds: number, head: boolean, bodyHits: number): boolean {
  return head || wounds + 1 >= bodyHits;
}

/** Short stagger after a body hit that did not drop it. */
export const FLINCH_SECONDS = 0.35;

/** A hit that did not kill: a lying zombie gets up (GetUp), a stunned or rising one keeps its timer, the rest stagger (never longer than they already do). */
export function flinch(mind: Mind): void {
  if (mind.state === 'lying') {
    mind.state = 'rising';
    mind.timer = RISE_SECONDS;
    mind.exposure = 0;
  } else if (mind.state !== 'stunned' && mind.state !== 'rising') {
    mind.timer = mind.state === 'recover' ? Math.max(mind.timer, FLINCH_SECONDS) : FLINCH_SECONDS;
    mind.state = 'recover';
  }
}

export interface Mind {
  state: ZombieState;
  timer: number;
  exposure: number;
  hunt: number;
  /** Already stunned by the light that is still on it: no new stun until REARM_SECONDS of dark. */
  dazzled: boolean;
  unlit: number;
  /** Sleeps through noise until the player is at the tent mouth. */
  deep: boolean;
}

export interface Senses {
  distance: number;
  /** In the beam's core: what builds up to a stun. */
  lit: boolean;
  /** Anywhere in the light you can see (wider than the core): keeps a stunned zombie slow and stops it re-arming. */
  inLight?: boolean;
  heard: boolean;
}

export interface Thought {
  intent: Intent;
  hit: boolean;
  /** Moving at LIT_SLOW of its speed (dazzled and still lit). */
  slow?: boolean;
}

/** `lying`: starts on the ground (a corpse that isn't one — day scares). */
export const newMind = (lying = false, deep = false): Mind => ({
  state: lying ? 'lying' : 'idle',
  timer: 0,
  exposure: 0,
  hunt: 0,
  dazzled: false,
  unlit: 0,
  deep,
});

export function isAlive(mind: Mind): boolean {
  return (
    mind.state !== 'dying' &&
    mind.state !== 'thrown' &&
    mind.state !== 'held' &&
    mind.state !== 'dead'
  );
}

export function kill(mind: Mind): void {
  if (!isAlive(mind)) return;
  mind.state = 'dying';
  mind.timer = FALL_SECONDS;
}

/** The orca knocks it aside into the lake (see thrown.ts). */
export function throwByFish(mind: Mind): void {
  if (!isAlive(mind)) return;
  mind.state = 'thrown';
  mind.timer = THROWN_SECONDS;
}

/** The orca has it: returns false if it was already dead (killed while the orca came in). */
export function seize(mind: Mind): boolean {
  if (!isAlive(mind)) return false;
  mind.state = 'held';
  return true;
}

function set(out: Thought, intent: Intent, hit = false): Thought {
  out.intent = intent;
  out.hit = hit;
  out.slow = false;
  return out;
}

/** In any of the torch's visible light (the core counts too). */
const inLight = (s: Senses): boolean => s.lit || s.inLight === true;

/**
 * The beam's core builds up exposure; anything short of a stun fades away. Returns true when
 * stunned. A stunned zombie stays dazzled (no new stun) until it has been out of all visible light
 * for REARM_SECONDS: drifting off the core while still lit is not darkness.
 */
function lightUp(mind: Mind, senses: Senses, stun: Tuning['stun'], dt: number): boolean {
  const lit = senses.lit;
  if (inLight(senses)) mind.unlit = 0;
  else if (mind.dazzled && (mind.unlit += dt) >= REARM_SECONDS) mind.dazzled = false;
  if (mind.dazzled) return false;
  mind.exposure = lit ? mind.exposure + dt : Math.max(0, mind.exposure - dt);
  if (mind.exposure < stun.exposure) return false;
  mind.dazzled = true;
  mind.unlit = 0;
  mind.state = 'stunned';
  mind.timer = stun.seconds;
  mind.exposure = 0;
  return true;
}

function moveIntent(tuning: Tuning): Intent {
  return tuning.speed > 2 ? 'run' : 'walk';
}

function ending(mind: Mind, dt: number, out: Thought): Thought {
  mind.timer -= dt;
  const intent = mind.state === 'thrown' ? 'thrown' : 'fall';
  if (mind.timer <= 0) mind.state = 'dead';
  return set(out, intent);
}

function wake(mind: Mind, senses: Senses, out: Thought): Thought {
  const asleep = mind.deep
    ? senses.distance >= TENT_WAKE
    : senses.distance >= WAKE && !senses.heard;
  if (asleep) return set(out, 'lie');
  mind.state = 'rising';
  mind.timer = RISE_SECONDS;
  mind.exposure = 0;
  if (senses.heard) mind.hunt = HUNT_SECONDS;
  return set(out, 'rise');
}

function chase(mind: Mind, senses: Senses, tuning: Tuning, dt: number, out: Thought): Thought {
  if (lightUp(mind, senses, tuning.stun, dt)) return set(out, 'stagger');
  mind.hunt = senses.heard ? HUNT_SECONDS : mind.hunt - dt;
  if (senses.distance > tuning.giveUp && mind.hunt <= 0) {
    mind.state = 'idle';
    return set(out, 'stand');
  }
  if (senses.distance <= ATTACK.range) {
    mind.state = 'attack';
    mind.timer = ATTACK.windup;
    return set(out, 'strike');
  }
  if (mind.dazzled && inLight(senses)) {
    set(out, 'walk');
    out.slow = true;
    return out;
  }
  return set(out, moveIntent(tuning));
}

function windup(
  mind: Mind,
  senses: Senses,
  stun: Tuning['stun'],
  dt: number,
  out: Thought,
): Thought {
  if (lightUp(mind, senses, stun, dt)) return set(out, 'stagger');
  mind.timer -= dt;
  if (mind.timer > 0) return set(out, 'strike');
  mind.state = 'recover';
  mind.timer = ATTACK.recover;
  mind.exposure = 0;
  return set(out, 'strike', senses.distance <= ATTACK.range * 1.4);
}

/** Counts the timer down; when it runs out the zombie goes back to chasing. */
function waitThen(mind: Mind, dt: number, out: Thought, intent: Intent): Thought {
  mind.timer -= dt;
  if (mind.timer <= 0) mind.state = 'chase';
  return set(out, intent);
}

/** Advance one mind by dt (mutates it — one per zombie, no allocation). Returns the intent and whether a blow landed this frame. */
export function think(
  mind: Mind,
  senses: Senses,
  tuning: Tuning,
  dt: number,
  out: Thought,
): Thought {
  switch (mind.state) {
    case 'dead':
      return set(out, 'fall');
    case 'held':
      return set(out, 'struggle');
    case 'lying':
      return wake(mind, senses, out);
    case 'rising':
      return waitThen(mind, dt, out, 'rise');
    case 'dying':
    case 'thrown':
      return ending(mind, dt, out);
    case 'stunned':
      return waitThen(mind, dt, out, 'stagger');
    case 'idle':
      if (senses.heard) mind.hunt = HUNT_SECONDS;
      if (senses.distance < tuning.sight || senses.heard) mind.state = 'chase';
      return set(out, mind.state === 'chase' ? moveIntent(tuning) : 'stand');
    case 'chase':
      return chase(mind, senses, tuning, dt, out);
    case 'attack':
      return windup(mind, senses, tuning.stun, dt, out);
    default:
      return waitThen(mind, dt, out, 'stand');
  }
}
