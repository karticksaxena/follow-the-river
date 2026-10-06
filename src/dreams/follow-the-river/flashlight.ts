import * as THREE from 'three/webgpu';
import { EYE_HEIGHT } from '../../engine/player';
import { TIERS, type Tier } from '../../engine/quality';
import { VOLUME_LAYER } from '../../engine/volume';

/**
 * Brightness (candela), reach (m), cone half-angle (rad), edge softness, falloff exponent and how far
 * below the view the axis points (rad). Tuning knobs. Ground ahead is hit at a grazing angle, so
 * real inverse-square (decay 2) leaves the bank 3-12 m ahead black; a gentler decay lights it.
 */
export const FLASHLIGHT = {
  intensity: 90,
  distance: 24,
  angle: 0.5,
  penumbra: 0.7,
  decay: 1.5,
  pitch: 0.2,
} as const;

/**
 * The eye adjusting: the light on the nearest character in the beam never exceeds `cap` (candela
 * at the character), so a face at 2 m is not blown white while the far ground pool stays bright.
 * `ease` is the time constant (s) of the change; `chest` the height (m) aimed at on a body.
 */
export const TORCH_EXPOSURE = {
  cap: 7,
  ease: 0.15,
  chest: 1.1,
  /** Ground pool: where the axis meets flat ground nearer than `groundRef` m, intensity falls by (d / groundRef)^2, never below `groundFloor`. */
  groundRef: 5,
  // looking at your feet on pale paving still clipped at 0.35; 0.15 keeps the pavers readable (Chrome, Night 1)
  groundFloor: 0.15,
} as const;

/** Pure: the torch's scale 0..1 so the pool on flat ground does not clip pale paving (`pitch`: the beam axis below horizontal, rad). */
export function groundScale(pitch: number, eyeHeight: number): number {
  if (pitch <= 1e-3) return 1;
  const k = eyeHeight / Math.sin(pitch) / TORCH_EXPOSURE.groundRef;
  return Math.max(TORCH_EXPOSURE.groundFloor, Math.min(1, k * k));
}

/** Pure: the torch's scale 0..1 so a character `d` m away is lit by at most `cap`. Infinity: full. */
export function torchScale(d: number, intensity: number, decay: number, cap: number): number {
  if (!Number.isFinite(d)) return 1;
  return Math.min(1, (cap * Math.max(d, 0.2) ** decay) / intensity);
}

/** Pure: distance from `eye` to a point inside the beam cone about `fwd` (unit), else Infinity. No allocation. */
export function inBeamDistance(
  eye: { x: number; y: number; z: number },
  fwd: { x: number; y: number; z: number },
  x: number,
  y: number,
  z: number,
): number {
  const dx = x - eye.x;
  const dy = y - eye.y;
  const dz = z - eye.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-6) return 0;
  return (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d >= Math.cos(FLASHLIGHT.angle) ? d : Infinity;
}

/** Who the eye adjusts to: independent slots, each cleared and refilled by its owner every frame. */
export const WATCH = { horde: 0, mom: 1, dras: 2 } as const;
const SLOTS = 3;

/** Where the torch points, in camera space: slightly inward (it is held on the right), `FLASHLIGHT.pitch` below the view. Writes `out`. */
export function torchAim<T extends { set(x: number, y: number, z: number): unknown }>(out: T): T {
  out.set(0.05, -0.12 - Math.tan(FLASHLIGHT.pitch), -1);
  return out;
}

/**
 * The light a player sees on a zombie: most of the spot's cone (its soft edge fades out toward
 * FLASHLIGHT.angle) and most of its reach. Wider than BEAM, the core that stuns: inside this a
 * stunned zombie stays slow and is not stopped again. Tuning knobs.
 */
export const LIGHT_CONE = { range: 18, halfAngle: 0.42 } as const;

/** The torch's axis in world space (unit), from the camera: where the visible beam really points. Writes `out`. */
export function torchDirection(camera: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  return torchAim(out).transformDirection(camera.matrixWorld);
}

/**
 * The torch's charge is 0..100. It drains while on; once it has been off for `rechargeDelay` s it
 * creeps back up (like Alan Wake's torch). Below `low` the beam stutters. Tuning knobs.
 */
export const BATTERY = {
  drainPerSecond: 1.2,
  low: 20,
  rechargePerSecond: 3,
  rechargeDelay: 1.5,
} as const;

/** Stun cone: reach (m) and half-angle (rad), narrower than the light itself. */
export const BEAM = { range: 14, halfAngle: 0.3 } as const;

/** The charge after `dt`: draining while on, recharging once it has been off `offFor` seconds. */
export function chargeBattery(battery: number, on: boolean, offFor: number, dt: number): number {
  if (on) return Math.max(0, battery - BATTERY.drainPerSecond * dt);
  if (offFor < BATTERY.rechargeDelay) return battery;
  return Math.min(100, battery + BATTERY.rechargePerSecond * dt);
}

/** 0..1: full above BATTERY.low, stuttering below it, 0 when empty. Deterministic in `time`. */
export function beamLevel(battery: number, time: number): number {
  if (battery <= 0) return 0;
  if (battery >= BATTERY.low) return 1;
  const step = Math.sin(time * 23) + Math.sin(time * 7.3) > 0.4 ? 1 : 0;
  return (0.35 + 0.65 * step) * Math.max(0.4, battery / BATTERY.low);
}

export interface Flashlight {
  readonly light: THREE.SpotLight;
  on: boolean;
  /** A scare stutter: forces the beam dark while true, however the battery is. */
  blackout: boolean;
  /** Sets intensity from on + battery (never `visible`); `dt` eases the eye adjustment (default: instant). */
  apply(battery: number, time: number, dt?: number): void;
  /** Offers a character's chest point `(x, y, z)` to slot `slot`; the nearest one in the beam sets the exposure. */
  watch(slot: number, x: number, y: number, z: number): void;
  /** Empties a slot (its owner calls this before refilling it each frame). */
  clearWatch(slot: number): void;
  dispose(): void;
}

/** The torch's shadow map for a tier (512 on Low and Medium); a no-op when it is already that size. */
export function setTorchShadowTier(light: THREE.SpotLight, tier: Tier): void {
  const size = TIERS[tier].torchShadowMap;
  if (light.shadow.mapSize.x === size) return;
  light.shadow.mapSize.set(size, size);
  light.shadow.map?.dispose(); // the next shadow pass allocates the new size
  light.shadow.map = null;
  light.shadow.needsUpdate = true;
}

/** A torch held at the camera, pointing where the player looks. Starts on. */
export function createFlashlight(camera: THREE.Camera, tier: Tier = 'high'): Flashlight {
  const light = new THREE.SpotLight(
    0xfff1d6,
    FLASHLIGHT.intensity,
    FLASHLIGHT.distance,
    FLASHLIGHT.angle,
    FLASHLIGHT.penumbra,
    FLASHLIGHT.decay,
  );
  // Held on the right, with the weapons; view-light.ts keeps it from blowing the viewmodel out to white.
  light.position.set(0.25, -0.12, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(TIERS[tier].torchShadowMap, TIERS[tier].torchShadowMap);
  light.shadow.bias = -0.0005;
  torchAim(light.target.position);
  light.layers.enable(VOLUME_LAYER); // the beam shows in the mist
  camera.add(light, light.target);
  const nearest = new Float64Array(SLOTS).fill(Infinity);
  const eye = { x: 0, y: 0, z: 0 };
  const fwd = { x: 0, y: 0, z: -1 };
  let exposure = 1;
  return {
    light,
    on: true,
    blackout: false,
    watch(slot, x, y, z) {
      const e = camera.matrixWorld.elements; // camera forward is -Z (column 2)
      eye.x = e[12];
      eye.y = e[13];
      eye.z = e[14];
      const len = Math.hypot(e[8], e[9], e[10]) || 1;
      fwd.x = -e[8] / len;
      fwd.y = -e[9] / len;
      fwd.z = -e[10] / len;
      nearest[slot] = Math.min(nearest[slot], inBeamDistance(eye, fwd, x, y, z));
    },
    clearWatch(slot) {
      nearest[slot] = Infinity;
    },
    apply(battery, time, dt = Infinity) {
      const wasOn = light.intensity > 0;
      const target = torchScale(
        Math.min(nearest[WATCH.horde], nearest[WATCH.mom], nearest[WATCH.dras]),
        FLASHLIGHT.intensity,
        FLASHLIGHT.decay,
        TORCH_EXPOSURE.cap,
      );
      const aim =
        FLASHLIGHT.pitch + Math.asin(THREE.MathUtils.clamp(camera.matrixWorld.elements[9], -1, 1));
      exposure +=
        (Math.min(target, groundScale(aim, EYE_HEIGHT)) - exposure) *
        (1 - Math.exp(-dt / TORCH_EXPOSURE.ease));
      light.intensity =
        this.on && !this.blackout ? FLASHLIGHT.intensity * exposure * beamLevel(battery, time) : 0;
      const isOn = light.intensity > 0;
      // Skip the 1024² shadow pass while dark; force one render on the off -> on edge.
      light.shadow.autoUpdate = isOn;
      if (isOn && !wasOn) light.shadow.needsUpdate = true;
    },
    dispose() {
      camera.remove(light, light.target);
      light.dispose();
    },
  };
}
