import * as THREE from 'three/webgpu';
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
  decay: 1.1,
  pitch: 0.2,
} as const;

/** Where the torch points, in camera space: slightly inward, `FLASHLIGHT.pitch` below the view. Writes `out`. */
export function torchAim<T extends { set(x: number, y: number, z: number): unknown }>(out: T): T {
  out.set(-0.05, -0.12 - Math.tan(FLASHLIGHT.pitch), -1);
  return out;
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
  /** Sets intensity from on + battery (never `visible`). */
  apply(battery: number, time: number): void;
  dispose(): void;
}

/** A torch held at the camera, pointing where the player looks. Starts on. */
export function createFlashlight(camera: THREE.Camera): Flashlight {
  const light = new THREE.SpotLight(
    0xfff1d6,
    FLASHLIGHT.intensity,
    FLASHLIGHT.distance,
    FLASHLIGHT.angle,
    FLASHLIGHT.penumbra,
    FLASHLIGHT.decay,
  );
  // Held in the left hand, so its cone misses the bow in the right (it blew the bow out to white).
  light.position.set(-0.25, -0.12, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0005;
  torchAim(light.target.position);
  light.layers.enable(VOLUME_LAYER); // the beam shows in the mist
  camera.add(light, light.target);
  return {
    light,
    on: true,
    blackout: false,
    apply(battery, time) {
      const wasOn = light.intensity > 0;
      light.intensity =
        this.on && !this.blackout ? FLASHLIGHT.intensity * beamLevel(battery, time) : 0;
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
