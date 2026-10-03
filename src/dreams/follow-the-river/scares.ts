import * as THREE from 'three/webgpu';
import { FLICKER_SECONDS, flickerOn, shakeAt } from '../../engine/scare';
import type { DreamContext } from '../types';
import type { ScareDef, ShackDef } from './areas/types';
import type { Flashlight } from './flashlight';
import type { Sounds } from './sounds';
import { loadWatcherFigure, WATCHER } from './watcher';
import type { Horde } from './zombies/horde';

/** Tuning knobs: sting loudness, roll (rad), and the ambush delay (s) and wake radius (m). */
const STING = { watcher: 0.9, ambush: 1, distant: 0.35 } as const;
const ROLL = 0.14;
const AMBUSH = { delay: 0.6, radius: 5 } as const;
/** The van alarm: how long it sounds (s), how far it carries (m), blink period (s). */
const ALARM = { seconds: 6, alert: 25, blink: 0.3, volume: 1, ref: 8 } as const;
/** Random stings at night: gap range (s) and how far away they come from (m). */
const NIGHT_STING = { min: 25, max: 45, distance: 20, ref: 20 } as const;
const LIGHT_ON = 0xff2810;
const LIGHT_OFF = 0x2a0804;
const NONE = Number.POSITIVE_INFINITY;

/** Whether the player at (x, z) sets off `def` (distance ≤ its trigger). Ambush scares fire from tapes, not distance. */
export function triggered(def: ScareDef, x: number, z: number): boolean {
  if (def.kind === 'ambush') return false;
  return Math.hypot(def.x - x, def.z - z) <= def.trigger;
}

/** The shack a pickup at (x, z) is in: the nearest one within 6 m, or null. */
export function shackAt(shacks: readonly ShackDef[], x: number, z: number): string | null {
  let best: string | null = null;
  let bestSq = 36;
  for (const s of shacks) {
    const sq = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (sq <= bestSq) {
      best = s.id;
      bestSq = sq;
    }
  }
  return best;
}

export interface Scares {
  /** Ticks the scares. By day they fire by distance; at night only the distant stings play. */
  update(dt: number, player: { x: number; z: number }, night: boolean): void;
  /** The player took the tape in `shack`: its ambush (if any) fires shortly after. */
  tapeTaken(shack: string): void;
  /** Re-arms everything (call at every phase start). */
  reset(): void;
  dispose(): void;
}

interface State {
  ctx: DreamContext;
  scene: THREE.Scene;
  defs: readonly ScareDef[];
  horde: Horde;
  sounds: Sounds;
  flashlight: Flashlight;
  shacks: readonly ShackDef[];
  fired: boolean[];
  figure: THREE.Object3D;
  vanishLeft: number;
  /** Seconds since the last camera jolt / light stutter (NONE when idle). */
  hitTime: number;
  ambushLeft: number;
  ambushShack: string;
  alarmLeft: number;
  alarmSound: THREE.PositionalAudio;
  alarmHost: THREE.Object3D;
  lightMat: THREE.MeshBasicMaterial;
  lightOn: boolean;
  distant: THREE.PositionalAudio;
  distantHost: THREE.Object3D;
  nightLeft: number;
}

function sting(s: State, volume: number): void {
  s.ctx.audio.once(s.sounds.sting, volume);
  s.hitTime = 0;
}

/** Roll jolt and light stutter after a hit. The player resets the camera roll every frame, so nothing to undo. */
function tickHit(s: State, dt: number): void {
  if (s.hitTime === NONE) return;
  s.hitTime += dt;
  const over = s.hitTime >= FLICKER_SECONDS;
  s.flashlight.blackout = !over && !flickerOn(s.hitTime);
  s.ctx.stage.camera.rotation.z = over ? 0 : shakeAt(s.hitTime) * ROLL * Math.sin(s.hitTime * 70);
  if (over) s.hitTime = NONE;
}

function tickWatcher(s: State, i: number, def: ScareDef, x: number, z: number, dt: number): void {
  if (def.kind !== 'watcher') return;
  if (s.fired[i]) {
    if (s.vanishLeft > 0 && (s.vanishLeft -= dt) <= 0) s.figure.visible = false;
    return;
  }
  s.figure.rotation.y = Math.atan2(x - def.x, z - def.z);
  if (!triggered(def, x, z)) return;
  s.fired[i] = true;
  s.vanishLeft = WATCHER.vanishAfter;
  sting(s, STING.watcher);
}

function startAlarm(s: State, def: ScareDef): void {
  if (def.kind !== 'alarm') return;
  s.horde.alert(def.x, def.z, ALARM.alert);
  s.alarmLeft = ALARM.seconds;
  s.alarmSound.play();
}

function tickAlarm(s: State, dt: number): void {
  if (s.alarmLeft <= 0) return;
  s.alarmLeft -= dt;
  const on = s.alarmLeft > 0 && Math.floor(s.alarmLeft / ALARM.blink) % 2 === 0;
  if (on !== s.lightOn) {
    s.lightOn = on;
    s.lightMat.color.setHex(on ? LIGHT_ON : LIGHT_OFF);
  }
  if (s.alarmLeft <= 0 && s.alarmSound.isPlaying) s.alarmSound.stop();
}

function tickAmbush(s: State, dt: number): void {
  if (s.ambushLeft < 0) return;
  s.ambushLeft -= dt;
  if (s.ambushLeft > 0) return;
  s.ambushLeft = -1;
  const shack = s.shacks.find((k) => k.id === s.ambushShack);
  if (shack) s.horde.alert(shack.x, shack.z, AMBUSH.radius);
  sting(s, STING.ambush);
}

function tickDistant(s: State, dt: number, x: number, z: number): void {
  s.nightLeft -= dt;
  if (s.nightLeft > 0) return;
  s.nightLeft = NIGHT_STING.min + Math.random() * (NIGHT_STING.max - NIGHT_STING.min);
  const buffer = s.sounds.weird[Math.floor(Math.random() * s.sounds.weird.length)];
  if (!buffer) return;
  const angle = Math.random() * Math.PI * 2;
  s.distantHost.position.set(
    x + Math.cos(angle) * NIGHT_STING.distance,
    1.5,
    z + Math.sin(angle) * NIGHT_STING.distance,
  );
  if (s.distant.isPlaying) s.distant.stop();
  s.distant.setBuffer(buffer);
  s.distant.setVolume(STING.distant);
  s.distant.play();
}

function tickDay(s: State, dt: number, x: number, z: number): void {
  for (let i = 0; i < s.defs.length; i++) {
    const def = s.defs[i];
    if (!def) continue;
    tickWatcher(s, i, def, x, z, dt);
    if (def.kind === 'alarm' && !s.fired[i] && triggered(def, x, z)) {
      s.fired[i] = true;
      startAlarm(s, def);
    }
  }
  tickAmbush(s, dt);
}

function build(
  ctx: DreamContext,
  scene: THREE.Scene,
  defs: readonly ScareDef[],
  figure: THREE.Object3D,
  rest: Pick<State, 'horde' | 'sounds' | 'flashlight' | 'shacks'>,
): State {
  const watcher = defs.find((d) => d.kind === 'watcher');
  const van = defs.find((d) => d.kind === 'alarm');
  if (watcher) {
    figure.position.set(watcher.x, 0, watcher.z);
    scene.add(figure);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: LIGHT_OFF });
  const alarmHost = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.15), lightMat);
  alarmHost.position.set(van?.x ?? 0, 1.4, van?.z ?? 0);
  alarmHost.visible = van !== undefined;
  const distantHost = new THREE.Object3D();
  scene.add(alarmHost, distantHost);
  const alarmSound = ctx.audio.positional(alarmHost, ALARM.ref);
  alarmSound.setBuffer(rest.sounds.alarm);
  alarmSound.setLoop(true);
  alarmSound.setVolume(ALARM.volume);
  return {
    ctx,
    scene,
    defs,
    ...rest,
    fired: defs.map(() => false),
    figure,
    vanishLeft: NONE,
    hitTime: NONE,
    ambushLeft: -1,
    ambushShack: '',
    alarmLeft: 0,
    alarmSound,
    alarmHost,
    lightMat,
    lightOn: false,
    distant: ctx.audio.positional(distantHost, NIGHT_STING.ref),
    distantHost,
    nightLeft: NIGHT_STING.min,
  };
}

function reset(s: State): void {
  s.fired.fill(false);
  s.figure.visible = s.figure.parent !== null;
  s.vanishLeft = NONE;
  s.hitTime = NONE;
  s.flashlight.blackout = false;
  s.ambushLeft = -1;
  s.alarmLeft = 0;
  s.lightOn = false;
  s.lightMat.color.setHex(LIGHT_OFF);
  if (s.alarmSound.isPlaying) s.alarmSound.stop();
  if (s.distant.isPlaying) s.distant.stop();
  s.nightLeft = NIGHT_STING.min + Math.random() * (NIGHT_STING.max - NIGHT_STING.min);
}

/**
 * The jumpscares: a figure that vanishes with a sting, a zombie that rises after the tape, a car
 * alarm that wakes the street, and random distant stings at night. Everything runs from `update(dt)`,
 * so it is pause-safe. Build it before the shader compile so the figure and van light are compiled.
 */
export async function createScares(
  ctx: DreamContext,
  scene: THREE.Scene,
  defs: readonly ScareDef[],
  horde: Horde,
  sounds: Sounds,
  flashlight: Flashlight,
  shacks: readonly ShackDef[],
): Promise<Scares> {
  const figure = await loadWatcherFigure();
  const s = build(ctx, scene, defs, figure, { horde, sounds, flashlight, shacks });
  return {
    update(dt, player, night) {
      tickHit(s, dt);
      tickAlarm(s, dt);
      if (night) {
        s.figure.visible = false;
        tickDistant(s, dt, player.x, player.z);
      } else tickDay(s, dt, player.x, player.z);
    },
    tapeTaken(shack) {
      const ambush = defs.findIndex((d) => d.kind === 'ambush' && d.shack === shack);
      if (ambush < 0 || s.fired[ambush]) return;
      s.fired[ambush] = true;
      s.ambushShack = shack;
      s.ambushLeft = AMBUSH.delay;
    },
    reset: () => reset(s),
    dispose() {
      s.flashlight.blackout = false;
      for (const sound of [s.alarmSound, s.distant]) {
        if (sound.isPlaying) sound.stop();
        sound.disconnect();
      }
      s.scene.remove(s.figure, s.alarmHost, s.distantHost);
    },
  };
}
