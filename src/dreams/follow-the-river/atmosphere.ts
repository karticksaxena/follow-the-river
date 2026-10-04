import { bayer16 } from 'three/addons/tsl/math/Bayer.js';
import { exp, Fn, mx_noise_float, screenCoordinate, time, vec3 } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { VOLUME_LAYER } from '../../engine/volume';

/** Low ground mist. Tuning knobs. The night must stay dark: the mist only shows where lights hit it. */
export const MIST = {
  /** The box that follows the player (m). */
  size: { x: 60, y: 12, z: 60 },
  /** Mist is thickest here (the water line) and thins upward. */
  floorY: -1,
  /** Height (m) over which the mist falls to 1/e. */
  height: 2.5,
  /** Scales how much light the mist scatters. */
  density: 0.1,
  /** How much the drifting noise modulates it (0 = flat, 1 = from nothing to double). */
  noiseAmount: 0.6,
  /** Noise feature size (1 / m) and drift speed (m/s along x; z drifts at 0.6 of it). */
  noiseScale: 0.07,
  drift: 0.35,
} as const;

/** Mist density at `height` m over the floor, for noise `n` (0..1). Pure; the shader below mirrors it. */
export function mistDensity(height: number, n: number): number {
  const noise = 1 - MIST.noiseAmount + MIST.noiseAmount * 2 * n;
  return MIST.density * Math.exp(-Math.max(0, height) / MIST.height) * noise;
}

export interface Atmosphere {
  readonly mesh: THREE.Mesh<THREE.BoxGeometry, THREE.VolumeNodeMaterial>;
  /** Per frame: the box follows the player (allocation-free). */
  follow(camera: THREE.Object3D): void;
}

/** The raymarched mist box on its own layer (the scene's disposal frees it). The post graph sets `steps` and `depthNode` on its material. */
export function createAtmosphere(): Atmosphere {
  const material = new THREE.VolumeNodeMaterial();
  material.fog = false; // fog would mix the scattered light toward the fog colour
  material.toneMapped = false;
  material.offsetNode = bayer16(screenCoordinate);
  material.scatteringNode = Fn(({ positionRay }: { positionRay: THREE.Node<'vec3'> }) => {
    const height = positionRay.y.sub(MIST.floorY).max(0);
    const drift = MIST.drift * MIST.noiseScale;
    const drifted = positionRay
      .mul(MIST.noiseScale)
      .add(vec3(time.mul(drift), 0, time.mul(drift * 0.6)));
    const n = mx_noise_float(drifted).mul(0.5).add(0.5).clamp(0, 1);
    const noise = n.mul(2 * MIST.noiseAmount).add(1 - MIST.noiseAmount);
    return exp(height.negate().div(MIST.height)).mul(noise).mul(MIST.density);
  });
  const { x, y, z } = MIST.size;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material);
  mesh.position.y = MIST.floorY + y / 2 - 1; // reaches a little under the water line
  mesh.receiveShadow = true; // so the torch's shadows reach the scattering
  mesh.frustumCulled = false;
  mesh.layers.disableAll();
  mesh.layers.enable(VOLUME_LAYER);
  return {
    mesh,
    follow(camera) {
      mesh.position.x = camera.position.x;
      mesh.position.z = camera.position.z;
    },
  };
}
