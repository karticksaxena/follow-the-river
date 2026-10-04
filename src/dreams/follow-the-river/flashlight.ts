import * as THREE from 'three/webgpu';

/** Brightness (candela), reach (m) and cone half-angle (rad). Tuning knobs. */
export const FLASHLIGHT = { intensity: 80, distance: 22, angle: 0.45, penumbra: 0.5 } as const;

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
    2,
  );
  // Held in the left hand, so its cone misses the bow in the right (it blew the bow out to white).
  light.position.set(-0.25, -0.12, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0005;
  light.target.position.set(-0.05, -0.3, -1);
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
