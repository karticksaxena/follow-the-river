import * as THREE from 'three/webgpu';
import { createRiverMaterial } from './water';

/** The river: its near edge sits at x = 3, right beside the walkable bank. Tuning knobs. */
export const RIVER_WIDTH = 14;
export const RIVER_X = 3 + RIVER_WIDTH / 2;
export const EDGE_X = 3;
/** Ground and water run this far past each end of the strip so fog, not an edge, ends the view. */
export const OVERRUN = 120;

/** A horizontal Lambert plane (ground, banks). */
export function plane(width: number, depth: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/**
 * Water, the far bank and a strip of wet mud where the near bank drops into the water,
 * from `fromZ` (start, positive) to `toZ` (far end, negative). Ground is added by the caller.
 */
export function addRiver(
  scene: THREE.Scene,
  fromZ: number,
  toZ: number,
  farBankColor = 0x24271f,
): void {
  const length = fromZ - toZ + 2 * OVERRUN;
  const middle = (fromZ + toZ) / 2;
  const farBank = plane(80, length, farBankColor);
  farBank.position.set(RIVER_X + RIVER_WIDTH / 2 + 40, 0, middle);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_WIDTH, length), createRiverMaterial());
  water.rotation.x = -Math.PI / 2;
  water.position.set(RIVER_X, -0.15, middle);
  const edge = plane(0.6, length, 0x4a4a3c);
  edge.position.set(EDGE_X - 0.3, 0.01, middle);
  scene.add(farBank, water, edge);
}
