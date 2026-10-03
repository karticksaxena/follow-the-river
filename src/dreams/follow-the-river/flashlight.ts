import * as THREE from 'three/webgpu';

/** Brightness (candela), reach (m) and cone half-angle (rad). Tuning knobs. */
export const FLASHLIGHT = { intensity: 80, distance: 22, angle: 0.45, penumbra: 0.5 } as const;

/** A torch held at the camera, pointing where the player looks. */
export function createFlashlight(camera: THREE.Camera): THREE.SpotLight {
  const light = new THREE.SpotLight(
    0xfff1d6,
    FLASHLIGHT.intensity,
    FLASHLIGHT.distance,
    FLASHLIGHT.angle,
    FLASHLIGHT.penumbra,
    2,
  );
  light.position.set(0.2, -0.15, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0005;
  light.target.position.set(0, -0.3, -1);
  camera.add(light, light.target);
  return light;
}
